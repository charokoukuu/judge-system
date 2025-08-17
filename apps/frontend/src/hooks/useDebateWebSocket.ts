import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  C2S_EVENTS,
  S2C_EVENTS,
  SessionCreatePayload,
  SessionJoinPayload,
  SessionCreatedPayload,
  SessionUpdatedPayload,
  ModeratorMessagePayload,
  TranscriptFinalPayload,
  ErrorPayload,
  DebateState,
  ParticipantRole,
} from "@repo/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3010";

export interface DebateSession {
  sessionId: string;
  theme: string;
  state: string;
  currentTurn: number;
  participantCount: number;
  role?: "moderator" | "participant";
  side?: "RIGHT" | "LEFT";
}

export interface Message {
  id: string;
  text: string;
  timestamp: Date;
  type: "system" | "moderator" | "transcript";
  side?: "RIGHT" | "LEFT";
}

export const useDebateWebSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [session, setSession] = useState<DebateSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // カウントダウン状態
  const [countdownEvent, setCountdownEvent] = useState<{
    duration: number;
    timestamp: number;
  } | null>(null);

  // 録音停止イベント
  const [recordingStopEvent, setRecordingStopEvent] = useState<{
    reason: "time_up" | "turn_ended" | "manual";
    timestamp: number;
  } | null>(null);

  // ターン評価結果
  const [turnResults, setTurnResults] = useState<{
    [turnIndex: number]: number; // -1.0 to 1.0 のスコア
  }>({});

  // 音声再生キュー
  const audioQueueRef = useRef<
    Array<{
      sessionId: string;
      text: string;
      audioData?: string;
      audioType?: string;
    }>
  >([]);
  const isPlayingAudioRef = useRef(false);

  const addMessage = useCallback(
    (text: string, type: Message["type"], side?: "RIGHT" | "LEFT") => {
      const message: Message = {
        id: Date.now().toString(),
        text,
        timestamp: new Date(),
        type,
        side,
      };
      setMessages((prev) => [...prev, message]);
    },
    []
  );

  // 音声キューを処理する関数
  const processAudioQueue = useCallback(() => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    const audioItem = audioQueueRef.current.shift();
    if (!audioItem) return;

    isPlayingAudioRef.current = true;

    // 即座にテキストを表示（音声再生と並行）
    if (audioItem.text) {
      addMessage(audioItem.text, "moderator");
    }

    if (audioItem.audioData && audioItem.audioType) {
      try {
        // Base64音声データをBlob化
        const audioBytes = atob(audioItem.audioData);
        const audioArray = new Uint8Array(audioBytes.length);
        for (let i = 0; i < audioBytes.length; i++) {
          audioArray[i] = audioBytes.charCodeAt(i);
        }

        const audioBlob = new Blob([audioArray], { type: audioItem.audioType });
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);

        const onEnded = () => {
          console.log("Audio playback completed");
          isPlayingAudioRef.current = false;

          // バックエンドに音声再生完了を通知
          socketRef.current?.emit("audio:playback_completed", {
            sessionId: audioItem.sessionId,
            text: audioItem.text,
          });

          URL.revokeObjectURL(audioUrl);

          // 次の音声を処理
          setTimeout(() => processAudioQueue(), 100);
        };

        const onError = () => {
          console.error("Audio playback error");
          isPlayingAudioRef.current = false;

          socketRef.current?.emit("audio:playback_completed", {
            sessionId: audioItem.sessionId,
            text: audioItem.text,
            error: true,
          });

          URL.revokeObjectURL(audioUrl);

          // 次の音声を処理
          setTimeout(() => processAudioQueue(), 100);
        };

        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);

        audio.play().catch(onError);
      } catch (error) {
        console.error("Failed to process audio data:", error);
        isPlayingAudioRef.current = false;

        socketRef.current?.emit("audio:playback_completed", {
          sessionId: audioItem.sessionId,
          text: audioItem.text,
          error: true,
        });

        // 次の音声を処理
        setTimeout(() => processAudioQueue(), 100);
      }
    } else {
      // 音声データがない場合
      isPlayingAudioRef.current = false;

      socketRef.current?.emit("audio:playback_completed", {
        sessionId: audioItem.sessionId,
        text: audioItem.text,
        noAudio: true,
      });

      // 次の音声を処理
      setTimeout(() => processAudioQueue(), 100);
    }
  }, [addMessage]);

  useEffect(() => {
    if (socketRef.current) return;

    console.log(`Connecting to WebSocket at: ${WS_URL}`);

    const socket = io(WS_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      setError(null);
    });

    socket.on("disconnect", () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
    });

    socket.on("connection:confirmed", (data) => {
      console.log("Connection confirmed:", data);
      addMessage("システムに接続しました", "system");
    });

    // セッション作成成功
    socket.on(S2C_EVENTS.SESSION_CREATED, (data: SessionCreatedPayload) => {
      console.log("Session created:", data);
      setSession((prev) => {
        // 既にsession:joinedで設定済みの場合は、テーマだけ更新
        if (prev && prev.sessionId === data.sessionId) {
          console.log("Session already exists, updating theme:", prev);
          return {
            ...prev,
            theme: data.config.theme,
          };
        }

        // 新しいセッションを作成
        const newSession = {
          sessionId: data.sessionId,
          theme: data.config.theme,
          state: "IDLE" as const,
          currentTurn: 0,
          participantCount: 1,
          role: "moderator" as const,
        };
        console.log("Setting session to:", newSession);
        return newSession;
      });
      addMessage(`セッションが作成されました: ${data.config.theme}`, "system");
      setIsLoading(false);

      // セッション作成者は既にバックエンドでモデレーターとして参加済み
      // 自動参加は不要
    });

    // セッション参加成功
    socket.on("session:joined", (data: any) => {
      console.log("Session joined:", data);
      setSession((prev) => {
        // sessionIdが含まれている場合は、新しいセッション情報として扱う
        if (data.sessionId) {
          const newSession = {
            sessionId: data.sessionId,
            theme: prev?.theme || "テーマ未設定",
            state: prev?.state || "IDLE",
            currentTurn: prev?.currentTurn || 0,
            role: data.role,
            side: data.side,
            participantCount: data.participantCount,
          };
          console.log("Creating session from join event:", newSession);
          return newSession;
        }

        // sessionIdがない場合は既存のセッションを更新
        if (!prev) {
          console.warn(
            "session:joined received but no previous session state and no sessionId"
          );
          return null;
        }
        const updatedSession = {
          ...prev,
          role: data.role,
          side: data.side,
          participantCount: data.participantCount,
        };
        console.log("Updated session after join:", updatedSession);
        return updatedSession;
      });
      const sideText = data.side === "RIGHT" ? "右サイド" : "左サイド";
      addMessage(`セッションに${sideText}として参加しました`, "system");
      setIsLoading(false);
    });

    // セッション状態更新
    socket.on("session:state_changed", (data: any) => {
      console.log("Session state changed:", data);
      setSession((prev) => (prev ? { ...prev, state: data.state } : null));
      // addMessage(`セッション状態が変更されました: ${data.state}`, "system");
    });

    // セッション開始
    socket.on("session:started", (data: any) => {
      console.log("Session started:", data);
      addMessage(data.message, "moderator");
    });

    // ターン開始
    socket.on("turn:started", (data: any) => {
      console.log("Turn started:", data);
      addMessage(data.message, "moderator");
      setSession((prev) =>
        prev ? { ...prev, currentTurn: data.turnIndex } : null
      );
    });

    // 自分のターン
    socket.on("turn:your_turn", (data: any) => {
      console.log("Your turn:", data);
      addMessage("あなたの発話時間です！", "system");
    });

    // カウントダウン開始
    socket.on("turn:countdown_started", (data: any) => {
      console.log("Countdown started:", data);
      addMessage(`カウントダウン開始 - ${data.duration}秒`, "system");

      // カウントダウンイベントを設定
      setCountdownEvent({
        duration: data.duration,
        timestamp: Date.now(),
      });
    });

    // ターン終了
    socket.on("turn:time_up", (data: any) => {
      console.log("Time up:", data);
      addMessage("時間終了です", "system");

      // 録音停止イベントを発火
      setRecordingStopEvent({
        reason: "time_up",
        timestamp: Date.now(),
      });
    });

    // ターン終了イベント（バックエンドから送信される場合）
    socket.on("turn:ended", (data: any) => {
      console.log("Turn ended:", data);
      addMessage(`ターン${data.turnIndex}が終了しました`, "system");

      // 録音停止イベントを発火
      setRecordingStopEvent({
        reason: "turn_ended",
        timestamp: Date.now(),
      });
    });

    // 発話受信
    socket.on(S2C_EVENTS.TRANSCRIPT_FINAL, (data: TranscriptFinalPayload) => {
      console.log("[STT] 音声認識結果を受信:", data);
      const side = (data as any).side;
      const sideText = side === "RIGHT" ? "右" : "左";
      const turnText = `ターン${(data as any).turnIndex}`;
      console.log(`[STT] ${turnText} ${sideText}側: "${data.text}"`);
      addMessage(`${turnText} ${sideText}: ${data.text}`, "transcript", side);
    });

    // ターン評価
    socket.on("turn:evaluated", (data: any) => {
      console.log("Turn evaluated:", data);
      addMessage(data.message, "moderator");

      // ターン評価結果を保存
      if (data.turnIndex && typeof data.rate === "number") {
        setTurnResults((prev) => ({
          ...prev,
          [data.turnIndex]: data.rate,
        }));
      }
    });

    // 音声生成完了
    socket.on("audio:generated", (data: any) => {
      console.log("Audio generated:", data);

      // 音声をキューに追加
      audioQueueRef.current.push({
        sessionId: data.sessionId,
        text: data.text,
        audioData: data.audioData,
        audioType: data.audioType,
      });

      // キューの処理を開始
      processAudioQueue();
    });

    // 判定開始
    socket.on("judgment:started", (data: any) => {
      console.log("Judgment started:", data);
      addMessage(data.message, "moderator");
    });

    // 判定結果
    socket.on("verdict:announced", (data: any) => {
      console.log("Verdict announced:", data);
      addMessage(data.message, "moderator");
    });

    // セッション終了
    socket.on("session:finished", (data: any) => {
      console.log("Session finished:", data);
      addMessage(data.message, "system");
    });

    // エラー
    socket.on(S2C_EVENTS.ERROR, (data: ErrorPayload) => {
      console.error("WebSocket error:", data);
      setError(data.message);
      setIsLoading(false);
    });

    // 汎用的なイベントリスナー（デバッグ用）
    socket.onAny((event, ...args) => {
      console.log(`Received event: ${event}`, args);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const createSession = useCallback((theme: string) => {
    if (!socketRef.current?.connected) {
      setError("WebSocketに接続されていません");
      return;
    }

    setIsLoading(true);
    setError(null);

    const payload: SessionCreatePayload = {
      theme,
      maxTurns: 3,
    };

    socketRef.current.emit(C2S_EVENTS.SESSION_CREATE, payload);
  }, []);

  const joinSession = useCallback((sessionId: string) => {
    if (!socketRef.current?.connected) {
      setError("WebSocketに接続されていません");
      return;
    }

    setIsLoading(true);
    setError(null);

    const payload: SessionJoinPayload = {
      sessionId,
    };

    socketRef.current.emit(C2S_EVENTS.SESSION_JOIN, payload);
  }, []);

  const startSession = useCallback(() => {
    console.log("startSession called, session:", session);
    if (!socketRef.current?.connected || !session) {
      setError("セッションが見つかりません");
      return;
    }

    console.log("Emitting session:start with sessionId:", session.sessionId);
    socketRef.current.emit("session:start", { sessionId: session.sessionId });
    addMessage("セッションを開始します...", "system");
  }, [session, addMessage]);

  const sendText = useCallback(
    (text: string) => {
      if (!socketRef.current?.connected || !session) {
        setError("セッションが見つかりません");
        return;
      }

      // テキスト送信イベントを送信
      socketRef.current.emit("text:send", { text });

      console.log(`Text sent: ${text}`);
    },
    [session]
  );

  const sendAudioStart = useCallback((sessionId: string) => {
    if (!socketRef.current?.connected) {
      setError("WebSocketに接続されていません");
      return;
    }

    socketRef.current.emit("audio:start", { sessionId });
  }, []);

  const sendAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (!socketRef.current?.connected) {
      return;
    }

    // ArrayBufferをBase64エンコード
    const uint8Array = new Uint8Array(chunk);
    const binaryString = Array.from(uint8Array)
      .map((byte) => String.fromCharCode(byte))
      .join("");
    const base64 = btoa(binaryString);

    socketRef.current.emit("audio:chunk", { chunk: base64 });
  }, []);

  const sendAudioStop = useCallback(() => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit("audio:stop", {});
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    setSession(null);
    setMessages([]);
    setError(null);
  }, []);

  return {
    isConnected,
    session,
    messages,
    error,
    isLoading,
    countdownEvent,
    recordingStopEvent,
    turnResults,
    createSession,
    joinSession,
    startSession,
    sendText,
    sendAudioStart,
    sendAudioChunk,
    sendAudioStop,
    disconnect,
    clearError: () => setError(null),
  };
};
