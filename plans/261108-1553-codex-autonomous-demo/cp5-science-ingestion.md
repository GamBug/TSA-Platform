# CP5: Science section ingestion

Precondition (owner gate): the owner has placed cropped Science-section captures under
`TSA_Example_Questions/<Science folder>/` and confirmed that the same non-profit permission covers
them. Until then the status stays BLOCKED with the reason "waiting for owner Science files".

Goal: at least 80 Science DRAFTs ready for owner approval (2 full sections).
Leader reasoning: medium. Builder: `tsa_builder`.

## Steps
1. Reuse the CP3 Math image pipeline unchanged where possible (transcription, key extraction,
   blind solve, diagram crop). Add only Science-specific parsing such as data tables and
   multi-question stimuli, which become shared-stimulus bundles like Reading passages.
2. Propose taxonomy labels using the existing taxonomy catalog. Unknown topics go to
   `needs_owner_attention` instead of new labels.
3. Import as DRAFT and summarize the queue in the report, as in CP3.

## Exit criteria
- At least 80 Science DRAFTs import cleanly, and the leakage and privacy tests pass.
- Corpus hashes are unchanged and nothing is committed from it.
- STOP for owner approval.
