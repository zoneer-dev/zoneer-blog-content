# zoneer-blog-content

Blog post content for [zoneer.pro](https://zoneer.pro), kept in its own repo so posts can be
added or edited independently of the main site's build/deploy pipeline.

## How this fits together

- Posts are plain Markdown files in [`posts/`](posts/), with YAML frontmatter (`title`,
  `description`, `pubDate`, `updatedDate`, `heroImage`, `tags`, `draft`).
- Images uploaded through the CMS land in [`images/`](images/) and are served live via jsDelivr's
  GitHub CDN (`cdn.jsdelivr.net/gh/zoneer-dev/zoneer-blog-content@main/images/<file>`) — no copying
  into the site repo needed.
- The [Decap CMS](https://decapcms.org) admin UI lives on the main site at `zoneer.pro/admin`, but
  it's configured to commit here (`backend.repo: zoneer-dev/zoneer-blog-content`).
- [`oauth-worker/`](oauth-worker/) is a small Cloudflare Worker that authenticates the CMS against
  GitHub (Decap's self-hosted OAuth provider contract) — see its own README for setup.
- The site (`zoneer-dev/zoneer-company-site`) fetches posts from this repo's GitHub API **at build
  time** via a custom Astro Content Layer loader — nothing here is fetched at request time.
- [`.github/workflows/notify-site.yml`](.github/workflows/notify-site.yml) pings the site's deploy
  trigger whenever `posts/**` changes on `main`, so publishing a post here rebuilds the live site
  automatically.

## Adding a post manually (without the CMS)

Add a file to `posts/` following the frontmatter shape of [`posts/hello-world.md`](posts/hello-world.md)
and push to `main`.
