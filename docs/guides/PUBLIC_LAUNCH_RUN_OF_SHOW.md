# Run of show: public launch (Tuesday 2026-11-24)

The unofficial, non-profit TSA practice site goes public for students. This page is the checklist for the days around it.
How the server is built and operated is in the [public demo runbook](PUBLIC_DEMO_RUNBOOK.md); do not repeat it here.

## 1. DNS record (the VPS owner)

Message to send to the person who controls the `smartnovi.tech` DNS:

> Please add one DNS record for the TSA practice site, and tell me when it is done:
> Type `A`, name `tsa` (full name `tsa.smartnovi.tech`), value `103.72.56.139`, TTL 300 or the default.
> Nothing else changes; the server is already set up and the existing sites are not touched.

Until it exists, the site works at `https://tsa.103.72.56.139.sslip.io/` (a name that always points at the server).

### Switch to the real name (after the record exists, about 5 minutes)

1. `getent hosts tsa.smartnovi.tech` must print `103.72.56.139`.
2. `ssh vps 'sudo certbot --nginx -d tsa.smartnovi.tech --redirect --non-interactive --agree-tos --keep-until-expiring'`
   (this server already has a Let's Encrypt account for its other sites). Certbot then serves the new certificate for this site.
3. `ssh vps 'sudo nano /etc/tsa/demo.env'`: set `DEMO_PUBLIC_ORIGIN=https://tsa.smartnovi.tech`.
   The app only accepts requests whose `Host` and `Origin` match this value, so the sslip.io name stops working for guests
   after the change. That is intended.
4. `ssh vps 'sudo systemctl restart tsa-demo'`, wait about 25 seconds.
5. `node scripts/verify-public-live.mjs https://tsa.smartnovi.tech --skip-load` must print no `FAIL`.
6. Regenerate the QR code for the new link (section 4) and open the link on a phone once.

## 2. Freeze: Monday 2026-11-23, 18:00

After the freeze only fixes for a defect that stops a student are shipped; each one needs a new tag and a live check.

- [ ] Working tree clean; the release to ship is tagged (`demo-261123-rc<n>`) and deployed with `bash infra/server/release.sh <tag>`.
- [ ] The Bank on the server is the one the owner approved. If it changed, run `bash infra/server/upload-bank.sh` (it backs up
      both sides and keeps the previous server Bank as `track-b.previous`).
- [ ] Fresh backups: the local Bank (`.local/track-b-backups`) and a copy of the server Bank
      (`ssh vps 'sudo tar -C /var/lib/tsa -czf /var/tmp/track-b-freeze.tgz track-b track-b-images'`, then `scp` it to the PC; delete the
      server copy afterwards).
- [ ] Live checks with load: `node scripts/verify-public-live.mjs https://tsa.smartnovi.tech --guests 50 --full 10` shows no `FAIL`
      and no 5xx.
- [ ] One full 40/20/40 attempt on a real phone, and one on a laptop, by a person: answer, jump between sections, submit, read the result.
- [ ] Disk and memory: `ssh vps 'df -h / ; free -m'` (more than 10 GB free).
- [ ] Certificate: `ssh vps 'sudo certbot certificates | grep -A2 tsa'` shows more than 30 days.
- [ ] **Last step:** `ssh vps 'sudo systemctl restart tsa-demo'` to clear the test guests and attempts, then wait 25 seconds and
      check `https://tsa.smartnovi.tech/healthz`. The tests then stay open for 14 days from this restart (until Monday 2026-12-07).
- [ ] Do not restart, deploy or upload again during the event: a restart erases every student's open attempt.

## 3. Launch morning (Tuesday)

1. `curl -fsS https://tsa.smartnovi.tech/healthz`, then open `https://tsa.smartnovi.tech/` on a phone; it must land on the
   student page and the button "Bắt đầu luyện tập" must start a guest.
2. `ssh vps 'systemctl is-active tsa-demo; journalctl -u tsa-demo -n 15 --no-pager'`: the log ends with the offering summary
   ("Full simulation: offered").
3. Share the link and the QR code. Say it is an unofficial practice site with no HUST affiliation and no official scoring.

## 4. The link and the QR code

The link to share is `https://tsa.smartnovi.tech/`. The QR code is made on the PC; nothing about it is stored in Git.
Current stand-in (sslip.io name): `.local/public-launch-qa/qr-sslip.svg`. To make the one for the real name:

```sh
python3 -m pip install --quiet --target /tmp/qr-tool qrcode
python3 -I -c "
import sys; sys.path.insert(0, '/tmp/qr-tool')
import qrcode, qrcode.image.svg
qrcode.make('https://tsa.smartnovi.tech/', image_factory=qrcode.image.svg.SvgPathImage,
            error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4).save('.local/public-launch-qa/qr-tsa.svg')"
```

Open the SVG in a browser to show or print it, and scan it with a phone before using it.

## 5. Ten-minute walk-through

| Minute | Show | Say |
|--------|------|-----|
| 0-1 | The link or QR code, then the opening page | An unofficial, non-profit practice site; questions are drawn from a corpus the owner is permitted to use; no HUST affiliation, no official scoring. |
| 1-2 | "Bắt đầu luyện tập" | No account is needed. Each visitor gets a private guest session. |
| 2-3 | The full-test card "Thi thử đầy đủ" | 100 questions: Math 40 (60 min), Reading 20 (30 min), Science 40 (60 min). Each section has its own clock. |
| 3-6 | Start the test, answer a few questions, open one with a formula and one with an image | Formulas and images are real TSA-style items. Free navigation inside a section; you can return to a section whose time remains. |
| 6-8 | Submit and read the result | The score is the number of correct answers, shown per section and in total. |
| 8-9 | Section practice (Math, Science) | Short sets of 4 questions for quick practice. Reading practice is inside the full test. |
| 9-10 | The About page | The source credit, and how to report a wrong question or a display problem (tell the person who sent the link). |

## 6. If something goes wrong

| Symptom | First action |
|---------|--------------|
| `healthz` fails or the page does not load | `ssh vps 'systemctl status tsa-demo --no-pager'`; the service restarts itself within about 25 seconds. If it stays down, read `journalctl -u tsa-demo -n 80 --no-pager`. |
| "Not found" or a blank page on the root link | `curl -I https://tsa.smartnovi.tech/` must show `302` to `/student/`; if not, `ssh vps 'sudo nginx -t && sudo systemctl reload nginx'`. |
| Guests cannot start ("limit reached") | The limit is 300 new guests per hour per network address and 5000 in total. One shared campus address can reach it; raise `DEMO_GUESTS_PER_HOUR` in `/etc/tsa/demo.env` and restart only if nobody is mid-test. |
| Test creation is slow (over 10 s) | Check `ssh vps 'uptime'` and `free -m`; heavy load from another project on the shared server is the usual cause. |
| A question is wrong | Note its number and the section; do not fix it live. Corrections follow [BANK_CORRECTIONS](BANK_CORRECTIONS.md) after the event. |
| Browser shows a certificate warning | `ssh vps 'sudo certbot certificates'`, then `sudo certbot renew`. Check the date on the PC and the phone. |
| Need to stop everything quickly | `ssh vps 'sudo systemctl stop tsa-demo'`; the nginx site then answers 502 and nothing is exposed. Start it again with `start`. |

Other projects share this server. Never reboot it, stop nginx, or touch another site; the pending operating-system restart is
the VPS owner's decision.
