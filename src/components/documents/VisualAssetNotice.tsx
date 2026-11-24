'use client';

// Logos, fonts and reference images dropped on Knowledge are held here instead of uploaded.
// Knowledge only reads a file's words: an image becomes OCR text, and a font or an SVG is
// refused by ingest, so none of them would ever reach generation. The person chooses: send
// them to the Library (fonts through the font review, images as Library media), or keep a
// raster image in Knowledge for its text. Fonts and SVGs never go to Knowledge.

import { ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FontUploadReviewDialog } from '@/components/library/FontUploadReviewDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { mayKeepInKnowledge, visualAssetKind } from '@/lib/documents/visualAssets';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

type Props = {
  brandId: string;
  files: File[];
  /** Raster images the person chose to keep in Knowledge, to upload as documents. */
  onKeepInKnowledge: (files: File[]) => void;
  /** Files that are dealt with (sent, kept or failed), to drop from the notice. */
  onSettled: (files: File[]) => void;
  /** The Library upload, injectable for tests. */
  uploadToLibrary?: (file: File, brandId: string) => Promise<unknown>;
};

export function VisualAssetNotice({
  brandId,
  files,
  onKeepInKnowledge,
  onSettled,
  uploadToLibrary = (file, id) => uploadMediaAsset({ file, brandId: id }),
}: Props) {
  const uiText = useTranslations('common');
  const [fontFiles, setFontFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  if (files.length === 0 && fontFiles.length === 0) return null;

  const keepable = files.filter(mayKeepInKnowledge);

  const sendToLibrary = async () => {
    const fonts = files.filter((file) => visualAssetKind(file) === 'font');
    const images = files.filter((file) => visualAssetKind(file) !== 'font');
    setSending(true);
    const results = await Promise.allSettled(images.map((file) => uploadToLibrary(file, brandId)));
    setSending(false);
    setFailed(
      images.filter((_, index) => results[index]?.status === 'rejected').map((f) => f.name),
    );
    setFontFiles(fonts);
    onSettled(files);
  };

  return (
    <>
      {files.length > 0 ? (
        <Alert data-testid="visual-asset-notice">
          <ImageIcon />
          <AlertTitle>{uiText('visualAssetNoticeTitle', { count: files.length })}</AlertTitle>
          <AlertDescription>
            <p>{uiText('visualAssetNoticeBody')}</p>
            <ul className="mt-1 list-disc pl-4">
              {files.map((file) => (
                <li key={`${file.name}:${file.size}`}>{file.name}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={sending} onClick={() => void sendToLibrary()}>
                {uiText('visualAssetSendToLibrary')}
              </Button>
              {keepable.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending}
                  onClick={() => {
                    onKeepInKnowledge(keepable);
                    onSettled(keepable);
                  }}
                >
                  {uiText('visualAssetKeepInKnowledge', { count: keepable.length })}
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {failed.length > 0 ? (
        <Alert variant="destructive" data-testid="visual-asset-failed">
          <AlertDescription>
            {uiText('visualAssetSendFailed', { files: failed.join(', ') })}
          </AlertDescription>
        </Alert>
      ) : null}
      {fontFiles.length > 0 ? (
        <FontUploadReviewDialog
          brandId={brandId}
          files={fontFiles}
          onClose={() => setFontFiles([])}
          onUploaded={() => setFontFiles([])}
        />
      ) : null}
    </>
  );
}
