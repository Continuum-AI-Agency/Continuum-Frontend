// The TikTok Ads copy audit (PP-L1-copy-sells-tiktok-ads-in-seven-places): a static scan of
// src/ for user-visible strings that name TikTok beside ads vocabulary without saying TikTok Ads
// is not connected. TikTok Ads has no connector (capability matrix row 5: "Do not mention"), so
// such a line sells something the product cannot do. Shared by perfplus:tiktok:honesty:ui:bench
// and its bun test, so the gate and the bench cannot read different rules.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC_DIR = resolve(__dirname, '../../src');
/** Out of the audit by path, with the reason: tests and fixtures; API routes and schemas (not
 *  copy); the TikTok tab's own connected-only render and Ask Jaina questions, the platform cards
 *  and the cross-platform
 *  move (they exist only for a connected advertiser) and the entity noun table behind them. */
const SKIP_PATH =
  /\.(test|bench|stories)\.|__tests__|__fixtures__|\/app\/api\/|\/lib\/api\/|\/lib\/schemas\/|platforms\/(?:TikTokAdsTab|useTikTokAdsOverview|tiktokAdsOverviewModel|tiktokAdsEntryPrompts)\.|platformCards\/|crossPlatformMove\/|optimizer\/entityNoun\.ts/;
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/;
/** A string literal or JSX text that names TikTok. */
const USER_VISIBLE = /['"`][^'"`\n]*TikTok[^'"`\n]*['"`]|>[^<{]*TikTok|TikTok[^<{]*</;
const ADS_COPY =
  /ad accounts?|campaign-level|Spark Ads?|ad groups?|\bCPA\b|cost per result|\bspend|\bAds\b|advertiser|pixel|learning|TikTok Marketing|writes alike/i;
/** Copy that says, in the same line, that TikTok Ads is not there. */
const HONEST_COPY =
  /isn'?t connected|not connected|not built|no connector|not supported|coming soon|once a .*connected|could not be loaded|Ads Manager/i;
/** Lines that name TikTok Ads only for an advertiser the brand already has, each with the reason
 *  the static scan cannot see. Keep this SHORT: an entry that matches sell copy is silence. */
const CONNECTED_ONLY_LINES: readonly { file: string; pattern: RegExp; reason: string }[] = [
  {
    file: 'src/components/settings/shell/platformIcons.tsx',
    pattern: /^tiktokAds: 'TikTok Ads',$/,
    reason:
      "the tab label of a brand's TikTok advertiser accounts; BrandIntegrationsSwitcher lists a tab only for a key with accounts",
  },
];
/** The one affordance frontend.html §2 asks for: a WARN row, not a FAIL. */
const DESIGNED_COPY = /Connect TikTok Ads/;

export type CopyHit = { file: string; line: number; text: string; severity: 'FAIL' | 'WARN' };

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
}

export function auditCopy(srcDir = SRC_DIR): CopyHit[] {
  const files: string[] = [];
  walk(srcDir, files);
  const hits: CopyHit[] = [];
  for (const file of files) {
    const rel = relative(srcDir, file);
    if (SKIP_PATH.test(`/${rel}`)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/TikTok/.test(line) || COMMENT_LINE.test(line)) return;
      if (!USER_VISIBLE.test(line) || !ADS_COPY.test(line) || HONEST_COPY.test(line)) return;
      const connectedOnly = CONNECTED_ONLY_LINES.some(
        (entry) => entry.file === `src/${rel}` && entry.pattern.test(line.trim()),
      );
      if (connectedOnly) return;
      hits.push({
        file: `src/${rel}`,
        line: index + 1,
        text: line.trim().slice(0, 200),
        severity: DESIGNED_COPY.test(line) ? 'WARN' : 'FAIL',
      });
    });
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
