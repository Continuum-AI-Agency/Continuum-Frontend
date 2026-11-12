'use client';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { QUICK_START_CARDS, type QuickStartCard, type SlotRole } from './quickStarts';

type StudioMessageKey = keyof typeof import('../../../../messages/studio/en.json');
type QuickStartCopyKeys = {
  label: StudioMessageKey;
  description: StudioMessageKey;
  promptPlaceholder?: StudioMessageKey;
  promptLabel?: StudioMessageKey;
  promptMissing?: StudioMessageKey;
  slots: Partial<Record<SlotRole, StudioMessageKey>>;
};

const copyKeys = {
  create_image: {
    label: 'create_image_81fc5194',
    description: 'a_new_still_from_a_prompt_your_subj_be55edbd',
    promptPlaceholder: 'the_subject_on_a_clean_studio_sweep_b4b09097',
    slots: {
      style: 'style_7e744141',
    },
  },
  restyle_image: {
    label: 'restyle_image_672c5b6c',
    description: 'give_an_image_the_look_of_a_style_r_d3e4405e',
    promptPlaceholder: 'optional_what_to_keep_or_push_7f915a18',
    slots: {
      source: 'image_1aa4cb0b',
      style: 'style_7e744141',
    },
  },
  edit_image: {
    label: 'edit_image_5597753f',
    description: 'change_one_thing_in_an_image_and_ke_0f417e98',
    promptPlaceholder: 'swap_the_background_for_a_sunlit_gy_1946a766',
    promptMissing: 'say_what_to_change_1f0b330c',
    slots: {
      source: 'image_1aa4cb0b',
    },
  },
  storyboard_to_video: {
    label: 'storyboard_to_video_df235382',
    description: 'animate_an_opening_frame_with_one_o_4758c9ff',
    promptPlaceholder: 'she_turns_to_camera_and_smiles_a2f32588',
    slots: {
      first_frame: 'opening_frame_840d797d',
      subject: 'reference_71bf9093',
    },
  },
  keyframes_to_video: {
    label: 'keyframes_to_video_1b89028c',
    description: 'one_shot_that_travels_from_a_first__e802fbc1',
    promptPlaceholder: 'a_slow_push_in_as_the_lights_come_u_e49f106f',
    slots: {
      first_frame: 'first_frame_70c0e501',
      last_frame: 'last_frame_909e0b8a',
    },
  },
  rotate_360: {
    label: '360_rotation_74b11ee2',
    description: 'orbit_the_camera_once_around_a_prod_d0fcc2a0',
    promptPlaceholder: 'optional_surface_lighting_backgroun_64ec3527',
    slots: {
      source: 'product_image_1d9518b2',
    },
  },
  music_bed: {
    label: 'music_bed_1c136971',
    description: 'an_instrumental_bed_as_long_as_the__00b19aba',
    promptPlaceholder: 'warm_acoustic_guitar_light_percussi_98836bd1',
    promptLabel: 'mood_780fe43f',
    promptMissing: 'pick_a_mood_or_describe_one_c75bb88a',
    slots: {},
  },
  voiceover: {
    label: 'voiceover_317f3d76',
    description: 'your_script_read_aloud_placed_at_th_cd33beb3',
    promptPlaceholder: 'your_first_class_is_on_us_book_it_t_32b74716',
    promptLabel: 'script_102acc10',
    promptMissing: 'write_the_script_aa8a437f',
    slots: {},
  },
  headless_concept: {
    label: 'concept_reel_09e6e45c',
    description: 'a_finished_reel_with_your_approved__5b4f0111',
    promptPlaceholder: 'optional_the_offer_or_pain_to_lead__0577fe1c',
    promptLabel: 'angle_1968034b',
    slots: {},
  },
} as const satisfies Record<QuickStartCard['id'], QuickStartCopyKeys>;

export function useQuickStartCards(): readonly QuickStartCard[] {
  const t = useTranslations('studio');
  return useMemo(
    () =>
      QUICK_START_CARDS.map((card) => {
        const keys: QuickStartCopyKeys = copyKeys[card.id];
        const optional = (property: 'promptPlaceholder' | 'promptLabel' | 'promptMissing') => {
          const key = keys[property];
          return key ? t(key) : card[property];
        };
        return {
          ...card,
          label: t(keys.label),
          description: t(keys.description),
          promptPlaceholder: optional('promptPlaceholder') ?? '',
          promptLabel: optional('promptLabel'),
          promptMissing: optional('promptMissing'),
          slots: card.slots.map((slot) => {
            const key = keys.slots[slot.role];
            return { ...slot, label: key ? t(key) : slot.label };
          }),
        };
      }),
    [t],
  );
}
