import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { MediaComment } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { buildCommentThreads } from '@/lib/library/comments';
import { CommentThreads } from './CommentThreads';
import { partitionThreadsByVersion } from './commentVersions';
import { buildStageAnnotations } from './stageAnnotations';

afterEach(cleanup);

const V1 = 'version-1';
const V2 = 'version-2';

function comment(overrides: Partial<MediaComment> & { id: string }): MediaComment {
  return {
    brandId: 'brand-1',
    assetId: 'asset-1',
    versionId: null,
    parentCommentId: null,
    body: 'body',
    annotation: null,
    resolvedAt: null,
    resolvedBy: null,
    createdBy: 'user-1',
    authorName: 'Jane Doe',
    authorEmail: 'jane@example.com',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const ON_V1 = comment({
  id: 'c-v1',
  versionId: V1,
  body: 'Logo is cropped',
  annotation: { kind: 'box', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
});
const ON_V2 = comment({
  id: 'c-v2',
  versionId: V2,
  body: 'Much better',
  annotation: { kind: 'box', x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
  createdAt: '2026-07-05T00:00:00.000Z',
});

// Renders the sidebar exactly as the modal wires it: partition first, then pins
// built from the viewed version's open threads only.
function renderSidebar(viewedVersionId: string, onViewVersion = mock(() => {})) {
  const partition = partitionThreadsByVersion({
    threads: buildCommentThreads([ON_V1, ON_V2]),
    viewedVersionId,
    headVersionId: V2,
  });
  const { pinLabels } = buildStageAnnotations({
    openThreads: partition.current.open,
    selectedCommentId: null,
  });

  const result = render(
    <CommentThreads
      threads={partition.current}
      pinLabels={pinLabels}
      otherVersionThreads={partition.otherVersions}
      otherVersionCommentCount={partition.otherVersionCommentCount}
      versionLabels={
        new Map([
          [V1, 'v1'],
          [V2, 'v2'],
        ])
      }
      viewingHead={viewedVersionId === V2}
      onViewVersion={onViewVersion}
      selectedId={null}
      onSelectThread={() => {}}
      currentUserId="user-1"
      pendingIds={new Set()}
      posting={false}
      loading={false}
      onReply={() => {}}
      onResolve={() => {}}
      onDelete={() => {}}
    />,
  );
  return { ...result, onViewVersion };
}

describe('CommentThreads — comments from another version', () => {
  it('holds an earlier version’s comment behind a collapsed expander', () => {
    const { container, getByText, queryByText } = renderSidebar(V2);

    expect(getByText('Much better')).toBeTruthy();
    // Collapsed: the v1 note is summarized, not listed.
    expect(queryByText('Logo is cropped')).toBeNull();
    expect(container.textContent).toContain('1 comment on earlier versions');
  });

  it('reveals the earlier thread with a version chip and no pin label', () => {
    const { getByText, container } = renderSidebar(V2);

    fireEvent.click(getByText('1 comment on earlier versions'));

    expect(getByText('Logo is cropped')).toBeTruthy();
    // The v2 note holds pin 1; the v1 note holds no pin at all, because its box
    // addresses a crop that is not on the stage.
    expect(container.textContent).toContain('v1');
    const pinLabels = Array.from(container.querySelectorAll('.text-primary')).map(
      (node) => node.textContent,
    );
    expect(pinLabels).toEqual(['1']);
  });

  it('offers a way to go look at the version the comment was written on', () => {
    const { getByText, onViewVersion } = renderSidebar(V2);

    fireEvent.click(getByText('1 comment on earlier versions'));
    fireEvent.click(getByText('View v1'));

    expect(onViewVersion).toHaveBeenCalledWith(V1);
  });

  it('says “other versions” when the stage is not on the head', () => {
    const { container, getByText } = renderSidebar(V1);

    // Viewing v1: the v2 note is not "earlier", so the copy must not claim it is.
    expect(getByText('Logo is cropped')).toBeTruthy();
    expect(container.textContent).toContain('1 comment on other versions');
    expect(container.textContent).not.toContain('on earlier versions');
  });

  it('tells the truth when a version has no comments of its own', () => {
    const partition = partitionThreadsByVersion({
      threads: buildCommentThreads([ON_V1]),
      viewedVersionId: V2,
      headVersionId: V2,
    });
    const { container } = render(
      <CommentThreads
        threads={partition.current}
        pinLabels={new Map()}
        otherVersionThreads={partition.otherVersions}
        otherVersionCommentCount={partition.otherVersionCommentCount}
        versionLabels={new Map([[V1, 'v1']])}
        viewingHead
        onViewVersion={() => {}}
        selectedId={null}
        onSelectThread={() => {}}
        currentUserId="user-1"
        pendingIds={new Set()}
        posting={false}
        loading={false}
        onReply={() => {}}
        onResolve={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(container.textContent).toContain('No comments on this version yet.');
    // "No comments yet" would be a lie — there is a conversation, on v1.
    expect(container.textContent).toContain('1 comment on earlier versions');
  });
});
