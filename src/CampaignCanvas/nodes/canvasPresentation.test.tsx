import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { DragEvent, ReactNode } from 'react';
import { ASSET_DRAG_MIME } from '@/components/library/views/assetDrag';
import * as brandContext from '@/components/providers/ActiveBrandProvider';
import { render, renderHook } from '@/i18n/__tests__/render';
import * as activity from '@/lib/paid-media/jaina-activity-client';
import commonEn from '../../../messages/common/en.json';
import commonEs from '../../../messages/common/es.json';
import commonPt from '../../../messages/common/pt-BR.json';
import en from '../../../messages/scale/en.json';
import es from '../../../messages/scale/es.json';
import pt from '../../../messages/scale/pt-BR.json';
import { NodeProvenance } from '../components/NodeProvenance';
import { placementFor, useCreativeAssetPlacement } from '../hooks/useCreativeAssetPlacement';
import { useCampaignStore } from '../stores/useCampaignStore';
import type { BaseCampaignNodeData, CampaignNodeProps, CreativeData } from '../types';
import { CreativeNode } from './CreativeNode';
import { OpenAiAdGroupNode } from './OpenAiAdGroupNode';
import { OpenAiCampaignNode } from './OpenAiCampaignNode';

let brandSpy: ReturnType<typeof spyOn<typeof brandContext, 'useActiveBrandContext'>>;
let fetchSpy: ReturnType<typeof spyOn<typeof activity, 'fetchAssetKinds'>> | undefined;
let savedStore: ReturnType<typeof useCampaignStore.getState>;
let queryClient: QueryClient;

beforeEach(() => {
  savedStore = useCampaignStore.getState();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  brandSpy = spyOn(brandContext, 'useActiveBrandContext').mockReturnValue({
    activeBrandId: 'brand-1',
    brandSummaries: [],
    permissions: [],
    isSwitching: false,
    switchingToBrandId: null,
    selectBrand: async (brandId) => ({ switched: false, prevBrandId: brandId }),
    updateBrandName: () => {},
    user: null,
  });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  brandSpy.mockRestore();
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
  useCampaignStore.setState(savedStore, true);
});

const props = <T extends 'creative' | 'openai-campaign' | 'openai-ad-group'>(
  type: T,
  data: CampaignNodeProps<T>['data'],
): CampaignNodeProps<T> => ({
  id: 'node-1',
  data,
  selected: false,
  type,
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: '',
});

