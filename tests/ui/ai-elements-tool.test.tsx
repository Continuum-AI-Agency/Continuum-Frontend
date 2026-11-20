import { expect, test } from 'bun:test';
import React from 'react';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { renderToStaticMarkup } from '@/i18n/__tests__/render';

test('Tool renders header, input, and output sections', () => {
  const html = renderToStaticMarkup(
    <Tool type="tool-get_campaigns" state="output-available" defaultOpen>
      <ToolHeader />
      <ToolContent>
        <ToolInput value={{ force_refresh: false }} />
        <ToolOutput value={{ campaigns: [] }} />
      </ToolContent>
    </Tool>,
  );

  expect(html).toContain('get campaigns');
  expect(html).toContain('Input');
  expect(html).toContain('Output');
});
