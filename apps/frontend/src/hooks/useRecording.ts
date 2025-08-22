import { useState, useEffect, useCallback, useRef } from "react";

interface UseRecordingProps {
  onAudioChunk: (chunk: Blob) => void;
  onRecordingStart: () => void;
  onRecordingStop: () => void;
  enableKeyboardShortcuts?: boolean; // キーボードショートカットを有効にするかどうか
}

export const useRecording = ({
  onAudioChunk,
  onRecordingStart,
  onRecordingStop,
  enableKeyboardShortcuts = false,
}: UseRecordingProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    console.log("startRecording called, current state:", isRecording);
    console.log(
      "mediaRecorderRef.current?.state:",
      mediaRecorderRef.current?.state
    );

    // 既に録音中、または MediaRecorder が recording 状態の場合は早期リターン
    if (
      isRecording ||
      (mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording")
    ) {
      console.log("Already recording, returning early");
      return;
    }

    try {
      console.log("Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log("Microphone access granted");

      // NOTE: For a true PCM16LE stream as requested, an AudioWorklet would be needed.
      // This is a complex setup. For this MVP, we use MediaRecorder which typically
      // records in WebM or Ogg format with the Opus or Vorbis codec.
      // The backend will need to handle this format.
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        console.log(
          "Audio data available:",
          event.data.size,
          "bytes",
          "type:",
          event.data.type
        );
        if (event.data.size > 0) {
          console.log("Calling onAudioChunk with data size:", event.data.size);
          onAudioChunk(event.data);
        } else {
          console.warn("Audio data available but size is 0");
        }
      });

      recorder.addEventListener("start", () => {
        console.log("MediaRecorder started");
        setIsRecording(true); // start イベントで状態を更新
      });

      recorder.addEventListener("stop", () => {
        console.log("MediaRecorder stopped");
        setIsRecording(false); // stop イベントで状態を更新
      });

      recorder.start(100); // Start recording with small chunks to ensure continuous data flow
      console.log("Recording start requested, calling onRecordingStart");
      console.log("MediaRecorder state after start():", recorder.state);
      console.log("MediaRecorder mimeType:", recorder.mimeType);
      onRecordingStart();
    } catch (err) {
      console.error("Error starting recording:", err);
      alert(
        "Microphone access was denied. Please allow microphone access in your browser settings."
      );
    }
  }, [onAudioChunk, onRecordingStart]); // isRecordingの依存を削除

  const stopRecording = useCallback(() => {
    console.log("stopRecording called, current state:", isRecording);
    console.log("mediaRecorderRef.current:", mediaRecorderRef.current);
    console.log(
      "mediaRecorderRef.current?.state:",
      mediaRecorderRef.current?.state
    );
    console.trace("stopRecording call stack"); // 呼び出し元をトレース

    // MediaRecorderの状態を基準に判定
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state !== "recording"
    ) {
      console.log(
        "Not recording or recorder not in recording state, returning early"
      );
      return;
    }

    console.log("Stopping MediaRecorder...");
    mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => {
      console.log("Stopping track:", track.kind);
      track.stop();
    });

    // MediaRecorderのstopイベントで状態が更新されるため、ここでは設定しない
    mediaRecorderRef.current = null;
    streamRef.current = null;
    console.log("Cleanup completed, calling onRecordingStop");
    onRecordingStop();
  }, [onRecordingStop]); // isRecordingの依存を削除

  useEffect(() => {
    // キーボードショートカットが無効の場合はキーイベントリスナーを追加しない
    if (!enableKeyboardShortcuts) {
      return; // クリーンアップ関数を返さない
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isRecording) {
        event.preventDefault();
        startRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && isRecording) {
        event.preventDefault();
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      // Ensure recording is stopped if component unmounts
      if (mediaRecorderRef.current?.state === "recording") {
        stopRecording();
      }
    };
  }, [isRecording, startRecording, stopRecording, enableKeyboardShortcuts]);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      // コンポーネントがアンマウントされる時に録音を停止
      if (mediaRecorderRef.current?.state === "recording") {
        console.log("Component unmounting, stopping recording");
        mediaRecorderRef.current.stop();
        streamRef.current?.getTracks().forEach((track) => track.stop());
      }
    };
  }, []); // 空の依存配列でマウント時に一度だけ設定

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
};
