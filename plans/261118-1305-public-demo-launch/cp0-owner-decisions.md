# CP0 — Owner decisions (Wed 18 Nov)

Recorder: Claude Code, Opus 5.5, medium reasoning (short documentation work with the plan in context).

## Recorded 2026-11-18 ([OPEN_DECISIONS](../../docs/decisions/OPEN_DECISIONS.md#public-demo-launch-and-real-full-simulation--2026-11-18))

| ID | Decision |
|----|----------|
| D1 | One-click synthetic guests, one per browser, no personal data |
| D2 | Staff workspace off on the public URL |
| D3 | One complete real 40/20/40 test is required (supersedes the 2026-11-11 "no full simulation" decision) |
| D3a | Combined "TSA simulation" taxonomy; pool imported as new questions; no database rule change |
| D3b | Science: owner files first, AI-written originals for the rest, each approved by the owner |
| D4 | Hosting on the VPS provided by the owner's relative; access expected the evening of 2026-11-18 |

## Still open

| ID | Question | Needed by |
|----|----------|-----------|
| D5 | Domain: one the owner/relative controls, or a free DuckDNS subdomain | Sat 21 (CP5) |
| D7 | What Science files the owner will supply, and when | Thu 19, 20:00 |
| D8 | Owner review slot for ~25 AI-written Science questions (2–3 hours) | Sat 21 |
| D9 | Exact `DEMO_UNI_SOURCE_CREDIT` text | Fri 20 |

## Ask the relative for (tonight)

1. SSH login: a separate user for this project with `sudo` (or the exact commands they allow), key-based.
2. OS and version (`cat /etc/os-release`), CPU/RAM/disk free (`nproc; free -h; df -h /`).
3. What already runs there, especially on ports 80/443 (`sudo ss -ltnp`), and which web server owns them
   (nginx, Caddy, Apache, Docker). If one exists, we add a site to it instead of installing Caddy.
4. Whether a domain or subdomain can point at this server.
5. Any rules: firewall, resource limits, backup schedule, maintenance windows.
