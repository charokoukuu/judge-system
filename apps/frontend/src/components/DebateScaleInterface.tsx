"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDebateWebSocket } from "../hooks/useDebateWebSocket";
import { useRecording } from "../hooks/useRecording";

export default function DebateScaleInterface() {
  const [debateTheme, setDebateTheme] = useState("");
  const [isDebateStarted, setIsDebateStarted] = useState(false);
  const [currentScore, setCurrentScore] = useState(0); // -1 to 1, 左(-1) ← → 右(1)
  const [aiSubtitle, setAiSubtitle] = useState("AIジャッジの準備ができました");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [lastProcessedTimestamp, setLastProcessedTimestamp] = useState<
    number | null
  >(null);
  const [lastStopEventTimestamp, setLastStopEventTimestamp] = useState<
    number | null
  >(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const {
    isConnected,
    session,
    messages,
    error,
    countdownEvent,
    recordingStopEvent,
    turnResults,
    createSession,
    startSession,
    sendAudioStart,
    sendAudioChunk,
    sendAudioStop,
  } = useDebateWebSocket();

  // 音声録音機能
  const {
    isRecording: isRecordingAudio,
    startRecording,
    stopRecording,
  } = useRecording({
    enableKeyboardShortcuts: false, // キーボードショートカットを無効化
    onAudioChunk: (chunk: Blob) => {
      // 音声チャンクをWebSocketで送信
      if (session?.sessionId) {
        chunk.arrayBuffer().then((buffer) => {
          sendAudioChunk(buffer);
        });
      }
    },
    onRecordingStart: () => {
      console.log("Recording started");
      if (session?.sessionId) {
        sendAudioStart(session.sessionId);
      }
    },
    onRecordingStop: () => {
      console.log("Recording stopped");
      sendAudioStop();
    },
  });

  // カウントダウン機能
  const startCountdown = useCallback(
    (seconds: number) => {
      setCountdown(seconds);
      setIsCountdownActive(true);

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }

      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            setIsCountdownActive(false);
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }

            // カウントダウン終了時に録音も自動停止
            if (isRecordingAudio) {
              console.log(
                "Auto-stopping recording due to countdown reaching 0"
              );
              stopRecording();
            }

            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [isRecordingAudio, stopRecording]
  );

  const stopCountdown = useCallback(() => {
    setIsCountdownActive(false);
    setCountdown(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // カウントダウン停止時に録音も自動停止
    if (isRecordingAudio) {
      console.log("Auto-stopping recording due to countdown end");
      stopRecording();
    }
  }, [isRecordingAudio, stopRecording]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // AIメッセージを字幕として表示
  useEffect(() => {
    const latestAiMessage = messages
      .filter((msg) => msg.type === "system" || msg.type === "moderator")
      .slice(-1)[0];

    if (latestAiMessage) {
      setAiSubtitle(latestAiMessage.text);
    }
  }, [messages]);

  // turnResultの結果に基づいてスコア更新（録音制御はカウントダウンに依存）
  useEffect(() => {
    if (session?.state?.includes("RIGHT") || session?.state?.includes("LEFT")) {
      // 発言中は天秤の傾きは変更しない（皿のサイズで表現）
      // 現在のスコアを維持
    } else if (
      session?.state?.includes("WRAPUP") ||
      session?.state?.includes("JUDGING")
    ) {
      // WRAPUPまたはJUDGING状態では、最新のターン結果を反映
      const currentTurn = session?.currentTurn || 1;
      const latestTurnResult = turnResults[currentTurn];

      if (typeof latestTurnResult === "number") {
        // turnResultのスコア（-1.0 to 1.0）をそのまま使用
        setCurrentScore(latestTurnResult);
      } else {
        setCurrentScore(0); // 評価結果がない場合は中央
      }

      stopCountdown(); // カウントダウン停止（録音も自動停止）
    } else {
      // IDLE, READY, FINISHED状態では累積スコアを表示
      const allScores = Object.values(turnResults);
      if (allScores.length > 0) {
        // 全ターンの平均スコアを計算
        const averageScore =
          allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
        setCurrentScore(averageScore);
      } else {
        setCurrentScore(0); // 評価結果がない場合は中央
      }

      stopCountdown(); // カウントダウン停止（録音も自動停止）
    }
  }, [session?.state, session?.currentTurn, turnResults, stopCountdown]);

  // カウントダウンイベントに基づいてカウントダウン開始と自動録音
  useEffect(() => {
    console.log("[DEBUG] カウントダウンイベント処理:", {
      countdownEvent: !!countdownEvent,
      isCountdownActive,
      isRecordingAudio,
      lastProcessedTimestamp,
      currentTimestamp: countdownEvent?.timestamp,
    });

    if (
      countdownEvent &&
      !isCountdownActive &&
      countdownEvent.timestamp !== lastProcessedTimestamp
    ) {
      console.log("Starting countdown from event:", countdownEvent);
      setLastProcessedTimestamp(countdownEvent.timestamp);
      startCountdown(countdownEvent.duration);

      // 既に録音中の場合は一度停止してから再開
      if (isRecordingAudio) {
        console.log("Stopping previous recording before starting new one");
        stopRecording();
        // 少し待ってから新しい録音を開始
        setTimeout(() => {
          console.log(
            "Auto-starting recording due to countdown start (after previous stop)"
          );
          startRecording();
        }, 100);
      } else {
        // カウントダウン開始と同時に録音を自動開始
        console.log("Auto-starting recording due to countdown start");
        startRecording();
      }
    } else if (countdownEvent?.timestamp === lastProcessedTimestamp) {
      console.log(
        "Skipping duplicate countdown event:",
        countdownEvent.timestamp
      );
    } else if (countdownEvent) {
      console.log("[DEBUG] カウントダウン開始条件不満足:", {
        hasEvent: !!countdownEvent,
        isCountdownActive,
        isRecordingAudio,
        timestampMismatch: countdownEvent.timestamp !== lastProcessedTimestamp,
      });
    }
  }, [
    countdownEvent,
    isCountdownActive,
    lastProcessedTimestamp,
    startCountdown,
    startRecording,
    stopRecording,
    isRecordingAudio,
  ]);

  // 録音停止イベントに基づく自動録音停止
  useEffect(() => {
    console.log("[DEBUG] 録音停止イベント処理:", {
      recordingStopEvent: !!recordingStopEvent,
      isRecordingAudio,
      lastStopEventTimestamp,
      currentStopTimestamp: recordingStopEvent?.timestamp,
    });

    if (
      recordingStopEvent &&
      isRecordingAudio &&
      recordingStopEvent.timestamp !== lastStopEventTimestamp
    ) {
      console.log(
        "Auto-stopping recording due to stop event:",
        recordingStopEvent
      );
      setLastStopEventTimestamp(recordingStopEvent.timestamp);
      stopRecording();
    } else if (recordingStopEvent?.timestamp === lastStopEventTimestamp) {
      console.log(
        "Skipping duplicate recording stop event:",
        recordingStopEvent?.timestamp
      );
    }
  }, [
    recordingStopEvent,
    isRecordingAudio,
    lastStopEventTimestamp,
    stopRecording,
  ]);

  // セッションが作成されたら自動的に開始状態に
  useEffect(() => {
    if (session && !isDebateStarted) {
      setIsDebateStarted(true);
      // 少し待ってからセッション開始
      setTimeout(() => {
        startSession();
      }, 1000);
    }
  }, [session, isDebateStarted, startSession]);

  const handleStartDebate = () => {
    if (!debateTheme.trim()) return;

    createSession(debateTheme.trim());
  };

  const handleMicToggle = () => {
    // 手動での録音操作は無効化 - カウントダウンによる自動制御のみ
    console.log(
      "Manual mic toggle disabled - recording is controlled by countdown"
    );
  }; // 天秤の傾きを計算（-45度から+45度）
  const scaleRotation = currentScore * 45;

  // 皿のサイズを計算（発言中は該当する皿を大きく表示）
  const getPlateSize = (side: "LEFT" | "RIGHT") => {
    const isSpeaking = session?.state?.includes(side);
    return isSpeaking ? "w-20 h-20" : "w-16 h-16"; // 発言中は20、通常時は16
  };

  const getPlateTextSize = (side: "LEFT" | "RIGHT") => {
    const isSpeaking = session?.state?.includes(side);
    return isSpeaking ? "text-xl" : "text-lg"; // 発言中はテキストも大きく
  };

  const getPlateEffects = (side: "LEFT" | "RIGHT") => {
    const isSpeaking = session?.state?.includes(side);
    if (!isSpeaking) return "";

    const shadowColor =
      side === "LEFT" ? "shadow-red-400/50" : "shadow-blue-400/50";
    return `shadow-lg ${shadowColor}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-purple-900 flex flex-col">
      {/* ヘッダー */}
      <header className="p-6 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">
          {/* AI審判官ディベートシステム */}
        </h1>
        <div className="flex items-center justify-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
          ></div>
          <span className="text-white/80">
            {isConnected ? "AI審判官 接続中" : "AI審判官 未接続"}
          </span>
        </div>
      </header>

      {/* カウントダウン表示 */}
      {isCountdownActive && countdown !== null && (
        <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50">
          <div
            className={`text-8xl font-bold px-8 py-4 rounded-2xl border-4 transition-all duration-300 ${
              countdown <= 10
                ? "text-red-500 border-red-500 bg-red-50 animate-pulse shadow-lg shadow-red-200"
                : countdown <= 20
                  ? "text-orange-500 border-orange-500 bg-orange-50 shadow-lg shadow-orange-200"
                  : "text-blue-500 border-blue-500 bg-blue-50 shadow-lg shadow-blue-200"
            }`}
          >
            {countdown}
          </div>
        </div>
      )}

      {/* メイン天秤コンテナ */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {!isDebateStarted ? (
          /* 開始前画面 */
          <div className="max-w-md w-full space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                ディベートテーマを設定
              </h2>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={debateTheme}
                onChange={(e) => setDebateTheme(e.target.value)}
                placeholder="例: AIの進歩は人類にとって良いことか"
                className="w-full p-4 text-lg rounded-lg border-2 border-white/20 bg-white/10 text-white placeholder-white/60 focus:border-white/40 focus:outline-none"
              />

              <button
                onClick={handleStartDebate}
                disabled={!debateTheme.trim() || !isConnected}
                className="w-full py-4 text-xl font-bold rounded-lg bg-gradient-to-r from-green-500 to-blue-500 text-white hover:from-green-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transition-all"
              >
                ディベート開始
              </button>
            </div>
          </div>
        ) : (
          /* ディベート中画面 */
          <div className="w-full max-w-6xl">
            {/* 天秤デバイス表示 */}
            <div className="relative mb-8">
              {/* 天秤の基座 */}
              <div className="flex justify-center mb-4">
                <div className="w-8 h-32 bg-gray-300 rounded-t-lg"></div>
              </div>

              {/* 天秤のアーム */}
              <div className="relative flex justify-center">
                <div
                  className="w-96 h-2 bg-gray-400 rounded-full transition-transform duration-500"
                  style={{ transform: `rotate(${scaleRotation}deg)` }}
                >
                  {/* 左の皿 */}
                  <div
                    className={`absolute -left-4 -top-8 ${getPlateSize("LEFT")} bg-red-500/20 border-4 border-red-500 rounded-full flex items-center justify-center transition-all duration-300 ${getPlateEffects("LEFT")} ${session?.state?.includes("LEFT") ? "animate-pulse" : ""}`}
                  >
                    <span
                      className={`text-red-500 font-bold ${getPlateTextSize("LEFT")}`}
                    >
                      左
                    </span>
                  </div>

                  {/* 右の皿 */}
                  <div
                    className={`absolute -right-4 -top-8 ${getPlateSize("RIGHT")} bg-blue-500/20 border-4 border-blue-500 rounded-full flex items-center justify-center transition-all duration-300 ${getPlateEffects("RIGHT")} ${session?.state?.includes("RIGHT") ? "animate-pulse" : ""}`}
                  >
                    <span
                      className={`text-blue-500 font-bold ${getPlateTextSize("RIGHT")}`}
                    >
                      右
                    </span>
                  </div>
                </div>
              </div>

              {/* スコア表示 */}
              <div className="text-center mt-8">
                <div className="text-white/60 text-sm mb-2">現在のスコア</div>
                <div className="text-2xl font-bold text-white">
                  {currentScore > 0
                    ? "右優勢"
                    : currentScore < 0
                      ? "左優勢"
                      : "互角"}
                  {currentScore !== 0 && (
                    <span className="text-lg ml-2">
                      ({Math.abs(currentScore * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>

                {/* ターン評価詳細 */}
                {Object.keys(turnResults).length > 0 && (
                  <div className="mt-4 text-sm text-white/80">
                    <div className="flex justify-center space-x-4">
                      {Object.entries(turnResults).map(([turnIndex, score]) => (
                        <div key={turnIndex} className="text-center">
                          <div className="text-xs text-white/60">
                            ターン{turnIndex}
                          </div>
                          <div
                            className={`text-sm font-medium ${
                              score > 0
                                ? "text-blue-400"
                                : score < 0
                                  ? "text-red-400"
                                  : "text-gray-400"
                            }`}
                          >
                            {score > 0 ? "右" : score < 0 ? "左" : "互角"}(
                            {(score * 100).toFixed(0)})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI字幕エリア */}
            <div className="bg-black/30 backdrop-blur-sm rounded-lg p-6 mb-8">
              <div className="text-center">
                <div className="text-white/60 text-sm mb-2">
                  AI審判官からのメッセージ
                </div>
                <div className="text-xl text-white font-medium leading-relaxed">
                  {aiSubtitle}
                </div>
              </div>
            </div>

            {/* 録音状態表示（クリック無効） */}
            <div className="flex justify-center space-x-6">
              <div
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold transition-all
                  ${
                    isRecordingAudio
                      ? "bg-red-500 animate-pulse"
                      : "bg-gray-600"
                  }
                `}
              >
                🎤
              </div>

              {/* 録音状態表示 */}
              {isRecordingAudio && (
                <div className="flex items-center space-x-2">
                  <div className="text-white text-sm">🔴 録音中（自動）</div>
                </div>
              )}
            </div>

            {/* セッション情報 */}
            {session && (
              <div className="mt-8 text-center text-white/60 text-sm">
                <div>テーマ: {session.theme}</div>
                <div>
                  状態: {session.state} | ターン: {session.currentTurn || 0}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* エラー表示 */}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 p-4 bg-red-500/90 backdrop-blur-sm text-white rounded-lg">
          <div className="text-center">
            <strong>エラー:</strong> {error}
          </div>
        </div>
      )}
    </div>
  );
}
