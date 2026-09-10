import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_KEY_MAX,
  templateKeyFromName,
  templateNameProblem,
} from './template-name';

describe('templateKeyFromName', () => {
  it('collapses a readable name the way the forge does', () => {
    expect(templateKeyFromName('StarCraft: Remastered Hero')).toBe('starcraft_remastered_hero');
    expect(templateKeyFromName('  Vivo47 EasyFit  ')).toBe('vivo47_easyfit');
  });

  it('refuses the filename an AE project actually carries', () => {
    // `media.assets.file_name` is the designer's own filename (the uuid lives in storage_path),
    // and designers name files like this. It must NEVER be truncated to fit: a shortened key is
    // two templates sharing one root table, and the queue resolves the template FROM the table.
    const real = 'Vivo47_EasyFit_1x1_9x16_16x9_v11_FINAL_APPROVED.aep';
    expect(templateKeyFromName(real)).toBeNull();
    expect(templateNameProblem(real)).toMatch(/too long/);
    // and the same project, named deliberately, is fine
    expect(templateKeyFromName('Vivo47 EasyFit')).toBe('vivo47_easyfit');
  });

  it('says what is wrong in words the form can render', () => {
    expect(templateNameProblem('')).toMatch(/give this template a name/);
    expect(templateNameProblem('   ')).toMatch(/give this template a name/);
    expect(templateNameProblem('***')).toMatch(/at least one letter or number/);
    expect(templateNameProblem('StarCraft Remastered')).toBeNull();
  });

  it('accepts exactly the limit and refuses one past it', () => {
    expect(templateKeyFromName('a'.repeat(TEMPLATE_KEY_MAX))).toHaveLength(TEMPLATE_KEY_MAX);
    expect(templateKeyFromName('a'.repeat(TEMPLATE_KEY_MAX + 1))).toBeNull();
  });
});
