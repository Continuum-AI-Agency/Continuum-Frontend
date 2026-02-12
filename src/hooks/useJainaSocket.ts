"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWsUrl } from "@/lib/api/ws";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import {
  createInitialJainaStreamState,
  reduceJainaStreamEvent,
  parseJainaStreamEvent,
  type JainaStreamState,
} from "@/lib/jaina/stream";

export type JainaSocketStatus = "connecting" | "connected" | "disconnected" | "error";

export function useJainaSocket(
  brandId: string, 
  adAccountId: string | null,
  options: { disabled?: boolean } = {}
) {
  const [state, setState] = useState<JainaStreamState>(() =>
    createInitialJainaStreamState()
  );
  const [socketStatus, setSocketStatus] = useState<JainaSocketStatus>(
    "disconnected"
  );
  
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(async () => {
    if (options.disabled) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) return;
    
    setSocketStatus("connecting");
    
    try {
      const token = await getBrowserAccessToken();
      const url = getWsUrl(`/api/agents/jaina/chat/socket?brand_id=${brandId}&token=${token}`);
      
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        setSocketStatus("connected");
      };

      ws.onmessage = (event) => {
        const parsed = parseJainaStreamEvent(event.data);
        if (parsed) {
          setState((prev) => reduceJainaStreamEvent(prev, parsed));
        }
      };

      ws.onclose = () => {
        setSocketStatus("disconnected");
        if (!options.disabled) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        setSocketStatus("error");
      };
    } catch (err) {
      setSocketStatus("error");
    }
  }, [brandId, options.disabled]);

  useEffect(() => {
    if (options.disabled) {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      setSocketStatus("disconnected");
      return;
    }

    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
    };
  }, [connect, options.disabled]);

  useEffect(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN && adAccountId) {
      socketRef.current.send(JSON.stringify({ 
        type: "context.sync", 
        data: { adAccountId } 
      }));
    }
  }, [adAccountId, socketStatus]);

  const sendPrompt = useCallback((query: string, metadata: any = {}) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    
    socketRef.current.send(JSON.stringify({
      type: "prompt",
      data: { query, ...metadata }
    }));
    
    return true;
  }, []);

  const sendFeedback = useCallback((payload: { text: string; planId?: string }) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;

    socketRef.current.send(JSON.stringify({
      type: "feedback",
      data: { text: payload.text, planId: payload.planId }
    }));

    return true;
  }, []);

  const reset = useCallback(() => {
    setState(createInitialJainaStreamState());
  }, []);

  return {
    state,
    socketStatus,
    sendPrompt,
    sendFeedback,
    reset,
    reconnect: connect
  };
}
