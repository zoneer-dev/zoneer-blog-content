# zoneer-decap-oauth

Self-hosted OAuth provider so Decap CMS's GitHub backend can authenticate without depending on
Netlify's proxy. Implements Decap's documented `/auth` + `/callback` contract as a Cloudflare
Worker — see [`src/index.js`](src/index.js) for the full flow.

## One-time setup

1. **Register a GitHub OAuth App** — github.com/settings/developers → OAuth Apps → New OAuth App:
   - Homepage URL: `https://zoneer.pro`
   - Authorization callback URL: `https://zoneer-decap-oauth.<your-subdomain>.workers.dev/callback`
     (swap in the real subdomain after the first `wrangler deploy` tells you the URL, then update
     the callback URL in the GitHub app settings to match exactly)
   - Save the **Client ID** and generate a **Client Secret**.

2. **Install deps and deploy:**
   ```bash
   npm install
   npx wrangler deploy
   ```

3. **Set the secrets** (never commit these):
   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

4. **Point Decap at it** — in the site repo's `public/admin/config.yml`, set
   `backend.base_url` to `https://zoneer-decap-oauth.<your-subdomain>.workers.dev`.

## `ALLOWED_DOMAINS`

`wrangler.jsonc`'s `vars.ALLOWED_DOMAINS` restricts which `site_id` (i.e. which origin `/admin` is
served from) may use this authenticator. Update it if the site's domain changes.
