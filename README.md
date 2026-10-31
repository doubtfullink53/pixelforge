# PixelForge

A local pixel art **character generator** built in the spirit of
[PixelLab](https://www.pixellab.ai/): describe a character in words and get a game-ready sprite.

Two sources, one studio:

- **Local engine** — a seeded geometry engine draws the character instantly, in eight directions and
  five animations. No network, no key, no cost.
- **AI model** — a real image model (WaveSpeedAI by default, or any OpenAI-compatible
  `/images/generations` endpoint you have access to) draws the character from your prompt, then
  PixelForge converts that render into a crisp, limited-palette sprite locally.

```bash
python server.py
# open http://127.0.0.1:5173
```

The local engine works immediately. AI mode needs a key — see [AI setup](#ai-setup).

## What it does

- **Text prompt → character**: an archetype parser reads the prompt (`hooded ranger with a longbow`,
  `golden king`, `toxic slime`, `neon robot`) and maps it to anatomy, gear, palette and extras.
- **Eight directions**: front, back, both profiles and four three-quarter views. Vanilla sprites are
  authored once, then mirrored for the opposite side.
- **Five animations**: idle, walk, run, attack and cast, each with a hand-authored frame count.
- **Sprite sheet export**: PNG sheet (directions × frames) plus a JSON metadata file with frame
  rects, fps and the generated palette.
- **Deterministic seeds**: the same prompt + seed + options always produces the same sprite, so
  results are reproducible and shareable.
- **AI sprites**: one model call per generate; up to four variants per session. The pixel conversion
  (background keying, palette reduction, outline) runs locally, so changing size or palette is free.

## How it works

### The local engine

The local generator is **procedural**, not a diffusion model: it draws characters on a 32×32 pixel
grid with a small geometry engine, using the same techniques a pixel artist would:

1. `js/spec.js` turns the prompt into a `spec` (archetype, gear, palette hue, anatomy, animation).
2. `js/palette.js` builds a coherent palette (cloth, metal, leather, skin, accent) from the spec.
3. `js/character.js` draws a role-mask grid: limbs, torso, head, gear and accessories.
4. `js/grid.js` lights the mask (top-left key light, dithered ramps, metal specular, selective
   outline) and turns it into RGBA pixels.
5. `js/generate.js` builds every direction × animation frame and composites export sheets.

### The AI path

Image models draw at 1024px with soft edges, gradients and a painted backdrop — the opposite of
pixel art. `js/pixelate.js` is the bridge:

1. **Key the backdrop** — flood fill from the border against the colour sampled from the corners,
   so a white or duplicated background becomes transparent. A painted scene is detected (almost
   nothing removed) and falls back to a centered crop.
2. **Crop and fit** the subject into the sprite grid, preserving aspect.
3. **Area-average downsample** to 32/48/64px, premultiplied by alpha so edges cannot tint the result.
4. **Median-cut quantization** to 12–32 colours.
5. **Outline** the silhouette in the sprite's own darkest colour, slightly cooled.

The server ([server.py](server.py)) exposes two endpoints and keeps your key:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/ai/status` | Provider, model, and whether a key is configured |
| `POST /api/ai/sprite` | `{ "prompt": "…" }` → `{ image: "data:image/png;base64,…", model, seconds }` |

## AI setup

1. Copy `.env.example` to `.env`.
2. Pick a provider.
   - **WaveSpeedAI** (default, one key for 1,000+ image models): [wavespeed.ai/access-key](https://wavespeed.ai/access-key)
   - **Any OpenAI-compatible image endpoint** you have access to: set `AI_PROVIDER=openai` and give
     an explicit `AI_IMAGE_BASE_URL` plus `AI_IMAGE_MODEL`. There is no default base URL, because
     OpenAI-compatible APIs that only do chat completions will answer `404` there — PixelForge
     shows that error verbatim rather than pretending it worked. Freebuff's own API is one of
     those: its `/models` list is chat-only and `/images/generations` is a 404, so it cannot draw.
   - **Pollinations** (`AI_PROVIDER=pollinations`): no account and no key. Advertised free tier is
     1 image every 45 seconds per IP, but that limit is unreliable in practice — when it triggers,
     the endpoint returns a branded "Free limit reached" placeholder *image* with a 402, which
     PixelForge rejects and reports instead of saving a fake sprite. Treat it as a demo, not a
     dependency.
3. Start `python server.py`, open the app, switch to **AI model**.

Editing `.env` later needs no restart: the server reads it on every request, so paste the key,
press **Recheck key & generate** and it is live. (Restart only if you change `.env` while the server
is stopped.)

The key lives in `.env`, is read only by the server, and `.env` is git-ignored. The page never sees
it — the browser only ever receives a data URL. Each generate spends one call on your account, so
prompt edits do not auto-generate; press **Generate sprite** (or `Ctrl`/`Cmd` + `Enter`).

If no key is configured the panel shows the exact variable it needs and where to get it; the local
engine keeps working regardless.

## Deploy

There are two shapes, because AI generation needs a process that can hold a secret.

### Static hosting (GitHub Pages, Netlify, Cloudflare Pages)

The local engine, all eight directions, five animations and every export work with no backend. AI mode
does not: there is no server to keep the key, so the panel detects the missing proxy and says so
rather than failing with a stack of HTML.

`.github/workflows/pages.yml` deploys the app to GitHub Pages on every push to `main`:

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The site lands at `https://<user>.github.io/<repo>/` after the first run of the **Deploy static
   app to GitHub Pages** workflow.

All asset paths are relative, so serving from a repository subpath works unchanged. The workflow
assembles a `dist/` folder containing only `index.html`, `styles.css` and `js/` — `server.py`, `.env`,
`qa/` and the workflow itself are never uploaded, so a local key cannot be published even by mistake.

### A host that runs Python (Render, Railway, Fly, a VPS)

`server.py` serves the app *and* the AI endpoint on one origin, so this is the only deployment that
has AI built in:

1. Point the host at this repository. `Procfile` already declares `web: python server.py`.
2. Add `AI_IMAGE_KEY` (and optionally `AI_PROVIDER`, `AI_IMAGE_MODEL`) as an environment variable in
the host's dashboard — never in the repo.
3. The server binds `0.0.0.0` automatically when the platform provides `PORT`.

**This costs money per request, and a public URL means anyone's requests.** Keep the URL private,
put it behind the host's auth, or deploy without a key and treat it as a static demo. There is no
built-in rate limit; the key holder pays for every generation.

## Files

| Path | Purpose |
| --- | --- |
| `server.py` | Static server + AI proxy (Python stdlib, no dependencies) |
| `Procfile`, `requirements.txt` | Start command + Python marker for hosting platforms |
| `.gitattributes`, `.gitignore` | LF in the repo; secrets, caches and QA captures stay local |
| `.github/workflows/pages.yml` | GitHub Pages deployment (static, no AI backend) |
| `index.html` | App shell |
| `styles.css` | Studio UI |
| `js/app.js` | UI state, playback, AI generation, export handling |
| `js/ai.js` | Client for the proxy (`/api/ai/*`) |
| `js/pixelate.js` | Model render → pixel sprite (keying, downsample, quantize, outline) |
| `js/spec.js` | Prompt parsing, archetypes, anatomy |
| `js/character.js` | Sprite drawing (humanoid, slime, ghost, gear) |
| `js/grid.js` | Pixel grid primitives, lighting, renderer |
| `js/palette.js` | Palette construction |
| `js/generate.js` | Directions, animation frames, sprite sheets |
| `js/rng.js` | Seeded PRNG |
| `js/color.js` | HSL/RGB helpers |
| `qa/lab.html` | Dev view: every sample archetype at 6×, or one prompt at a large zoom |

## Sprite lab

`qa/lab.html` renders the local engine's samples side by side so you can judge silhouettes and
animations at a comfortable size. Add `?prompt=…&scale=10` to inspect a single character (all eight
directions plus walk, attack and cast strips). It is a development page, not part of the app.

## Controls

- Click any frame in the filmstrip to pause on it; `Space` toggles playback (local mode).
- `R` rolls a new seed. Every local control re-renders live — there is no generate button.
- In AI mode the filmstrip holds the session's variants; clicking one re-pixelates it.
- Directions on the right always show frame 1 of the current animation in all eight views.

## Limits

The local engine is rules-based: it draws humanoids, slimes and ghosts with recognisable gear, but
it will not follow detailed art direction, and output is fixed at 32×32 with a structured palette.

AI mode draws one **front-facing** character per call — no directional set and no animation, because
an image model returns a single picture. Converting a 1024px render to 32×32 also averages away fine
detail, so busy costumes and small props read as a few pixels. It needs a key and an internet
connection; the local engine does not.
