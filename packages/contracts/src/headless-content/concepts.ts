// The headless concept catalog (owner 2026-09-29: "We need to have these styles as pre-done concepts,
// and we need to have this guidance in them"): one entry per reel grammar, with the rules learned
// making them. The Backend's grammar registry reads its beats and length from here (a test pins
// every registered grammar to its entry), and any surface that offers a concept reads the same data
// (headless_graph_inspect view=guidance, the Frontend). The shared prose rules are the product's own
// words: the director and the compiler import them from CONCEPT_RULES, so each is written once.

import { z } from 'zod';
import { type ReelShotRole, reelShotRoleSchema } from '../reels/templates';
import { type HeadlessGrammar, headlessGrammarSchema } from './index';

/** The prose rules the product says to the director or to Omni, word for word. */
export const CONCEPT_RULES = {
  /** On every speaking beat's camera (compiler): the cropped-head opening stills of 09-29. No
   *  pronoun: the street concepts' standing interviewer is a man (Mateo, owner 09-29). */
  headroom:
    'The whole head stays in frame with a little space above the hair; the top edge of the frame never touches the head.',
  /** A spoken beat's opening still is drawn from its action and first body position: a stance or a
   *  reach to the floor gave every speaking still of a reply-to-comment reel a full body. */
  upperBodyStaging:
    'Every spoken beat is framed from the waist or mid-chest up: its action and every bodyPositions entry describe only what that frame shows (her face, gaze, shoulders, arms and hands), never her feet, legs or stance, kneeling, squatting, or reaching to the floor',
  /** t3: "one concrete result". No quoted example: one leaked verbatim into unrelated stories. */
  oneResult:
    "A result is one specific thing she can now do or no longer suffers: a verb and what it changed, drawn from the recommendation's value props, angle or the digest, and tied to the pain this reel opened on. A bare adjective about the place is not a result.",
  /** The close every concept ends on: the offer, said easily. */
  relaxedCta:
    'The cta is a relaxed close, said easily like advice to a friend: the action verb and the whole offer (never renamed: a first month is not a membership), spoken as a natural full sentence ("Pide tu primer mes a $12", "Pide tu 50% de descuento en tu anualidad"). The 24-character button (cta) may be shorter; the spoken line never is the button\'s abbreviation. Omit displayWord on this beat; the end card shows the action. Never add a benefit word to the offer or repeat the call to action.',
  /** Every concept but offer-direct: the cta names the offer, the hook never does. */
  ctaCarriesOffer:
    'The spoken lines carry that angle. The cta line names the offer itself (the concrete thing the winner asks people to get); the hook never does.',
  /** Any caller-chosen concept: a claim or a feeling gives the video a person standing still. */
  writeForTheCamera:
    'Write for the camera: every action, bodyPositions entry and storyboard beat is something the camera can watch happen — "she pulls her towel out of her gym bag", "she wipes the bench and sits down" — never a claim or a feeling ("the gym supports her goals"), which gives the video a person standing still. The lines carry the claim; the action carries the picture.',
} as const;

/** Every rule a concept follows, as data: what it says and how the product holds it. */
export const conceptRuleSchema = z
  .object({
    id: z.string().min(1).max(40),
    rule: z.string().min(1).max(700),
    heldBy: z.enum(['prompt', 'check', 'repair']),
  })
  .strict();
export type ConceptRule = z.infer<typeof conceptRuleSchema>;

