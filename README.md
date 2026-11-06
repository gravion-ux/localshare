# Localshare v0.4.3

CLI to share a local development service via Cloudflare Quick Tunnel, or run a preconfigured Named Tunnel with a stable hostname.

## Requirements

- Node.js 20+
- `cloudflared` installed and available on PATH (use a current release that supports protected Quick Tunnels with `--allowed-mail`)
- A local HTTP app for Quick Tunnel mode; a configured Cloudflare named tunnel for named mode

## Mode 1 — temporary local share

```bash
npm test
npm start -- --port 3000 --allow-email teammate@example.com
```

The recipient completes Cloudflare's email one-time-PIN flow. Multiple email addresses can be comma-separated or repeated. You may also explicitly allow a whole email domain with `--allow-email '*@example.com'`; that grants access to every matching address on the domain.

Options that take a value accept both spellings: `--port 3000` and `--port=3000` are equivalent. A value that starts with `--` is still refused, so a value can never be mistaken for another option.

Public link (interactive confirmation required):

```bash
npm start -- --port 3000 --public
```

Anyone with the URL may access the app in public mode. The process and your computer must stay online; the random URL expires when the tunnel stops.

## Mode 2 — stable named tunnel

Create a Cloudflare named tunnel, set up DNS, configure an ingress rule in `~/.cloudflared/config.yml`, and create a Cloudflare Access self-hosted application/policy. Then:

```bash
npm start -- --mode named \
  --config ~/.cloudflared/config.yml \
  --tunnel localshare-preview \
  --hostname preview.example.com
```

The hostname is printed for convenience; it must actually match the ingress configuration. Access rules are created in Cloudflare, not by this CLI. This named tunnel can run on your laptop or on a VPS.

## Mode 3 — deploy the website to a VPS

See the repo-level [Localshare deployment guide](docs/SHARE-DEPLOYMENT.md) and runnable Caddy example in `deployment`. Direct app hosting is distinct from a tunnel. Localshare is not yet a multi-user hosted relay SaaS.

## Important

- Loopback origins only in Quick Tunnel mode.
- Email-restricted access is preferred for private previews.
- Never expose database ports, Docker socket, SSH, admin consoles, secrets or production credentials.
- Quick Tunnels are for development/testing; they have no uptime guarantee, their hostname changes every time, and have documented SSE/concurrency limitations.

---

## Part of the Gravion Toolkit

This repository holds one project from the four-project Gravion Toolkit. The projects are independent and can be used separately.

| Project | Purpose | Repository |
|---|---|---|
| **This repository** | Share a local development server through Cloudflare Quick or Named Tunnels | https://github.com/gravion-ux/localshare/tree/main |
| privacyflow | Validate authorized VPN profiles and plan safe rotation workflows | https://github.com/gravion-ux/privacyflow/tree/main |
| agent-browser | Run permission-aware browser tasks on allow-listed domains | https://github.com/gravion-ux/agent-browser/tree/main |
| gravion-trainner | Evaluate AI models against a JSONL dataset and report quality | https://github.com/gravion-ux/gravion-trainner/tree/main |

The four projects are **development foundations and MVP scaffolds**, not production services. They do not provide anonymity guarantees, CAPTCHA or anti-bot bypass, universal model retraining, or a managed multi-tenant sharing relay. See [the shared security notes](docs/SECURITY.md), [the threat model](docs/THREAT-MODEL.md) and [the roadmap](docs/ROADMAP.md) for the boundaries and the planned work.
