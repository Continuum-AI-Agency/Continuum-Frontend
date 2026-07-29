import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { PortfolioOption } from './defaultPickerSources';
import { PaidPortfolioPicker } from './PaidPortfolioPicker';
import { chooseOption, installPickerDomGlobals, openSelect, stubSource } from './pickerTestHarness';

installPickerDomGlobals();
afterEach(cleanup);

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const PORTFOLIO_ID = '22222222-2222-4222-8222-222222222222';

const portfolios: PortfolioOption[] = [
  { id: PORTFOLIO_ID, name: 'Prospecting — US', adAccountId: 'act_1' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Retargeting', adAccountId: 'act_2' },
];

describe('PaidPortfolioPicker', () => {
  test('offers the brand portfolios across every ad account', () => {
    render(
      <PaidPortfolioPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: portfolios })}
      />,
    );

    openSelect('Optimizer portfolio');
    expect(screen.getByRole('option', { name: 'Prospecting — US' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Retargeting' })).toBeTruthy();
  });

  test('writes the chosen portfolio id', () => {
    const onChange = mock();
    render(
      <PaidPortfolioPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: portfolios })}
      />,
    );

    openSelect('Optimizer portfolio');
    chooseOption('Prospecting — US');
    expect(onChange).toHaveBeenLastCalledWith(PORTFOLIO_ID);
  });

  test('renders the retired entity placeholder as unset', () => {
    render(
      <PaidPortfolioPicker
        brandId={BRAND_ID}
        value="select-paid-target"
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: portfolios })}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Optimizer portfolio' }).textContent).toContain(
      'Select a portfolio',
    );
    expect(
      screen.getByText('This step cannot run or publish until a portfolio is chosen.'),
    ).toBeTruthy();
  });

  test('degrades to the raw portfolio id when the source errors', () => {
    render(
      <PaidPortfolioPicker
        brandId={BRAND_ID}
        value={PORTFOLIO_ID}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ isError: true })}
      />,
    );

    expect((screen.getByLabelText('Optimizer portfolio ID') as HTMLInputElement).value).toBe(
      PORTFOLIO_ID,
    );
    expect(screen.queryByRole('combobox', { name: 'Optimizer portfolio' })).toBeNull();
  });

  test('keeps an archived portfolio selectable rather than discarding it', () => {
    render(
      <PaidPortfolioPicker
        brandId={BRAND_ID}
        value="44444444-4444-4444-8444-444444444444"
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: portfolios })}
      />,
    );

    openSelect('Optimizer portfolio');
    expect(screen.getByRole('option', { name: /Unavailable portfolio/ })).toBeTruthy();
  });
});
