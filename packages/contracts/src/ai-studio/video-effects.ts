// Named video effects: a `/slug` typed in the Video Studio agent (or read by an MCP client)
// that stands for editing instructions written in the editor ops' own vocabulary. The house
// effects ship here, in code — a deploy brings them, no seeding. A brand's saved workflows
// (save_workflow) answer to the slug of their name and win over a house effect of the same slug.

import { z } from 'zod';
import { parseShortcutTokens } from '../skills/shortcuts';

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export const videoHouseEffectSchema = z
  .object({
    slug: z.string().regex(SLUG).max(60),
    name: z.string().min(1).max(60),
    /** One line for the `/` menu. */
    description: z.string().min(1).max(120),
    /** What the editor does, in op names — the same text drives the agent and an MCP client. */
    prompt: z.string().min(1).max(2_000),
  })
  .strict();
export type VideoHouseEffect = z.infer<typeof videoHouseEffectSchema>;

const NO_INVENTED_FIGURES =
  'Use only words and figures the speaker says; never invent one. If what this needs was never said, stop and ask for it.';

export const VIDEO_HOUSE_EFFECTS: readonly VideoHouseEffect[] = [
  {
    slug: 'shoulder-zoom',
    name: 'Shoulder zoom',
    description: 'Punch in on the speaker as a before/after pair of figures pops up',
    prompt: `Read get_transcript. Find the line where the speaker contrasts a before and an after (a price, a count, a time, a percentage); else their strongest claim with a number. At that line's start, animate_clip the main video clip with punch_in at that time. Then add_text template stat_callout with the BEFORE figure as text and "Before" as secondaryText, from the line's start for 1.5 s, animationIn pop; then a second stat_callout with the AFTER figure and "After", starting as the first ends, for 2 s, animationIn pop. ${NO_INVENTED_FIGURES}`,
  },
  {
    slug: 'card-strike',
    name: 'Card strike',
    description: 'Your stills strike in as stacked cards, then back to you',
    prompt:
      'Read get_pool and pick 3 to 5 images (screenshots, photos, product shots). At the playhead, or 0 when there is none, add_clip each image as an overlay 0.15 s apart, each for 1.6 s. animate_clip each one with pop, then ONE stagger_clips over them in the order placed with eachSec 0.12. animate_clip the main video clip with shake at the moment the last card lands. If the pool has no images, say so and stop.',
  },
  {
    slug: 'hook-pop',
    name: 'Hook pop',
    description: 'The strongest line as a big opening title, with a punch-in',
    prompt: `Read get_transcript and pick the strongest line in the first 10 seconds, at most 7 words, verbatim. add_text template hook_title with it at 0 for 2.5 s, animationIn pop. animate_clip the main video clip with punch_in at 0.4. If the timeline has no captions yet, set_captions with style pop and highlight word. ${NO_INVENTED_FIGURES}`,
  },
  {
    slug: 'fast-cuts',
    name: 'Fast cuts',
    description: 'Doka-doka jump cuts on every half beat',
    prompt:
      'When there is music on the timeline, beat_cut with everyNBeats 0.5: jump_cuts on the selected (or main) clip, switch_shots when there are two or more source spans. With no music, cut_silence instead and say there was no beat to cut on.',
  },
  {
    slug: 'film-look',
    name: 'Film look',
    description: 'Grain, warmth and light leaks over the footage',
    prompt:
      'On the selected video clips, or else the main track clips (at most 4), apply_effect film_grain at 0.35, vintage at 0.25 and light_leaks at 0.3, then vignette at 0.25 — one apply_effect per clip and look.',
  },
  {
    slug: 'cta-close',
    name: 'CTA close',
    description: 'A call-to-action card over the last 3 seconds',
    prompt:
      'Read get_project for the duration and get_transcript for the call to action the speaker gives (try it free, book a demo, follow, link in bio). add_text template cta_end_card with that call to action as text, covering the last 3 s, animationIn pop. If they never give one, ask which call to action to use.',
  },
  {
    slug: 'glass-graph',
    name: 'Glass graph',
    description: 'A glass card with a graph that climbs to their number',
    prompt: `Read get_transcript. Find the line with a growth figure (retention, revenue, followers, a percentage). add_motion_graphic recipe glass_graph at that line's start, durationSec 4: label = what is measured in 1 to 3 words, value = the figure, unit = its unit ("%", "$", "k", "x" or empty), points = 6 to 8 rising values ending at value when they give a start figure, else omit points. ${NO_INVENTED_FIGURES}`,
  },
  {
    slug: 'particle-push',
    name: 'Particle push',
    description: 'Particles pour into a box that opens into their steps',
    prompt: `Read get_transcript. Find where the speaker lists steps or parts (first, second, third; one, two, three). add_motion_graphic recipe particle_push at the first step, durationSec 4.5, steps = up to 3 labels of one or two words each, taken from their words. ${NO_INVENTED_FIGURES}`,
  },
  {
    slug: 'dot-matrix',
    name: 'Dot matrix',
    description: 'Their punchiest words in LED dots, one at a time',
    prompt: `Read get_transcript and pick the strongest line. add_motion_graphic recipe dot_matrix at that line's start, durationSec = the line's length (2 to 5 s), words = its 2 to 4 punchiest words, verbatim and in order. ${NO_INVENTED_FIGURES}`,
  },
  {
    slug: 'word-lock',
    name: 'Word lock',
    description: 'Newspaper pages cut fast, one word locked in the centre',
    prompt: `Read get_transcript and pick the word the speaker stresses most (a name, a product, a single noun). add_motion_graphic recipe word_lock starting 0.8 s before they say it, durationSec 2, keyword = that word, lines = 4 to 8 sentences built from the transcript around it, each containing the keyword. ${NO_INVENTED_FIGURES}`,
  },
];

/** The slug a saved workflow answers to: its name, lowercased and kebab-cased. */
export const workflowSlug = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');

export type AppliedVideoEffect = { slug: string; name: string; prompt: string };

/**
 * The effects a message's `/slug` tokens name, in the order typed: a brand workflow of that
 * slug first, else the house effect. A slug neither knows stays as plain text — it was
 * probably just words.
 */
export function resolveVideoEffects(
  text: string,
  workflows: readonly { name: string; prompt: string }[],
): { applied: AppliedVideoEffect[]; unknown: string[] } {
  const applied: AppliedVideoEffect[] = [];
  const unknown: string[] = [];
  for (const slug of parseShortcutTokens(text).slugs) {
    const saved = workflows.find((workflow) => workflowSlug(workflow.name) === slug);
    const house = VIDEO_HOUSE_EFFECTS.find((effect) => effect.slug === slug);
    const found = saved ?? house;
    if (found) applied.push({ slug, name: found.name, prompt: found.prompt });
    else unknown.push(slug);
  }
  return { applied, unknown };
}

/** True when a message carries any `/token`, so a resolver can skip reading workflows otherwise. */
export const hasEffectTokens = (text: string): boolean =>
  parseShortcutTokens(text).slugs.length > 0;
