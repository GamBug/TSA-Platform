# Public demo runbook

How the unofficial TSA practice demo runs on the shared VPS at `https://tsa.smartnovi.tech`. Everything here is run
from the owner's PC over SSH (host alias `vps`, user `deploy` with passwordless `sudo`). The server also hosts other
projects, so nothing below touches their nginx sites, Docker, firewall or users.

## What runs where

| Part | Place |
|------|-------|
| Public edge | The existing nginx and Certbot; one extra site `tsa.smartnovi.tech` proxies to `127.0.0.1:4180` |
| App | `/opt/tsa-platform/releases/<release>`; `/opt/tsa-platform/current` points to the live one |
| Service | `tsa-demo.service` (user `tsa`, `Restart=always`), runs `scripts/start-uni-demo.mjs` in public mode |
| Node and PostgreSQL | Node 24.18.0 in `/opt/node` (not on the system path); PostgreSQL 18.6 binaries from the PGDG repository, held with `apt-mark hold` because the launcher accepts exactly 18.6; **no cluster and no system service**, the launcher starts its own private PostgreSQL |
| Private Bank | `/var/lib/tsa/track-b` and `/var/lib/tsa/track-b-images` (mode 700, owner `tsa`), uploaded from the PC |
| Settings | `/etc/tsa/demo.env` (mode 640, root:tsa), no secrets |

On every start the launcher backs up the Bank into `/var/lib/tsa/track-b-backups/before-start-*`, restores it into a
disposable database, and seeds offerings that stay open for `DEMO_OFFERING_DAYS` days (14). Guest attempts live only in
that disposable database, so a restart clears them. Restart rarely, and not while visitors are mid-test.

## One-time setup

1. **DNS.** Add an `A` record `tsa.smartnovi.tech` pointing to `103.72.56.139`. Check: `getent hosts tsa.smartnovi.tech`.
2. **Provision** (idempotent; adds the `tsa` user, Node, PostgreSQL 18 binaries, folders and `/etc/tsa/demo.env`):
   `ssh vps 'bash -s' < infra/server/install.sh`
3. **Settings.** Edit `/etc/tsa/demo.env` (`sudo nano`): set `DEMO_UNI_SOURCE_CREDIT` to the real source-credit text. It is
   shown to every student and the service refuses to start without it.
4. **Service unit:** `scp infra/server/tsa-demo.service vps:/tmp/ && ssh vps 'sudo install -m 644 /tmp/tsa-demo.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable tsa-demo'`
5. **Release and Bank:** see "Deploy a release" and "Upload the Bank".
6. **nginx site** (after DNS resolves):
   `scp infra/server/nginx-tsa.conf vps:/tmp/ && ssh vps 'sudo install -m 644 /tmp/nginx-tsa.conf /etc/nginx/sites-available/tsa.smartnovi.tech && sudo ln -sfn /etc/nginx/sites-available/tsa.smartnovi.tech /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx'`
7. **TLS:** `ssh vps 'sudo certbot --nginx -d tsa.smartnovi.tech'` (accept the redirect to https). Certbot renews on its own.

## Deploy a release

1. Commit, then tag: `git tag demo-<date>-rc<n>`. Only committed files are shipped.
2. `bash infra/server/release.sh demo-<date>-rc<n>` packs the tag, copies it to the server, runs `npm ci --ignore-scripts`,
   the contract build and the student app build as user `tsa`, switches `current` and restarts the service. The three newest
   releases stay on disk.
3. Check: `ssh vps 'curl -fsS http://127.0.0.1:4180/healthz'` and `ssh vps 'journalctl -u tsa-demo -n 40 --no-pager'`.
   The log ends with the summary ("Full simulation: offered") when the service is ready.

## Upload the Bank

Run on the PC with the local demo and Bank server stopped: `bash infra/server/upload-bank.sh`. It refuses if
`.local/track-b` is open, keeps a local copy in `.local/track-b-backups/pre-upload-*`, uploads, stops the service,
keeps the previous server Bank as `/var/lib/tsa/track-b.previous`, installs the new one and starts the service.
The Bank is published by the owner on the PC (see [BANK_CORRECTIONS](BANK_CORRECTIONS.md) and the question-bank guides);
the server never publishes anything.

## Daily operation

| Task | Command |
|------|---------|
| Status | `ssh vps 'systemctl status tsa-demo --no-pager'` |
| Live log | `ssh vps 'journalctl -u tsa-demo -f'` |
| Restart (clears every guest attempt) | `ssh vps 'sudo systemctl restart tsa-demo'` |
| Health | `curl -fsS https://tsa.smartnovi.tech/healthz` |
| Disk | `ssh vps 'df -h / ; sudo du -sh /var/lib/tsa/*'` |

`track-b-backups/before-start-*` grows by about 4 MB per start. Delete old ones with
`sudo find /var/lib/tsa/track-b-backups -maxdepth 1 -name 'before-start-*' -mtime +7 -exec rm -rf {} +`.

## Live checks

`node scripts/verify-public-live.mjs https://<host> [--guests 50] [--full 10]` checks the public surface (staff paths 404, foreign
Origin refused), guest isolation, that the delivered test contains no key or staff field, and then runs the given numbers of
concurrent Math section attempts and full 100-question tests, with grading. It needs `DEMO_GUESTS_PER_HOUR` above the guest count.
Restart the service afterwards to clear the test guests and attempts.

## Known performance limit (2026-11-19)

Creating a test is slow on this server: a full 40/20/40 test takes about 30 s to build (about 8 s on a fast laptop), and a
section practice about 8 s, because each creation re-checks rights and delivery for the whole published pool inside the database
function `tsa.assembly_commit_simulation`. Several creations at once queue on the database connections: 12 simultaneous starts
gave 4 temporary 503 answers, and 3 simultaneous full tests took about 3.5 minutes. Answering, reading and grading are fast
(median request about 130 ms). Planner hints on the helper functions made it worse; caching the per-question checks for the
life of the disposable copy is the candidate fix and needs the owner's decision.

## Rollback

- **Code:** `ssh vps 'sudo ln -sfn /opt/tsa-platform/releases/<previous> /opt/tsa-platform/current && sudo systemctl restart tsa-demo'`
  (`ls /opt/tsa-platform/releases` lists what is kept).
- **Bank:** `ssh vps 'sudo systemctl stop tsa-demo && cd /var/lib/tsa && sudo rm -rf track-b track-b-images && sudo mv track-b.previous track-b && sudo mv track-b-images.previous track-b-images && sudo systemctl start tsa-demo'`.

## Take the demo down

Stop and disable the service (`sudo systemctl disable --now tsa-demo`), remove the nginx site and its certificate
(`sudo rm /etc/nginx/sites-enabled/tsa.smartnovi.tech && sudo nginx -t && sudo systemctl reload nginx && sudo certbot delete --cert-name tsa.smartnovi.tech`),
delete the DNS record, then delete the data: `sudo rm -rf /var/lib/tsa /opt/tsa-platform /etc/tsa`.
The data on the server is the questions and synthetic guest attempts; there is no personal data.
Record the takedown in [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md).

## Boundaries

- The firewall (`ufw`) is inactive on this host and is left alone: SSH listens on port 2222, and other projects share the machine.
- The pending operating-system restart on this host is the VPS owner's decision.
- Only ports 80 and 443 reach the demo, through nginx. The app listens on `127.0.0.1:4180` only.
