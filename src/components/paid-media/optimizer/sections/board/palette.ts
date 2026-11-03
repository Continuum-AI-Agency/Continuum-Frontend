// Chart colors for the board and the Optimizer pages that share its look. Wrap the root in
// boardPaletteClass, then paint marks with BOARD_COLOR: the values switch with the theme.
// Text never takes a series color; it stays in the foreground and muted tokens.
import styles from './board.module.css';

export const boardPaletteClass: string = styles.palette ?? '';

export const BOARD_COLOR = {
  search: 'var(--board-search)',
  pmax: 'var(--board-pmax)',
  video: 'var(--board-video)',
  /** Cost below its goal (good), at the goal, above it (bad). */
  below: 'var(--board-below)',
  mid: 'var(--board-mid)',
  above: 'var(--board-above)',
  meta: 'var(--platform-meta)',
  google: 'var(--platform-google)',
} as const;
