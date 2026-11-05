# VPS deployment example

This is a minimal direct-hosting demo, not a production-ready application template. It runs the sample web server privately and places Caddy in front for automatic HTTPS.

1. Provision an Ubuntu/Debian VPS and install Docker Engine + Compose plugin.
2. Point `demo.example.com` A/AAAA DNS records at the VPS address.
3. Allow inbound TCP 80/443 (and optionally UDP 443 for HTTP/3) in the VPS firewall.
4. Run:

```bash
cd deployment
SITE_DOMAIN=demo.example.com docker compose up -d --build
```

5. Browse to `https://demo.example.com`.

The Node container has no public host port; only Caddy publishes 80/443. Replace `demo-web` with your project image/build. Keep database services on private networks, inject secrets at runtime, patch the host, configure backups and monitoring, and review TLS/DNS/firewall settings before production.

To stop: `docker compose down`. Persistent Caddy data remains in named volumes unless you remove them.
