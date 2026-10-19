'use client';

// Speak-your-change: the browser's own Web Speech recognizer, no dependency and no audio
// leaving through our servers. Firefox has none, so the button renders nothing there.

import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function speechRecognition(): RecognitionConstructor | undefined {
  const speech = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
}

const subscribeNever = () => () => {};

export function DictationButton({
  onTranscript,
  disabled,
  className,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const supported = useSyncExternalStore(
    subscribeNever,
    () => Boolean(speechRecognition()),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const deliver = useRef(onTranscript);
  deliver.current = onTranscript;

  useEffect(() => () => recognition.current?.abort(), []);

  if (!supported) return null;

  const toggle = () => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const Recognizer = speechRecognition();
    if (!Recognizer) return;
    const recognizer = new Recognizer();
    recognizer.lang = navigator.language || 'en-US';
    recognizer.interimResults = false;
    recognizer.continuous = false;
    recognizer.onresult = (event) => {
      const spoken = Array.from(
        { length: event.results.length - event.resultIndex },
        (_, index) => event.results[event.resultIndex + index],
      )
        .filter((result) => result?.isFinal)
        .map((result) => result?.[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (spoken) deliver.current(spoken);
    };
    recognizer.onerror = (event) =>
      setProblem(event.error === 'not-allowed' ? 'Microphone access was refused.' : event.error);
    recognizer.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = recognizer;
    setProblem(null);
    setListening(true);
    recognizer.start();
  };

  return (
    <Button
      type="button"
      size="icon"
      variant={listening ? 'default' : 'ghost'}
      disabled={disabled}
      aria-label={listening ? 'Stop dictation' : 'Dictate'}
      aria-pressed={listening}
      title={problem ?? (listening ? 'Listening… click to stop' : 'Speak your change')}
      className={cn('size-7 shrink-0', listening && 'animate-pulse', className)}
      onClick={toggle}
    >
      {listening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
    </Button>
  );
}

/** A dictated phrase appended to what is already typed. */
export const appendDictation = (current: string, spoken: string): string =>
  current.trim() ? `${current.trimEnd()} ${spoken}` : spoken;