export const CONCEPT_GUIDANCE: readonly ConceptRule[] = [
  { id: 'headroom', rule: CONCEPT_RULES.headroom, heldBy: 'prompt' },
  { id: 'upper-body-staging', rule: CONCEPT_RULES.upperBodyStaging, heldBy: 'prompt' },
  {
    id: 'keeps-her-place',
    rule: 'On a spoken beat her body keeps its place and the camera keeps its distance: a step, lean or bend toward the lens is refused in an action and dropped from body positions, because it crops her head in the opening still. Her hands may still push a product to the lens.',
    heldBy: 'check',
  },
  {
    id: 'below-the-frame',
    rule: 'Body positions below the frame (feet, legs, kneeling, the floor) are dropped; an action staged there is refused (staging_below_the_frame).',
    heldBy: 'repair',
  },
  {
    id: 'camera-not-phone',
    rule: 'The filming device is the camera: "the propped phone" becomes "the propped camera". Only a phone seen on screen (its screen, one shown to the lens, a second phone) is refused on a spoken beat.',
    heldBy: 'repair',
  },
  {
    id: 'no-printed-props',
    rule: "No logo, label, printing or the brand's name on a prop or surface: Omni paints it (EASY on a bottle, ETRAN on a machine). A place may be named in a scene's setting.",
    heldBy: 'check',
  },
  {
    id: 'end-card-after-last-word',
    rule: 'The end card starts after her last heard word: the spoken cta keeps 1.4 s after it (the 1.2 s card, a 0.15 s gap and a 0.05 s pad); a take that ends sooner holds its last frame for up to 0.8 s.',
    heldBy: 'repair',
  },
  {
    id: 'prices-in-brand-currency',
    rule: 'A price is written in digits with its sign ("$12") and spoken in the brand\'s currency ("doce pesos" for an MXN ad account). Clips are timed on what is said: "$12" is two spoken words, "50%" three.',
    heldBy: 'repair',
  },
  { id: 'relaxed-cta', rule: CONCEPT_RULES.relaxedCta, heldBy: 'prompt' },
  {
    id: 'display-word-from-its-line',
    rule: "A beat's display word is a benefit word of its own line, never an offer word, a filler or another beat's word; one the line does not say is replaced by the line's own benefit word, and the cta has none.",
    heldBy: 'repair',
  },
  {
    id: 'headline-on-hook',
    rule: 'A concept whose hook shows a headline (a question, a comment, a title) draws it at 0 s: the template is bold-punch and the hook takes no display word.',
    heldBy: 'repair',
  },
  {
    id: 'one-person-per-shot',
    rule: "Exactly one person in every frame. A second speaker is a second approved person in her own shot and voice, cast by the product (never the same actress asking herself); a line said off camera comes out in the on-camera woman's voice.",
    heldBy: 'check',
  },
  { id: 'one-result', rule: CONCEPT_RULES.oneResult, heldBy: 'prompt' },
  { id: 'write-for-the-camera', rule: CONCEPT_RULES.writeForTheCamera, heldBy: 'prompt' },
  {
    id: 'provider-filter',
    rule: 'Omni\'s post-generation filter ("filtered out") gets one fresh take of that shot; a second refusal, or "Input blocked" before generation, is final (provider_refused). Never word-game it.',
    heldBy: 'check',
  },
];

export const headlessConceptStatusSchema = z.enum(['draft', 'benched', 'proven']);
export type HeadlessConceptStatus = z.infer<typeof headlessConceptStatusSchema>;

