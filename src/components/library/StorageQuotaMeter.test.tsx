import { afterEach, describe, expect, it } from 'bun:test';
import type { DriveQuota } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { StorageQuotaMeterView } from './StorageQuotaMeter';

afterEach(cleanup);

const GB = 1e9;

function quota(usedBytes: number, reservedBytes = 0): DriveQuota {
  const capacityBytes = 100 * GB;
  return {
    brandId: '00000000-0000-4000-8000-000000000001',
    usedBytes,
    reservedBytes,
    capacityBytes,
    availableBytes: Math.max(0, capacityBytes - usedBytes - reservedBytes),
  };
}

describe('StorageQuotaMeterView', () => {
  it('shows usage and no warning below 80%', () => {
    render(<StorageQuotaMeterView quota={quota(79 * GB)} />);
    expect(screen.getByTestId('storage-quota-meter').textContent).toContain('79 GB of 100 GB used');
    expect(screen.queryByTestId('storage-quota-warning')).toBeNull();
    expect(screen.queryByTestId('storage-quota-upgrade')).toBeNull();
  });

  it('warns with an upgrade link at 80%, counting in-flight uploads', () => {
    render(<StorageQuotaMeterView quota={quota(70 * GB, 10 * GB)} />);
    expect(screen.getByTestId('storage-quota-warning').textContent).toContain(
      'Library is 80% full',
    );
    expect(screen.getByTestId('storage-quota-upgrade').getAttribute('href')).toBe(
      '/settings/drive#storage',
    );
  });

  it('says uploads are paused when full', () => {
    render(<StorageQuotaMeterView quota={quota(100 * GB)} />);
    const warning = screen.getByTestId('storage-quota-warning');
    expect(warning.textContent).toContain('Library full — uploads are paused');
    expect(warning.getAttribute('role')).toBe('alert');
    expect(screen.getByTestId('storage-quota-upgrade').getAttribute('href')).toBe(
      '/settings/drive#storage',
    );
  });
});
