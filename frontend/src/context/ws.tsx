import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getToken, wsUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";

type WSEvent = { type: string; [k: string]: unknown };
type Listener = (event: WSEvent) => void;

type WSState = {
  connected: boolean;
  subscribe: (fn: Listener) => () => void;
};

const WSContext = createContext<WSState | undefined>(undefined);

export function WSProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    if (!user) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    const connect = async () => {
      if (stoppedRef.current) return;
      const token = await getToken();
      if (!token) return;
      try {
        //const socket = new WebSocket(wsUrl(token));
        
        const url = wsUrl(token);
        console.log("WS URL:", url);
        const socket = new WebSocket(url);

        wsRef.current = socket;
        socket.onopen = () => {
          console.log("🟢 WebSocket Connected");
          setConnected(true);
        };
        socket.onclose = (e) => {
          console.log("🔴 WebSocket Closed", e.code, e.reason);
          setConnected(false);

          if (!stoppedRef.current) {
              reconnectRef.current = setTimeout(connect, 3000);
          }
        };
        socket.onerror = () => {
          // let onclose handle reconnect
        };
        socket.onmessage = (ev) => {
          console.log("📩 WS EVENT", ev.data);

          try {
              const parsed = JSON.parse(ev.data);
              listenersRef.current.forEach((l) => l(parsed));
          } catch (err) {
              console.log(err);
          }
      };
      } catch {
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user]);

  const value = useMemo<WSState>(() => ({
    connected,
    subscribe: (fn) => {
      listenersRef.current.add(fn);
      return () => {
        listenersRef.current.delete(fn);
      };
    },
  }), [connected]);

  return <WSContext.Provider value={value}>{children}</WSContext.Provider>;
}

export function useWS(): WSState {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used within WSProvider");
  return ctx;
}
