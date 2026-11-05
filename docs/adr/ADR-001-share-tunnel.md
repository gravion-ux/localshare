# ADR-001: Use Cloudflare Tunnels for Localshare's first release

- Status: Accepted for prototype
- Date: 2026-11-04

## Context

The first Localshare feature must make a local web server reachable without deploying the project to a hosting provider.

## Decision

Use Cloudflare Quick Tunnels for temporary previews and support a user-configured named tunnel for stable hostnames. Keep tunnel policy and DNS configuration in Cloudflare; Localshare validates user inputs and launches `cloudflared`.

## Trade-offs

- Quick Tunnel: easy and temporary; random hostname, service ends when process stops, documented request/SSE/uptime limitations.
- Named tunnel: stable hostname and Access policies; requires Cloudflare account, domain, tunnel credentials and ingress configuration.
- Direct VPS hosting is a separate deployment path, not a tunnel mode.
- A Gravion-operated relay is deferred until there is a real multi-user control plane and abuse/security operations.

## References

- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/
- https://developers.cloudflare.com/tunnel/get-started/
