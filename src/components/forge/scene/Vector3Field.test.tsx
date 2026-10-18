/**
 * A vector field: three axes named "<label> X/Y/Z". A rotation is shown in degrees and written in
 * radians, and only the axis that moved is converted back.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toDegrees, toRadians, Vector3Field } from './Vector3Field';

afterEach(cleanup);

const axis = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe('Vector3Field', () => {
  test('degrees and radians convert both ways', () => {
    expect(toDegrees(Math.PI)).toBe(180);
    expect(toRadians(90)).toBeCloseTo(Math.PI / 2, 12);
  });

  test('a rotation shows degrees and writes radians for the axis that moved', () => {
    const onChange = mock((_next: [number, number, number]) => {});
    const stored = 1.5707963; // what Blender wrote: 90° to 7 digits
    render(
      <Vector3Field label="Title rotation" value={[stored, 0, 0]} rotation onChange={onChange} />,
    );
    expect(axis('Title rotation X').value).toBe('90');

    fireEvent.change(axis('Title rotation Z'), { target: { value: '45' } });
    const [next] = onChange.mock.calls.at(-1) ?? [];
    expect(next?.[0]).toBe(stored);
    expect(next?.[1]).toBe(0);
    expect(next?.[2]).toBeCloseTo(Math.PI / 4, 12);
  });

  test('a location is written as typed', () => {
    const onChange = mock((_next: [number, number, number]) => {});
    render(<Vector3Field label="Swatch location" value={[-5, 0, -2]} onChange={onChange} />);
    expect(axis('Swatch location X').value).toBe('-5');

    fireEvent.change(axis('Swatch location X'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith([0, 0, -2]);
  });
});
