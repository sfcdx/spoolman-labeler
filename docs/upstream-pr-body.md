# Server-side label printing (opt-in)

## What this is

Spoolman can already design a label and print it — through the browser's print
dialog. That works, but it means every label costs a dialog, a paper-size
guess, and a "which printer was it again?" That is fine for a sheet of stickers
you print twice a year, and it is the wrong shape for a dedicated label printer
sitting next to the machine.

This adds an **optional** second path: configure a printer once, then press
print and the label comes out. No dialog.

The browser print path is untouched and stays the default. **If you never
configure a printer, nothing about Spoolman changes** — the new UI does not
appear at all.

## How it works

The label is still rendered by the existing designer, in the browser, by
`renderLabelDataUrl()`. Nothing about rendering moved to the server: the
designer stays the single source of truth for what a label looks like, so it
can keep evolving without a second renderer drifting behind it.

What is new is where the finished raster goes. Instead of being handed to
`window.print()`, it is POSTed to the server, which forwards it to the printer
over IPP.

```
designer → renderLabelDataUrl() → PNG → POST /printer/{id}/print → IPP → printer
```

## No new dependencies

The obvious way to talk to CUPS is `pycups`. I deliberately did not use it: it
is a C extension against libcups, so it would add `libcups2-dev` and a compile
step to the Docker build for **everyone**, including the majority who will
never print from the server.

IPP is a binary payload over HTTP POST. The four operations needed here
(`Print-Job`, `Get-Printer-Attributes`, `Get-Job-Attributes`,
`CUPS-Get-Printers`) are encoded directly in `spoolman/printing/ipp.py` using
`httpx`, which is already a dependency.

**No new Python dependency, no new system package, no Dockerfile change.**

## Scope of the change

Everything is additive: **2731 insertions, 4 deletions**, and all four of those
"deletions" are lines that were extended rather than removed (an import list, a
function signature, a loop body). The edits to existing files are:

| File | Change |
|---|---|
| `spoolman/api/v1/router.py` | one import, one `include_router` |
| `spoolman/database/models.py` | one model class appended |
| `client_v2/src/routes/settings/+page.svelte` | one section rendered |
| `client_v2/src/lib/components/labels/PrintLayoutPanel.svelte` | one extra button, shown only when a printer exists |
| `client_v2/src/lib/components/AddSpoolModal.svelte` | one extra button; `submit()` gained an optional `andPrint` argument and now keeps the spools it created |

Everything else is new files. There is one Alembic migration, which only
creates the new `printer` table.

## Add and print in one step

The add-spool dialog already creates N spools from its count field, so the
second half of the job was one button away: type 4, press *Add 4 spools &
print*, get four labels. Creation and printing stay separate — printing runs
strictly after creation and cannot throw, so a printer that is off never costs
you the spools you just typed in. It only changes the message you get.

That button, too, is hidden unless a printer and a spool label design exist.

## API

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/v1/printer` | list / create |
| `GET/PATCH/DELETE /api/v1/printer/{id}` | read / update / delete |
| `GET /api/v1/printer/discover` | list the queues a CUPS server offers |
| `POST /api/v1/printer/{id}/test` | reachability; always 200, reports the outcome in the body |
| `POST /api/v1/printer/{id}/print` | submit an already-rendered document |

`/discover` means an existing CUPS queue can be picked from a list rather than
typed in — which is where most of the "why won't it print" time usually goes.

## Testing

`tests/test_ipp.py` covers the wire format without needing a printer: the
encoder and decoder are checked against each other and against hand-built
payloads, including the awkward parts (multi-value attributes repeating with an
empty name, value types we do not decode, truncated responses).

`tests/test_printer_api.py` covers the endpoints and the DB layer, with the IPP
client mocked — no test touches the network.

`tests/test_ipp_live.py` is opt-in and skipped unless `SPOOLMAN_TEST_IPP_HOST`
is set. Against a real CUPS instance it verifies discovery, printer state, and
an actual submitted job:

```
SPOOLMAN_TEST_IPP_HOST=localhost SPOOLMAN_TEST_IPP_QUEUE=YourQueue pytest tests/test_ipp_live.py
```

I ran this against a real cupsd while developing: discovery returned the queue
with its model and location, the job was accepted, and polling reported it
through to `completed`.

## Notes / limitations

- The document is sent as the MIME type configured on the printer
  (`image/png` by default). CUPS converts that for any queue that has a driver;
  a **raw** queue passes bytes through untouched, so a raw queue needs a format
  the printer itself understands.
- No print history table. The browser print path does not record one either,
  and per-label success/failure is already reported in the UI — a table felt
  like weight this change does not need to carry.
- `POST /print` caps the document size and checks it *before* decoding the
  base64, so an oversized payload is rejected without being expanded in memory.

## Happy to adjust

This is a fair amount of surface area, and I would rather match your
preferences than defend mine. In particular I am not attached to: the endpoint
layout, the `printer` table's shape, or putting the print button where I put
it. If the whole direction is not something you want in Spoolman, say so and
I will not be offended.
