# Localshare: local, cloud and VPS deployment

Localshare helps you share a web project; it does not magically upload your source code to the internet. The app stays where it is running. A tunnel or a deployment makes its HTTP service reachable.

## A. Localhost -> temporary link (fastest)

**Example:** React/Vite/Next development server at `127.0.0.1:3000`.

1. Run your project locally.
2. Install or update `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/. Use version 2026.9.3 or later for the protected Quick Tunnel `--allowed-mail` option.
3. In another terminal:

```bash
cd 
npm start -- --port 3000 --allow-email friend@example.com
```

4. Copy the temporary URL displayed by Localshare and send it to your friend.
5. Friend enters the allowed email and Cloudflare sends a one-time PIN.
6. Keep your laptop awake and online. Press `Ctrl+C` to stop.

For a deliberately public preview:

```bash
npm start -- --port 3000 --public
```

Type `EXPOSE` only after checking that the selected app has no secrets, admin routes or sensitive data. Anyone who gets the URL can access it in public mode.

**Use this for:** quick demos, client previews, webhook testing and short-lived QA. It is not permanent hosting. The URL changes per session. Quick Tunnel traffic has documented limits (including no SSE support and a 200 in-flight request ceiling) and no uptime guarantee.

## B. Stable hostname -> named tunnel (on your PC OR VPS)

This mode gives you a hostname such as `preview.example.com`. You need:
- A Cloudflare account and a domain managed/configured there.
- A named tunnel and its credentials.
- A `cloudflared` config file with an ingress mapping.
- A Cloudflare Access self-hosted application/policy if only invited people should enter.

Create the tunnel in the Cloudflare dashboard (or follow the official named tunnel setup). A locally-managed example config:

```yaml
# ~/.cloudflared/config.yml
# Replace the placeholders; keep the credentials file private.
tunnel: YOUR_TUNNEL_UUID
credentials-file: /home/YOUR_USER/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: preview.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Validate the file:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml ingress validate
```

Create/attach the DNS route in your Cloudflare tunnel setup, then configure a Cloudflare Access self-hosted app and an Allow policy for the exact invited emails or identity group. Do not assume a hostname is protected merely because a tunnel is active.

Run with Localshare:

```bash
npm start -- --mode named \
  --config ~/.cloudflared/config.yml \
  --tunnel YOUR_TUNNEL_NAME \
  --hostname preview.example.com
```

The configured hostname continues to route while the named tunnel is running. You can run `cloudflared` on your personal machine or a VPS. For a VPS, keep the origin service bound to loopback/private networking and manage the process with systemd or your container orchestrator.

## C. Host the project permanently on a VPS/cloud VM

This is conventional deployment: upload/build the project on a cloud VM, run it as a service/container and serve it behind Caddy/Nginx with TLS. You no longer depend on your laptop being online.

This bundle includes `deployment/compose.yml`, `deployment/Caddyfile` and a tiny static demo. To try the example:

```bash
cd deployment
# Point your domain's DNS A/AAAA record at the VPS first.
# Set SITE_DOMAIN in the environment, then:
SITE_DOMAIN=demo.example.com docker compose up -d --build
```

Open `https://demo.example.com`. Ensure the VPS firewall allows inbound TCP 80 and 443; do not expose the app container port publicly. For a real application, replace the demo container with your build/runtime and keep secrets outside the image.

## D. Host Localshare itself as a public SaaS

That is **not implemented in this starter**. A production product needs a control-plane API, user login, tenant/session database, short-lived connector credentials, reverse-tunnel relay, edge hostname routing, abuse protection, expiry/revocation, monitoring, billing/quotas and an on-call/security process. This is planned for roadmap phases 4–6.

## E. Which option should you choose?

| Goal | Choose |
|---|---|
| Show today's localhost project to a friend | A — Quick Tunnel |
| Keep one stable preview URL, still running app on your own PC | B — Named Tunnel on PC |
| Run stable preview from an always-on machine | B — Named Tunnel on VPS |
| Host a production website/service | C — Direct VPS/cloud deployment |
| Let many users create share links through Gravion accounts | D — Future Gravion SaaS relay |

## Safety checklist

- Only share an HTTP app you own or have permission to expose.
- Bind development servers to loopback where possible.
- Keep databases, Redis, Docker sockets, SSH, admin dashboards and debug consoles private.
- Use email PIN or Access policy for non-public previews.
- Rotate any development credentials that were accidentally exposed.
- Use HTTPS at the edge and patch the host OS/runtime.

### Optional: keep a named tunnel running on a Linux VPS

Install `cloudflared`, place the named-tunnel config and credentials under `/etc/cloudflared/` readable only by a dedicated service account, and adapt `deployment/cloudflared-named-tunnel.service.example`:

```bash
sudo useradd --system --home /var/lib/cloudflared --shell /usr/sbin/nologin localshare
sudo install -d -o localshare -g localshare -m 700 /var/lib/cloudflared
sudo install -d -m 750 -o root -g localshare /etc/cloudflared
# Copy your real config and tunnel credentials securely; do not commit them.
sudo chmod 640 /etc/cloudflared/config.yml
sudo chmod 640 /etc/cloudflared/YOUR_TUNNEL_UUID.json
sudo cp deployment/cloudflared-named-tunnel.service.example /etc/systemd/system/localshare-cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable --now localshare-cloudflared
sudo systemctl status localshare-cloudflared
```

Before enabling, edit the service `ExecStart` tunnel name, config path, account ownership and credential-file path to match your deployment. Review systemd hardening against your installed `cloudflared` version. Keep the app origin private on `127.0.0.1`; do not open its application port on the public firewall.
