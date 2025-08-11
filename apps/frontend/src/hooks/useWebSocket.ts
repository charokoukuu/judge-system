import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { S2C_EVENTS } from '@repo/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

export const useWebSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    if (socketRef.current) return;

    const socket = io(WS_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    // A generic listener for all events for debugging
    socket.onAny((event, ...args) => {
      console.log(`Received event: ${event}`, args);
      setLastMessage({ event, payload: args[0] });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const emitEvent = (eventName: string, payload: any) => {
    socketRef.current?.emit(eventName, payload);
  };

  return { isConnected, lastMessage, emitEvent };
};
