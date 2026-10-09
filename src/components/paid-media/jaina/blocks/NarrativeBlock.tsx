'use client';

import type { NarrativeBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { SECTION_LABELS } from '../answerLanguage';
import { useAnswerLanguage } from '../answerLanguageContext';
import {
  JAINA_EVIDENCE_PROSE,
  JAINA_TYPE,
  JUDGEMENT_LABEL,
  JUDGEMENT_TEXT,
  judgeValue,
} from '../reading';
import { BlockHeading } from './BlockHeading';
import { BlockSourcesFooter } from './citations';
import { MediaText } from './mediaText';
import { JAINA_MODULE } from './modules';
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
 *
 * Each box is its own borderless module, side by side once the answer is wide enough to hold
 * three columns (a container query: the same answer mounts in a 390px panel). The third box
 * asks for a move, so it takes the decision tint.
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
    <div className="@container" data-testid="narrative-three">
      <div className="grid gap-3 @xl:grid-cols-3">
        {boxes.map((box) => {
          const decision = box.key === 'now_what';
          return (
            <section
              key={box.key}
              className={cn(
                'flex flex-col gap-1.5',
                decision ? JAINA_MODULE.decision : JAINA_MODULE.neutral,
              )}
              data-narrative-box={box.key}
            >
              <h5
                className={cn(
                  JAINA_TYPE.label,
                  decision ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {box.label}
              </h5>
              <JainaProse
                content={box.text}
                citations={block.citations}
                mode={isStreaming ? 'streaming' : 'static'}
                className={cn(JAINA_TYPE.body, 'text-foreground')}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function NarrativeBlock({ block, isStreaming }: NarrativeBlockProps) {
  const three = narrativeThreeOf(block);
  // A reading in one body is one neutral module; a three-box reading is three modules, so
  // the block around them takes no fill.
  return (
    <div
      className={cn('space-y-3', !three && JAINA_MODULE.neutral)}
      data-jaina-module={three ? undefined : 'block'}
    >
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
            // "why is this mark red", and design tokens that follow the theme. The judgement
            // is a dot in its colour, not a rule — an answer draws no lines.
            const judgement = judgeValue(highlight.severity);
            return (
              <li
                key={index}
                className="flex gap-2.5 py-1"
                title={`${highlight.category || 'Highlight'}: ${JUDGEMENT_LABEL[judgement]}`}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-2.5 size-1.5 shrink-0 rounded-full bg-current',
                    JUDGEMENT_TEXT[judgement],
                  )}
                  data-judgement={judgement}
                />
                <div className="min-w-0">
                  {highlight.category && (
                    <span className="inline-block text-xs font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5 mb-1">
                      {highlight.category}
                    </span>
                  )}
                  <p className={cn('text-foreground', JAINA_TYPE.body)}>
                    <MediaText>{highlight.text}</MediaText>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <BlockSourcesFooter citations={block.citations} />
    </div>
  );
}
