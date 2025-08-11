import { useState, useEffect, useCallback, useRef } from 'react';

interface UseRecordingProps {
  onAudioChunk: (chunk: Blob) => void;
  onRecordingStart: () => void;
  onRecordingStop: () => void;
}

export const useRecording = ({
  onAudioChunk,
  onRecordingStart,
  onRecordingStop,
}: UseRecordingProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // NOTE: For a true PCM16LE stream as requested, an AudioWorklet would be needed.
      // This is a complex setup. For this MVP, we use MediaRecorder which typically
      // records in WebM or Ogg format with the Opus or Vorbis codec.
      // The backend will need to handle this format.
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          onAudioChunk(event.data);
        }
      });

      recorder.start(500); // Collect chunks every 500ms
      setIsRecording(true);
      onRecordingStart();
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Microphone access was denied. Please allow microphone access in your browser settings.');
    }
  }, [isRecording, onAudioChunk, onRecordingStart]);

  const stopRecording = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return;

    mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    setIsRecording(false);
    mediaRecorderRef.current = null;
    streamRef.current = null;
    onRecordingStop();
  }, [isRecording, onRecordingStop]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isRecording) {
        event.preventDefault();
        startRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && isRecording) {
        event.preventDefault();
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      // Ensure recording is stopped if component unmounts
      if (mediaRecorderRef.current?.state === 'recording') {
        stopRecording();
      }
    };
  }, [isRecording, startRecording, stopRecording]);

  return { isRecording };
};
