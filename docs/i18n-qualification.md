# i18n qualification — 2026-11-12

Latest result: [production bundle comparison](i18n-production-bundle-results.md). The candidate compiles but fails bundle budgets; browser timings remain unrun.

Source implementation and focused validation pass. **Release qualification remains UNRUN.** No deployment was performed.

English, Brazilian Portuguese and Spanish use pinned `next-intl` 4.15.0, build-time message compilation, server translations and source-derived client catalogs. Internal locale routing preserves visible URLs. Account preferences, authentication/settings selectors, validation, error guidance, native formatting and production UI surfaces have been migrated. Brand/generated/authored content and Jaina report language retain independent behavior.

There are 17,436 canonical keys per locale across 15 namespaces, 33 server-delivered client scopes and 3 existing lazy feature boundaries. These are source counts, not browser payload measurements. Offline Google Translation drafting used 14 batches: 59,327 request-source codepoints and 3,020 target drafts, with review before integration. These counts may include repetitions and are not billing receipts.

## Passing evidence

- Full `i18n:check`: zero catalog/parser/scope failures, zero detected untranslated UI literals, zero translated machine values; 82 reviewed invariant occurrences.
- Slotted Frontend/Backend typechecks and separate benchmark typecheck.
- Both sanctioned lockfiles and canonical/vendored i18n contract leaves.
- Focused catalog/provider/preference/validation, formatting, error, editor and feature regressions; scoped change gates. The sealed report names exact logs and hashes. Counts from overlapping suites are not added together.

## Unrun acceptance gates

The source-pinned standalone baseline build, candidate standalone production build, actual bundle budgets, real-authentication browser workflows, mobile/keyboard/hydration acceptance, actual payload/navigation request checks, 10 KiB shared-runtime gate and ten-pair p75 comparisons remain unrun. There are zero browser acceptance cases and zero performance samples. The repeatable real-data benchmark is constructed at `scripts/i18n-e2e-bench.ts`; setup is in `scripts/i18n/README.md`.

The last benchmark admission reported 49 GiB free against the 50 GiB floor. Space briefly crossed that floor later; 49.99 GiB was free at evidence sealing. The standalone baseline dependency prerequisite remains unqualified. Earlier, a standalone dependency installation exceeded the 2 GiB staging budget and was stopped; no Next build began. Its recorded footprint was 4,178,087,100 logical bytes. All local data and failed/unrun evidence were retained. The incomplete dependency tree is not qualified, and no cleanup is included.

## Source and evidence

Candidate Frontend source fingerprint: `9f4e9b8cb7d93965942b06c2db104238707409e690a53140b37f53eb8c1f0ba0`. The pre-migration source archive SHA-256 is `3f52234b063d0861e604218331faef6a10059a934d043e566ae15c7f872e1656`, GCS generation `1794418018853693`. Existing uncommitted work was preserved.

Evidence: `gs://continuum-production-477821-creative-benchmarks/i18n/20261111-app-i18n/source-validation-20261111T2200Z/`. The qualification JSON, evidence archive, file manifest and verified upload receipts retain passing, failed and unrun checks separately. Implementation guidance: [i18n.md](i18n.md).
