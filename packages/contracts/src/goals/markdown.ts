import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';
import { goalActorSchema, goalArtifactStatusSchema } from './domain';
import { getGoalTemplate } from './templates';

const idSchema = z.string().trim().min(1).max(240);
const timestampSchema = z.string().trim().min(1);

export const goalArtifactFrontMatterSchema = z
  .object({
    schema_version: z.literal(1).default(1),
    goal_id: idSchema,
    artifact_id: idSchema,
    artifact_type: idSchema,
    template_id: idSchema.optional(),
    template_version: z.number().int().positive().optional(),
    workstream_id: idSchema.optional(),
    status: goalArtifactStatusSchema,
    version: z.number().int().positive(),
    dependencies: z.array(idSchema).max(200).default([]),
    evidence_ids: z.array(idSchema).max(500).default([]),
    updated_at: timestampSchema,
    updated_by: goalActorSchema,
  })
  .strict();
export type GoalArtifactFrontMatter = z.infer<typeof goalArtifactFrontMatterSchema>;

export interface ParsedGoalArtifactMarkdown {
  frontMatter: GoalArtifactFrontMatter | null;
  body: string;
  raw: string;
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/**
 * Parse a Goal artifact without making a user-authored Markdown document
 * unreadable. Invalid or absent front matter returns null and preserves the
 * complete input as the body; callers can then request a repair explicitly.
 */
export const parseGoalArtifactMarkdown = (input: string): ParsedGoalArtifactMarkdown => {
  const match = FRONT_MATTER_RE.exec(input);
  if (!match) return { frontMatter: null, body: input, raw: input };

  try {
    const parsed = goalArtifactFrontMatterSchema.safeParse(parseYaml(match[1]));
    if (!parsed.success) return { frontMatter: null, body: input, raw: input };
    return {
      frontMatter: parsed.data,
      body: input.slice(match[0].length),
      raw: input,
    };
  } catch {
    return { frontMatter: null, body: input, raw: input };
  }
};

export const serializeGoalArtifactMarkdown = (args: {
  frontMatter: GoalArtifactFrontMatter;
  body: string;
}): string => {
  const frontMatter = goalArtifactFrontMatterSchema.parse(args.frontMatter);
  const yaml = stringifyYaml(frontMatter, { lineWidth: 0 });
  return `---\n${yaml}---\n${args.body}`;
};

export const createGoalArtifactMarkdown = (args: {
  templateId: string;
  artifactDefinitionId: string;
  goalId: string;
  artifactId: string;
  workstreamId?: string;
  updatedBy: z.infer<typeof goalActorSchema>;
  updatedAt: string;
}): string => {
  const template = getGoalTemplate(args.templateId);
  if (!template) throw new Error(`Unknown Goal template: ${args.templateId}`);

  const artifact = template.artifacts.find(
    (definition) => definition.id === args.artifactDefinitionId,
  );
  if (!artifact) {
    throw new Error(
      `Unknown artifact definition "${args.artifactDefinitionId}" for Goal template "${args.templateId}".`,
    );
  }
  if (artifact.format !== 'markdown') {
    throw new Error(`Artifact definition "${artifact.id}" is not a Markdown artifact.`);
  }

  const body = [
    `# ${artifact.title}`,
    '',
    ...artifact.requiredSections.flatMap((section) => [`## ${section.title}`, '']),
  ].join('\n');

  return serializeGoalArtifactMarkdown({
    frontMatter: {
      schema_version: 1,
      goal_id: args.goalId,
      artifact_id: args.artifactId,
      artifact_type: artifact.id,
      template_id: template.id,
      template_version: template.version,
      workstream_id: args.workstreamId,
      status: 'drafting',
      version: 1,
      dependencies: [...artifact.defaultDependencies],
      evidence_ids: [],
      updated_at: args.updatedAt,
      updated_by: args.updatedBy,
    },
    body,
  });
};
