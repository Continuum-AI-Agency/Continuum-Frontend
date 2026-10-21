import { z } from 'zod';
import { microMeasuredOutputSchema, microMediaToolSchema } from '../ai-studio/delivery-timing';
import {
  hyperframesCanonicalJson,
  hyperframesClockSchema,
  hyperframesCompilerBuildSchema,
  hyperframesDependencySchema,
  hyperframesUploadPinSchema,
} from './hyperframes-native';
import { templateRevisionRefSchema } from './template-revision-pin';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const https = z
  .string()
  .url()
  .max(4096)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  }, 'Render URLs must be signed HTTPS locations without credentials or fragments');

export const hyperframesNativeRefusalSchema = z
  .object({
    refused: z.string().regex(/^[a-z][a-z0-9_:-]{0,159}$/),
    at: z
      .string()
      .max(200)
      .refine(
        (value) => !value.includes('://') && !/[?@]/.test(value),
        'Native refusal locations must not contain private URLs',
      )
      .nullable(),
  })
  .strict();

export const HYPERFRAMES_RENDER_SCHEMA = 'micro-render/hyperframes-render/1' as const;
/** No AE catalog, layer binding or promotion identity belongs in this request. */
export const hyperframesNativeRenderRequestSchema = z
  .object({
    schema: z.literal(HYPERFRAMES_RENDER_SCHEMA),
    job: z.uuid(),
    /** The existing service lease token; a replacement lease has a different attempt. */
    attempt: z.uuid(),
    source: z
      .object({
        family: z.literal('hyperframes'),
        assetId: z.uuid(),
        versionId: z.uuid(),
        upload: hyperframesUploadPinSchema,
        entrySha256: hash,
        scene: z
          .object({
            url: https,
            sha256: hash,
            byteLength: z
              .number()
              .int()
              .positive()
              .max(32 << 20),
          })
          .strict(),
        compiler: hyperframesCompilerBuildSchema,
      })
      .strict(),
    revision: templateRevisionRefSchema.extend({ resolvedEditsSha256: hash }).strict(),
    engine: z.object({ implementation: z.string().min(1).max(200), sha256: hash }).strict(),
    tools: z.object({ encoderSha256: hash, probeSha256: hash }).strict(),
    viewport: z
      .object({
        width: z.number().int().min(1).max(8192),
        height: z.number().int().min(1).max(8192),
      })
      .strict(),
    clock: hyperframesClockSchema,
    /** One signed resource URL per unique content hash. Scene URL aliases are kept in the scene. */
    resources: z
      .array(
        hyperframesDependencySchema
          .pick({ sha256: true, byteLength: true, kind: true, mediaType: true })
          .extend({ url: https })
          .strict(),
      )
      .max(1000),
    outputs: z
      .array(
        z.discriminatedUnion('file', [
          z
            .object({
              file: z.literal('png'),
              frame: z.number().int().nonnegative(),
              upload: z.object({ url: https, contentType: z.literal('image/png') }).strict(),
            })
            .strict(),
          z
            .object({
              file: z.literal('mp4'),
              crf: z.number().int().min(0).max(51),
              upload: z.object({ url: https, contentType: z.literal('video/mp4') }).strict(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(2),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (
      request.source.upload.mediaType === 'text/html' &&
      request.source.upload.sha256 !== request.source.entrySha256
    )
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'The original HTML upload and entry must have the same checksum',
      });
    if (
      request.source.upload.mediaType === 'text/html' &&
      request.source.upload.byteLength > 32 << 20
    )
      ctx.addIssue({ code: 'custom', path: ['source', 'upload'], message: 'HTML exceeds 32 MiB' });
    if (new Set(request.resources.map((item) => item.sha256)).size !== request.resources.length)
      ctx.addIssue({
        code: 'custom',
        path: ['resources'],
        message: 'Each immutable resource must be supplied once',
      });
    if (request.resources.reduce((sum, item) => sum + item.byteLength, 0) > 64 << 20)
      ctx.addIssue({
        code: 'custom',
        path: ['resources'],
        message: 'Resource bytes exceed 64 MiB',
      });
    const destinations = request.outputs.map((out) => {
      const url = new URL(out.upload.url);
      return `${url.origin}${url.pathname}`;
    });
    if (new Set(destinations).size !== destinations.length)
      ctx.addIssue({
        code: 'custom',
        path: ['outputs'],
        message: 'Native outputs need distinct private object destinations',
      });
    if (new Set(request.outputs.map((item) => item.file)).size !== request.outputs.length)
      ctx.addIssue({
        code: 'custom',
        path: ['outputs'],
        message: 'An output format may only appear once',
      });
    if (
      request.outputs.some((item) => item.file === 'png' && item.frame >= request.clock.frameCount)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['outputs'],
        message: 'Still frame is outside the compiled clock',
      });
    if (
      request.outputs.some((item) => item.file === 'mp4') &&
      (request.viewport.width % 2 || request.viewport.height % 2)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['viewport'],
        message: 'The qualified H.264 output needs even dimensions',
      });
    if (
      request.viewport.width * request.viewport.height > 8_388_608 ||
      request.clock.frameCount > 1800 ||
      request.clock.frameCount * request.clock.denominator > 600 * request.clock.numerator
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Native render exceeds the viewport, frame or duration budget',
      });
  });
export type HyperframesNativeRenderRequest = z.infer<typeof hyperframesNativeRenderRequestSchema>;

const nativeOutputSchema = microMeasuredOutputSchema
  .extend({
    file: z.enum(['png', 'mp4']),
    bytes: z
      .number()
      .int()
      .positive()
      .max(128 << 20),
    uploaded: z.literal(true),
    audio: z.null(),
    still: z
      .object({
        frame: z.number().int().nonnegative(),
        width: z.number().int().min(1).max(8192),
        height: z.number().int().min(1).max(8192),
        rgbaSha256: hash,
        decodeClean: z.literal(true),
      })
      .strict()
      .nullable(),
  })
  .superRefine((output, ctx) => {
    if (
      output.file === 'png'
        ? output.profile !== null || output.video !== null || output.still === null
        : output.profile !== 'web-h264' || output.video === null || output.still !== null
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Output measurements do not match the native format',
      });
    if (output.video && output.video.durationSeconds.length > 64)
      ctx.addIssue({ code: 'custom', message: 'Invalid native duration' });
  });
