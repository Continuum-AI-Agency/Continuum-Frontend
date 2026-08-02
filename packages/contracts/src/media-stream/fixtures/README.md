# MediaStream contract fixtures

Checked-in golden payloads read by **both** halves of the contract:

| reader | file | asserts |
|---|---|---|
| TypeScript | `packages/contracts/src/media-stream/fixtures.test.ts` | the Zod schemas accept `valid/` and reject `invalid/` |
| Rust | `Continuum-MediaStream/tests/contracts_guard.rs` | `serde` deserializes `valid/` into `src/models.rs` and rejects `invalid/` |

Neither side owns the corpus. That is the whole point: a shape change on one
side that is not made on the other turns one of those two tests red, so
`bun run mediastream:contracts:check` (which runs both) is the drift guard.

## Layout

```
error-codes.json          the canonical JobErrorCode list, in order
valid/<job>.<dir>.<label>.json     both sides MUST accept
invalid/<job>.<dir>.<label>.json   both sides MUST reject
```

`<job>` is `passthrough` | `transfer` | `zip`; `<dir>` is `request` | `response`.
The filename is the routing key — there is no manifest to fall out of sync.

## What belongs in `invalid/`

Only payloads that **both** readers reject at the *deserialization* layer:
unknown fields (Zod `.strict()` / serde `deny_unknown_fields`), missing required
fields, and wrong types.

Semantic rejections — a `..` in a path, a path not under the caller's brand —
deliberately do **not** live here. Rust enforces those in `src/tenancy.rs`,
after deserialization, and covers them with its own unit tests; Zod enforces
them in `.refine()` and covers them in `jobs.test.ts`. Putting them here would
mean asserting Rust rejects at a layer that is not the one doing the work, which
would either fail spuriously or force the guard to duplicate the tenancy logic.

## Adding a field

1. Add it to `jobs.ts` (canonical) and to `Continuum-MediaStream/src/models.rs`.
2. Add or update a fixture under `valid/`.
3. `bun run mediastream:contracts:check`.
