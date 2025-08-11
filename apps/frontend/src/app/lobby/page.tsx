'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { C2S_EVENTS, S2C_EVENTS, SessionCreatedPayload } from '@repo/types';

export default function LobbyPage() {
  const [theme, setTheme] = useState('');
  const [maxTurns, setMaxTurns] = useState(3);
  const router = useRouter();
  const { isConnected, lastMessage, emitEvent } = useWebSocket();

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme.trim()) {
      alert('Please enter a theme.');
      return;
    }
    if (isConnected) {
      emitEvent(C2S_EVENTS.SESSION_CREATE, { theme, maxTurns });
    } else {
      alert('Not connected to the server. Please wait.');
    }
  };

  useEffect(() => {
    if (lastMessage?.event === S2C_EVENTS.SESSION_CREATED) {
      const payload = lastMessage.payload as SessionCreatedPayload;
      router.push(`/room/${payload.sessionId}`);
    }
  }, [lastMessage, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center">Create a Debate Session</h1>
        <form onSubmit={handleCreateSession} className="space-y-6">
          <div>
            <label htmlFor="theme" className="block text-sm font-medium text-gray-300">
              Debate Theme
            </label>
            <input
              id="theme"
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g., Is pineapple on pizza good?"
              className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="turns" className="block text-sm font-medium text-gray-300">
              Number of Turns (per side)
            </label>
            <select
              id="turns"
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!isConnected}
            className="w-full px-4 py-2 font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
          >
            {isConnected ? 'Create Session' : 'Connecting...'}
          </button>
        </form>
      </div>
    </main>
  );
}
