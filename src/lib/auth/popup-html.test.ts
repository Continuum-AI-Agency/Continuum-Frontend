import { describe, expect, test } from 'bun:test';
import { escapePopupHtml, popupScriptJson } from './popup-html';

describe('OAuth popup HTML boundaries', () => {
  test('escapes translated HTML text without changing ordinary locale characters', () => {
    expect(escapePopupHtml('Autenticação concluída.')).toBe('Autenticação concluída.');
    expect(escapePopupHtml('"<script>" & \'text\'')).toBe(
      '&quot;&lt;script&gt;&quot; &amp; &#39;text&#39;',
    );
  });
  test('keeps wire payload values identical while blocking script termination and JavaScript line separators', () => {
    const payload = {
      type: 'oauth:error',
      message: '</script><script>alert("x")</script>\u2028\u2029',
      provider: 'Google',
      context: 'login',
    };
    const encoded = popupScriptJson(payload);
    expect(encoded).not.toContain('<');
    expect(encoded).not.toContain('>');
    expect(encoded).not.toContain('\u2028');
    expect(encoded).not.toContain('\u2029');
    expect(JSON.parse(encoded)).toEqual(payload);
    expect(JSON.parse(popupScriptJson('https://example.test/?next=</script>'))).toBe(
      'https://example.test/?next=</script>',
    );
  });
});
