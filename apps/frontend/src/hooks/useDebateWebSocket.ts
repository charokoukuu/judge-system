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
      addMessage(`セッション状態が変更されました: ${data.state}`, "system");
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

    // ターン終了
    socket.on("turn:time_up", (data: any) => {
      console.log("Time up:", data);
      addMessage("時間終了です", "system");
    });

    // 発話受信
    socket.on(S2C_EVENTS.TRANSCRIPT_FINAL, (data: TranscriptFinalPayload) => {
      console.log("Transcript received:", data);
      const side = (data as any).side;
      const sideText = side === "RIGHT" ? "右" : "左";
      addMessage(`${sideText}: ${data.text}`, "transcript", side);
    });

    // ターン評価
    socket.on("turn:evaluated", (data: any) => {
      console.log("Turn evaluated:", data);
      addMessage(data.message, "moderator");
    });

    // 音声生成完了
    socket.on("audio:generated", (data: any) => {
      console.log("Audio generated:", data);

      // テキストをメッセージに追加
      if (data.text) {
        addMessage(data.text, "moderator");
      }

      // 音声データがある場合は再生
      if (data.audioData && data.audioType) {
        try {
          // Base64音声データをBlob化
          const audioBytes = atob(data.audioData);
          const audioArray = new Uint8Array(audioBytes.length);
          for (let i = 0; i < audioBytes.length; i++) {
            audioArray[i] = audioBytes.charCodeAt(i);
          }

          const audioBlob = new Blob([audioArray], { type: data.audioType });
          const audioUrl = URL.createObjectURL(audioBlob);

          // 音声再生
          const audio = new Audio(audioUrl);
          audio
            .play()
            .then(() => {
              console.log("Audio playback started");
            })
            .catch((err) => {
              console.error("Audio playback failed:", err);
            })
            .finally(() => {
              // メモリリークを防ぐためにURLを解放
              setTimeout(() => URL.revokeObjectURL(audioUrl), 1000);
            });
        } catch (error) {
          console.error("Failed to process audio data:", error);
        }
      } else if (data.textOnly) {
        console.log("Text-only message (TTS unavailable)");
      } else if (data.error) {
        console.warn("Audio generation failed:", data.error);
      }
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
    createSession,
    joinSession,
    startSession,
    sendText,
    disconnect,
    clearError: () => setError(null),
  };
};
