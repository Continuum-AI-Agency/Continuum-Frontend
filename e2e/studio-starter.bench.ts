#!/usr/bin/env bun
/**
 * studio:starter:bench — proves a captured starter stays a RE-RUNNABLE RECIPE, not a
 * flattened text blob.
 *
 * The change this guards: the old "Create skill from selection" gesture ran the
 * selection through projectSkillSelection, which DISCARDED skillIds, model, refs, and
 * kept only a text paragraph. A starter instead rides the workflow save/apply pipeline,
 * whose node serializer is a BLOCKLIST — it strips only runtime/base64 keys and lets
 * everything else through. So the recipe (prompt + model + aspectRatio + skillIds)
 * survives capture and re-apply untouched.
 *
 * What is REAL here: the actual serializeWorkflowSnapshot (capture) and
 * normalizeWorkflowSnapshot (re-apply) the canvas uses, run on a real generator node.
 * The assertion is that the recipe fields survive the round-trip and that runtime-only
 * fields are dropped — because that is exactly what determines whether pressing Run on
 * an invoked starter reproduces the original generation.
 *
 * Pure functions, no infra: runnable anywhere. The full browser capture→save→invoke
 * path is the (heavier) Playwright bench; this proves the invariant those depend on.
 */
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../src/StudioCanvas/types';
import {
  normalizeWorkflowSnapshot,
  serializeWorkflowSnapshot,
} from '../src/StudioCanvas/utils/workflowSerialization';

const STARTER_METADATA_FLAG = 'starter';
const isStarter = (metadata: Record<string, unknown> | undefined) =>
  metadata?.[STARTER_METADATA_FLAG] === true;

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}\n      ${detail}`);
};

const SKILL_ID = 'sk_bench_starter';

// A generator node exactly as the canvas holds it mid-session: recipe fields plus
// runtime execution state that must NOT be persisted into a saved starter.
const node = {
  id: 'gen_1',
  type: 'nanoGen',
  position: { x: 0, y: 0 },
  data: {
    positivePrompt: 'A product hero on wet concrete, dusk light',
    model: 'gemini-3-flash-image',
    aspectRatio: '9:16',
    skillIds: [SKILL_ID],
    brandBookPieces: ['full'],
    // runtime-only — the serializer's blocklist must strip these:
    isExecuting: true,
    isComplete: true,
    generatedImageUrl: 'https://signed.example/expiring.png',
  },
} as unknown as StudioNode;

function recipeOf(nodes: unknown[]): Record<string, unknown> {
  const first = nodes[0] as { data?: Record<string, unknown> } | undefined;
  return first?.data ?? {};
}

// ── capture: serialize the selected node as a starter would ────────────────────
const captured = serializeWorkflowSnapshot([node], [] as Edge[], 'default');
const capturedData = recipeOf(captured.nodes);

check(
  'capture keeps the skillIds (the grounding that makes it re-runnable)',
  Array.isArray(capturedData.skillIds) && (capturedData.skillIds as string[]).includes(SKILL_ID),
  `skillIds = ${JSON.stringify(capturedData.skillIds)}`,
);
check(
  'capture keeps the model + prompt + aspectRatio (the recipe, not a text blob)',
  capturedData.model === 'gemini-3-flash-image' &&
    typeof capturedData.positivePrompt === 'string' &&
    capturedData.aspectRatio === '9:16',
  `model=${capturedData.model} aspectRatio=${capturedData.aspectRatio} prompt="${String(capturedData.positivePrompt).slice(0, 32)}…"`,
);
check(
  'capture drops runtime-only fields (isExecuting / isComplete / expiring URL)',
  !('isExecuting' in capturedData) &&
    !('isComplete' in capturedData) &&
    !('generatedImageUrl' in capturedData),
  `residual runtime keys: ${
    Object.keys(capturedData)
      .filter((k) => ['isExecuting', 'isComplete', 'generatedImageUrl'].includes(k))
      .join(', ') || '(none)'
  }`,
);

// ── invoke: re-apply the saved starter onto a canvas ───────────────────────────
const reapplied = normalizeWorkflowSnapshot(
  { nodes: captured.nodes as unknown as StudioNode[], edges: [] },
  'default',
);
const reappliedData = recipeOf(reapplied.nodes);
check(
  'invoke re-applies the node with skillIds still attached (Run resolves them)',
  Array.isArray(reappliedData.skillIds) && (reappliedData.skillIds as string[]).includes(SKILL_ID),
  `skillIds after re-apply = ${JSON.stringify(reappliedData.skillIds)}`,
);

// ── classification: the picker singles starters out by metadata flag ───────────
check(
  'a starter row is distinguished from a plain workflow by metadata.starter',
  isStarter({ starter: true }) === true &&
    isStarter({}) === false &&
    isStarter(undefined) === false,
  'isStarter({starter:true})=true, isStarter({})=false, isStarter(undefined)=false',
);

const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${'─'.repeat(72)}\n  ${checks.length - failed.length}/${checks.length} PASS\n${'─'.repeat(72)}\n`,
);
if (failed.length > 0) process.exit(1);
console.log(
  '  A captured starter survives as a re-runnable recipe — prompt, model, and skillIds\n' +
    '  intact through capture and re-apply — instead of collapsing to a text paragraph.\n',
);
