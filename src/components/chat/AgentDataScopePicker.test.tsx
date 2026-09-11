import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { type AgentDataScopeOption, AgentDataScopePicker } from './AgentDataScopePicker';

afterEach(cleanup);

const options: AgentDataScopeOption[] = [
  { id: 'primary', label: 'Primary account' },
  { id: 'second', label: 'Second account' },
  { id: 'third', label: 'Third account' },
];

describe('AgentDataScopePicker', () => {
  it('names current coverage and keeps required accounts selected', () => {
    const onChange = mock(() => {});
    render(
      <AgentDataScopePicker
        label="Meta accounts"
        options={options}
        selectedIds={['primary']}
        requiredIds={['primary']}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Meta accounts: 1 of 3 included' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Meta accounts: 1 of 3 included' }));

    const primary = screen.getByRole('checkbox', { name: /Primary account/ });
    expect((primary as HTMLInputElement).checked).toBe(true);
    expect((primary as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Second account' }));
    expect(onChange).toHaveBeenCalledWith(['primary', 'second']);
  });

  it('selects all only after the user explicitly asks and respects the maximum', () => {
    const manyOptions = Array.from({ length: 12 }, (_, index) => ({
      id: `account-${index + 1}`,
      label: `Account ${index + 1}`,
    }));

    function ControlledPicker() {
      const [selectedIds, setSelectedIds] = useState(['account-1']);
      return (
        <AgentDataScopePicker
          label="Meta accounts"
          options={manyOptions}
          selectedIds={selectedIds}
          requiredIds={['account-1']}
          maxSelected={10}
          onChange={setSelectedIds}
        />
      );
    }

    render(<ControlledPicker />);
    expect(screen.getByRole('button', { name: 'Meta accounts: 1 of 12 included' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Meta accounts: 1 of 12 included' }));
    fireEvent.click(screen.getByRole('button', { name: 'Include up to 10' }));

    expect(screen.getByRole('button', { name: 'Meta accounts: 10 of 12 included' })).toBeTruthy();
    expect(
      screen.getAllByRole('checkbox').filter((checkbox) => (checkbox as HTMLInputElement).checked),
    ).toHaveLength(10);
  });
});
