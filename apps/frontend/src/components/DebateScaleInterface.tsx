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
  const [lastDisplayedMessage, setLastDisplayedMessage] = useState<
    string | null
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

  // AIメッセージを字幕として表示（重複防止とアニメーション付き）
  useEffect(() => {
    const latestAiMessage = messages
      .filter((msg) => msg.type === "system" || msg.type === "moderator")
      .slice(-1)[0];

    if (latestAiMessage && latestAiMessage.text !== lastDisplayedMessage) {
      console.log("[字幕更新] 新しいメッセージ:", latestAiMessage.text);
      console.log("[字幕更新] 前回のメッセージ:", lastDisplayedMessage);

      // 前回と同じメッセージの場合はスキップ
      setLastDisplayedMessage(latestAiMessage.text);

      // フェードアウトしてから新しいメッセージを表示
      const element = document.querySelector(".magic-subtitle");
      if (element && lastDisplayedMessage !== null) {
        // 前回メッセージがある場合のみフェードアウト→フェードイン
        element.classList.add("animate-fade-out");
        setTimeout(() => {
          setAiSubtitle(latestAiMessage.text);
          element.classList.remove("animate-fade-out");
          element.classList.add("animate-fade-in");
          setTimeout(() => {
            element.classList.remove("animate-fade-in");
          }, 1000);
        }, 300);
      } else {
        // 初回メッセージまたは要素が見つからない場合は直接設定
        setAiSubtitle(latestAiMessage.text);
      }
    } else if (
      latestAiMessage &&
      latestAiMessage.text === lastDisplayedMessage
    ) {
      console.log("[字幕更新] 重複メッセージをスキップ:", latestAiMessage.text);
    }
  }, [messages, lastDisplayedMessage]);

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
      side === "LEFT" ? "shadow-red-500/50" : "shadow-green-500/50";
    return `shadow-lg ${shadowColor}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-slate-900 flex flex-col relative overflow-hidden">
      {/* ハリーポッター風魔法の背景エフェクト */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 夜空の星座エフェクト */}
        <div className="absolute inset-0 bg-[radial-gradient(white_0.5px,transparent_0.5px)] bg-[length:80px_80px] opacity-20 animate-pulse"></div>
        {/* ホグワーツ風の魔法の粒子エフェクト */}
        <div className="absolute top-10 left-10 w-2 h-2 bg-amber-300 rounded-full animate-bounce opacity-60"></div>
        <div className="absolute top-20 right-20 w-1 h-1 bg-green-300 rounded-full animate-ping opacity-50"></div>
        <div className="absolute bottom-32 left-16 w-3 h-3 bg-yellow-300 rounded-full animate-pulse opacity-40"></div>
        <div className="absolute bottom-40 right-32 w-2 h-2 bg-emerald-300 rounded-full animate-bounce opacity-50"></div>
        <div className="absolute top-1/3 left-1/4 w-1 h-1 bg-amber-300 rounded-full animate-ping opacity-30"></div>
        <div className="absolute top-2/3 right-1/3 w-2 h-2 bg-yellow-300 rounded-full animate-pulse opacity-40"></div>
      </div>

      {/* ハリーポッター風ヘッダー */}
      <header className="p-6 text-center relative z-10 border-b border-amber-400/20">
        {/* ホグワーツ風タイトル */}
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="text-4xl">⚗️</div>
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-300 to-emerald-300 font-serif tracking-wider drop-shadow-lg">
            魔法の天秤
          </h1>
          <div className="text-4xl">📜</div>
        </div>
        <div className="text-lg text-amber-200/80 mb-4 font-serif italic">
          〜 The Ancient Scales of Magical Justice 〜
        </div>

        {/* 魔法回路接続状態 */}
        <div className="flex items-center justify-center gap-3">
          <div className="relative">
            <div
              className={`w-4 h-4 rounded-full ${isConnected ? "bg-emerald-400" : "bg-red-400"} animate-pulse`}
            ></div>
            <div className="absolute inset-0 rounded-full border-2 border-amber-300 opacity-50 animate-ping"></div>
          </div>
          <span className="text-amber-200 font-medium">
            {isConnected ? "✨ 魔法回路 接続中" : "❌ 魔法回路 切断"}
          </span>
        </div>
      </header>

      {/* ハリーポッター風魔法のカウントダウン表示 */}
      {isCountdownActive && countdown !== null && (
        <div className="fixed top-12 left-1/2 transform -translate-x-1/2 z-50">
          <div className="relative">
            {/* 古代魔法陣背景 */}
            <div className="absolute inset-0 animate-spin-slow">
              <div className="w-32 h-32 border-4 border-dashed border-amber-400 rounded-full opacity-60"></div>
            </div>
            <div className="absolute inset-2 animate-reverse-spin">
              <div className="w-28 h-28 border-2 border-dotted border-green-400 rounded-full opacity-40"></div>
            </div>

            {/* カウントダウン数字 */}
            <div
              className={`relative z-10 w-32 h-32 flex items-center justify-center text-8xl font-bold rounded-full border-4 transition-all duration-300 transform ${
                countdown <= 10
                  ? "text-red-400 border-red-400 bg-red-900/30 animate-pulse scale-110 shadow-lg shadow-red-400/50"
                  : countdown <= 20
                    ? "text-orange-400 border-orange-400 bg-orange-900/30 scale-105 shadow-lg shadow-orange-400/50"
                    : "text-amber-300 border-amber-400 bg-amber-900/30 shadow-lg shadow-amber-400/50"
              }`}
            >
              <span className="drop-shadow-lg font-serif">{countdown}</span>
            </div>

            {/* ホグワーツ風のきらめき */}
            <div className="absolute -top-2 -right-2 text-amber-300 text-2xl animate-bounce">
              ✨
            </div>
            <div className="absolute -bottom-2 -left-2 text-pink-300 text-xl animate-pulse">
              🌟
            </div>
          </div>
        </div>
      )}

      {/* メイン天秤コンテナ */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {!isDebateStarted ? (
          /* ホグワーツ風開始前画面 */
          <div className="max-w-lg w-full space-y-8 relative z-10">
            {/* 古代魔法の書物風枠 */}
            <div className="bg-gradient-to-br from-slate-900/90 to-gray-900/90 backdrop-blur-sm rounded-2xl border-4 border-amber-400/60 p-8 shadow-2xl shadow-amber-500/20">
              <div className="text-center mb-8">
                <div className="text-4xl mb-4">⚗️</div>
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-emerald-300 mb-2 font-serif">
                  魔法議論の巻物
                </h2>
                <p className="text-amber-200/80 text-sm italic font-serif">
                  〜 Ancient Scales shall reveal the Truth 〜
                </p>
              </div>

              <div className="space-y-6">
                <div className="relative">
                  <input
                    type="text"
                    value={debateTheme}
                    onChange={(e) => setDebateTheme(e.target.value)}
                    placeholder="例: 魔法薬学は変身術より高等か..."
                    className="w-full p-4 text-lg rounded-xl border-2 border-amber-400/40 bg-gray-900/50 text-amber-100 placeholder-amber-300/50 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 transition-all backdrop-blur-sm font-serif"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-amber-400">
                    🪶
                  </div>
                </div>

                <button
                  onClick={handleStartDebate}
                  disabled={!debateTheme.trim() || !isConnected}
                  className="w-full py-4 text-xl font-bold rounded-xl bg-gradient-to-r from-amber-600 via-yellow-600 to-emerald-600 text-white hover:from-amber-500 hover:via-yellow-500 hover:to-emerald-500 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed transition-all transform hover:scale-105 shadow-lg hover:shadow-xl shadow-amber-500/30 relative overflow-hidden font-serif"
                >
                  <span className="relative z-10">� 古代の儀式を開始</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ディベート中画面 */
          <div className="w-full max-w-6xl">
            {/* ホグワーツ風魔法の天秤デバイス表示 */}
            <div className="relative mb-12">
              {/* 古代の台座 */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="w-12 h-40 bg-gradient-to-t from-amber-700 via-amber-600 to-amber-500 rounded-t-lg shadow-lg border-2 border-amber-400"></div>
                  {/* 台座の装飾 */}
                  <div className="absolute -bottom-2 -left-3 -right-3 h-6 bg-gradient-to-r from-amber-800 to-amber-700 rounded-lg border-2 border-amber-600"></div>
                  {/* 古代魔法の光 */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-16 bg-yellow-300 opacity-20 rounded-full blur-xl animate-pulse"></div>
                </div>
              </div>

              {/* 魔法の天秤アーム */}
              <div className="relative flex justify-center">
                <div
                  className="w-80 h-3 bg-gradient-to-r from-silver-400 via-silver-300 to-silver-400 rounded-full transition-transform duration-700 shadow-lg border border-gray-300"
                  style={{ transform: `rotate(${scaleRotation}deg)` }}
                >
                  {/* 左の古代魔法皿（グリフィンドール風） */}
                  <div
                    className={`absolute -left-6 -top-10 ${getPlateSize("LEFT")} bg-gradient-to-br from-red-600/40 to-amber-600/40 border-4 border-red-500 rounded-full flex items-center justify-center transition-all duration-300 ${getPlateEffects("LEFT")} ${session?.state?.includes("LEFT") ? "animate-pulse shadow-lg shadow-red-500/50" : ""} backdrop-blur-sm`}
                  >
                    {/* 古代魔法のルーン */}
                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-red-400 opacity-60 animate-spin-slow"></div>
                    <span
                      className={`text-red-300 font-bold ${getPlateTextSize("LEFT")} drop-shadow-lg relative z-10`}
                    >
                      🦁
                    </span>
                    {session?.state?.includes("LEFT") && (
                      <>
                        <div className="absolute -top-1 -right-1 text-amber-300 text-sm animate-bounce">
                          ✨
                        </div>
                        <div className="absolute -bottom-1 -left-1 text-red-300 text-xs animate-pulse">
                          ⭐
                        </div>
                      </>
                    )}
                  </div>

                  {/* 右の古代魔法皿（スリザリン風） */}
                  <div
                    className={`absolute -right-6 -top-10 ${getPlateSize("RIGHT")} bg-gradient-to-br from-green-600/40 to-emerald-600/40 border-4 border-green-500 rounded-full flex items-center justify-center transition-all duration-300 ${getPlateEffects("RIGHT")} ${session?.state?.includes("RIGHT") ? "animate-pulse shadow-lg shadow-green-500/50" : ""} backdrop-blur-sm`}
                  >
                    {/* 古代魔法のルーン */}
                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-green-400 opacity-60 animate-reverse-spin"></div>
                    <span
                      className={`text-green-300 font-bold ${getPlateTextSize("RIGHT")} drop-shadow-lg relative z-10`}
                    >
                      🐍
                    </span>
                    {session?.state?.includes("RIGHT") && (
                      <>
                        <div className="absolute -top-1 -left-1 text-emerald-300 text-sm animate-bounce">
                          ✨
                        </div>
                        <div className="absolute -bottom-1 -right-1 text-green-300 text-xs animate-pulse">
                          ⭐
                        </div>
                      </>
                    )}
                  </div>

                  {/* 中央の魔法石（ホグワーツの賢者の石風） */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-gradient-to-r from-amber-400 to-yellow-400 rounded-full shadow-lg animate-pulse border border-amber-300"></div>
                </div>
              </div>

              {/* ホグワーツ風スコア表示 */}
              <div className="text-center mt-12">
                <div className="text-amber-200/80 text-lg mb-4 font-serif italic">
                  〜 Ancient Scales Judgment 〜
                </div>
                <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-300 to-emerald-300 drop-shadow-lg font-serif">
                  {currentScore > 0
                    ? "🐍 スリザリンの優勢"
                    : currentScore < 0
                      ? "🦁 グリフィンドールの優勢"
                      : "⚖️ 均衡状態"}
                  {currentScore !== 0 && (
                    <span className="text-2xl ml-2 text-amber-200/80">
                      ({Math.abs(currentScore * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>

                {/* ホグワーツ風ターン評価詳細 */}
                {Object.keys(turnResults).length > 0 && (
                  <div className="mt-6 text-sm text-amber-200/80">
                    <div className="text-center mb-3 text-amber-300 font-serif italic">
                      〜 各章の記録 〜
                    </div>
                    <div className="flex justify-center space-x-6">
                      {Object.entries(turnResults).map(([turnIndex, score]) => (
                        <div key={turnIndex} className="text-center">
                          <div className="text-xs text-amber-300 mb-1 font-serif">
                            第{turnIndex}章
                          </div>
                          <div
                            className={`text-lg font-bold ${
                              score > 0
                                ? "text-green-300"
                                : score < 0
                                  ? "text-red-300"
                                  : "text-gray-300"
                            }`}
                          >
                            {score > 0 ? "🐍" : score < 0 ? "🦁" : "⚖️"}
                            <div className="text-xs">
                              ({(score * 100).toFixed(0)})
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ホグワーツ風字幕エリア */}
            <div className="bg-gradient-to-br from-slate-900/90 to-gray-900/90 backdrop-blur-sm rounded-2xl border-2 border-amber-400/40 p-8 mb-8 shadow-2xl shadow-amber-500/10 relative overflow-hidden">
              {/* 古代魔法のオーラエフェクト */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent animate-pulse"></div>

              <div className="text-center relative z-10">
                <div className="text-amber-300 text-lg mb-4 font-serif italic flex items-center justify-center gap-2">
                  <span>⚗️</span>
                  <span>〜 Ancient Oracle's Words 〜</span>
                  <span>📜</span>
                </div>
                <div className="text-3xl text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-300 to-emerald-300 font-bold leading-relaxed magic-subtitle font-serif">
                  {aiSubtitle}
                </div>
              </div>
            </div>

            {/* ホグワーツ風録音状態表示 */}
            <div className="flex justify-center space-x-6">
              <div className="relative">
                <div
                  className={`
                    w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold transition-all relative overflow-hidden
                    ${
                      isRecordingAudio
                        ? "bg-gradient-to-br from-red-600 to-amber-600 animate-pulse shadow-lg shadow-red-600/50"
                        : "bg-gradient-to-br from-gray-700 to-gray-800 shadow-lg"
                    }
                  `}
                >
                  <span className="relative z-10">🎤</span>
                  {isRecordingAudio && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-sweep"></div>
                      <div className="absolute -inset-2 border-4 border-amber-500/50 rounded-full animate-ping"></div>
                    </>
                  )}
                </div>
              </div>

              {/* ホグワーツ風録音状態表示 */}
              {isRecordingAudio && (
                <div className="flex items-center space-x-3">
                  <div className="text-amber-300 text-lg font-bold animate-pulse font-serif">
                    🔴 古代の記録中
                  </div>
                  <div className="flex space-x-1">
                    <div className="w-2 h-8 bg-amber-400 rounded animate-bounce"></div>
                    <div
                      className="w-2 h-6 bg-amber-400 rounded animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-10 bg-amber-400 rounded animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-2 h-7 bg-amber-400 rounded animate-bounce"
                      style={{ animationDelay: "0.3s" }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* ホグワーツ風セッション情報 */}
            {session && (
              <div className="mt-8 text-center text-amber-200/80 text-sm font-serif">
                <div className="mb-2">📜 議論の巻物: {session.theme}</div>
                <div className="flex items-center justify-center gap-4 text-xs">
                  <span>魔法状態: {session.state}</span>
                  <span>|</span>
                  <span>章: {session.currentTurn || 0}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ホグワーツ風エラー表示 */}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 p-4 bg-gradient-to-r from-red-900/95 to-gray-900/95 backdrop-blur-sm text-white rounded-xl border-2 border-red-500/60 shadow-lg font-serif">
          <div className="text-center">
            <strong>⚠️ 魔法回路の障害:</strong> {error}
          </div>
        </div>
      )}
    </div>
  );
}
