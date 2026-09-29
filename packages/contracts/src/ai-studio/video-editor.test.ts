import { describe, expect, test } from 'bun:test';
import { videoEditorAgentFrameSchema } from '../streaming/video-editor';
import {
  analyzePcmBeats,
  applyEditorCommandBatch,
  createEditorProjectV2,
  type EditorCommandBatch,
  type EditorProjectV2,
  editorExportSettingsSchema,
  editorProjectV2Schema,
  editorRenderBlockers,
  exportPresetWarnings,
  exportSettingsForPreset,
  PLATFORM_EXPORT_PRESET_IDS,
  VIDEO_EDITOR_OP_NAMES,
  VIDEO_EDITOR_OPS,
} from './index';

const blank = () =>
  createEditorProjectV2({ projectId: 'p', title: 'Edit', width: 1080, height: 1920 });

const withFootage = (project: EditorProjectV2): EditorProjectV2 =>
  editorProjectV2Schema.parse({
    ...project,
    durationSec: 4,
    tracks: [
      {
        id: 'video-main',
        name: 'Video',
        kind: 'video',
        order: 0,
        enabled: true,
        locked: false,
        muted: false,
        solo: false,
        clips: [
          {
            id: 'clip-1',
            kind: 'video',
            timelineStartSec: 0,
            durationSec: 4,
            enabled: true,
            locked: false,
            tags: [],
            source: { sourceType: 'library_asset', assetId: 'a', renditionId: 'v' },
            sourceInSec: 0,
            playbackRate: 1,
            reverse: false,
            transform: {
              position: { x: 0.5, y: 0.5, unit: 'normalized' },
              scaleX: 1,
              scaleY: 1,
              rotationDeg: 0,
              anchorX: 0.5,
              anchorY: 0.5,
              opacity: 1,
            },
            crop: { left: 0, top: 0, right: 0, bottom: 0 },
            blendMode: 'normal',
            audioEnabled: true,
            effects: [],
            keyframes: [],
          },
        ],
      },
    ],
  });

describe('editorRenderBlockers', () => {
  test('a plain edit needs only picture on the timeline', () => {
    expect(editorRenderBlockers(blank())).toEqual(['The timeline is empty.']);
    expect(editorRenderBlockers(withFootage(blank()))).toEqual([]);
  });

  test('muting a video track silences it; its picture still renders', () => {
    const project = withFootage(blank());
    const muted = {
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, muted: true })),
    };
    expect(editorRenderBlockers(muted)).toEqual([]);
    const hidden = {
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, enabled: false })),
    };
    expect(editorRenderBlockers(hidden)).toEqual(['The timeline is empty.']);
  });

  test('a production project still answers to its approval gates', () => {
    const project = withFootage(blank());
    const production = editorProjectV2Schema.parse({
      ...project,
      production: {
        ...project.production,
        shots: [
          {
            id: 'shot-1',
            order: 0,
            title: 'Hook',
            brief: 'Creator reveals the product.',
            subjectAction: 'The creator raises the product.',
            cameraMove: 'Slow dolly in.',
            inSceneEvent: 'The package catches the key light.',
            targetDurationSec: 4,
            takes: [],
          },
        ],
      },
    });
    const blockers = editorRenderBlockers(production);
    expect(blockers).toContain('Approve the style contract before rendering.');
    expect(blockers).toContain('Every shot needs a human-approved 1080p master.');
  });
});

describe('platform presets', () => {
  test('every preset is a legal export setting', () => {
    for (const id of PLATFORM_EXPORT_PRESET_IDS) {
      expect(editorExportSettingsSchema.safeParse(exportSettingsForPreset(id)).success).toBe(true);
    }
    expect(exportSettingsForPreset('tiktok')).toMatchObject({ width: 1080, height: 1920 });
  });

  test('duration limits warn, never block', () => {
    expect(exportPresetWarnings('reels', 60)).toEqual([]);
    expect(exportPresetWarnings('reels', 240)).toHaveLength(1);
    expect(exportPresetWarnings('youtube', 7_200)).toEqual([]);
  });
});

