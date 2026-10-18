import { describe, expect, it } from 'bun:test';
import parseExample from './__fixtures__/blend-parse.example.json';
import jobExample from './__fixtures__/scene-render-job.example.json';
import resultExample from './__fixtures__/scene-render-result.example.json';
import {
  blendFieldSchema,
  blendParseSchema,
  blendTargetSchema,
  scenePreviewRequestSchema,
  sceneRenderJobSchema,
  sceneRenderRequestSchema,
  sceneRenderResultSchema,
} from './blend-scene';

// The Rust crates parse these same three files with serde; a shape change has to pass both.
describe('blend-scene examples', () => {
  it('parses the forge parse example', () => {
    const parse = blendParseSchema.parse(parseExample);
    expect(parse.fields.filter((f) => f.exposed).map((f) => f.key)).toEqual([
      'headline',
      'logo.image',
      'brand_colour',
      'hide_badge',
    ]);
    expect(parse.outputs.map((o) => o.id)).toEqual(['Main/CamWide', 'Motion/CamWide']);
  });

  it('parses the render job and result examples', () => {
    expect(sceneRenderJobSchema.parse(jobExample).values).toHaveLength(6);
    expect(sceneRenderResultSchema.parse(resultExample).blenderVersion).toBe('5.2.2');
  });
});

describe('blendTargetSchema', () => {
  it('refuses a path outside the closed set', () => {
    expect(
      blendTargetSchema.safeParse({ idCode: 'OB', idName: 'Title', path: 'location' }).success,
    ).toBe(false);
  });

  it('refuses a socket target without its node', () => {
    expect(
      blendTargetSchema.safeParse({ idCode: 'MA', idName: 'M', path: 'socket', socket: 'Color' })
        .success,
    ).toBe(false);
  });
});

describe('blendFieldSchema', () => {
  const field = {
    key: 'k',
    name: 'n',
    target: { idCode: 'OB', idName: 'Title', path: 'text.body' },
    exposed: true,
    origin: 'discovered',
  } as const;

  it('refuses a default that does not fit the kind', () => {
    expect(blendFieldSchema.safeParse({ ...field, kind: 'color', default: 'red' }).success).toBe(
      false,
    );
    expect(blendFieldSchema.safeParse({ ...field, kind: 'number', default: '3' }).success).toBe(
      false,
    );
    expect(blendFieldSchema.safeParse({ ...field, kind: 'text', default: null }).success).toBe(
      false,
    );
  });

  it('accepts a null default only for images', () => {
    expect(blendFieldSchema.safeParse({ ...field, kind: 'image', default: null }).success).toBe(
      true,
    );
  });
});

describe('sceneRenderJobSchema', () => {
  const job = sceneRenderJobSchema.parse(jobExample);

  it('refuses a multi-frame image output', () => {
    const output = { ...job.output, frameEnd: 5 };
    expect(sceneRenderJobSchema.safeParse({ ...job, output }).success).toBe(false);
  });

  it('refuses an upload type that does not match the output', () => {
    const upload = { ...job.upload, contentType: 'video/mp4' };
    expect(sceneRenderJobSchema.safeParse({ ...job, upload }).success).toBe(false);
  });

  it('refuses more than 600 frames', () => {
    const output = { ...job.output, mediaType: 'video', frameStart: 1, frameEnd: 601 };
    const upload = { ...job.upload, contentType: 'video/mp4' };
    expect(sceneRenderJobSchema.safeParse({ ...job, output, upload }).success).toBe(false);
  });

  it('refuses an image file name that could escape the work dir', () => {
    const values = [{ ...job.values[1], fileName: '../etc/passwd' }];
    expect(sceneRenderJobSchema.safeParse({ ...job, values }).success).toBe(false);
  });
});

describe('vector3 fields and author scope', () => {
  const location = {
    key: 'swatch.location',
    name: 'Swatch · location',
    kind: 'vector3',
    target: { idCode: 'OB', idName: 'Swatch', path: 'transform.location' },
    exposed: false,
    origin: 'discovered',
  } as const;

  it('takes an [x, y, z] default and refuses anything else for a vector3', () => {
    expect(blendFieldSchema.safeParse({ ...location, default: [-5, 0, -2] }).success).toBe(true);
    expect(blendFieldSchema.safeParse({ ...location, default: [1, 2] }).success).toBe(false);
    expect(blendFieldSchema.safeParse({ ...location, default: 3 }).success).toBe(false);
  });

  it('refuses a vector default on a scalar field', () => {
    expect(
      blendFieldSchema.safeParse({ ...location, kind: 'number', default: [0, 0, 0] }).success,
    ).toBe(false);
  });

  const request = {
    brandId: '11111111-1111-4111-8111-111111111111',
    versionId: '22222222-2222-4222-8222-222222222222',
    outputId: 'Main/CamWide',
  };

  it('leaves scope absent unless a caller asks for all', () => {
    expect(sceneRenderRequestSchema.parse(request).scope).toBeUndefined();
    const author = sceneRenderRequestSchema.parse({
      ...request,
      scope: 'all',
      values: { 'swatch.location': [0, 0, -2] },
    });
    expect(author.values['swatch.location']).toEqual([0, 0, -2]);
  });

  it('takes a preview request with a quality and refuses render-only keys', () => {
    expect(scenePreviewRequestSchema.safeParse({ ...request, quality: 'draft' }).success).toBe(
      true,
    );
    expect(
      scenePreviewRequestSchema.safeParse({
        ...request,
        requestId: '33333333-3333-4333-8333-333333333333',
      }).success,
    ).toBe(false);
  });

  it('caps a job sample override at 128', () => {
    const job = sceneRenderJobSchema.parse(jobExample);
    const output = { ...job.output, samples: 129 };
    expect(sceneRenderJobSchema.safeParse({ ...job, output }).success).toBe(false);
  });
});
