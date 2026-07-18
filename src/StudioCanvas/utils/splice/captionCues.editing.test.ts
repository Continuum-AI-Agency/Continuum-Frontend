import { describe, expect, it } from 'bun:test';
import { groupWordsIntoCues, updateCaptionCue } from './captionCues';

describe('updateCaptionCue', () => {
  it('re-times replacement copy across the selected cue interval', () => {
    const cue = groupWordsIntoCues([{ text: 'old', startSec: 1, endSec: 2 }])[0];
    expect(updateCaptionCue(cue, { text: 'new caption', startSec: 2, endSec: 4 })).toMatchObject({
      startSec: 2,
      endSec: 4,
      words: [
        { text: 'new', startSec: 2 },
        { text: 'caption', endSec: 4 },
      ],
    });
  });

  it('clears a cue override without discarding the global style', () => {
    const cue = { ...groupWordsIntoCues([{ text: 'hello', startSec: 0, endSec: 1 }])[0], style: { textColor: '#ff0000' } };
    expect(updateCaptionCue(cue, { style: undefined }).style).toBeUndefined();
  });
});
