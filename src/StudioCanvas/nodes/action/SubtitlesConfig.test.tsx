import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Base UI's Switch is a popup-free primitive but still relies on browser APIs the DOM shim
// does not provide; a checkbox stands in so the assertions stay about THIS component.
mock.module('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

const { SubtitlesConfig } = await import('./SubtitlesConfig');

afterEach(cleanup);

type Write = { key: string; value: unknown };

function setup(
  config: Record<string, unknown> = {},
  brandStyle?: Parameters<typeof SubtitlesConfig>[0]['brandStyle'],
) {
  const writes: Write[] = [];
  render(
    <SubtitlesConfig
      nodeId="n1"
      config={{ preset: 'pop', emphasize: true, language: null, ...config }}
      onWrite={(key, value) => writes.push({ key, value })}
      brandStyle={brandStyle}
    />,
  );
  return { writes };
}

const presetButton = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`^${label} —`) });

describe('SubtitlesConfig', () => {
  it('offers exactly the six presets the frozen registry enum allows', () => {
    setup();
    for (const label of ['Classic', 'Pop', 'Pulse', 'Glide', 'Fusion', 'Boxed']) {
      expect(presetButton(label)).toBeDefined();
    }
  });

  it('marks the configured preset as the active one', () => {
    setup({ preset: 'boxed' });
    expect(presetButton('Boxed').getAttribute('aria-pressed')).toBe('true');
    expect(presetButton('Pop').getAttribute('aria-pressed')).toBe('false');
  });

  it('falls back to classic for an unknown stored preset', () => {
    setup({ preset: 'hormozi-5' });
    expect(presetButton('Classic').getAttribute('aria-pressed')).toBe('true');
  });

  it('writes the preset id when a chip is clicked', () => {
    const { writes } = setup();
    fireEvent.click(presetButton('Pulse'));
    expect(writes).toEqual([{ key: 'preset', value: 'pulse' }]);
  });

  it('renders each chip in its OWN typeface, so the gallery cannot lie', () => {
    // A picker that shows six identical chips is exactly the failure the font work exists
    // to prevent; if this regresses, the UI stops telling the user what they are choosing.
    setup();
    const families = ['Pop', 'Pulse', 'Glide', 'Boxed'].map((label) => {
      const swatch = presetButton(label).querySelector('span span') as HTMLElement | null;
      return swatch?.style.fontFamily ?? '';
    });
    expect(families[0]).toContain('Anton');
    expect(families[1]).toContain('Montserrat');
    expect(families[2]).toContain('Inter');
    expect(families[3]).toContain('JetBrains Mono');
  });

  it('labels each preset with its motion, including the static ones', () => {
    setup();
    expect(presetButton('Classic').textContent).toContain('static');
    expect(presetButton('Pop').textContent).toContain('pop');
    expect(presetButton('Glide').textContent).toContain('floatIn');
  });

  it('shows the active preset description', () => {
    setup({ preset: 'fusion' });
    expect(screen.getByText(/Rounded panel behind the line/)).toBeDefined();
  });

  it('toggles emphasis and writes the boolean', () => {
    const { writes } = setup({ emphasize: true });
    fireEvent.click(screen.getByLabelText('Emphasise key words'));
    expect(writes).toEqual([{ key: 'emphasize', value: false }]);
  });

  it('reflects emphasis being off', () => {
    setup({ emphasize: false });
    expect((screen.getByLabelText('Emphasise key words') as HTMLInputElement).checked).toBe(false);
  });

  it('writes null rather than an empty string when the language is cleared', () => {
    // The registry field is nullable, and null means auto-detect. Writing '' would be a
    // value the user never chose.
    const { writes } = setup({ language: 'en-US' });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: '  ' } });
    expect(writes).toEqual([{ key: 'language', value: null }]);
  });

  it('writes a trimmed language code', () => {
    const { writes } = setup();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: ' es-ES ' } });
    expect(writes).toEqual([{ key: 'language', value: 'es-ES' }]);
  });

  it('says out loud when the brand face cannot be rendered', () => {
    setup({}, { colors: ['#1c7ed6'], typography: { primary: 'Gotham Rounded' } });
    expect(screen.getByText(/Gotham Rounded/)).toBeDefined();
    expect(screen.getByText(/unavailable/)).toBeDefined();
  });

  it('stays quiet when the brand face IS registered', () => {
    setup({}, { colors: ['#1c7ed6'], typography: { primary: 'Inter' } });
    expect(screen.queryByText(/unavailable/)).toBeNull();
  });

  it('stays quiet when the brand names no face at all', () => {
    setup({}, { colors: ['#1c7ed6'], typography: { primary: null } });
    expect(screen.queryByText(/unavailable/)).toBeNull();
  });
});
