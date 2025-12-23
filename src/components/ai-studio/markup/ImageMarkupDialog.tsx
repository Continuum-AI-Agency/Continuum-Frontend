"use client";

import React from "react";
import { Button, Dialog, IconButton, Text } from "@radix-ui/themes";
import { CheckIcon, Cross2Icon, Pencil2Icon, ReloadIcon, TrashIcon } from "@radix-ui/react-icons";

import { useToast } from "@/components/ui/ToastProvider";
import { estimateBase64DecodedBytes, formatMiB } from "@/lib/ai-studio/referenceDrop";

type MarkupTool = "pen" | "eraser";

type MarkupSize = { label: "S" | "M" | "L"; value: number };

type PaletteColor = { name: string; value: string; className: string };

const MAX_CANVAS_DIM = 2048;
const MAX_HISTORY = 24;

const SIZE_OPTIONS: MarkupSize[] = [
  { label: "S", value: 4 },
  { label: "M", value: 8 },
  { label: "L", value: 14 },
];

const PALETTE: PaletteColor[] = [
  { name: "Black", value: "#0b0b0b", className: "bg-black" },
  { name: "White", value: "#ffffff", className: "bg-white" },
  { name: "Red", value: "#ef4444", className: "bg-red-500" },
  { name: "Amber", value: "#f59e0b", className: "bg-amber-400" },
  { name: "Green", value: "#22c55e", className: "bg-green-500" },
  { name: "Blue", value: "#3b82f6", className: "bg-blue-500" },
];

export type ImageMarkupDialogProps = {
  open: boolean;
  sourceBase64: string;
  sourceMime: string;
  title?: string;
  maxBytes?: number;
  onClose: () => void;
  onSave: (result: { base64: string; mime: "image/png" }) => void;
};

