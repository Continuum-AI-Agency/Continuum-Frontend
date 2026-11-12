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

Missing Portuguese/Spanish keys and changed English messages are drafted. Translations whose English source is unchanged stay intact. A human translation changed alongside English is also preserved; stale machine drafts can be refreshed. The source hash and resulting draft hashes in `scripts/i18n/translation-drafts.json` prevent repeated requests for the same completed drafts, including reruns against the same PR baseline. Source/catalog changes during a paid request stop application of the results. Provider output must retain exact protected tokens, control order and ICU structure. Any failed validation leaves catalogs untouched and retains evidence.

New prose is marked **DRAFT**. Human review still owns language/domain meaning. The automation does not translate authored text, generated reports, emails or stored content language; those remain the separate phase-2 scope.

After filling, source-derived feature/lazy catalogs regenerate and the existing catalog, ICU, literal and machine-value checks run. Unsupported cases cause `NEEDS_REVIEW`, never a silent green result. Valid drafts can still be committed for review while the job stays red; malformed catalogs or translated machine values are not committed. Exit 0 means current/source checks passed; exit 2 means translation/review is needed; exit 1 means an operational or validation failure.

## Pull-request automation

`I18n drafts` runs on source/catalog PR changes targeting beta or main. Its `pull_request_target` job checks out the reviewed **base SHA** as executable tooling, installs only that trusted dependency tree, and reads the incoming PR in a separate directory as data. It never installs or executes incoming PR code. Forks are excluded. Paid authentication is restricted to this repository, event and exact workflow on beta/main. The existing CI provider is unchanged.

The bot commits translation drafts back to the originating feature PR after catalog and machine-value checks pass. Unsupported source findings keep the job red while valid drafts remain reviewable. Operational failures, including failed evidence uploads, block the commit. The commit is a normal, non-forced push, so a concurrent author update rejects it rather than being overwritten. English source changes and draft hashes make completed reruns idempotent. Release branches (`beta` and `main`) are not written by the bot; use feature PRs for authoring and the existing release qualification for merging. The translation job runs source checks without invoking a production build. Normal CI and Vercel behavior remain part of the repository's release workflow. GitHub controls follow-up workflow triggers and approvals for bot commits; required checks still need to pass on the reviewed head ([event behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)).

Requests, provider responses, plans, reports and review patches are stored create-only under `gs://continuum-production-477821-creative-benchmarks/i18n/automation/<run>/`. Uploads verify generation, size and checksum. Failed hosted runs also retain recovery data as a repository artifact under the repository’s existing retention policy; recover and verify it into the approved GCS prefix within 24 hours. The job remains failed until its source/recovery issues are resolved. GCS destination, translation roles and source-code review are distinct from release qualification.

### Activation state

The local command and real Google/file/ICU round trip have been exercised. GitHub variables `I18N_WIF_PROVIDER` and `I18N_SERVICE_ACCOUNT` name the configured dedicated keyless identity. Install the reviewed workflow on the target base branch (`beta`) as part of the qualified i18n release; then subsequent UI PRs run it automatically. Source tags do not activate a PR workflow. The first hosted PR run remains a separate check and is not yet claimed.

This tooling does not waive the unfinished beta i18n real-data E2E, payload or timing gates documented in [the release checkpoint](i18n-release-checkpoint.md). A standalone candidate production build and the shared emitted-JavaScript gzip gate have passed for the pinned source there; later CI-only changes are separate source evidence.

Authentication follows [Google's federation guidance](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines). The event uses [GitHub's documented base-branch context](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).
