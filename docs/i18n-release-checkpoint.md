# Beta i18n source checkpoint — 2026-11-12

This is an integration checkpoint for the requested beta deployment at `app.beta.trycontinuum.ai`. Its exact parent is Frontend `73cad67b818c6dc571676347e69f85928aadd72e`. It carries the i18n delta from source tag `i18n-source-20261112-010213fc` onto beta, preserving beta's newer features and localizing its additional UI. It does not replace beta with the older development branch.

English, Brazilian Portuguese and Spanish use pinned next-intl 4.15.0, static precompiled catalogs, never-prefixed locale routing and active-language feature slices. UI language remains independent of brand content, authored text, generated output and Jaina report language. Reports, emails and other generated communications remain phase 2.

## Integration and authoring

The source transplant required conflict resolution because beta had moved substantially. Source-derived scopes and literal checks were regenerated after localization. An initial inventory found 1,006 newer UI locations. Existing reviewed catalog wording was reused where appropriate; Google Cloud Translation produced 618 new offline message drafts per target language, followed by 30 further drafts for expanded descriptions. Interpolation tokens were protected and validated, and drafts were reviewed for domain meaning and grammar before integration. Whole ICU plurals/selects replace English words embedded in dynamic sentences.

Helper-derived dashboard, goal, pacing, chart, activity and error labels were included in the follow-up source pass. Currency identity, precision, source IDs, calendar day keys and scheduling timezones retain their existing behavior. Changing language rederives an existing conversation-search error without refetching the search. Error-boundary fallback bodies use function components so translation hooks do not run in class methods. The literal checker now guards that mistake and displaced client/server directives.

Source checks are bounded evidence. A clean literal scan does not independently establish that every value arriving through helpers, stored data or backend boundaries is translated. Real browser coverage and the integration conflict review remain release requirements.

Known follow-up: beta's `scaffoldFieldGroupsOf` still assembles some field labels, campaign-budget-share descriptions and derived values in English before they reach the translated scaffold card. Finish that structured helper boundary and review the recorded overlapping integration conflicts before calling the UI inventory complete. The current summary and budget tests cover the localized paths explicitly; they do not certify this remaining field-group surface.

## Validation and qualification

The run's machine-readable check logs and source snapshot are preserved under the evidence destination below. Catalog/ICU/scope/literal checks, canonical scoped Biome, slotted type generation/typechecking, focused UI/model tests and standalone lockfile validation are recorded individually; their results must be read from those receipts. Local checks use the existing monorepo dependencies and do not establish standalone production acceptance.

The builder completed a standalone production build of the exact **pre-i18n beta baseline** at the parent above. The baseline used standalone locked Next.js 16.3.1 and passed its existing bundle gates. Build ID: `o9h3U6hNV3a5clMMBI-w1`. Its Git archive SHA-256 is `d6625aeac16b9c362dd3cdc2c253ab5824646c1927425673bdfb21acbbcae511`.

**Candidate standalone production build, new shared-gzip comparison, full real-data authenticated end-to-end acceptance, ten paired timing runs and strobe verdict are UNRUN.** The earlier [gzip measurements](i18n-gzip-optimization.md) apply only to their older pinned source/dependency cohort. Their 10,085-byte result cannot qualify this beta integration. The original 10,240-byte shared gzip ceiling and all route budgets remain unchanged.

The existing root real-data benchmark needs a separately pinned beta cohort before reuse: its historical baseline archive fingerprint is different. It also needs private real-authentication/store/backend fixture configuration. No mock, placeholder build environment, source check or anonymous observation is treated as that acceptance run. The root workspace lockfile must be checked against the eventual beta integration manifest before final multi-repository release.

## Builder and deployment state

The authorized additional builder window started at 17:39 UTC on November 12. Another operator's agent stopped the VM around 17:50 UTC, after the baseline build. The VM remained stopped through the window's expiry at 18:39 UTC. The local disk remains below the unchanged 50 GiB heavy-work floor. No cleanup is authorized or included.

Baseline logs and build outputs remain recoverable on the stopped VM at `/home/claighmor/i18n-proof/20261112-beta-builder-qualification`; the interruption prevented sealing those remote files to GCS. Local observations distinguish the successful final baseline phase from retained failed setup attempts. Recover and seal that remote evidence during an explicitly authorized new builder window.

The beta deployment branch has not been pushed by this checkpoint, and no deployment is claimed. Source preservation may use an immutable annotated tag without triggering a deployment. Deployment remains gated on the missing production, payload, real-data browser and performance evidence.

Evidence owner: Claighmor/i18n. Approved destination: `gs://continuum-production-477821-creative-benchmarks/i18n/20261112-beta-builder-qualification/`. Local staging: `/tmp/continuum-i18n-beta-builder-20261112`, capped at 2 GiB. Original shared source, all prior experiments and failed-check history remain retained.
