'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecordingSource = 'screen' | 'camera' | 'mic';
export type RecorderState = 'idle' | 'starting' | 'recording';

const VIDEO_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];
const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

const FILE_LABELS: Record<RecordingSource, string> = {
  screen: 'Screen recording',
  camera: 'Camera recording',
  mic: 'Voice-over',
};

export function isRecordingSupported(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices;
}

function openStream(source: RecordingSource): Promise<MediaStream> {
  if (source === 'screen') {
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  }
  return navigator.mediaDevices.getUserMedia({ video: source === 'camera', audio: true });
}

export function recordingFileName(source: RecordingSource, baseMime: string, at: Date): string {
  const extension = baseMime === 'audio/mp4' ? 'm4a' : baseMime.endsWith('/mp4') ? 'mp4' : 'webm';
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  return `${FILE_LABELS[source]} ${date} ${time}.${extension}`;
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** `start` rejects when the browser refuses the device (NotAllowedError = denied or cancelled). */
export function useMediaRecorder(onRecorded: (file: File) => void | Promise<void>) {
  const [state, setState] = useState<RecorderState>('idle');
  const [source, setSource] = useState<RecordingSource | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const unmountedRef = useRef(false);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }, []);

  const start = useCallback(
    async (next: RecordingSource) => {
      if (recorderRef.current) return;
      setSource(next);
      setState('starting');
      let stream: MediaStream | null = null;
      try {
        stream = await openStream(next);
        // The picker can resolve after the editor closed; the capture indicator would stay on.
        if (unmountedRef.current) {
          stopTracks(stream);
          return;
        }
        const candidates = next === 'mic' ? AUDIO_MIME_TYPES : VIDEO_MIME_TYPES;
        const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        const startedAt = new Date();
        const liveStream = stream;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
          stopTracks(liveStream);
          streamRef.current = null;
          recorderRef.current = null;
          setState('idle');
          setSource(null);
          const fallback = next === 'mic' ? 'audio/webm' : 'video/webm';
          const type = (recorder.mimeType || mimeType || fallback).split(';')[0] ?? fallback;
          if (chunks.length === 0) return;
          void onRecordedRef.current(
            new File(chunks, recordingFileName(next, type, startedAt), { type }),
          );
        };
        // Ending the share from the browser's own bar ends the track, not the recorder.
        for (const track of stream.getTracks()) track.addEventListener('ended', stop);
        streamRef.current = stream;
        recorderRef.current = recorder;
        startedAtRef.current = startedAt.getTime();
        setElapsedSec(0);
        recorder.start(1000);
        setState('recording');
      } catch (cause) {
        stopTracks(stream);
        recorderRef.current = null;
        streamRef.current = null;
        setState('idle');
        setSource(null);
        throw cause;
      }
    },
    [stop],
  );

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    // Reset on (re)mount: StrictMode runs this cleanup once before the real mount.
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      // Closing the editor mid-take discards it: there is no timeline left to drop it on.
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      }
      stopTracks(streamRef.current);
    };
  }, []);

  return { state, source, elapsedSec, start, stop };
}
