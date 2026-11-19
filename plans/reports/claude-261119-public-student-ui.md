# CP3 report — student app ready for the public

Date: 2026-11-19 (Asia/Bangkok). Implementer: Claude Code (Sonnet 5.5), single agent, no subagents.
Task card: [cp3-student-ui-public](../261118-1305-public-demo-launch/cp3-student-ui-public.md).

## Outcome

The React student app signs visitors in as guests on the public server and presents the site to strangers.
No server, API or contract change; local mode behaves as before.

## What changed

| File | Change |
|---|---|
| `apps/candidate-web/src/api/public.ts` (new) | Reads `publicDemo` from `/local/demo-notice`; `startGuest` calls `POST /local-auth/guest` with the CSRF header when a session exists; maps 503 and 429 to Vietnamese messages. |
| `src/App.tsx` | Learns the mode before restoring a session; guest start; no logout in public mode; `?page=about`. |
| `src/screens/LoginScreen.tsx` | Public: three-line explanation and one button; local: students A/B as before. |
| `src/screens/AboutScreen.tsx` (new) | Unofficial, no HUST affiliation, no official score, non-profit, temporary guest data, source credit notice. |
| `src/screens/CatalogScreen.tsx` | Public practice catalog leads with the full-test card (100 questions, 150 minutes, clocks, return navigation), or a pending notice when the server offers no full test. |
| `src/ui/Shell.tsx`, `index.html` | Footer About link (44 px target); meta description, Open Graph title/description/locale, inline SVG favicon. |
| `scripts/verify-student-web-public.mjs`, `package.json` | New `test:student-web:public`: public server behind a throwaway TLS proxy, Chromium at 1280, 768 and 360 px. |
| Guide, backlog, state, handoff | Updated. |

## Commands and results

| Command | Result |
|---|---|
| `npm run test:student-web:public` | PASS at 1280, 768, 360 px: landing hides A/B, one-click guest, no logout, full-test card, reload keeps the guest, section practice 4/4, second browser gets another guest with zero attempts, full test 6/100 with 3/40, 2/20, 1/40, About page, unknown query values open the catalog, `/` is 404, unknown `/student/...` path is 404, no third-party request, no horizontal overflow. |
| `npm run test:student-web` | 2 pass |
| `npm run test:student-web:browser` | PASS (local mode, desktop and mobile, cloze/matching 6/6) |
| `npm run test:demo:public` | 13 pass, 0 skipped |
| `npm run test:docs` | 13 pass |

Screenshots (private, ignored): `.local/public-launch-qa/cp3/{desktop-1280,tablet-768,phone-360}-{landing,catalog,result,simulation,about}.png`.
This run also confirms the app works under the public Content-Security-Policy over https (CP1 had only reasoned about it).

## Decisions and limits

- Unknown paths under `/student/` stay 404 (the app never produces path routes and a missing asset must 404); the card's "falls back to the catalog" is met for unknown `mode`/`page` values.
- Not done: contact line on About (owner has not chosen one); Open Graph `og:url`/`og:image` (need the final domain and an image; absolute URLs are also barred by the build-output test unless it is relaxed deliberately); real Android/iOS devices, Firefox, Zalo/Facebook preview; a network-loss retry check beyond existing behaviour (existing client reports "temporarily unavailable" messages).
- Vietnamese copy was written by the agent and not reviewed by a native editor.
- No independent reviewer was used.

## Open questions for the owner

1. Contact line for the About page (email or form)?
2. Final domain, so Open Graph URL and a preview image can be added?
