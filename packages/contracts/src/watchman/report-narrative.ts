export const WATCHMAN_REPORT_NARRATIVE_MESSAGE =
  'Keep report narrative qualitative. Submit numeric claims as typed evidence; the server renders their values.';

/** A lexical refusal, never proof of the prose. All narrative stays unverified. */
export function watchmanReportNarrativeIssue(subject: string, body: string): string | null {
  const visible = `${subject}\n${body}`
    .replace(/\]\(https?:\/\/[^\s)]+\)/g, ']')
    .replace(/https?:\/\/[^\s<>]+/g, '');
  return /\p{N}|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent|percentage|once|twice|thrice|half|quarter|double|triple)\b/iu.test(
    visible,
  )
    ? WATCHMAN_REPORT_NARRATIVE_MESSAGE
    : null;
}