const pinnedToolSchema = microMediaToolSchema.extend({ sha256: hash });

/** A validated delivery. Signed request URLs never appear in durable results or logs. */
export const hyperframesNativeRenderResultSchema = z
  .object({
    schema: z.literal('micro-render/hyperframes-result/1'),
    job: z.uuid(),
    attempt: z.uuid(),
    source: z
      .object({
        assetId: z.uuid(),
        versionId: z.uuid(),
        upload: hyperframesUploadPinSchema,
        entrySha256: hash,
        sceneSha256: hash,
        compiler: hyperframesCompilerBuildSchema,
      })
      .strict(),
    revision: templateRevisionRefSchema.extend({ resolvedEditsSha256: hash }).strict(),
    engine: z.object({ implementation: z.string().min(1).max(200), sha256: hash }).strict(),
    clock: hyperframesClockSchema,
    viewport: z
      .object({ width: z.number().int().positive(), height: z.number().int().positive() })
      .strict(),
    outputs: z.array(nativeOutputSchema).min(1).max(2),
    validation: z.literal('passed'),
    encoder: pinnedToolSchema,
    probe: pinnedToolSchema,
    renderMs: z.number().int().nonnegative(),
    encodeMs: z.number().int().nonnegative(),
    validateMs: z.number().int().nonnegative(),
    uploadMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (new Set(result.outputs.map((item) => item.file)).size !== result.outputs.length)
      ctx.addIssue({ code: 'custom', path: ['outputs'], message: 'Repeated native output' });
  });
export type HyperframesNativeRenderResult = z.infer<typeof hyperframesNativeRenderResultSchema>;

/**
 * Verify the response against the frozen execution request, including every decoded PTS.
 * The worker must also hold this lease and read back/check uploaded bytes before publication.
 * This helper does not assert that either of those storage operations has happened.
 */
export async function verifyHyperframesNativeRenderResult(
  requestValue: unknown,
  resultValue: unknown,
): Promise<HyperframesNativeRenderResult> {
  const request = hyperframesNativeRenderRequestSchema.parse(requestValue);
  const result = hyperframesNativeRenderResultSchema.parse(resultValue);
  const same = (name: string, actual: unknown, expected: unknown) => {
    if (hyperframesCanonicalJson(actual) !== hyperframesCanonicalJson(expected))
      throw Error(`Native render result mismatch: ${name}`);
  };
  same('job', result.job, request.job);
  same('attempt', result.attempt, request.attempt);
  same('source', result.source, {
    assetId: request.source.assetId,
    versionId: request.source.versionId,
    upload: request.source.upload,
    entrySha256: request.source.entrySha256,
    sceneSha256: request.source.scene.sha256,
    compiler: request.source.compiler,
  });
  same('revision', result.revision, request.revision);
  same('engine', result.engine, request.engine);
  same('clock', result.clock, request.clock);
  same('viewport', result.viewport, request.viewport);
  same('encoder name', result.encoder.name, 'ffmpeg');
  same('probe name', result.probe.name, 'ffprobe');
  same('encoder', result.encoder.sha256, request.tools.encoderSha256);
  same('probe', result.probe.sha256, request.tools.probeSha256);
  same(
    'output formats',
    result.outputs.map((o) => o.file).sort(),
    request.outputs.map((o) => o.file).sort(),
  );
  const count = request.clock.frameCount;
  const numerator = BigInt(request.clock.numerator),
    denominator = BigInt(request.clock.denominator);
  let expectedPtsHash: string | undefined;
  for (const output of result.outputs) {
    if (output.file === 'png') {
      const planned = request.outputs.find((o) => o.file === 'png');
      if (planned?.file !== 'png' || !output.still)
        throw Error('Native render result mismatch: still');
      same('still frame', output.still.frame, planned.frame);
      same('still width', output.still.width, request.viewport.width);
      same('still height', output.still.height, request.viewport.height);
      continue;
    }
    const video = output.video!;
    if (!expectedPtsHash) {
      const bytes = new TextEncoder().encode(
        Array.from({ length: count }, (_, i) => `${i}\n`).join(''),
      );
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      expectedPtsHash = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
    }
    same('frame count', video.frames, count);
    if (BigInt(video.rate.num) * denominator !== numerator * BigInt(video.rate.den))
      throw Error('Native render result mismatch: frame rate');
    const [durationNum, durationDen] = video.durationSeconds.split('/').map(BigInt);
    if (durationNum * numerator !== BigInt(count) * denominator * durationDen)
      throw Error('Native render result mismatch: duration');
    if (
      video.firstPts !== 0 ||
      BigInt(video.lastPts) * BigInt(video.timeBase.num) * numerator !==
        BigInt(count - 1) * denominator * BigInt(video.timeBase.den)
    )
      throw Error('Native render result mismatch: presentation timestamps');
    same('PTS sequence', video.ptsSha256, expectedPtsHash);
    same('progressive output', video.fieldOrder, 'progressive');
    same('clean decode', video.decodeClean, true);
  }
  return result;
}