async function expectOptionDescription(option: HTMLElement, description: string) {
  const info = option.querySelector('button')!;
  await act(async () => {
    fireEvent.pointerEnter(info, { pointerType: 'mouse' });
    fireEvent.mouseEnter(info);
    fireEvent.pointerMove(info, { pointerType: 'mouse' });
    fireEvent.mouseMove(info);
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
    description,
  );
}

const dropEvent = (brandId: string): DragEvent<HTMLElement> =>
  ({
    dataTransfer: {
      files: [],
      getData: (mime: string) =>
        mime === ASSET_DRAG_MIME ? JSON.stringify({ brandId, assetIds: ['asset-1'] }) : '',
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  }) as unknown as DragEvent<HTMLElement>;

for (const [locale, messages, common] of [
  ['en', en, commonEn],
  ['pt-BR', pt, commonPt],
  ['es', es, commonEs],
] as const) {
  const t = createTranslator({
    locale,
    namespace: 'scale',
    messages: { scale: messages },
    onError: (error) => {
      throw error;
    },
  });
  const wrap = (children: ReactNode) => (
    <NextIntlClientProvider
      locale={locale}
      timeZone="Pacific/Honolulu"
      messages={{ scale: messages, common }}
      onError={(error) => {
        throw error;
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ReactFlowProvider>{children}</ReactFlowProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  describe(`Campaign node presentation ${locale}`, () => {
    test('localizes approval/status labels and browser-local dates without changing records or names', () => {
      const statuses = {
        proposed: 'proposed_9b0c660',
        awaiting_approval: 'awaiting_approval_ae25c9b',
        approved: 'approved_87b42e4',
        denied: 'denied_da404de',
        expired: 'expired_424a255',
        consumed: 'approval_used_7e440fe',
      } as const;
      for (const [status, key] of Object.entries(statuses)) {
        const data: BaseCampaignNodeData = {
          label: 'Awaiting approval',
          metaId: 'meta-123',
          provenance: {
            sourceId: 'source-1',
            pathKey: 'c0/a1',
            metaStatus: 'ACTIVE',
            gate: {
              gate: 'build',
              status: status as keyof typeof statuses,
              approvedBy: 'Awaiting approval',
              approvedAt: '2026-01-01T00:45:00Z',
            },
          },
        };
        const before = structuredClone(data);
        const view = render(wrap(<NodeProvenance data={data} />));
        expect(view.getByTestId('canvas-node-gate').textContent).toBe(t(key));
        expect(view.getByTestId('canvas-node-meta-status').textContent).toBe(t('entityActive'));
        expect(view.getByTestId('canvas-node-approver').textContent).toContain('Awaiting approval');
        expect(view.getByTestId('canvas-node-approver').textContent).toContain(
          new Date('2026-01-01T00:45:00Z').toLocaleString(locale, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
        );
        expect(view.getByTestId('canvas-node-meta-id').textContent).toContain('meta-123');
        expect(data).toEqual(before);
        view.unmount();
      }
    });

    test('localizes carousel plural captions and keeps authored creative/card text intact', () => {
      for (const count of [0, 1, 2]) {
        const data: CreativeData = {
          label: 'Carousel',
          assetType: 'carousel',
          cards: Array.from({ length: count }, (_, index) => ({
            mediaId: `asset-${index}`,
            kind: 'image',
            thumbnailUrl: 'https://example.com/image.png',
            headline: 'Image',
          })),
        };
        const before = structuredClone(data);
        const view = render(wrap(<CreativeNode {...props('creative', data)} />));
        expect(view.getByTestId('canvas-creative-format').textContent).toBe(
          t('canvasCarouselCardCount', { count }),
        );
        expect(view.getByText('Carousel').textContent).toBe('Carousel');
        if (count) expect(view.getAllByAltText('Image')).toHaveLength(count);
        expect(data).toEqual(before);
        view.unmount();
      }
    });

    test('localizes creative format options and changes only the stable format ID', async () => {
      const data: CreativeData = { label: 'Image', assetType: 'image' };
      useCampaignStore.setState({
        nodes: [{ id: 'node-1', type: 'creative', position: { x: 0, y: 0 }, data }],
        edges: [],
      });
      const view = render(wrap(<CreativeNode {...props('creative', data)} />));
      fireEvent.contextMenu(view.container.querySelector('[data-slot="context-menu-trigger"]')!, {
        button: 2,
        clientX: 10,
        clientY: 10,
      });
      await waitFor(() =>
        expect(document.querySelector('[data-slot="context-menu-sub-trigger"]')).not.toBeNull(),
      );
      fireEvent.click(document.querySelector('[data-slot="context-menu-sub-trigger"]')!);
      const video = await view.findByRole('menuitemcheckbox', { name: t('video_d534be8') });
      expect(
        view
          .getByRole('menuitemcheckbox', { name: t('image_1aa4cb0') })
          .getAttribute('aria-checked'),
      ).toBe('true');
      expect(view.getByRole('menuitemcheckbox', { name: t('carousel_37219fb') })).toBeTruthy();
      await expectOptionDescription(video, t('one_video_its_ad_runs_as_a_single_video_ad_752fc30'));
      fireEvent.click(video);
      expect(useCampaignStore.getState().nodes[0].data).toMatchObject({
        label: 'Image',
        assetType: 'video',
      });
    });

    test('keeps localized campaign bidding selections on their original store IDs', async () => {
      const data = {
        label: 'Clicks (CPC)',
        biddingType: 'impressions' as const,
        lifetimeSpendLimitMicros: 60_123_456,
        currencyCode: 'BRL',
      };
      useCampaignStore.setState({
        nodes: [{ id: 'node-1', type: 'openai-campaign', position: { x: 0, y: 0 }, data }],
        edges: [],
      });
      const view = render(wrap(<OpenAiCampaignNode {...props('openai-campaign', data)} />));
      expect(view.getByText('Clicks (CPC)').textContent).toBe('Clicks (CPC)');
      expect(view.container.textContent).toContain(
        new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(60.123456),
      );
      const trigger = view.container.querySelector('[data-slot="context-menu-trigger"]');
      expect(trigger).not.toBeNull();
      fireEvent.contextMenu(trigger!, { button: 2, clientX: 10, clientY: 10 });
      await waitFor(() =>
        expect(document.querySelector('[data-slot="context-menu-sub-trigger"]')).not.toBeNull(),
      );
      fireEvent.click(document.querySelector('[data-slot="context-menu-sub-trigger"]')!);
      const option = await view.findByRole('menuitemcheckbox', {
        name: t('conversions_ocpc_0ae021d'),
      });
      await expectOptionDescription(
        option,
        t('still_billed_per_click_but_delivery_optimizes_3a1fd7b'),
      );
      fireEvent.click(option);
      expect(useCampaignStore.getState().nodes[0].data).toEqual({
        ...data,
        biddingType: 'conversions',
      });
    });

    test('keeps localized billing event selections on their original store IDs', async () => {
      const data = {
        label: 'Click',
        billingEventType: 'impression' as const,
        validationStatus: 'valid' as const,
        validationErrors: [],
        maxBidMicros: 60_123_456,
        currencyCode: 'USD',
      };
      useCampaignStore.setState({
        nodes: [{ id: 'node-1', type: 'openai-ad-group', position: { x: 0, y: 0 }, data }],
        edges: [],
      });
      const view = render(wrap(<OpenAiAdGroupNode {...props('openai-ad-group', data)} />));
      expect(view.getByText('Click').textContent).toBe('Click');
      fireEvent.contextMenu(view.container.querySelector('[data-slot="context-menu-trigger"]')!, {
        button: 2,
        clientX: 10,
        clientY: 10,
      });
      await waitFor(() =>
        expect(document.querySelector('[data-slot="context-menu-sub-trigger"]')).not.toBeNull(),
      );
      fireEvent.click(document.querySelector('[data-slot="context-menu-sub-trigger"]')!);
      const click = await view.findByRole('menuitemcheckbox', { name: t('canvasBillingClick') });
      await expectOptionDescription(
        click,
        t('for_click_and_conversion_campaigns_under_conv_4f99b6e'),
      );
      fireEvent.click(click);
      expect(useCampaignStore.getState().nodes[0].data).toEqual({
        ...data,
        billingEventType: 'click',
      });
    });

    test('localizes capped placement guidance and preserves asset order and source inputs', () => {
      const current: CreativeData = {
        label: 'Carousel',
        assetType: 'carousel',
        cards: Array.from({ length: 9 }, (_, index) => ({
          mediaId: `old-${index}`,
          kind: 'image',
        })),
      };
      const assets = [
        { id: 'first', kind: 'image' as const },
        { id: 'second', kind: 'video' as const },
      ];
      const before = structuredClone({ current, assets });
      const placement = placementFor(current, assets, t);
      expect(placement.notice).toBe(t('canvasCarouselLimit', { limit: 10, count: 1 }));
      expect(placement.patch?.cards?.map((card) => card.mediaId)).toEqual([
        ...current.cards!.map((card) => card.mediaId),
        'first',
      ]);
      expect({ current, assets }).toEqual(before);
    });

    test('refuses cross-brand drops with localized guidance and no backend/store mutation', async () => {
      fetchSpy = spyOn(activity, 'fetchAssetKinds').mockResolvedValue({ 'asset-1': 'image' });
      const originalNodes = useCampaignStore.getState().nodes;
      const { result } = renderHook(() => useCreativeAssetPlacement('node-1'), {
        wrapper: ({ children }) => wrap(children),
      });
      await act(async () => result.current.dropHandlers.onDrop(dropEvent('other-brand')));
      expect(result.current.notice).toBe(t('canvasAssetOtherBrand'));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(useCampaignStore.getState().nodes).toBe(originalNodes);
    });

    test('retains failed asset diagnostics while showing safe localized feedback', async () => {
      const raw = new Error('provider private diagnostic: secret-account-123');
      fetchSpy = spyOn(activity, 'fetchAssetKinds').mockRejectedValue(raw);
      const originalNodes = useCampaignStore.getState().nodes;
      const { result } = renderHook(() => useCreativeAssetPlacement('node-1'), {
        wrapper: ({ children }) => wrap(children),
      });
      await act(async () => result.current.dropHandlers.onDrop(dropEvent('brand-1')));
      await waitFor(() => expect(result.current.lookupError).toBe(raw));
      expect(result.current.notice).toBeTruthy();
      expect(result.current.notice).not.toContain('provider private');
      expect(result.current.notice).not.toContain('secret-account');
      expect(fetchSpy).toHaveBeenCalledWith({ brandId: 'brand-1', assetIds: ['asset-1'] });
      expect(useCampaignStore.getState().nodes).toBe(originalNodes);
    });
  });
}
