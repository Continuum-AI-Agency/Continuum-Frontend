import { describe, expect, it } from 'bun:test';
import { animatedCssProperties, withCrossOrigin } from './browserRenderer';

/**
 * `crossorigin` is what opts a media fetch into CORS mode. Without it the browser
 * fetches in no-cors mode and taints the canvas even when the response carries
 * `Access-Control-Allow-Origin: *` — which is precisely how a reference video
 * used to kill an entire render with an uncaught SecurityError.
 */
describe('withCrossOrigin', () => {
  it('adds crossorigin to a video referencing an attached asset', () => {
    const html = '<video class="plate" src="hf-asset://abc-123" muted></video>';
    expect(withCrossOrigin(html)).toBe(
      '<video class="plate" src="hf-asset://abc-123" muted crossorigin="anonymous"></video>',
    );
  });

  it('covers img and audio too', () => {
    const html = '<img src="hf-asset://i"><audio src="hf-asset://a"></audio>';
    const out = withCrossOrigin(html);
    expect(out).toContain('<img src="hf-asset://i" crossorigin="anonymous">');
    expect(out).toContain('<audio src="hf-asset://a" crossorigin="anonymous">');
  });

  it('preserves self-closing syntax rather than corrupting the tag', () => {
    expect(withCrossOrigin('<img src="hf-asset://i"/>')).toBe(
      '<img src="hf-asset://i" crossorigin="anonymous"/>',
    );
  });

  it('is idempotent — a second pass does not duplicate the attribute', () => {
    const once = withCrossOrigin('<video src="hf-asset://v"></video>');
    expect(withCrossOrigin(once)).toBe(once);
  });

  it('respects an author-supplied crossorigin value', () => {
    const html = '<video crossorigin="use-credentials" src="hf-asset://v"></video>';
    expect(withCrossOrigin(html)).toBe(html);
  });

  it('leaves elements that do not reference an attached asset alone', () => {
    const html = '<img src="data:image/png;base64,AAAA"><video src="/local.mp4"></video>';
    expect(withCrossOrigin(html)).toBe(html);
  });

  it('does not touch non-media tags that merely mention an asset id', () => {
    const html = '<div data-note="hf-asset://v">x</div>';
    expect(withCrossOrigin(html)).toBe(html);
  });

  it('handles several media elements in one document', () => {
    const html =
      '<video src="hf-asset://v1"></video><img src="hf-asset://i1"><video src="hf-asset://v2"></video>';
    const out = withCrossOrigin(html);
    expect(out.match(/crossorigin="anonymous"/g)).toHaveLength(3);
  });
});

/**
 * Serializing the DOM captures INLINE styles, so a GSAP composition (GSAP writes
 * element.style) always rendered correctly — but a CSS `@keyframes` animation
 * applies COMPUTED values and touches no inline style, so every frame came out
 * at the animation's base state and the MP4 was a still. The freeze copies the
 * seeked computed value onto the clone; getting these names wrong makes it
 * silently do nothing, which looks exactly like the bug it fixes.
 */
describe('animatedCssProperties', () => {
  it('converts camelCased keyframe properties to CSS names', () => {
    expect(animatedCssProperties([{ backgroundColor: 'red' }, { backgroundColor: 'blue' }])).toEqual(
      ['background-color'],
    );
  });

  it('drops keyframe metadata, which is not a style property', () => {
    const names = animatedCssProperties([
      { offset: 0, easing: 'ease-out', composite: 'replace', opacity: '0' },
      { offset: 1, computedOffset: 1, opacity: '1' },
    ]);
    expect(names).toEqual(['opacity']);
  });

  it('collects every property across the whole set, not just the first frame', () => {
    const names = animatedCssProperties([
      { opacity: '0' },
      { transform: 'translateY(40px)' },
      { letterSpacing: '0.2em' },
    ]);
    expect(names.sort()).toEqual(['letter-spacing', 'opacity', 'transform']);
  });

  it('returns nothing for a keyframe set that animates nothing', () => {
    expect(animatedCssProperties([{ offset: 0 }, { offset: 1 }])).toEqual([]);
  });
});
