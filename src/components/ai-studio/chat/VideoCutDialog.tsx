"use client";

import React from "react";
import { Button, Dialog, Flex, IconButton, Text, Slider } from "@radix-ui/themes";
import { CheckIcon, Cross2Icon, PlayIcon, PauseIcon } from "@radix-ui/react-icons";

type VideoCutDialogProps = {
  open: boolean;
  sourceBase64: string;
  sourceMime: string;
  initialStart?: number;
  initialEnd?: number;
  title?: string;
  onClose: () => void;
  onSave: (result: { startTime: number; endTime: number }) => void;
};

export function VideoCutDialog({
  open,
  sourceBase64,
  sourceMime,
  initialStart = 0,
  initialEnd,
  title,
  onClose,
  onSave,
}: VideoCutDialogProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = React.useState(0);
  const [range, setRange] = React.useState<[number, number]>([initialStart, initialEnd ?? 20]);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);

  React.useEffect(() => {
    if (open && initialEnd === undefined && duration > 0) {
      setRange([initialStart, Math.min(duration, initialStart + 20)]);
    }
  }, [open, duration, initialStart, initialEnd]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      if (initialEnd === undefined) {
        setRange([initialStart, Math.min(dur, initialStart + 20)]);
      } else {
        setRange([initialStart, initialEnd]);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.currentTime >= range[1]) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        if (videoRef.current.currentTime >= range[1] || videoRef.current.currentTime < range[0]) {
          videoRef.current.currentTime = range[0];
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleRangeChange = (newRange: number[]) => {
    const [start, end] = newRange as [number, number];
    setRange([start, end]);
    if (videoRef.current) {
      videoRef.current.currentTime = start;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Content className="w-[92vw]" style={{ maxWidth: 640 }}>
        <Flex justify="between" align="center" mb="4">
          <Dialog.Title>{title ?? "Cut Reference Video"}</Dialog.Title>
          <Dialog.Close>
            <IconButton variant="ghost" color="gray">
              <Cross2Icon />
            </IconButton>
          </Dialog.Close>
        </Flex>

        <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            src={`data:${sourceMime};base64,${sourceBase64}`}
            className="h-full w-full object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onClick={togglePlay}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center p-4 bg-gradient-to-t from-black/60 to-transparent">
             <IconButton size="3" variant="soft" color="white" onClick={togglePlay} className="rounded-full">
               {isPlaying ? <PauseIcon /> : <PlayIcon />}
             </IconButton>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Start: {range[0].toFixed(1)}s</span>
            <span>Duration: {(range[1] - range[0]).toFixed(1)}s</span>
            <span>End: {range[1].toFixed(1)}s</span>
          </div>
          
          <Slider
            min={0}
            max={duration || 100}
            step={0.1}
            value={[range[0], range[1]]}
            onValueChange={handleRangeChange}
          />
          
          <Text size="1" color="gray" align="center" className="block">
            Max reference duration is 20 seconds.
          </Text>
        </div>

        <Flex gap="3" mt="6" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button onClick={() => onSave({ startTime: range[0], endTime: range[1] })}>
            <CheckIcon /> Save Cut
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
