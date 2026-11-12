# Automatic UI localization

`bun run i18n:auto` fills incremental UI localization without a Next.js production build. It uses the existing offline Google Cloud Translation service, protects ICU arguments/selectors/tags, and leaves static catalogs in the repository. The app never imports this tool.

From the standalone Frontend checkout:

```sh
bun run i18n:auto:check                    # inspect; no Google requests
bun run i18n:auto                         # fill drafts, regenerate scopes, validate
bun run i18n:auto -- --base origin/beta    # include changed English keys in a PR
bun run i18n:auto:bench                   # real paid provider/filesystem/ICU round trip
```

Local runs use existing `gcloud` authentication. A write run declares its fresh staging path and approved GCS prefix, defaults to a maximum of 10,000 requested source codepoints across both targets, and keeps staging under 2 GiB. `--staging`, `--prefix`, `--run-id` and `--max-characters` make an explicit run reproducible. Unknown flags and invalid budgets fail. No production build, browser benchmark, deployment, cleanup or automatic retry of an uncertain paid request is included.

## What is filled

The existing UI inventory identifies display text and reviewed exceptions. Direct React text, accessible labels and placeholders are converted to typed translation keys. Async server components use server translations; ordinary components reuse their existing namespace translator where possible. JSX whitespace and directives are preserved. The common count/singular/plural idiom becomes one ICU plural. Shared constants, class error boundaries and other ambiguous helper/data-flow cases remain explicit findings for review.

Missing Portuguese/Spanish keys and changed English messages are drafted. Translations whose English source is unchanged stay intact. The source hash and resulting draft hashes in `scripts/i18n/translation-drafts.json` prevent repeated requests for the same completed drafts, including reruns against the same PR baseline. Source/catalog changes during a paid request stop application of the results. Provider output must retain exact protected tokens, control order and ICU structure. Any failed validation leaves catalogs untouched and retains evidence.

New prose is marked **DRAFT**. Human review still owns language/domain meaning. The automation does not translate authored text, generated reports, emails or stored content language; those remain the separate phase-2 scope.

After filling, source-derived feature/lazy catalogs regenerate and the existing catalog, ICU, literal and machine-value checks run. Unsupported cases cause `NEEDS_REVIEW`, never a silent green result. Exit 0 means current/source checks passed; exit 2 means translation/review is needed; exit 1 means an operational or validation failure.

## Pull-request automation

`I18n inventory` runs on UI/catalog changes in PRs to beta/main with read-only permissions. `I18n drafts` responds through `workflow_run`, executes tooling and installs dependencies from the trusted default branch, and treats incoming PR files as data. Paid authentication is restricted to the same repository and the exact trusted default-branch workflow. Fork code is not given the translation identity. The existing CI provider is unchanged.

The bot commits translation drafts back to the originating feature PR after source checks pass. The commit is a normal, non-forced push, so a concurrent author update rejects it rather than being overwritten. English source changes and draft hashes make completed reruns idempotent. Release branches (`beta` and `main`) are not written by the bot; use feature PRs for authoring and the existing release qualification for merging. The translation job runs source checks without invoking a production build. Normal CI and Vercel behavior remain part of the repository's release workflow.

Requests, provider responses, plans, reports and review patches are stored create-only under `gs://continuum-production-477821-creative-benchmarks/i18n/automation/<run>/`. Uploads verify generation, size and checksum. GCS destination, translation roles and source-code review are distinct from release qualification.

### Activation state

The local command and real Google/file/ICU round trip have been exercised. GitHub repository variables `I18N_WIF_PROVIDER` and `I18N_SERVICE_ACCOUNT` name the dedicated keyless identity when configured. The privileged workflow must be installed on the repository's default branch (`main`) before GitHub will dispatch `workflow_run` events. Source-tag publication or a beta-only merge does **not** activate it. Its first hosted execution remains a separate check; do not report it as enabled before that run exists.

This tooling does not waive the unfinished beta i18n production, real-data E2E or performance gates documented in [the release checkpoint](i18n-release-checkpoint.md).

Authentication follows [Google's federation guidance](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).
