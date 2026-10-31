#!/usr/bin/env python3
"""PixelForge dev server.

Serves the static app and proxies AI sprite requests so the API key stays on
this machine. Standard library only — nothing to install.

    python server.py                 # http://127.0.0.1:5173
    PORT=8080 python server.py

Configuration lives in .env next to this file (see .env.example):

    AI_PROVIDER=wavespeed            # or: openai / pollinations
    AI_IMAGE_KEY=...                 # WAVESPEED_API_KEY / OPENAI_API_KEY also work
    AI_IMAGE_MODEL=wavespeed-ai/z-image/turbo
    AI_IMAGE_BASE_URL=...            # required for the openai provider

AI_PROVIDER=pollinations needs no account or key (free tier: 1 image / 45s).
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"

WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3"
# No default for OpenAI-compatible endpoints: the base URL depends on the account
# and not every OpenAI-compatible API exposes /images/generations.
POLLINATIONS_BASE = "https://image.pollinations.ai"
KEYLESS_PROVIDERS = ("pollinations",)

# How the model is asked to draw. Image models cannot really output 32x32 pixel
# art, so we ask for a clean, flat, single-subject illustration on a plain
# background and let js/pixelate.js do the actual pixel conversion.
PROMPT_TEMPLATE = (
    "pixel art game sprite of {subject}, full body, standing, facing the viewer, "
    "centered, whole character visible, chunky visible pixels, clean thick outline, "
    "limited color palette, flat cel shading, no background (plain solid white), "
    "no text, no watermark, no frame, no drop shadow"
)

MAX_PROMPT = 400
MAX_BODY = 64 * 1024
POLL_BUDGET = 150  # seconds


# ---------------------------------------------------------------- config


EXTRA_ENV = ("WAVESPEED_API_KEY", "WAVESPEED_KEY", "OPENAI_API_KEY", "FREEBUFF_API_KEY")


def load_env() -> dict[str, str]:
    """Read .env, then let real environment variables win over it."""
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    overrides = set(values) | set(EXTRA_ENV)
    overrides |= {key for key in os.environ if key.startswith("AI_")}
    for key in overrides:
        if key in os.environ:
            values[key] = os.environ[key]
    return values


def setting(env: dict[str, str], *names: str, default: str = "") -> str:
    for name in names:
        value = env.get(name, "").strip()
        if value:
            return value
    return default


def read_config() -> dict:
    env = load_env()
    provider = setting(env, "AI_PROVIDER", default="wavespeed").lower()
    if provider not in ("wavespeed", "openai", "pollinations"):
        provider = "wavespeed"

    if provider == "pollinations":
        return {
            "provider": "pollinations",
            "key": "",
            "keyRequired": False,
            "model": setting(env, "AI_IMAGE_MODEL", default="flux"),
            "base": setting(env, "AI_IMAGE_BASE_URL", default=POLLINATIONS_BASE).rstrip("/"),
            "missing": None,
            "setupUrl": "https://pollinations.ai",
            "note": "Pollinations needs no key. Free tier: 1 image every 45s per IP; a pollen key removes the limit.",
        }

    if provider == "wavespeed":
        key = setting(env, "AI_IMAGE_KEY", "WAVESPEED_API_KEY", "WAVESPEED_KEY")
        model = setting(env, "AI_IMAGE_MODEL", default="wavespeed-ai/z-image/turbo")
        base = setting(env, "AI_IMAGE_BASE_URL", default=WAVESPEED_BASE).rstrip("/")
        missing = "AI_IMAGE_KEY"
        setup = "https://wavespeed.ai/access-key"
        note = "WaveSpeedAI: 1,000+ image models on one key. New accounts may get $1 trial credit."
    else:
        key = setting(env, "AI_IMAGE_KEY", "OPENAI_API_KEY", "FREEBUFF_API_KEY")
        model = setting(env, "AI_IMAGE_MODEL", default="gpt-image-1")
        base = setting(env, "AI_IMAGE_BASE_URL").rstrip("/")
        missing = "AI_IMAGE_BASE_URL" if base else "AI_IMAGE_KEY"
        setup = ""
        note = "Any OpenAI-compatible /images/generations endpoint you have access to."
        if not base:
            key = ""  # a base URL is required before a request can be made

    return {
        "provider": provider,
        "key": key,
        "keyRequired": True,
        "model": model,
        "base": base,
        "missing": missing,
        "setupUrl": setup,
        "note": note,
    }


# ---------------------------------------------------------------- providers


def readable_body(text: str, limit: int = 240) -> str:
    """Providers return JSON when happy and HTML error pages when not."""
    stripped = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    stripped = re.sub(r"<[^>]+>", " ", stripped)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    return stripped[:limit] or "empty response"


def http_json(url: str, payload: dict | None, headers: dict, timeout: int = 60) -> tuple[int, dict]:
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"message": readable_body(body) or str(error.reason)}
        if not isinstance(parsed, dict):
            parsed = {"message": readable_body(body)}
        return error.code, parsed
    except urllib.error.URLError as error:
        return 0, {"message": f"Network error: {error.reason}"}


def fetch_bytes(url: str, headers: dict) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def as_data_url(payload: bytes) -> str:
    head = payload[:8]
    mime = "image/png" if head.startswith(b"\x89PNG") else "image/jpeg" if head[:2] == b"\xff\xd8" else "image/webp" if payload[:4] == b"RIFF" else "image/png"
    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"


def generate_wavespeed(config: dict, prompt: str) -> dict:
    headers = {"Authorization": f"Bearer {config['key']}", "Content-Type": "application/json"}
    url = f"{config['base']}/{config['model']}"
    status, body = http_json(url, {"prompt": prompt, "size": "1024*1024"}, headers)
    if status != 200 or body.get("code") not in (200, None):
        raise RuntimeError(body.get("message") or body.get("error") or f"Submit failed (HTTP {status})")

    task = body.get("data") or {}
    task_id = task.get("id")
    if not task_id:
        raise RuntimeError("Provider returned no task id")

    deadline = time.time() + POLL_BUDGET
    delay = 1.5
    while time.time() < deadline:
        time.sleep(delay)
        delay = min(6.0, delay + 0.7)
        status, body = http_json(
            f"{config['base']}/predictions/{task_id}/result",
            None,
            {"Authorization": headers["Authorization"]},
        )
        if status == 0:
            continue  # transient; GETs are safe to retry
        if status != 200:
            raise RuntimeError(body.get("message") or f"Result query failed (HTTP {status})")
        data = body.get("data") or {}
        state = data.get("status")
        if state == "completed":
            outputs = data.get("outputs") or []
            if not outputs:
                raise RuntimeError("Task finished with no output")
            return {"image": as_data_url(fetch_bytes(outputs[0], {})), "output": outputs[0]}
        if state in ("failed", "cancelled", "timeout", "deleted"):
            raise RuntimeError(data.get("error") or f"Task {state}")
    raise RuntimeError("Timed out waiting for the model (150s)")


def generate_pollinations(config: dict, prompt: str) -> dict:
    """Keyless free endpoint: one GET returns the image bytes."""
    seed = int.from_bytes(os.urandom(3), "big")
    url = (
        f"{config['base']}/prompt/{urllib.parse.quote(prompt, safe='')}"
        f"?width=1024&height=1024&nologo=true&seed={seed}&model={urllib.parse.quote(config['model'], safe='')}"
    )
    request = urllib.request.Request(url, headers={"accept": "image/*", "user-agent": "PixelForge/1.2"})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read()
            mime = response.headers.get("content-type", "")
    except urllib.error.HTTPError as error:
        body = error.read()
        # Over the free limit Pollinations answers 402/429 with a branded
        # placeholder *image*, so never quote the body as text.
        is_image = body[:2] == b"\xff\xd8" or body[:4] == b"\x89PNG"
        text = "" if is_image else body[:600].decode("utf-8", "replace")
        if error.code in (402, 429) or "FREE_LIMIT" in text:
            raise RuntimeError(
                "Pollinations free tier allows 1 image every 45 seconds per IP. "
                "Wait a moment and press Generate again, or set a different AI_PROVIDER in .env."
            ) from None
        raise RuntimeError(readable_body(text) if text else f"Pollinations returned HTTP {error.code}") from None

    if mime.startswith("application/json") or payload[:1] == b"{":
        raise RuntimeError(readable_body(payload.decode("utf-8", "replace")))
    return {"image": as_data_url(payload), "output": url}


def generate_openai(config: dict, prompt: str) -> dict:
    if not config["base"]:
        raise RuntimeError("AI_IMAGE_BASE_URL is not set")
    headers = {"Authorization": f"Bearer {config['key']}", "Content-Type": "application/json"}
    url = f"{config['base']}/images/generations"
    payload = {"model": config["model"], "prompt": prompt, "n": 1, "size": "1024x1024"}
    status, body = http_json(url, payload, headers)
    if status != 200:
        error = body.get("error")
        if isinstance(error, dict):
            error = error.get("message")
        raise RuntimeError(str(error or body.get("message") or f"HTTP {status} from {url}")[:400])

    items = body.get("data") or []
    if not items:
        raise RuntimeError("Provider returned no image")
    item = items[0]
    if item.get("b64_json"):
        return {"image": as_data_url(base64.b64decode(item["b64_json"])), "output": None}
    if item.get("url"):
        return {"image": as_data_url(fetch_bytes(item["url"], {})), "output": item["url"]}
    raise RuntimeError("Provider returned neither b64_json nor url")


# ---------------------------------------------------------------- handler


class Handler(SimpleHTTPRequestHandler):
    server_version = "PixelForge/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # -- helpers ---------------------------------------------------------

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        # Always revalidate local edits; a stale module is more confusing than
        # a cache header that costs nothing on localhost.
        if self.path.endswith((".html", ".js", ".mjs", ".css", ".json")) or self.path == "/":
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        # args can contain HTTPStatus objects, so format first and text-match after.
        try:
            message = fmt % args
        except Exception:  # noqa: BLE001 - logging must never break a response
            message = str(fmt)
        if "/api/" in message or "code 4" in message or "code 5" in message:
            sys.stderr.write(f"  {message}\n")

    def translate_path(self, path: str) -> str:
        # Block path traversal and hidden files outright.
        clean = urllib.request.urlparse(path).path
        resolved = (ROOT / clean.lstrip("/")).resolve()
        if ROOT not in resolved.parents and resolved != ROOT:
            return str(ROOT / "__denied__")
        if any(part.startswith(".") for part in resolved.relative_to(ROOT).parts):
            return str(ROOT / "__denied__")
        return str(resolved)

    # -- routes ----------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?")[0] == "/api/ai/status":
            config = read_config()
            ready = bool(config["key"]) or not config.get("keyRequired", True)
            return self.send_json(
                200,
                {
                    "available": ready,
                    "provider": config["provider"],
                    "model": config["model"],
                    "missing": None if ready else config["missing"],
                    "setupUrl": None if ready else config["setupUrl"],
                    "note": config["note"],
                },
            )
        if self.path.startswith("/api/"):
            return self.send_json(404, {"error": "Unknown endpoint"})
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/api/ai/sprite":
            return self.send_json(404, {"error": "Unknown endpoint"})

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send_json(413, {"error": "Request too large"})
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "Malformed JSON"})

        subject = re.sub(r"\s+", " ", str(payload.get("prompt") or "")).strip()
        if not subject:
            return self.send_json(400, {"error": "Describe a character first"})
        if len(subject) > MAX_PROMPT:
            return self.send_json(400, {"error": f"Prompt is too long (max {MAX_PROMPT} characters)"})

        config = read_config()
        if not config["key"] and config.get("keyRequired", True):
            return self.send_json(
                501,
                {
                    "error": "No API key configured",
                    "hint": f"Paste {config['missing']} into .env next to server.py, then press Generate again — the server re-reads .env on every request, so no restart is needed.",
                    "setupUrl": config["setupUrl"],
                    "provider": config["provider"],
                },
            )

        prompt = PROMPT_TEMPLATE.format(subject=subject)
        started = time.time()
        try:
            if config["provider"] == "wavespeed":
                result = generate_wavespeed(config, prompt)
            elif config["provider"] == "pollinations":
                result = generate_pollinations(config, prompt)
            else:
                result = generate_openai(config, prompt)
        except RuntimeError as error:
            return self.send_json(502, {"error": str(error), "provider": config["provider"]})
        except Exception as error:  # noqa: BLE001 - surface anything the provider throws
            return self.send_json(502, {"error": f"{type(error).__name__}: {error}", "provider": config["provider"]})

        return self.send_json(
            200,
            {
                "image": result["image"],
                "provider": config["provider"],
                "model": config["model"],
                "prompt": subject,
                "promptUsed": prompt,
                "seconds": round(time.time() - started, 1),
            },
        )


def main() -> None:
    # LOCAL by default; hosted platforms inject PORT and need a public bind.
    port_env = os.environ.get("PORT")
    host = os.environ.get("HOST", "0.0.0.0" if port_env else "127.0.0.1")
    port = int(port_env or "5173")
    config = read_config()
    ready = bool(config["key"]) or not config.get("keyRequired", True)
    state = (
        f"AI ready · {config['provider']} · {config['model']}"
        if ready
        else f"AI off · set {config['missing']} in .env to enable generation"
    )
    print(f"PixelForge → http://{host}:{port}")
    print(f"  {state}")
    print("  Ctrl+C to stop")
    server = ThreadingHTTPServer((host, port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
