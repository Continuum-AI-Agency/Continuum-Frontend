'use client';

// One page of a document, drawn at the container's width: an image as itself, a PDF page
// through pdf.js (loaded only when a PDF is opened, never in the main bundle). It reports
// nothing back — region boxes are fractions of the page, so they sit on it at any size.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const PDF_RENDER_WIDTH = 1400;

let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  pdfjs ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return lib;
  });
  return pdfjs;
}

function usePdf(fileUrl: string, enabled: boolean) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Destroying the loading task aborts a fetch still in flight and frees a loaded document.
    let task: { destroy: () => Promise<void> } | null = null;
    void loadPdfjs()
      .then((lib) => {
        if (cancelled) return null;
        const loading = lib.getDocument({ url: fileUrl });
        task = loading;
        return loading.promise;
      })
      .then((doc) => {
        if (doc && !cancelled) setPdf(doc);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileUrl, enabled]);
  return { pdf, failed };
}

export function DocumentPage({
  fileUrl,
  mimeType,
  page,
  alt,
  className,
}: {
  fileUrl: string;
  mimeType: string;
  page: number;
  alt: string;
  className?: string;
}) {
  const isPdf = mimeType === 'application/pdf';
  const { pdf, failed } = usePdf(fileUrl, isPdf);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let task: { cancel: () => void } | null = null;
    void pdf.getPage(page).then((pdfPage) => {
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: PDF_RENDER_WIDTH / base.width });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setAspect(viewport.width / viewport.height);
      const render = pdfPage.render({ canvas, viewport });
      task = render;
      render.promise.catch(() => undefined);
    });
    return () => task?.cancel();
  }, [pdf, page]);

  if (!isPdf) {
    // biome-ignore lint/performance/noImgElement: a signed storage URL, drawn at its own size under the overlay
    return <img src={fileUrl} alt={alt} className={cn('block h-auto w-full', className)} />;
  }
  return (
    <div
      className={cn('relative w-full bg-white', className)}
      style={{ aspectRatio: aspect ?? 1 / Math.SQRT2 }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        className={cn('block size-full', failed && 'hidden')}
      />
    </div>
  );
}
