'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useRecording } from '@/hooks/useRecording';
import {
  C2S_EVENTS,
  S2C_EVENTS,
  SessionUpdatedPayload,
  TranscriptPartialPayload,
  TranscriptFinalPayload,
} from '@repo/types';

export default function RoomPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [sessionState, setSessionState] = useState<SessionUpdatedPayload | null>(null);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscripts, setFinalTranscripts] = useState<string[]>([]);

  const { isConnected, lastMessage, emitEvent } = useWebSocket();

  const handleAudioChunk = (chunk: Blob) => {
    // The useRecording hook gives us a Blob. We need to convert it to ArrayBuffer
    // to send over WebSocket, as defined in our shared types.
    chunk.arrayBuffer().then((arrayBuffer) => {
      emitEvent(C2S_EVENTS.AUDIO_CHUNK, { chunk: arrayBuffer });
    });
  };

  const { isRecording } = useRecording({
    onAudioChunk: handleAudioChunk,
    onRecordingStart: () => emitEvent(C2S_EVENTS.AUDIO_START, { sessionId }),
    onRecordingStop: () => emitEvent(C2S_EVENTS.AUDIO_STOP, {}),
  });

  useEffect(() => {
    if (isConnected && sessionId) {
      emitEvent(C2S_EVENTS.SESSION_JOIN, { sessionId });
    }
  }, [isConnected, sessionId, emitEvent]);

  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case S2C_EVENTS.SESSION_UPDATED:
        setSessionState(lastMessage.payload as SessionUpdatedPayload);
        break;
      case S2C_EVENTS.TRANSCRIPT_PARTIAL:
        setPartialTranscript((lastMessage.payload as TranscriptPartialPayload).text);
        break;
      case S2C_EVENTS.TRANSCRIPT_FINAL:
        const finalPayload = lastMessage.payload as TranscriptFinalPayload;
        setFinalTranscripts((prev) => [...prev, finalPayload.text]);
        setPartialTranscript(''); // Clear partial transcript
        break;
      default:
        break;
    }
  }, [lastMessage]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-12 bg-gray-900 text-white">
      <div className="w-full text-center">
        <h1 className="text-2xl font-bold">Debate Room: {sessionId}</h1>
        <div className="mt-2 text-lg">
          <p>Status: <span className="font-semibold text-yellow-400">{sessionState?.state || 'Connecting...'}</span></p>
          <p>Speaker: <span className="font-semibold text-green-400">{sessionState?.speaker || 'N/A'}</span></p>
          <p>Time Left: <span className="font-semibold">{sessionState?.remainingTime ?? 'N/A'}s</span></p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-grow w-full">
        <div className="w-full max-w-4xl p-4 text-center">
          {finalTranscripts.map((text, index) => (
            <p key={index} className="text-3xl text-gray-400 mb-4">{text}</p>
          ))}
          {partialTranscript && (
            <p className="text-5xl font-bold text-white">{partialTranscript}</p>
          )}
        </div>
      </div>

      <div className="w-full text-center">
        <div className={`p-4 rounded-lg transition-colors ${isRecording ? 'bg-red-600' : 'bg-gray-700'}`}>
          <p className="text-xl font-semibold">
            {isRecording ? 'Recording...' : 'Hold [SPACE] to Speak'}
          </p>
        </div>
      </div>
    </main>
  );
}
