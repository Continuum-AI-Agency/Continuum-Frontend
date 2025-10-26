"use client";

import { useEffect, useRef } from "react";

import type {
  ContinuumEvent,
  ContinuumEventMap,
  ContinuumEventName,
} from "@/lib/events/schema";
import { CONTINUUM_EVENT_TYPES } from "@/lib/events/schema";

type ContinuumEventHandlers = {
  [K in ContinuumEventName]?: (event: ContinuumEvent<K>) => void;
};

type UseContinuumServerEventsOptions = {
  url?: string;
  withCredentials?: boolean;
  onOpen?: () => void;
  onError?: (event: Event) => void;
};

function parseEventPayload<K extends ContinuumEventName>(
  eventName: K,
  message: MessageEvent<string>
): ContinuumEvent<K> | null {
  try {
    const parsed = JSON.parse(message.data) as ContinuumEventMap[K] & {
      timestamp?: string;
    };

    const { timestamp, ...rest } = parsed;

    return {
      type: eventName,
      data: rest as ContinuumEventMap[K],
      timestamp: timestamp ?? new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Continuum SSE] Failed to parse payload for ${eventName}`, error);
    return null;
  }
}

export function useContinuumServerEvents(
  handlers: ContinuumEventHandlers,
  options?: UseContinuumServerEventsOptions
) {
  const handlersRef = useRef(handlers);
  const optionsRef = useRef(options);
  const url = options?.url ?? "/api/events";
  const withCredentials = options?.withCredentials ?? true;

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const eventSource = new EventSource(url, { withCredentials });

    const onConnected = () => {
      optionsRef.current?.onOpen?.();
    };

    const onError = (event: Event) => {
      optionsRef.current?.onError?.(event);
    };

    const onKeepAlive = () => undefined;

    eventSource.addEventListener("continuum.connected", onConnected);
    eventSource.addEventListener("continuum.keepalive", onKeepAlive);
    eventSource.onerror = onError;

    const listeners = CONTINUUM_EVENT_TYPES.map((eventName) => {
      const listener = (message: MessageEvent<string>) => {
        const handler = handlersRef.current[eventName];
        if (!handler) return;

        const payload = parseEventPayload(eventName, message);
        if (!payload) return;

        handler(payload);
      };

      eventSource.addEventListener(eventName, listener as EventListener);
      return { eventName, listener };
    });

    return () => {
      listeners.forEach(({ eventName, listener }) => {
        eventSource.removeEventListener(eventName, listener as EventListener);
      });
      eventSource.removeEventListener("continuum.connected", onConnected);
      eventSource.removeEventListener("continuum.keepalive", onKeepAlive);
      eventSource.close();
    };
  }, [url, withCredentials]);
}
