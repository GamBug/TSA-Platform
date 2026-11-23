# Image asset library

Images are independent, reusable assets. A question names an image by a stable asset code such as `IMG-GEO-000123`;
the same code may appear in many questions, and one question may show several images anywhere in its content. The
library sits on the Bank's existing content-addressed asset storage, so published questions, sealed forms, inspected
image delivery and answer privacy are unchanged. Migration `032_image_library.sql` adds the registry.

## Model

| Piece | Role |
|---|---|
| `tsa.image_assets` | One row per distinct file: code, SHA-256 `content_hash` (unique), media type, size, width, height, title, alt text, `status` (`ACTIVE`/`RETIRED`). |
| `tsa.image_asset_versions` | Links a code to its existing `tsa.asset_versions` rows, one per purpose (`QUESTION`, `EXPLANATION`). |
| `tsa.asset_versions` (existing) | What questions actually reference, by UUID, in `image` blocks and `question_assets`. |
| Private image store (existing) | Content-addressed files under a private directory; never inside the public web root. |

**Asset id format**: `IMG-<AREA>-<6 digits>`; `AREA` is 2-8 uppercase letters or digits (`GEO`, `ALG`, `PHY`). Numbers
count up per area and are never reused. Assets that existed before the library were registered once as area `LEG`
(`IMG-LEG-000001`, ...).

**Why two asset versions per image.** A question image and an explanation image must stay separately authorized: the
explanation copy is only served after results are released. The library keeps one asset per file and creates the
explanation asset version the first time an explanation uses it. Both point at the same stored bytes.

## Commands

All commands act on the local Bank (`TRACK_B_DATA_DIRECTORY`, default `.local/track-b`); the image store defaults to
`.local/track-b-images` (`TSA_IMAGE_STORE_DIRECTORY`). Writes default to a dry run and `--apply` takes a backup first.

```
npm run images -- init --apply                 back up, then apply pending migrations (adds the library)
npm run images -- list [--status ACTIVE]
npm run images -- show IMG-GEO-000123
npm run images -- references IMG-GEO-000123    questions that show the image, with their workflow state
npm run images -- catalog --out assets.json    active ids, for `questions:validate --assets`
npm run images -- check questions.json         image ids in a question set against the library
npm run images -- fetch IMG-GEO-000123 --out figure.png     bytes verified against the stored hash
npm run images -- register --file figure.png --area GEO --alt "Hình lập phương ABCD.A'B'C'D'" \
    --title "Hình lập phương" --source-version <uuid> [--apply]
npm run images -- retire IMG-GEO-000123 [--apply]
```

## Registering

`register` decodes the file in a bounded worker (PNG, JPEG or WebP, at most 2 MiB and 4096 px a side), records its
dimensions and hash, stores the bytes and creates the asset. It also records the inspection the Bank requires, so the
image is immediately usable by questions.

- **Duplicates**: a byte-identical file returns the existing asset and writes nothing, whatever title or area is given.
  Only identical bytes are merged. A re-encoded or visually similar image is a different file and gets its own code.
- **Rejected before any write**: SVG and any other format, corrupt or truncated files, oversized images, missing or
  blank alt text, an invalid area, a missing or unknown source version, and a disabled image store.
- **Source**: the operator names an existing source version. The library never creates or edits sources or rights.

## Using an image in a question

In the exchange format an image block is `{"type":"image","asset_id":"IMG-GEO-000123","alt":"...","caption":"..."}` and
the question lists the id in `asset_refs`. `npm run questions:import` resolves each code to the stored asset version for
the right purpose and writes the usual `image` block with `assetVersionId`. Retired and unknown codes are rejected for
the whole set. Authors who need a figure that does not exist yet use an `image_request` block; the question cannot be
imported until the image is registered. The ChatGPT [question inbox](CHATGPT_QUESTION_INBOX.md) does this step itself:
a file named `<question id>_<request id>.png` beside the pasted answer is registered (area `MATH`, `READ` or `SCIE`,
under the answer's own source) and swapped in for the block when the import is confirmed.

## Deleting and retiring

Assets are never deleted: a database trigger rejects `DELETE`, and the foreign keys from questions and forms are
`RESTRICT`. `retire` stops *new* use. It is refused while any question version in `DRAFT`, `IN_REVIEW` or `APPROVED`
still shows the image (the same rule is a database trigger, so a direct update cannot bypass it). Published and sealed
content that already references a retired asset keeps displaying it. Retire or quarantine the questions first, then
retire the image.

## Migration of existing images

The migration registers every existing asset version without changing any existing row. The first version of a file
becomes the library asset; a second version of the same file for the other purpose becomes its twin; a further exact
copy for the same purpose stays valid for the questions that reference it but is not linked. The migration backfill was empty when applied to the retained Bank; later imports registered figures for
unpublished drafts. The retained published stock is still text and LaTeX. Original files
and stored objects are untouched; cleanup of any duplicate is a separate owner decision.

## Delivery and limits

Students receive images through the existing inspected-image routes (`/attempts/{id}/assets/...`), which stay behind
their default-off feature flag and re-check inspection, purpose, rights and attempt membership for every request. The
library adds no new public route and exposes no storage path. There is no staff upload screen yet: registration is a
maintenance command. A missing stored file fails in a controlled way (`IMAGE_OBJECT_UNAVAILABLE`) and the student
renderer falls back to the image's alt text when an image cannot be loaded.


## Local student demo

`npm run demo:uni` opens the existing private library at `.local/track-b-images`, or the absolute directory supplied by
`TSA_IMAGE_STORE_DIRECTORY`, and connects it to the student runtime. A missing directory leaves image delivery disabled
without creating a library. The synthetic `--rehearsal` mode does not open private corpus images automatically.
The general runtime still requires an explicitly supplied image store; production enablement is unchanged.

Only published, selectable questions enter the demo. Connecting the library does not publish imported drafts.
Question, option and passage figures use the same attempt-bound routes; explanation figures remain unavailable until
results are released. Stored bytes, inspection, rights and ownership are checked as before. See the
[copy-only browser verification](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261117-student-image-delivery.md).
