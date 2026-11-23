# Phase 7 — Summary for the owner

Write `reports/SUMMARY.md` from the six phase reports only (do not re-test):

1. One paragraph: overall state, how many findings per severity, what was NOT RUN.
2. A table of every finding, CRITICAL first: id, severity, REPRODUCED/SUSPECTED, one-line title, link to its report.
3. The top five things to fix first, each with why it matters to students or the owner.
4. Everything NOT RUN, with the reason, so nobody mistakes it for a pass.
5. Questions for the owner.

Then set every phase in `STATUS.md` to its final state and confirm no tester process is running
(`ss -ltnp | grep 4180 || echo free`). Note at the top: "HIGH and CRITICAL findings need re-checking by the owner or a
stronger model before acting."