export function ImageMarkupDialog({
  open,
  sourceBase64,
  sourceMime,
  title,
  maxBytes,
  onClose,
  onSave,
}: ImageMarkupDialogProps) {
  const { show } = useToast();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const historyRef = React.useRef<ImageData[]>([]);

  const [tool, setTool] = React.useState<MarkupTool>("pen");
  const [color, setColor] = React.useState(PALETTE[0]?.value ?? "#0b0b0b");
  const [strokeSize, setStrokeSize] = React.useState(SIZE_OPTIONS[1]?.value ?? 8);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [isCanvasHover, setIsCanvasHover] = React.useState(false);
  const [history, setHistory] = React.useState<ImageData[]>([]);
  const [canvasDims, setCanvasDims] = React.useState({ width: 0, height: 0 });
  const [displayDims, setDisplayDims] = React.useState({ width: 0, height: 0 });

  const setHistoryState = React.useCallback((next: ImageData[]) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const resetCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const blank = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistoryState([blank]);
  }, [setHistoryState]);

  const pushHistory = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const next = historyRef.current.concat(snapshot).slice(-MAX_HISTORY);
    setHistoryState(next);
  }, [setHistoryState]);

  const setCanvasSnapshot = React.useCallback(
    (snapshot: ImageData) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.putImageData(snapshot, 0, 0);
    },
    []
  );

  const handleUndo = React.useCallback(() => {
    if (historyRef.current.length <= 1) {
      resetCanvas();
      return;
    }
    const next = historyRef.current.slice(0, -1);
    const last = next[next.length - 1];
    setHistoryState(next);
    if (last) {
      setCanvasSnapshot(last);
    }
  }, [resetCanvas, setCanvasSnapshot, setHistoryState]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      canvas.setPointerCapture(event.pointerId);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = strokeSize;
      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
    },
    [color, strokeSize, tool]
  );

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing]);

  const finishStroke = React.useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    pushHistory();
  }, [isDrawing, pushHistory]);

  const handlePointerLeave = React.useCallback(() => {
    setIsCanvasHover(false);
    finishStroke();
  }, [finishStroke]);

  const handleSave = React.useCallback(() => {
    if (!canvasRef.current || !imageRef.current) return;
    const canvas = canvasRef.current;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;
    exportCtx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
    exportCtx.drawImage(canvas, 0, 0);
    const dataUrl = exportCanvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1] ?? "";
    if (maxBytes) {
      const bytes = estimateBase64DecodedBytes(base64);
      if (bytes > maxBytes) {
        show({
          title: "Edited image too large",
          description: `${formatMiB(bytes)} (max ${formatMiB(maxBytes)})`,
          variant: "error",
        });
        return;
      }
    }
    onSave({ base64, mime: "image/png" });
  }, [maxBytes, onSave, show]);

  const updateDisplayDims = React.useCallback(
    (width: number, height: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        setDisplayDims({ width, height });
        return;
      }
      const maxWidth = viewport.clientWidth;
      const maxHeight = viewport.clientHeight;
      if (!maxWidth || !maxHeight) {
        setDisplayDims({ width, height });
        return;
      }
      const scale = Math.min(maxWidth / width, maxHeight / height);
      setDisplayDims({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      });
    },
    []
  );

  React.useEffect(() => {
    if (!open) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_CANVAS_DIM / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      imageRef.current = img;
      setCanvasDims({ width, height });
      requestAnimationFrame(() => {
        updateDisplayDims(width, height);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        resetCanvas();
      });
    };
    img.onerror = () => {
      show({ title: "Failed to load image", variant: "error" });
    };
    img.src = `data:${sourceMime};base64,${sourceBase64}`;
  }, [open, resetCanvas, show, sourceBase64, sourceMime, updateDisplayDims]);

  React.useEffect(() => {
    if (!open) {
      setIsDrawing(false);
      setHistoryState([]);
      setCanvasDims({ width: 0, height: 0 });
      setDisplayDims({ width: 0, height: 0 });
    }
  }, [open, setHistoryState]);

  React.useEffect(() => {
    if (!open || !canvasDims.width || !canvasDims.height) return;
    const onResize = () => updateDisplayDims(canvasDims.width, canvasDims.height);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [canvasDims.height, canvasDims.width, open, updateDisplayDims]);

  const canUndo = history.length > 1;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Content className="w-[92vw]" style={{ maxWidth: 960 }}>
        <div className="flex items-center justify-between">
          <div>
            <Dialog.Title>{title ?? "Markup image"}</Dialog.Title>
            <Dialog.Description size="2" color="gray">
              Draw on top of the image. Use pen, eraser, and undo.
            </Dialog.Description>
          </div>
          <Dialog.Close>
            <IconButton size="2" variant="ghost" aria-label="Close">
              <Cross2Icon />
            </IconButton>
          </Dialog.Close>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
              <Button
                size="1"
                variant={tool === "pen" ? "solid" : "outline"}
                onClick={() => setTool("pen")}
              >
                <Pencil2Icon /> Pen
              </Button>
              <Button
                size="1"
                variant={tool === "eraser" ? "solid" : "outline"}
                onClick={() => setTool("eraser")}
              >
                Eraser
              </Button>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
            {SIZE_OPTIONS.map((opt) => (
              <Button
                key={opt.label}
                size="1"
                variant={strokeSize === opt.value ? "solid" : "outline"}
                onClick={() => setStrokeSize(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
            {PALETTE.map((swatch) => {
              const isSelected = color === swatch.value;
              const isLight = swatch.value.toLowerCase() === "#ffffff";
              return (
                <button
                  key={swatch.name}
                  type="button"
                  onClick={() => {
                    setColor(swatch.value);
                    setTool("pen");
                  }}
                  aria-pressed={color === swatch.value}
                  title={swatch.name}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full border ${swatch.className} ${
                    isSelected ? "border-white ring-2 ring-white ring-offset-2 ring-offset-slate-950" : "border-white/30"
                  } transition hover:scale-[1.05] hover:ring-2 hover:ring-white/60 hover:ring-offset-2 hover:ring-offset-slate-950`}
                  aria-label={`Select ${swatch.name}`}
                >
                  {isSelected ? (
                    <CheckIcon className={isLight ? "text-black" : "text-white"} />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="1" variant="outline" onClick={handleUndo} disabled={!canUndo}>
              <ReloadIcon /> Undo
            </Button>
            <Button size="1" variant="outline" color="red" onClick={resetCanvas}>
              <TrashIcon /> Clear
            </Button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className="mt-4 max-h-[70vh] min-h-[320px] overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 p-3"
        >
          {canvasDims.width > 0 ? (
            <div
              className={`relative mx-auto rounded-lg ${isCanvasHover ? "ring-2 ring-[var(--accent-9)] ring-offset-2 ring-offset-slate-950" : ""}`}
              style={{ width: displayDims.width, height: displayDims.height }}
            >
              <img
                src={`data:${sourceMime};base64,${sourceBase64}`}
                alt="Markup source"
                width={canvasDims.width}
                height={canvasDims.height}
                draggable={false}
                className="block rounded-lg pointer-events-none select-none"
                style={{ width: displayDims.width, height: displayDims.height }}
              />
              {isCanvasHover && !isDrawing ? (
                <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white">
                  Click + drag to draw
                </div>
              ) : null}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 z-10 rounded-lg cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerEnter={() => setIsCanvasHover(true)}
                onPointerLeave={handlePointerLeave}
                onMouseEnter={() => setIsCanvasHover(true)}
                onMouseLeave={handlePointerLeave}
                style={{ touchAction: "none", width: displayDims.width, height: displayDims.height }}
              />
            </div>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center text-white/60">
              <Text size="2">Loading image...</Text>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button variant="solid" onClick={handleSave}>Save markup</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
