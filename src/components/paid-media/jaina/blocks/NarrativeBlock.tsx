'use client';

import type { NarrativeBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { SECTION_LABELS } from '../answerLanguage';
import { useAnswerLanguage } from '../answerLanguageContext';
import {
  JAINA_EVIDENCE_PROSE,
  JAINA_TYPE,
  JUDGEMENT_LABEL,
  JUDGEMENT_RULE,
  judgeValue,
} from '../reading';
import { BlockHeading } from './BlockHeading';
import { BlockSourcesFooter } from './citations';
import { MediaText } from './mediaText';
import { type NarrativeThree, narrativeThreeOf } from './narrativeShape';
import { JainaProse } from './prose';

type NarrativeBlockProps = {
  block: NarrativeBlockV2;
  isStreaming: boolean;
};

// Citations, severity marks and bold entities are all placed by `JainaProse`; this block
// only says what ink its body is set in.
function NarrativeBody({ block, isStreaming }: NarrativeBlockProps) {
  return (
    <JainaProse
      content={block.body}
      citations={block.citations}
      mode={isStreaming ? 'streaming' : 'static'}
      className={JAINA_EVIDENCE_PROSE}
    />
  );
}

/**
 * The three boxes: Qué pasó · Qué significa · Qué hacer (What · So what · Now what), each a
 * label at the smallest step of the scale over its prose in the ink colour — the reading is
 * part of the answer, not evidence under it. The labels follow the answer's language; the
 * order is fixed, because "what to do" before "what happened" is not a reading.
 */
function NarrativeThreeBoxes({
  three,
  block,
  isStreaming,
}: NarrativeBlockProps & { three: NarrativeThree }) {
  const labels = SECTION_LABELS[useAnswerLanguage()];
  const boxes = [
    { key: 'what', label: labels.what, text: three.what },
    { key: 'so_what', label: labels.soWhat, text: three.so_what },
    { key: 'now_what', label: labels.nowWhat, text: three.now_what },
  ] as const;
  return (
    <div
      className="grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/40 sm:grid-cols-3"
      data-testid="narrative-three"
    >
      {boxes.map((box) => (
        <section
          key={box.key}
          className="flex flex-col gap-1.5 bg-background px-3 py-2.5"
          data-narrative-box={box.key}
        >
          <h5 className={cn(JAINA_TYPE.label, 'text-muted-foreground')}>{box.label}</h5>
          <JainaProse
            content={box.text}
            citations={block.citations}
            mode={isStreaming ? 'streaming' : 'static'}
            className={cn(JAINA_TYPE.body, 'text-foreground')}
          />
        </section>
      ))}
    </div>
  );
}

export default function NarrativeBlock({ block, isStreaming }: NarrativeBlockProps) {
  const three = narrativeThreeOf(block);
  return (
    <div className="space-y-3">
      <BlockHeading title={block.title} className="mb-0" />
      {/* The three fields REPLACE the body: the Backend keeps `body` for one release as the
       *  same reading in one paragraph, and printing both would say everything twice. */}
      {three ? (
        <NarrativeThreeBoxes three={three} block={block} isStreaming={isStreaming} />
      ) : (
        <NarrativeBody block={block} isStreaming={isStreaming} />
      )}
      {block.highlights.length > 0 && (
        <ul className="space-y-2">
          {block.highlights.map((highlight, index) => {
            // Through `reading.ts` rather than a local emerald/amber/red map: one answer to
            // "why is this rule red", and design tokens that follow the theme — the raw
            // palette literals this replaced kept their light values in dark mode while
            // every other judged figure on screen moved.
            const judgement = judgeValue(highlight.severity);
            return (
              <li
                key={index}
                className={cn('border-l-2 pl-3 py-1', JUDGEMENT_RULE[judgement])}
                title={`${highlight.category || 'Highlight'}: ${JUDGEMENT_LABEL[judgement]}`}
              >
                {highlight.category && (
                  <span className="inline-block text-xs font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5 mb-1">
                    {highlight.category}
                  </span>
                )}
                <p className={cn('text-foreground', JAINA_TYPE.body)}>
                  <MediaText>{highlight.text}</MediaText>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <BlockSourcesFooter citations={block.citations} />
    </div>
  );
}