describe('op vocabulary', () => {
  test('project ops refuse input without a projectId; brand ops take none', () => {
    for (const name of VIDEO_EDITOR_OP_NAMES) {
      const spec = VIDEO_EDITOR_OPS[name];
      const bare = spec.input.safeParse({}).success;
      expect(bare).toBe(spec.scope === 'brand');
    }
  });

  test('apply_commands carries each command through unvalidated for the reducer to judge', () => {
    const parsed = VIDEO_EDITOR_OPS.apply_commands.input.parse({
      projectId: '00000000-0000-4000-8000-000000000000',
      expectedRevision: 3,
      commands: [{ commandType: 'split_clip', clipId: 'clip-1', splitAtSec: 2 }],
    });
    expect(parsed.commands[0]).toEqual({
      commandType: 'split_clip',
      clipId: 'clip-1',
      splitAtSec: 2,
    });
  });
});

test('agent frames parse on the shared envelope', () => {
  const envelope = { eventId: 'e', seq: 1, ts: '2026-09-29T00:00:00.000Z' };
  expect(
    videoEditorAgentFrameSchema.safeParse({
      ...envelope,
      type: 'tool_result',
      data: { toolCallId: 't', op: 'cut_silence', ok: true, summary: 'Cut 7 pauses', revision: 4 },
    }).success,
  ).toBe(true);
  expect(
    videoEditorAgentFrameSchema.safeParse({
      ...envelope,
      type: 'tool_start',
      data: { toolCallId: 't', op: 'not_an_op' },
    }).success,
  ).toBe(false);
});

test('the shared beat grid finds a steady 120 bpm click', () => {
  const sampleRate = 22_050;
  const samples = new Float32Array(sampleRate * 8);
  for (let beat = 0; beat < 16; beat += 1) {
    const start = Math.round(beat * 0.5 * sampleRate);
    for (let i = 0; i < 400; i += 1) samples[start + i] = 0.9;
  }
  const analysis = analyzePcmBeats(samples, sampleRate);
  expect(Math.abs(analysis.bpm - 120)).toBeLessThanOrEqual(2);
  expect(analysis.markers[0]?.kind).toBe('beat');
});

describe('whole-state undo', () => {
  const user = { actorId: 'user-1', actorType: 'user' as const };
  const batch = (project: EditorProjectV2, commands: Record<string, unknown>[]) =>
    applyEditorCommandBatch(project, {
      batchId: `b-${project.revision}`,
      projectId: project.projectId,
      sequenceId: project.sequenceId,
      idempotencyKey: `batch-${project.revision}-key`,
      expectedRevision: project.revision,
      expectedFingerprint: project.fingerprint,
      atomic: true,
      issuedAt: '2026-09-29T00:00:00.000Z',
      actor: user,
      commands: commands.map((command, index) => ({
        ...command,
        commandId: `c-${project.revision}-${index}`,
        idempotencyKey: `command-${project.revision}-${index}`,
        expectedRevision: project.revision,
        issuedAt: '2026-09-29T00:00:00.000Z',
        actor: user,
      })),
    } as EditorCommandBatch);

  test('set_markers replaces every marker in one command, sorted', () => {
    const beats = Array.from({ length: 300 }, (_, i) => ({
      id: `beat:${i}`,
      kind: 'beat' as const,
      timeSec: (299 - i) * 0.5,
      label: `Beat ${i + 1}`,
    }));
    const next = batch(withFootage(blank()), [{ commandType: 'set_markers', markers: beats }]);
    expect(next.markers).toHaveLength(300);
    expect(next.markers[0]?.timeSec).toBe(0);
  });

  test('restoring a snapshot brings back the format and the markers, not only the tracks', () => {
    const before = withFootage(blank());
    const after = batch(before, [
      {
        commandType: 'set_project_metadata',
        canvas: { ...before.canvas, width: 1920, height: 1080 },
      },
      { commandType: 'set_export_settings', exportSettings: exportSettingsForPreset('youtube') },
      {
        commandType: 'set_markers',
        markers: [{ id: 'm', kind: 'beat', timeSec: 1, label: 'Beat 1' }],
      },
    ]);
    const restored = batch(after, [
      {
        commandType: 'restore_timeline_snapshot',
        snapshot: {
          sourceRevision: before.revision,
          sourceFingerprint: before.fingerprint,
          durationSec: before.durationSec,
          tracks: before.tracks,
          transitions: before.transitions,
          nestedSequences: before.nestedSequences,
          canvas: before.canvas,
          exportSettings: before.exportSettings,
          markers: before.markers,
        },
      },
    ]);
    expect(restored.canvas).toEqual(before.canvas);
    expect(restored.exportSettings).toEqual(before.exportSettings);
    expect(restored.markers).toEqual(before.markers);
  });
});
