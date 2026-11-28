'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { motionTokens } from '../lib/motion-tokens';
import { type CopyFeedbackState, useCopyFeedback } from '../lib/use-copy-feedback';
import styles from './copy-button.module.css';

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
  variant?: 'outline' | 'plain';
  disabled?: boolean;
  onCopied?: () => void;
  /** Localised words; the defaults are uiarc's English. */
  copiedLabel?: string;
  failedLabel?: string;
  /** Accessible name when it should say more than the visible label. */
  ariaLabel?: string;
}

const ease = [...motionTokens.ease.standard] as [number, number, number, number];
const instant = { duration: 0 } as const;
/** Icons settle on a short critically damped spring; nothing overshoots. */
const settle = { ...motionTokens.spring.snappy } as const;

/*
 * Every transform here runs on an HTML span, never inside the SVG: Safari scales SVG groups around the wrong origin,
 * which made the old glyph collapse on iPhone. No blur either: Safari rasterizes filtered text and icons, so they look
 * soft mid-animation and snap sharp at the end. The SVGs only animate pathLength, which every engine draws the same.
 */
const iconMotion = {
  initial: { opacity: 0, scale: 0.7 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.7, transition: { duration: motionTokens.duration.instant, ease } },
  transition: { ...settle, opacity: { duration: motionTokens.duration.instant, ease } },
};
const iconReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: instant },
  transition: instant,
};

function CopyIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2" />
    </svg>
  );
}

/**
 * The glyph a copy control shows: the copy icon at rest; on success it fades and a tick is drawn in its place, on
 * failure a short alert mark. `pulse` redraws the tick when the same value is copied twice. Shared with the site's copy controls.
 */
export function CopyGlyph({
  state,
  pulse = 0,
  size = 16,
  reduced = false,
}: {
  state: CopyFeedbackState;
  pulse?: number;
  size?: number;
  reduced?: boolean;
}) {
  const motionProps = reduced ? iconReduced : iconMotion;
  const key = state === 'copied' ? `copied-${pulse}` : state;
  return (
    <span
      className={styles.glyph}
      style={{ width: size, height: size }}
      data-state={state}
      aria-hidden="true"
    >
      <AnimatePresence initial={false}>
        <motion.span key={key} className={styles.glyphLayer} {...motionProps}>
          {state === 'copied' ? (
            <svg
              aria-hidden="true"
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={
                  reduced
                    ? instant
                    : { duration: motionTokens.duration.standard, ease, delay: 0.06 }
                }
              />
            </svg>
          ) : state === 'error' ? (
            <svg
              aria-hidden="true"
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5" />
              <path d="M12 16.2h.01" />
            </svg>
          ) : (
            <CopyIcon size={size} />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
  iconOnly = false,
  variant = 'outline',
  disabled,
  onCopied,
  copiedLabel = 'Copied',
  failedLabel = 'Failed',
  ariaLabel = label,
}: CopyButtonProps) {
  const { state, copy } = useCopyFeedback(1800);
  const reduced = useReducedMotion() ?? false;
  const [pulse, setPulse] = useState(0);
  const text = state === 'copied' ? copiedLabel : state === 'error' ? failedLabel : label;
  async function handleCopy() {
    if (await copy(value)) {
      setPulse((count) => count + 1);
      onCopied?.();
    }
  }

  const words = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: instant },
        transition: instant,
      }
    : {
        initial: { opacity: 0, y: 3 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -3, transition: { duration: motionTokens.duration.instant, ease } },
        transition: { duration: motionTokens.duration.standard, ease, delay: 0.04 },
      };

  return (
    <>
      <motion.button
        type="button"
        className={[
          styles.button,
          iconOnly && styles.iconOnly,
          variant === 'plain' && styles.plain,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => void handleCopy()}
        aria-label={ariaLabel}
        data-copy-state={state}
        disabled={disabled}
        whileTap={disabled || reduced ? undefined : { scale: 0.97 }}
        transition={motionTokens.spring.snappy}
      >
        <CopyGlyph state={state} pulse={pulse} reduced={reduced} />
        {/* The label keeps the width of its longest word, so the button never resizes and nothing around it moves. */}
        {!iconOnly && (
          <span className={styles.label} aria-hidden="true">
            {[label, copiedLabel, failedLabel].map((word) => (
              <span key={word} className={styles.sizer}>
                {word}
              </span>
            ))}
            <AnimatePresence initial={false}>
              <motion.span key={text} className={styles.word} {...words}>
                {text}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </motion.button>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {state === 'idle'
          ? ''
          : state === 'error'
            ? `${ariaLabel}: ${failedLabel}`
            : `${ariaLabel}: ${copiedLabel}`}
      </span>
    </>
  );
}
