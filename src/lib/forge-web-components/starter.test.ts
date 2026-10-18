import { describe, expect, test } from 'bun:test';
import { webComponentProjectSchema } from '@continuum/contracts';
import { createStarterProject } from './starter';

describe('createStarterProject', () => {
  test('creates contract-valid projects with the framework entry and portable defaults', () => {
    for (const framework of ['three', 'r3f', 'pixi', 'dom'] as const) {
      const project = createStarterProject(framework);
      expect(webComponentProjectSchema.parse(project)).toEqual(project);
      expect(project.entry).toBe('src/main.js');
      expect(project.files[project.entry]).toContain('createScene');
      expect(project.files[project.entry]).toContain("import './style.css'");
      expect(project.width).toBe(1280);
      expect(project.assets).toEqual([]);
      expect(project.overrides).toEqual([]);
    }
  });

  test('Three and R3F starters expose stable inspectable scene IDs and the requested edit surfaces', () => {
    for (const framework of ['three', 'r3f'] as const) {
      const source = createStarterProject(framework).files['src/main.js']!;
      for (const id of ['hero-orb', 'main-light', 'main-camera'])
        expect(source).toContain(`'${id}'`);
      expect(source).toContain('material.color');
      expect(source).toContain('position.x');
      expect(source).toContain('applyProperty');
      expect(source).toContain('dispose()');
      for (const key of [
        'position.x',
        'position.y',
        'position.z',
        'rotation.x',
        'rotation.y',
        'rotation.z',
        'scale.x',
        'scale.y',
        'scale.z',
        'visible',
      ])
        expect(source).toContain(`key: '${key}'`);
      expect(source).toContain(
        framework === 'three' ? "keyName.startsWith('rotation.')" : "key.startsWith('rotation.')",
      );
      expect(source).toContain(
        framework === 'three' ? "keyName.startsWith('scale.')" : "key.startsWith('scale.')",
      );
      expect(source).toContain(
        framework === 'three' ? "keyName === 'visible'" : "key === 'visible'",
      );
    }
    const r3fSource = createStarterProject('r3f').files['src/main.js']!;
    expect(r3fSource).toContain('timestampSeconds = t');
    expect(r3fSource).toContain('advance(timestampSeconds, true');
  });

  test('Pixi exposes stable editable transform, opacity, visibility, and tint controls', () => {
    const source = createStarterProject('pixi').files['src/main.js']!;
    for (const key of ['rotation', 'scale.x', 'scale.y', 'opacity', 'visible', 'tint'])
      expect(source).toContain(`key: '${key}'`);
    expect(source).toContain("key === 'opacity'");
    expect(source).toContain("key === 'visible'");
    expect(source).toContain('roundRect(-70, -70, 140, 140, 22)');
    expect(source).toContain('orb.rotation = t * 0.42');
  });
});
