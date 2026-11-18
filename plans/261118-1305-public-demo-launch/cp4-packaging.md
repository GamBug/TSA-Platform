# CP4 — Server packaging and runbook (Fri 20 – Sat 21 Nov)

Recommended implementer: Claude Code, Opus 5.5, high reasoning — shell-heavy work (install script,
systemd, Caddy, a throwaway VM test) where the deploy skill and direct terminal access help.
Fallback: Codex, strongest listed model, high.

## Decisions already fixed

Target: the VPS provided by the owner's relative (shared machine). Do not touch its existing services,
users, firewall rules or web-server sites beyond what the relative approves. If ports 80/443 already
belong to nginx/Apache/Caddy/Docker, add one site (server block) proxying to `127.0.0.1:4180` instead of
installing Caddy, and adapt the file list below. Adapt OS package steps to the reported OS version.

Native install (no Docker): Ubuntu 24.04 LTS, Node 24.18.0, npm 11.16.0, PostgreSQL 18.6 binaries
(PGDG apt; if 18.6 exactly is unavailable, check whether the launcher accepts the available 18.x and
record it), Caddy 2 from its official apt repo. Server user `tsa`, app in `/opt/tsa-platform`,
private Bank in `/var/lib/tsa/track-b` (mode 700), env file `/etc/tsa/demo.env` (mode 600).

## Files to create (under `infra/`, which is empty today)

1. `infra/server/install.sh` — idempotent: installs packages, creates the user and folders, clones or
   updates the repo at a given commit, runs `npm ci --ignore-scripts`, `npm run build`,
   `npm run setup:student`, `npm run build:student`. Prints each step; fails fast (`set -euo pipefail`).
2. `infra/server/tsa-demo.service` — systemd unit: `User=tsa`, `EnvironmentFile=/etc/tsa/demo.env`,
   `ExecStart=/usr/bin/node scripts/start-uni-demo.mjs` (after build), `Restart=always`,
   `RestartSec=5`, `KillSignal=SIGTERM`, `TimeoutStopSec=30`, `NoNewPrivileges`, `ProtectSystem=strict`,
   `ReadWritePaths` limited to the data, backup and temp folders. Verify the launcher writes nowhere else.
3. `infra/server/Caddyfile` — `<domain> { reverse_proxy 127.0.0.1:4180; encode gzip; header Strict-Transport-Security "max-age=31536000" }`
   plus `request_body max_size 1MB`.
4. `infra/server/demo.env.example` — `NODE_ENV=development` (required by the synthetic identity; the
   runbook explains why), `DEMO_PUBLIC=true`, `DEMO_PUBLIC_ORIGIN`, `DEMO_UNI_PORT=4180`,
   `DEMO_UNI_SOURCE_CREDIT`, `DEMO_GUEST_POOL`, `TRACK_B_DATA_DIRECTORY`, `PG_BIN`. No secrets committed.
5. `infra/server/upload-bank.sh` — run on the owner's PC: makes a fresh backup of `.local/track-b`,
   then `rsync -a --delete` over SSH to `/var/lib/tsa/track-b`, then restarts the service.
6. `docs/guides/PUBLIC_DEMO_RUNBOOK.md` — provision, first deploy, update deploy (git pull to a tagged
   commit + rebuild + restart), upload Bank, logs (`journalctl -u tsa-demo -f`), restart, rollback
   (previous tag + previous Bank backup), take down (stop service, remove DNS), firewall
   (`ufw allow 22,80,443`), what data exists on the server and how to delete it after the demo.

## Verification

On a throwaway local VM or container that mimics Ubuntu 24.04 (e.g. `multipass` or a cheap hourly VM):
follow the runbook literally from a blank machine using the rehearsal inventory; `curl -fsS
http://127.0.0.1:4180/healthz` succeeds; `systemctl restart` and `kill -9 <node pid>` both recover
within 10 s; no orphan postgres after `systemctl stop`.

## Expected output

Commit `feat(infra): add the public demo server install, service and proxy config`; runbook; report
listing every command run on the test VM and its result.
