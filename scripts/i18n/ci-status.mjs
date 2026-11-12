import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function reviewStatus(plan, report, writeExit = 0) {
  if (!report)
    return { commit: false, passed: plan.status === 'CURRENT', pending: plan.pending?.length ?? 0 };
  const valid =
    [0, 2].includes(writeExit) &&
    ['SOURCE_CHECKS_PASS', 'NEEDS_REVIEW'].includes(report.status) &&
    Array.isArray(report.errors) &&
    Array.isArray(report.machineFindings) &&
    Array.isArray(report.pending) &&
    report.errors.length === 0 &&
    report.machineFindings.length === 0;
  return {
    commit: valid,
    passed: valid && report.status === 'SOURCE_CHECKS_PASS' && report.pending.length === 0,
    pending: report.pending?.length ?? 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.RUNNER_TEMP;
  if (!root || !process.env.GITHUB_OUTPUT) throw new Error('Expected GitHub runner output paths');
  const plan = JSON.parse(readFileSync(path.join(root, 'i18n-plan.json'), 'utf8'));
  const reportFile = path.join(root, 'i18n-drafts/report.json');
  const result = reviewStatus(
    plan,
    existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null,
    Number(process.env.I18N_WRITE_EXIT),
  );
  appendFileSync(process.env.GITHUB_OUTPUT, `commit=${result.commit}\npassed=${result.passed}\n`);
  console.log(JSON.stringify(result));
}
