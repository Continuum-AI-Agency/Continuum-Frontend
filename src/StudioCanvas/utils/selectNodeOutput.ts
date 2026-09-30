import { renderOutputForHandle } from '@continuum/contracts';
import type { NodeOutput } from '../types/execution';

/** A scalar wire selects one exact render, never the cover of a batch. */
export function selectNodeOutput(
  output: NodeOutput | undefined,
  handle?: string | null,
): NodeOutput | undefined {
  if (output?.type !== 'render') return output;
  if (handle === 'collection') {
    const kinds = new Set(output.outputs.map((item) => item.kind));
    if (kinds.size !== 1 || output.outputs.some((item) => !item.assetId || !item.versionId))
      return undefined;
    const itemType = output.outputs[0]?.kind;
    if (!itemType) return undefined;
    return {
      type: 'collection',
      itemType,
      items: output.outputs.map((item) =>
        item.kind === 'image'
          ? {
              type: 'image',
              url: item.url,
              mimeType: item.mimeType,
              assetId: item.assetId!,
              assetVersionId: item.versionId!,
            }
          : {
              type: 'video',
              url: item.url,
              mimeType: item.mimeType,
              assetId: item.assetId!,
              assetVersionId: item.versionId!,
            },
      ),
    };
  }
  const selected = renderOutputForHandle(
    {
      id: 'output',
      type: 'apiRender',
      data: {
        renderOutputs: output.outputs.map((item) => ({
          jobId: 'run',
          outputId: item.id,
          kind: item.kind,
          fileName: item.fileName,
          assetId: item.assetId,
          versionId: item.versionId,
        })),
      },
    },
    handle,
  );
  const item =
    selected &&
    output.outputs.find(
      (value) =>
        value.id === selected.outputId &&
        value.assetId === selected.assetId &&
        value.versionId === selected.versionId,
    );
  if (!item) return undefined;
  const pin = { assetId: selected.assetId, assetVersionId: selected.versionId };
  return item.kind === 'image'
    ? { type: 'image', url: item.url, mimeType: item.mimeType, ...pin }
    : { type: 'video', url: item.url, mimeType: item.mimeType, ...pin };
}
