// Talks to the local proxy in server.py. The API key never reaches the browser:
// this module only ever sees a data URL.
//
// When the app is served as plain static files (GitHub Pages, Netlify, an
// artifact download) there is no proxy at /api/ai/*. That is not an error to
// dump into the UI — it is a deployment mode, and it is reported as one.

const ENDPOINT = '/api/ai';

const isLocalhost = () =>
  ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', ''].includes(location.hostname) ||
  location.protocol === 'file:';

/** Strip tags so an HTML error page never becomes UI text. */
function clean(text) {
  const stripped = String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 200);
}

async function readBody(response) {
  const text = await response.text();
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) return { __raw: text };
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text };
  }
}

const offline = (error) => ({
  available: false,
  hosted: !isLocalhost(),
  provider: '—',
  model: '—',
  error,
});

/** @returns {Promise<{available: boolean, provider: string, model: string, missing?: string, setupUrl?: string, note?: string, hosted?: boolean, error?: string}>} */
export async function aiStatus() {
  let response;
  try {
    response = await fetch(`${ENDPOINT}/status`, { headers: { accept: 'application/json' } });
  } catch {
    return offline('The proxy is not reachable');
  }

  let body;
  try {
    body = await readBody(response);
  } catch {
    return offline('The proxy did not answer');
  }

  if (!response.ok || body.__raw !== undefined) {
    // A static host answers /api/ai/status with its 404 page.
    return offline(response.ok ? 'Unexpected response from /api/ai/status' : `No proxy at ${ENDPOINT}`);
  }

  return { ...body, hosted: false };
}

/**
 * Ask the proxy for a freshly generated sprite.
 * @param {string} prompt
 * @param {AbortSignal} [signal]
 * @returns {Promise<{image: string, model: string, provider: string, seconds: number, promptUsed: string}>}
 */
export async function requestSprite(prompt, signal) {
  const response = await fetch(`${ENDPOINT}/sprite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  });
  const body = await readBody(response);
  const message = clean(body.error || body.__raw || `Generation failed (HTTP ${response.status})`);
  if (!response.ok || !body.image) {
    const error = new Error(message);
    error.code = response.status;
    error.hint = body.hint;
    error.setupUrl = body.setupUrl;
    throw error;
  }
  return body;
}

/** Decode a data URL into an image we can draw to a canvas. */
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode the generated image'));
    image.src = source;
  });
}
