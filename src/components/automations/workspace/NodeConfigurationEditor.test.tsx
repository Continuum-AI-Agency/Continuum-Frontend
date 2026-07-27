import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createAutomationWorkflowNode } from './automationNodeCatalog';
import { appendPromptStarter, NodeConfigurationEditor } from './NodeConfigurationEditor';

afterEach(cleanup);

describe('automation prompt editor', () => {
  test('offers compact prompt actions and appends a quick starter', () => {
    const node = createAutomationWorkflowNode({
      type: 'instruction',
      id: 'instruction',
      position: { x: 0, y: 0 },
    });
    const onChange = mock();

    render(
      <NodeConfigurationEditor
        node={node}
        disabled={false}
        sourceCapabilities={null}
        onChange={onChange}
      />,
    );

    expect((screen.getByLabelText('Prompt and operating rules') as HTMLTextAreaElement).value).toBe(
      node.config.text,
    );
    expect(screen.getByText('10 words')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open large prompt editor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add prompt starter' })).toBeTruthy();
    expect(appendPromptStarter('Existing direction', 'Add evidence.')).toBe(
      'Existing direction\n\nAdd evidence.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear prompt' }));
    expect(onChange).toHaveBeenLastCalledWith({ text: '' });
  });
});
