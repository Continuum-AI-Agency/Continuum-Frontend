import { describe, expect, it } from 'bun:test';
import type * as React from 'react';

import { acceptSuggestionOnTab, suggestionPlaceholder } from './suggestInput';

type KeyEvent = React.KeyboardEvent<HTMLInputElement>;

function keyEvent(
  key: string,
  value: string,
  options: { shiftKey?: boolean } = {},
): KeyEvent & { defaultPrevented: boolean } {
  const event = {
    key,
    shiftKey: options.shiftKey ?? false,
    currentTarget: { value } as HTMLInputElement,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event as unknown as KeyEvent & { defaultPrevented: boolean };
}

describe('acceptSuggestionOnTab', () => {
  it('fills an empty field and swallows the Tab', () => {
    const accepted: string[] = [];
    const event = keyEvent('Tab', '');
    acceptSuggestionOnTab(4200, (value) => accepted.push(value))(event);
    expect(accepted).toEqual(['4200']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets Tab move focus once the field has a value', () => {
    const accepted: string[] = [];
    const event = keyEvent('Tab', '3000');
    acceptSuggestionOnTab(4200, (value) => accepted.push(value))(event);
    expect(accepted).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('treats a whitespace-only field as empty', () => {
    const accepted: string[] = [];
    acceptSuggestionOnTab(4200, (value) => accepted.push(value))(keyEvent('Tab', '   '));
    expect(accepted).toEqual(['4200']);
  });

  it('never intercepts Shift+Tab', () => {
    const accepted: string[] = [];
    const event = keyEvent('Tab', '', { shiftKey: true });
    acceptSuggestionOnTab(4200, (value) => accepted.push(value))(event);
    expect(accepted).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores every other key', () => {
    const accepted: string[] = [];
    const event = keyEvent('Enter', '');
    acceptSuggestionOnTab(4200, (value) => accepted.push(value))(event);
    expect(accepted).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('passes Tab through when there is no suggestion to accept', () => {
    const accepted: string[] = [];
    const event = keyEvent('Tab', '');
    acceptSuggestionOnTab(null, (value) => accepted.push(value))(event);
    expect(accepted).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('accepts a string suggestion unchanged', () => {
    const accepted: string[] = [];
    acceptSuggestionOnTab('0.25', (value) => accepted.push(value))(keyEvent('Tab', ''));
    expect(accepted).toEqual(['0.25']);
  });

  it('does not treat 0 as absent', () => {
    const accepted: string[] = [];
    acceptSuggestionOnTab(0, (value) => accepted.push(value))(keyEvent('Tab', ''));
    expect(accepted).toEqual(['0']);
  });
});

describe('suggestionPlaceholder', () => {
  it('shows the suggestion when there is one', () => {
    expect(suggestionPlaceholder(4200, '40')).toBe('4200');
  });

  it('falls back when there is none', () => {
    expect(suggestionPlaceholder(null, '40')).toBe('40');
    expect(suggestionPlaceholder(undefined, '40')).toBe('40');
  });

  it('keeps a zero suggestion rather than falling back', () => {
    expect(suggestionPlaceholder(0, '40')).toBe('0');
  });
});