export const headlessConceptSchema = z
  .object({
    id: headlessGrammarSchema,
    label: z.string().min(1).max(40),
    summary: z.string().min(1).max(400),
    whenToUse: z.string().min(1).max(400),
    /** In order: each beat's role, what it is for, and who speaks it ('none' = a silent insert). */
    beats: z
      .array(
        z
          .object({
            role: reelShotRoleSchema,
            purpose: z.string().min(1).max(200),
            speaker: z.enum(['her', 'interviewer', 'none']),
          })
          .strict(),
      )
      .min(3)
      .max(6),
    /** The finished reel's length: the owner's 8–12 s, or a story's 12–20 s. */
    seconds: z.object({ min: z.number().positive(), max: z.number().positive() }).strict(),
    casting: z
      .object({
        people: z.union([z.literal(1), z.literal(2)]),
        /** Who the second person is, when there is one. */
        interviewer: z.string().min(1).max(200).optional(),
        /** The owner-approved standing interviewer (a Character Element), cast whenever the
         *  brand's approved people include them; otherwise the product casts the least alike. */
        interviewerElementId: z.string().uuid().optional(),
        /** Who she is: the persona the concept is written for. */
        persona: z.string().min(1).max(200).optional(),
      })
      .strict(),
    /** The hook's on-screen text is the headline (a question, a comment, a title). */
    headlineOnHook: z.boolean(),
    sceneDefaults: z.string().min(1).max(400),
    soundPolicy: z.string().min(1).max(300),
    /** This concept's own rules, beside CONCEPT_GUIDANCE (which every concept follows). */
    guidance: z.array(z.string().min(1).max(400)).max(8),
    /** draft: defined; benched: its bench is green; proven: a reel accepted clean (the exemplar). */
    status: headlessConceptStatusSchema,
    exemplar: z
      .object({ reel: z.string().startsWith('gs://'), runId: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((concept, ctx) => {
    const asks = concept.beats.some((beat) => beat.speaker === 'interviewer');
    if (asks !== (concept.casting.people === 2))
      ctx.addIssue({
        code: 'custom',
        path: ['casting', 'people'],
        message: 'two people exactly when a beat is the interviewer’s',
      });
    if (concept.casting.interviewerElementId && concept.casting.people !== 2)
      ctx.addIssue({
        code: 'custom',
        path: ['casting', 'interviewerElementId'],
        message: 'a standing interviewer only on a two-person concept',
      });
    if ((concept.status === 'proven') !== Boolean(concept.exemplar))
      ctx.addIssue({
        code: 'custom',
        path: ['exemplar'],
        message: 'a proven concept has an exemplar, and only a proven one',
      });
    if (concept.seconds.min >= concept.seconds.max)
      ctx.addIssue({ code: 'custom', path: ['seconds'], message: 'min below max' });
  });
export type HeadlessConcept = z.infer<typeof headlessConceptSchema>;

const REEL = { min: 8, max: 12 };
/** Owner-approved 2026-09-29: Mateo, the street concepts' standing interviewer (bench tenant). */
const STANDING_INTERVIEWER = 'f8b217bd-aac8-48b7-956a-425ff47ad2cf';
const STORY = { min: 12, max: 20 };
const beat = (
  role: ReelShotRole,
  purpose: string,
  speaker: 'her' | 'interviewer' | 'none' = 'her',
) => ({ role, purpose, speaker }) as const;
const GUADALAJARA = 'the Guadalajara metro (Zapopan), never Mexico City';
const ONE_PLACE_QUIET = 'One quiet place for every spoken beat, so her voice is clean.';

export const HEADLESS_CONCEPTS: readonly HeadlessConcept[] = [
  {
    id: 'offer-direct',
    label: 'Offer direct',
    summary:
      'The winning offer in her own words from the first line: a benefit and the whole offer on the hook, a silent insert, one reason, then the offer again as a relaxed close.',
    whenToUse:
      'A strong offer (a trial, a price) that sells itself, for warm audiences who already know the category. The default when no concept is chosen.',
    beats: [
      beat('hook', 'a two-word benefit, then the whole offer'),
      beat('detail', 'a silent insert of her hands, the product or the equipment', 'none'),
      beat('proof', 'one concrete reason from the recommendation'),
      beat('cta', 'the action verb and the whole offer, said as a sentence'),
    ],
    seconds: REEL,
    casting: { people: 1 },
    headlineOnHook: false,
    sceneDefaults:
      'A quiet room for the spoken beats; the busy one (the gym floor) only for the silent insert.',
    soundPolicy:
      'Her voice in the foreground; the room she is in, low. No music, crowd or other voices.',
    guidance: ['The hook is the one beat that says the offer before the cta.'],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'problem-solution',
    label: 'Problem → solution',
    summary:
      'A problem in the customer’s own words, the brand as her discovery with one result before halfway, a silent insert of that result, then a relaxed close.',
    whenToUse:
      'A pain the category’s buyers already name (waiting for machines, pressure, price) and the brand as the fix; cold audiences who do not know the brand yet.',
    beats: [
      beat('hook', 'the problem, in the customer’s words; never the offer'),
      beat('proof', 'the brand as her discovery, with one concrete result'),
      beat('detail', 'a silent insert of that result happening', 'none'),
      beat('cta', 'a relaxed close with the whole offer'),
    ],
    seconds: REEL,
    casting: { people: 1 },
    headlineOnHook: false,
    sceneDefaults: 'A quiet room for the spoken beats; the training floor for the silent insert.',
    soundPolicy:
      'Her voice in the foreground; the room she is in, low. No music, crowd or other voices.',
    guidance: ['The discovery lands before the halfway point.'],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'street-interview',
    label: 'Street interview',
    summary:
      'A second person, the interviewer, asks her on the street with a wireless mic, in his own shot and voice ("¡Te ves súper bien! ¿Dónde entrenas?"); she answers with the brand as her discovery, one result, then turns to the lens with the offer.',
    whenToUse:
      'Social proof from a stranger’s question: the brand as a real person’s answer. Local brands and cold audiences.',
    beats: [
      beat('hook', 'the interviewer asks the question on camera', 'interviewer'),
      beat('proof', 'her answer: the brand as her discovery'),
      beat('proof', 'one concrete result'),
      beat('cta', 'she turns to the lens with the whole offer'),
    ],
    seconds: REEL,
    casting: {
      people: 2,
      interviewer:
        'Mateo, the owner-approved standing interviewer (a man about 32), in his own shot and voice; on a brand without him, the approved person least like her',
      interviewerElementId: STANDING_INTERVIEWER,
    },
    headlineOnHook: true,
    sceneDefaults: `A quiet tree-lined sidewalk in ${GUADALAJARA}, with no sign, banner or lettering.`,
    soundPolicy:
      'One voice per clip: the interviewer in his own, her answers in hers; a quiet sidewalk, low.',
    guidance: [
      'The question is the headline, word for word: asked on camera and drawn at 0 s.',
      'The mic is a plain black WIRELESS handheld, no cable (owner, 09-29); only it may reach into her shots, from the lower edge.',
    ],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'street-price-guess',
    label: 'Street price guess',
    summary:
      'A second person, the interviewer, asks with a wireless mic what the offer costs; she guesses high, in words, then echoes the real price, surprised, and turns to the lens with the whole offer.',
    whenToUse:
      'A price that is surprisingly low: the gap between the guess and the real price is the hook. Price-sensitive audiences.',
    beats: [
      beat('hook', 'the interviewer asks what the offer costs', 'interviewer'),
      beat('proof', 'her guess, high, in words'),
      beat('cta', 'her surprised echo of the real price, then the whole offer'),
    ],
    seconds: REEL,
    casting: {
      people: 2,
      interviewer:
        'Mateo, the owner-approved standing interviewer (a man about 32), in his own shot and voice; on a brand without him, the approved person least like her',
      interviewerElementId: STANDING_INTERVIEWER,
    },
    headlineOnHook: true,
    sceneDefaults: `A quiet corner of an open-air plaza in ${GUADALAJARA}: planters, a low stone bench, trees.`,
    soundPolicy:
      'One voice per clip: the interviewer in his own, her guess and close in hers; a quiet plaza, low.',
    guidance: [
      'The question is the headline, word for word, up to 10 words: the interviewer’s clip sizes to it.',
      'The price is said only in the cta, as a surprised echo of the real one.',
    ],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'reply-to-comment',
    label: 'Reply to a comment',
    summary:
      'A viewer’s comment is on screen from the first frame; she answers it at the gym, the brand as her discovery with one result before halfway, then a relaxed close.',
    whenToUse:
      'A doubt or objection first-timers type (being judged, "is it for beginners?"): answering it in public.',
    beats: [
      beat('hook', 'her direct answer to the comment: yes or no, then why'),
      beat('proof', 'the brand as her discovery, with one result on what the comment doubts'),
      beat('cta', 'a relaxed close with the whole offer'),
    ],
    seconds: REEL,
    casting: { people: 1 },
    headlineOnHook: true,
    sceneDefaults:
      'The stretching area at the edge of the training floor: mats, foam rollers, nobody near her.',
    soundPolicy: `${ONE_PLACE_QUIET} The comment is shown, never spoken.`,
    guidance: [
      'The comment is one short question a first-timer would type, in the customer’s own words.',
      'No insert: an equipment-only insert had Omni paint brand lettering on a machine.',
    ],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'unpopular-opinion',
    label: 'Unpopular opinion',
    summary:
      'Under the words "Opinión impopular", she tells a friend one contrarian claim about value in the locker room, why she holds it (the brand as her discovery), and the offer as its proof.',
    whenToUse:
      'A contrarian value claim against expensive competitors, for audiences who overpay today.',
    beats: [
      beat('hook', 'her one contrarian claim about value'),
      beat('proof', 'why: the brand as her discovery, one result for less'),
      beat('cta', 'the offer as the proof of her opinion'),
    ],
    seconds: REEL,
    casting: { people: 1 },
    headlineOnHook: true,
    sceneDefaults:
      'The gym’s locker room: grey metal lockers, a light oak bench, no mirror behind her.',
    soundPolicy: `${ONE_PLACE_QUIET} The format’s words are shown, never spoken.`,
    guidance: [
      'Never another gym’s name, and the price is said only in the cta.',
      'A step or lean toward the lens on a spoken beat is refused: it cut a cta still’s head.',
    ],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'pov',
    label: 'POV: you walk in',
    summary:
      'The camera is the viewer walking into the brand’s reception: the on-screen hook says where they are, she greets them into the lens, does one welcoming thing, and closes relaxed.',
    whenToUse:
      'A welcoming first visit and a low-pressure front desk, for audiences put off by intimidating gyms.',
    beats: [
      beat('hook', 'her warm greeting, naming the brand as where they arrived'),
      beat('proof', 'one welcoming action and one concrete comfort'),
      beat('cta', 'a relaxed close with the whole offer, into the lens'),
    ],
    seconds: REEL,
    casting: { people: 1 },
    headlineOnHook: true,
    sceneDefaults:
      'The brand’s reception: a plain light-wood counter, a plant, the floor soft behind her.',
    soundPolicy: `${ONE_PLACE_QUIET} The POV line is shown, never spoken.`,
    guidance: ['She talks straight into the lens on every beat: the lens is the viewer.'],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'car-storytime',
    label: 'Car storytime',
    summary:
      'After a workout, from the driver’s seat of her parked car, she confesses the gym she paid for and hardly used, then the brand she actually goes to, one result, and a relaxed close.',
    whenToUse:
      'Lapsed members and anyone paying for a gym they do not use: a confession and the relief of one that fits.',
    beats: [
      beat('hook', '"Storytime:" what she paid for and how little she went'),
      beat('proof', 'why she stopped going, in the customer’s words'),
      beat('proof', 'the brand as the gym she found and goes to'),
      beat('detail', 'a silent cutaway to the result on the training floor', 'none'),
      beat('proof', 'how often she goes now'),
      beat('cta', 'a relaxed close with the whole offer, still in the car'),
    ],
    seconds: STORY,
    casting: { people: 1 },
    headlineOnHook: false,
    sceneDefaults: `Her parked car, engine off, in a daytime lot in ${GUADALAJARA}; the training floor for the insert.`,
    soundPolicy: 'A quiet parked car: her voice close, nothing else.',
    guidance: ['A display word is a verb or benefit, never a unit of time.'],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'expectation-vs-reality',
    label: 'Expectation vs. reality',
    summary:
      'First-day nerves at the gym’s entrance (everyone will watch her), the welcoming reality at reception with the brand as her discovery, the result on the floor, and a relaxed close.',
    whenToUse:
      'Beginners and intimidated audiences: a feared first day against a welcoming reality.',
    beats: [
      beat('hook', 'the expectation: what she feared, in the customer’s words'),
      beat('proof', 'the reality: a receptionist welcomes her by the brand’s name', 'interviewer'),
      beat('detail', 'a silent cutaway to the result on the training floor', 'none'),
      beat('proof', 'what she now does that her fear said she could not'),
      beat('cta', 'a relaxed close with the whole offer, at reception'),
    ],
    seconds: STORY,
    casting: {
      people: 2,
      interviewer:
        'the receptionist: a second approved woman, cast by the product, in her own shot and voice',
    },
    headlineOnHook: true,
    sceneDefaults: `The gym’s glass entrance on a calm sidewalk in ${GUADALAJARA}, reception, and the training floor.`,
    soundPolicy:
      'One voice per clip: the receptionist in hers at reception, every other beat in hers.',
    guidance: [
      'The title "Expectativa vs. realidad" is the headline, shown over her hook.',
      'The crowd she feared lives only in her words: nobody else is ever in frame.',
    ],
    status: 'benched',
    exemplar: null,
  },
  {
    id: 'busy-day-routine',
    label: 'Busy-day routine',
    summary:
      'A full day in her own words: in her morning kitchen the time problem, the pain and the brand as the gym that fits between errands; her 40-minute workout; one result and a relaxed close.',
    whenToUse:
      'No time: the gym that fits between work and errands. Written for the 35–44 persona.',
    beats: [
      beat('hook', 'the time problem, as she packs her gym bag'),
      beat('proof', 'the pain: the errands and hours that left no time'),
      beat('proof', 'the brand as the gym that fits between errands'),
      beat('detail', 'a silent insert of her 40-minute workout', 'none'),
      beat('proof', 'how the workout fits her day now'),
      beat('cta', 'a relaxed close with the whole offer'),
    ],
    seconds: STORY,
    casting: {
      people: 1,
      persona: 'a woman with a full day of work and errands, apparent age 35–44',
    },
    headlineOnHook: false,
    sceneDefaults: 'Her kitchen in the morning, then the training floor and the gym.',
    soundPolicy: 'Her voice on each beat; the room she is in, low. No music or other voices.',
    guidance: [
      'No child in the picture or the words: Omni draws what a line names.',
      'A display word is what time means to her (TIEMPO, PRISA), never a unit of time.',
    ],
    status: 'benched',
    exemplar: null,
  },
];

/** A concept by id: every grammar the contract names has one (a test pins it). */
export function headlessConcept(id: HeadlessGrammar): HeadlessConcept {
  const concept = HEADLESS_CONCEPTS.find((item) => item.id === id);
  if (!concept) throw new Error(`concept_not_found:${id}`);
  return concept;
}

/** The finished reel's length rule, as a person reads it. */
export const conceptLengthRule = (concept: HeadlessConcept): string =>
  `${concept.seconds.min}–${concept.seconds.max} s in ${concept.beats.length} beats`;
