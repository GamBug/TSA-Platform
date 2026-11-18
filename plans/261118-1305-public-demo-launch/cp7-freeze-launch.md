# CP7 — Freeze, rehearsal and launch (Mon 23 – Tue 24 Nov)

Recommended implementer: Claude Code, Opus 5.5, medium — documentation, tagging and a scripted
checklist with the deploy context in hand. Fallback: Codex, medium.

## Monday 23 Nov

1. 12:00 — no new features. Only P0/P1 fixes from CP6.
2. 18:00 — code freeze. Tag `demo-2026-11-24` on the deployed commit; record the commit and the Bank
   backup used in the runbook's "current release" line.
3. Fresh backup of the server state and of the owner's retained Bank; confirm the rollback steps work by
   reading them, not by running them on the live server.
4. Update `docs/agents/PROJECT_STATE.md`, `LAST_HANDOFF.md`, the run of show (new section "Present
   on the public URL": the link, a QR code image of it, the 10-minute script adapted to the guest flow).
5. Owner rehearses the presentation once on the live URL from a phone and a laptop; agent fixes only
   wording issues found.

## Tuesday 24 Nov (launch)

Morning checklist (agent runs, owner watches):
- [ ] `systemctl status tsa-demo` active; `/healthz` 200; TLS valid more than 30 days.
- [ ] One full guest journey on the live URL; results correct.
- [ ] Uptime monitor green; disk under 70 %; memory under 70 %.
- [ ] Owner shares the link.
During the day: check `journalctl -u tsa-demo` for errors every few hours; any P0 → follow the runbook
rollback.

After the demo period ends (owner decides the date): stop the service, delete server data per the
runbook, record the takedown in OPEN_DECISIONS.

## Expected output

Tag `demo-2026-11-24`; updated state, handoff, run of show; final report
`plans/reports/<agent>-261124-launch.md` comparing the result with the plan's acceptance criteria.
