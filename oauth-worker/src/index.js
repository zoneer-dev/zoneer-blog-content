/**
 * Self-hosted OAuth provider for Decap CMS's GitHub backend, so login doesn't depend on
 * Netlify's proxy for a site that isn't hosted on Netlify.
 *
 * Implements Decap's expected two-step flow:
 *   1. GET /auth    — redirect the popup to GitHub's OAuth authorize screen.
 *   2. GET /callback — exchange the returned code for a token, then postMessage it back to
 *      the window that opened the popup (the Decap admin UI), which is listening for it.
 *
 * Adapted from the sveltia-cms-auth pattern (MIT), trimmed to GitHub only.
 * @see https://github.com/sveltia/sveltia-cms-auth
 * @see https://decapcms.org/docs/external-oauth-clients/
 */

const GITHUB_HOSTNAME = 'github.com';
const DEFAULT_SCOPE = 'repo,user';

/**
 * Turn the ALLOWED_DOMAINS env var ("zoneer.pro,*.zoneer.pro") into anchored regex sources.
 * Empty/unset means "don't check" — only do that while testing, always set it in production.
 */
const getDomainPatterns = (allowedDomains) =>
  (allowedDomains ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.+')}$`);

const isTrustedOrigin = (origin, patterns) => {
  if (!patterns.length) return true;
  try {
    const { hostname } = new URL(origin);
    return patterns.some((p) => new RegExp(p).test(hostname));
  } catch {
    return false;
  }
};

const serialize = (value) => JSON.stringify(value ?? null).replaceAll('<', '\\u003c');

/** HTML response that postMessages the result back to window.opener, per Decap's contract. */
function outputHTML({ token, error, errorCode, allowedDomains }) {
  const state = error ? 'error' : 'success';
  const content = error ? { provider: 'github', error, errorCode } : { provider: 'github', token };
  const patterns = getDomainPatterns(allowedDomains);

  return new Response(
    `<!doctype html><html><body><script>
      (() => {
        const trustedPatterns = ${serialize(patterns)};
        const hasToken = ${serialize(!!token)};
        const isTrusted = (origin) => {
          if (!trustedPatterns.length) return true;
          try {
            const { hostname } = new URL(origin);
            return trustedPatterns.some((p) => new RegExp(p).test(hostname));
          } catch { return false; }
        };
        window.addEventListener('message', ({ data, origin }) => {
          if (data !== 'authorizing:github') return;
          if (hasToken && !isTrusted(origin)) return;
          window.opener?.postMessage('authorization:github:${state}:${JSON.stringify(content)}', origin);
        });
        window.opener?.postMessage('authorizing:github', '*');
      })();
    </script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Set-Cookie': 'csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure',
      },
    },
  );
}

async function handleAuth(request, env) {
  const { searchParams, origin: workerOrigin } = new URL(request.url);
  const domain = searchParams.get('site_id') ?? '';
  const scope = searchParams.get('scope') || DEFAULT_SCOPE;
  const { GITHUB_CLIENT_ID, ALLOWED_DOMAINS } = env;
  const domainPatterns = getDomainPatterns(ALLOWED_DOMAINS);

  if (!GITHUB_CLIENT_ID) {
    return outputHTML({ error: 'OAuth client ID is not configured.', errorCode: 'MISCONFIGURED_CLIENT', allowedDomains: ALLOWED_DOMAINS });
  }

  if (domainPatterns.length && !domainPatterns.some((p) => new RegExp(p).test(domain))) {
    return outputHTML({ error: 'This domain is not allowed to use this authenticator.', errorCode: 'UNSUPPORTED_DOMAIN', allowedDomains: ALLOWED_DOMAINS });
  }

  const csrfToken = crypto.randomUUID().replaceAll('-', '');
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope,
    state: csrfToken,
    redirect_uri: `${workerOrigin}/callback`,
  });

  return new Response('', {
    status: 302,
    headers: {
      Location: `https://${GITHUB_HOSTNAME}/login/oauth/authorize?${params.toString()}`,
      'Set-Cookie': `csrf-token=${csrfToken}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`,
    },
  });
}

async function handleCallback(request, env) {
  const { searchParams, origin: workerOrigin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const { ALLOWED_DOMAINS, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env;

  const cookieMatch = request.headers.get('Cookie')?.match(/\bcsrf-token=([0-9a-f]{32})\b/);
  const csrfToken = cookieMatch?.[1];

  if (!code || !state) {
    return outputHTML({ error: 'Failed to receive an authorization code. Please try again.', errorCode: 'AUTH_CODE_REQUEST_FAILED', allowedDomains: ALLOWED_DOMAINS });
  }

  if (!csrfToken || state !== csrfToken) {
    return outputHTML({ error: 'Potential CSRF attack detected. Authentication flow aborted.', errorCode: 'CSRF_DETECTED', allowedDomains: ALLOWED_DOMAINS });
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return outputHTML({ error: 'OAuth client ID or secret is not configured.', errorCode: 'MISCONFIGURED_CLIENT', allowedDomains: ALLOWED_DOMAINS });
  }

  let token = '';
  let error = '';

  try {
    const response = await fetch(`https://${GITHUB_HOSTNAME}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        redirect_uri: `${workerOrigin}/callback`,
      }),
    });
    ({ access_token: token, error } = await response.json());
  } catch {
    return outputHTML({ error: 'Failed to request an access token. Please try again later.', errorCode: 'TOKEN_REQUEST_FAILED', allowedDomains: ALLOWED_DOMAINS });
  }

  return outputHTML({ token, error, allowedDomains: ALLOWED_DOMAINS });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/auth') return handleAuth(request, env);
    if (request.method === 'GET' && pathname === '/callback') return handleCallback(request, env);

    return new Response('Not found', { status: 404 });
  },
};
