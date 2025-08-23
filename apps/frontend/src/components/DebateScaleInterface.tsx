"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDebateWebSocket } from "../hooks/useDebateWebSocket";
import { useRecording } from "../hooks/useRecording";

export default function DebateScaleInterface() {
  const [debateTheme, setDebateTheme] = useState("");
  const [isDebateStarted, setIsDebateStarted] = useState(false);
  const [isThemeRecording, setIsThemeRecording] = useState(false); // テーマ録音中フラグ
  const [themeRecordingPhase, setThemeRecordingPhase] = useState<
    "waiting" | "recording" | "processing"
  >("waiting"); // テーマ録音フェーズ
  const [themeRecordingCountdown, setThemeRecordingCountdown] = useState<
    number | null
  >(null); // テーマ録音のカウントダウン
  const [currentScore, setCurrentScore] = useState(0); // -1 to 1, 左(-1) ← → 右(1)
  const [aiSubtitle, setAiSubtitle] = useState(
    "魔法の天秤の準備が整ったのじゃ。スペースキーを押して論争のテーマを音声で入力するのじゃ。"
  );
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
  const [showFinalResult, setShowFinalResult] = useState(false); // 最終結果表示フラグ
  const [isSessionFinished, setIsSessionFinished] = useState(false); // セッション終了フラグ
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // テーマから立場を決定する関数
  const getDebatePositions = (theme: string) => {
    if (!theme) return { rightPosition: "", leftPosition: "" };

    const lowerTheme = theme.toLowerCase();

    // AI関連のテーマ
    if (lowerTheme.includes("ai") || lowerTheme.includes("人工知能")) {
      return {
        rightPosition: "AI推進派",
        leftPosition: "AI慎重派",
      };
    }

    // 環境問題関連
    if (
      lowerTheme.includes("環境") ||
      lowerTheme.includes("地球温暖化") ||
      lowerTheme.includes("脱炭素")
    ) {
      return {
        rightPosition: "環境優先派",
        leftPosition: "経済優先派",
      };
    }

    // 教育関連
    if (
      lowerTheme.includes("教育") ||
      lowerTheme.includes("学校") ||
      lowerTheme.includes("授業")
    ) {
      return {
        rightPosition: "改革推進派",
        leftPosition: "現状維持派",
      };
    }

    // 働き方関連
    if (
      lowerTheme.includes("働き方") ||
      lowerTheme.includes("リモートワーク") ||
      lowerTheme.includes("残業")
    ) {
      return {
        rightPosition: "改革派",
        leftPosition: "従来派",
      };
    }

    // 一般的な賛成/反対のテーマ
    if (
      theme.includes("すべきか") ||
      theme.includes("べきか") ||
      theme.includes("は良いか") ||
      theme.includes("は正しいか") ||
      theme.includes("賛成") ||
      theme.includes("反対")
    ) {
      return {
        rightPosition: "賛成派",
        leftPosition: "反対派",
      };
    }

    // 「AとBどちらが良いか」のようなテーマの場合
    if (
      theme.includes("どちら") ||
      theme.includes("VS") ||
      theme.includes("vs") ||
      theme.includes("対")
    ) {
      // テーマを分析してより具体的に
      const parts = theme.split(/どちら|VS|vs|対/);
      if (parts.length >= 2) {
        return {
          rightPosition: parts[0].trim() + "派",
          leftPosition: parts[1].trim() + "派",
        };
      }
    }

    // デフォルト
    return {
      rightPosition: "太陽側の立場",
      leftPosition: "月側の立場",
    };
  };

  const {
    isConnected,
    session,
    messages,
    error,
    countdownEvent,
    recordingStopEvent,
    turnResults,
    isJudging,
    judgingMessage,
    verdict,
    lastTranscript,
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
      console.log("[DEBUG] Audio chunk received:", chunk.size, "bytes");
      // 音声チャンクをWebSocketで送信
      chunk.arrayBuffer().then((buffer) => {
        console.log(
          "[DEBUG] Sending audio chunk to WebSocket:",
          buffer.byteLength,
          "bytes"
        );
        sendAudioChunk(buffer);
      });
    },
    onRecordingStart: () => {
      console.log(
        "[DEBUG] Recording started - theme recording phase:",
        themeRecordingPhase
      );
      // テーマ入力時はセッションIDなしでも録音開始
      if (session?.sessionId) {
        sendAudioStart(session.sessionId);
      } else {
        // テーマ入力用の録音開始（セッションIDなし）
        sendAudioStart("theme-input");
      }
    },
    onRecordingStop: () => {
      console.log(
        "[DEBUG] Recording stopped - theme recording phase:",
        themeRecordingPhase
      );
      console.trace("[DEBUG] Recording stop call stack");
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

            // カウントダウン終了時に録音も自動停止（ただしテーマ録音中は除外）
            if (isRecordingAudio && themeRecordingPhase !== "recording") {
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
    [isRecordingAudio, stopRecording, themeRecordingPhase]
  );

  const stopCountdown = useCallback(() => {
    setIsCountdownActive(false);
    setCountdown(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // カウントダウン停止時に録音も自動停止（ただしテーマ録音中は除外）
    if (isRecordingAudio && themeRecordingPhase !== "recording") {
      console.log("Auto-stopping recording due to countdown end");
      stopRecording();
    }
  }, [isRecordingAudio, stopRecording, themeRecordingPhase]);

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

  // 判定結果が出たら1秒後に最終結果を表示
  useEffect(() => {
    if (verdict && !showFinalResult) {
      const timer = setTimeout(() => {
        setShowFinalResult(true);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [verdict, showFinalResult]);

  // セッション終了時に天秤をリセット
  useEffect(() => {
    if (session?.state === "FINISHED" && !isSessionFinished) {
      const timer = setTimeout(() => {
        setIsSessionFinished(true);
        setCurrentScore(0); // 天秤を中央に戻す
        setShowFinalResult(false); // 最終結果表示をリセット
      }, 2000); // 2秒後にリセット

      return () => clearTimeout(timer);
    }
  }, [session?.state, isSessionFinished]);

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

  // テーマ音声認識結果の処理
  useEffect(() => {
    console.log("[テーマ音声認識] lastTranscript更新:", lastTranscript);
    console.log("[テーマ音声認識] 現在のフェーズ:", themeRecordingPhase);

    if (
      lastTranscript &&
      lastTranscript.isThemeInput &&
      themeRecordingPhase === "processing"
    ) {
      console.log("[テーマ音声認識] テーマを設定:", lastTranscript.text);
      setDebateTheme(lastTranscript.text);
      setThemeRecordingPhase("waiting");
      setAiSubtitle(
        `テーマ「${lastTranscript.text}」を受け取ったのじゃ。儀式を開始するのじゃ。`
      );

      // 2秒後に自動的にセッション開始
      setTimeout(() => {
        console.log("[自動開始] セッションを開始します");
        createSession(lastTranscript.text);
      }, 2000);
    }
  }, [lastTranscript, themeRecordingPhase, createSession]);

  // スペースキーでテーマ録音を開始（10秒間自動録音）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // デバッグ中は除外、またはセッション開始後は除外
      if (isDebateStarted) return;

      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();

        if (themeRecordingPhase === "waiting") {
          // テーマが未設定またはテーマ録音待ち状態
          if (!debateTheme.trim()) {
            startThemeRecording();
          } else {
            // テーマが既に設定されている場合はセッション開始
            createSession(debateTheme.trim());
          }
        }
      }
    };

    // キーアップは不要（10秒間自動録音なので）
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDebateStarted, themeRecordingPhase, debateTheme, createSession]);

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

  // テーマ録音を開始（10秒間自動録音）
  const startThemeRecording = () => {
    console.log("[テーマ録音] 10秒間の録音開始");
    setThemeRecordingPhase("recording");
    setThemeRecordingCountdown(10);
    setAiSubtitle("10秒間でテーマを話してくれい。");

    // 録音開始
    console.log("[DEBUG] About to call startRecording()");
    startRecording();
    console.log("[DEBUG] startRecording() called");

    // カウントダウン開始
    let remainingTime = 10;
    const countdownInterval = setInterval(() => {
      remainingTime -= 1;
      console.log("[DEBUG] Countdown:", remainingTime);
      setThemeRecordingCountdown(remainingTime);

      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        console.log("[テーマ録音] 10秒経過により自動停止");
        // 録音自動停止
        setThemeRecordingPhase("processing");
        setThemeRecordingCountdown(null);
        setAiSubtitle("音声を解析中じゃ。少し待つのじゃ...");
        console.log("[DEBUG] About to call stopRecording() after countdown");
        stopRecording();
        console.log("[DEBUG] stopRecording() called after countdown");

        // 5秒後に音声認識結果を待つ（実際はWebSocketからの結果を待つ）
        // setTimeout(() => {
        //   // 状態を直接チェックせず、常にタイムアウト処理を実行
        //   console.log("[テーマ録音] タイムアウトチェック実行");
        //   setAiSubtitle(
        //     "音声認識に失敗したのじゃ。もう一度スペースキーで試してくれい。"
        //   );
        //   setThemeRecordingPhase("waiting");
        // }, 5000);
      }
    }, 1000);
  };

  // テーマ録音を停止（手動停止用）
  const stopThemeRecording = () => {
    console.log("[テーマ録音] 手動録音停止");
    setThemeRecordingPhase("processing");
    setThemeRecordingCountdown(null);
    setAiSubtitle("音声を解析中じゃ。少し待つのじゃ...");
    stopRecording();
  };

  const handleMicToggle = () => {
    // 手動での録音操作は無効化 - カウントダウンによる自動制御のみ
    console.log(
      "Manual mic toggle disabled - recording is controlled by countdown"
    );
  };

  // 天秤の傾きを計算（-45度から+45度、最終判定後は-45度から+45度、セッション終了時は0度）
  const getScaleRotation = () => {
    // セッション終了時は中央に戻す
    if (isSessionFinished) {
      return 0;
    }
    // 最終判定後かつ1秒経過後は勝者の方向に大きく傾ける
    if (verdict && showFinalResult) {
      return verdict.winner === "RIGHT" ? 20 : -20; // 右勝利で+45度、左勝利で-45度
    }
    // 通常時は現在のスコアに基づいて傾ける
    return currentScore * 45;
  };

  const scaleRotation = getScaleRotation();

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
      side === "LEFT" ? "shadow-indigo-400/50" : "shadow-yellow-400/50";
    return `shadow-lg ${shadowColor}`;
  };

  return (
    <>
      {/* 判定中アニメーション用CSS */}
      <style jsx>{`
        @keyframes judgmentSpin {
          0% {
            transform: rotate(${scaleRotation}deg);
          }
          50% {
            transform: rotate(${scaleRotation + 180}deg);
          }
          100% {
            transform: rotate(${scaleRotation + 360}deg);
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes reverse-spin {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        @keyframes milky-way-flow {
          0% {
            transform: translateY(120vh) translateX(-3px);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-20vh) translateX(3px);
            opacity: 0;
          }
        }

        @keyframes milky-way-flow-reverse {
          0% {
            transform: translateY(120vh) translateX(3px);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-20vh) translateX(-3px);
            opacity: 0;
          }
        }

        @keyframes milky-way-flow-smooth {
          0% {
            transform: translateY(120vh);
            opacity: 0;
          }
          15% {
            opacity: 0.8;
          }
          85% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-20vh);
            opacity: 0;
          }
        }

        @keyframes star-twinkle {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }

        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }

        .animate-reverse-spin {
          animation: reverse-spin 15s linear infinite;
        }

        .bg-gradient-radial {
          background: radial-gradient(circle, var(--tw-gradient-stops));
        }

        .border-3 {
          border-width: 3px;
        }

        .filter {
          filter: var(--tw-filter);
        }

        .brightness-125 {
          --tw-brightness: brightness(1.25);
          filter: var(--tw-brightness);
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-violet-900 flex flex-col relative overflow-hidden">
        {/* 魔法的な背景エフェクト */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* 星空エフェクト */}
          <div className="absolute inset-0 bg-[radial-gradient(white_1px,transparent_1px)] bg-[length:50px_50px] opacity-30 animate-pulse"></div>

          {/* ローディング中の天の川アニメーション */}
          {isJudging && (
            <>
              {/* メイン天の川ストリーム - 中央左寄り */}
              <div className="absolute left-1/2 top-0 w-48 h-full transform -translate-x-24">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={`milky-main-${i}`}
                    className="absolute rounded-full bg-gradient-radial from-cyan-200 via-cyan-400 to-transparent"
                    style={{
                      width: `${6 + Math.sin(i) * 4}px`,
                      height: `${12 + Math.cos(i) * 8}px`,
                      animation: `milky-way-flow ${2.5 + i * 0.03}s linear infinite`,
                      animationDelay: `${i * 0.02}s`,
                      top: `calc(-20vh + ${i * 2.5}%)`,
                      left: `${Math.sin(i * 0.5) * 30 + Math.random() * 20}px`,
                      filter: "blur(1px)",
                      boxShadow: "0 0 8px rgba(34, 211, 238, 0.4)",
                    }}
                  />
                ))}
              </div>

              {/* セカンダリ天の川ストリーム - 中央右寄り */}
              <div className="absolute right-1/2 top-0 w-44 h-full transform translate-x-16">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div
                    key={`milky-secondary-${i}`}
                    className="absolute rounded-full bg-gradient-radial from-blue-200 via-blue-300 to-transparent"
                    style={{
                      width: `${5 + Math.cos(i) * 3}px`,
                      height: `${10 + Math.sin(i) * 6}px`,
                      animation: `milky-way-flow-reverse ${2.3 + i * 0.02}s linear infinite`,
                      animationDelay: `${i * 0.025}s`,
                      top: `calc(-20vh + ${i * 2.8}%)`,
                      left: `${Math.cos(i * 0.7) * 25 + Math.random() * 15}px`,
                      filter: "blur(0.8px)",
                      boxShadow: "0 0 6px rgba(59, 130, 246, 0.3)",
                    }}
                  />
                ))}
              </div>

              {/* 中央コア密集パーティクル */}
              <div className="absolute left-1/2 top-0 w-32 h-full transform -translate-x-16">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={`milky-core-${i}`}
                    className="absolute rounded-full bg-gradient-radial from-cyan-300 via-cyan-400 to-cyan-200"
                    style={{
                      width: `${4 + Math.sin(i * 0.8) * 5}px`,
                      height: `${8 + Math.cos(i * 0.8) * 4}px`,
                      animation: `milky-way-flow-smooth ${2.8 + i * 0.02}s linear infinite`,
                      animationDelay: `${i * 0.015}s`,
                      top: `calc(-20vh + ${i * 1.6}%)`,
                      left: `${Math.sin(i * 0.4) * 20 + Math.random() * 12}px`,
                      filter: "blur(0.5px)",
                      boxShadow: "0 0 5px rgba(34, 211, 238, 0.5)",
                      opacity: 0.7,
                    }}
                  />
                ))}
              </div>

              {/* 左側密集パーティクル */}
              <div className="absolute left-1/2 top-0 w-40 h-full transform -translate-x-32">
                {Array.from({ length: 45 }).map((_, i) => (
                  <div
                    key={`milky-left-${i}`}
                    className="absolute rounded-full bg-gradient-radial from-cyan-100 via-cyan-300 to-transparent"
                    style={{
                      width: `${3 + Math.sin(i * 1.2) * 2}px`,
                      height: `${6 + Math.cos(i * 1.2) * 3}px`,
                      animation: `milky-way-flow ${2.6 + i * 0.02}s linear infinite`,
                      animationDelay: `${i * 0.018}s`,
                      top: `calc(-20vh + ${i * 2.2}%)`,
                      left: `${Math.sin(i * 0.3) * 25 + Math.random() * 15}px`,
                      filter: "blur(0.8px)",
                      boxShadow: "0 0 4px rgba(103, 232, 249, 0.3)",
                    }}
                  />
                ))}
              </div>

              {/* 右側密集パーティクル */}
              <div className="absolute right-1/2 top-0 w-40 h-full transform translate-x-32">
                {Array.from({ length: 45 }).map((_, i) => (
                  <div
                    key={`milky-right-${i}`}
                    className="absolute rounded-full bg-gradient-radial from-blue-100 via-blue-300 to-transparent"
                    style={{
                      width: `${3 + Math.cos(i * 1.1) * 2}px`,
                      height: `${6 + Math.sin(i * 1.1) * 3}px`,
                      animation: `milky-way-flow-reverse ${2.4 + i * 0.02}s linear infinite`,
                      animationDelay: `${i * 0.018}s`,
                      top: `calc(-20vh + ${i * 2.2}%)`,
                      left: `${Math.cos(i * 0.6) * 25 + Math.random() * 15}px`,
                      filter: "blur(0.8px)",
                      boxShadow: "0 0 4px rgba(147, 197, 253, 0.3)",
                    }}
                  />
                ))}
              </div>

              {/* きらめく微細星のパーティクル */}
              <div className="absolute left-1/2 top-0 w-56 h-full transform -translate-x-28">
                {Array.from({ length: 80 }).map((_, i) => (
                  <div
                    key={`milky-star-${i}`}
                    className="absolute rounded-full bg-gradient-radial from-white via-cyan-200 to-transparent"
                    style={{
                      width: `${1.5 + Math.random() * 1.5}px`,
                      height: `${1.5 + Math.random() * 1.5}px`,
                      animation: `milky-way-flow-smooth ${2.0 + i * 0.01}s linear infinite, star-twinkle ${0.5 + Math.random() * 1}s ease-in-out infinite`,
                      animationDelay: `${i * 0.01}s`,
                      top: `calc(-20vh + ${Math.random() * 95}%)`,
                      left: `${Math.random() * 100}%`,
                      filter: "blur(0.3px)",
                      boxShadow: "0 0 3px rgba(255, 255, 255, 0.6)",
                    }}
                  />
                ))}
              </div>

              {/* 超微細背景パーティクル */}
              <div className="absolute left-1/2 top-0 w-64 h-full transform -translate-x-32">
                {Array.from({ length: 100 }).map((_, i) => (
                  <div
                    key={`milky-dust-${i}`}
                    className="absolute rounded-full bg-gradient-radial from-cyan-50 via-cyan-100 to-transparent"
                    style={{
                      width: `${1 + Math.random()}px`,
                      height: `${2 + Math.random() * 2}px`,
                      animation: `milky-way-flow-smooth ${3.0 + i * 0.01}s linear infinite`,
                      animationDelay: `${i * 0.005}s`,
                      top: `calc(-20vh + ${Math.random() * 98}%)`,
                      left: `${Math.random() * 100}%`,
                      filter: "blur(0.5px)",
                      opacity: 0.4,
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* 魔法の粒子エフェクト */}
          <div className="absolute top-10 left-10 w-2 h-2 bg-yellow-300 rounded-full animate-bounce opacity-70"></div>
          <div className="absolute top-20 right-20 w-1 h-1 bg-pink-300 rounded-full animate-ping opacity-60"></div>
          <div className="absolute bottom-32 left-16 w-3 h-3 bg-blue-300 rounded-full animate-pulse opacity-50"></div>
          <div className="absolute bottom-40 right-32 w-2 h-2 bg-green-300 rounded-full animate-bounce opacity-60"></div>
          <div className="absolute top-1/3 left-1/4 w-1 h-1 bg-purple-300 rounded-full animate-ping opacity-40"></div>
          <div className="absolute top-2/3 right-1/3 w-2 h-2 bg-cyan-300 rounded-full animate-pulse opacity-50"></div>
        </div>

        {/* ヘッダー */}
        <header className="p-6 text-center relative z-10">
          {/* <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300 mb-4 drop-shadow-lg">
          ✨ 魔法の天秤 ✨
        </h1> */}
          <div className="text-lg text-purple-200 mb-2 font-serif italic">
            〜 Ancient Scale of Truth 〜
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="relative">
              <div
                className={`w-4 h-4 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"} animate-pulse`}
              ></div>
              <div className="absolute inset-0 rounded-full border-2 border-white opacity-50 animate-ping"></div>
            </div>
            <span className="text-purple-200 font-medium">
              {isConnected ? "✨ 魔法使い 接続中" : "❌ 魔法使い 未接続"}
            </span>
          </div>
        </header>

        {/* 魔法のカウントダウン表示 */}
        {isCountdownActive && countdown !== null && (
          <div className="fixed top-12 left-1/2 transform -translate-x-1/2 z-50">
            <div className="relative">
              {/* 魔法陣背景 */}
              <div className="absolute inset-0 animate-spin-slow">
                <div className="w-32 h-32 border-4 border-dashed border-yellow-300 rounded-full opacity-60"></div>
              </div>
              <div className="absolute inset-2 animate-reverse-spin">
                <div className="w-28 h-28 border-2 border-dotted border-pink-300 rounded-full opacity-40"></div>
              </div>

              {/* カウントダウン数字 */}
              <div
                className={`relative z-10 w-32 h-32 flex items-center justify-center text-8xl font-bold rounded-full border-4 transition-all duration-300 transform ${
                  countdown <= 10
                    ? "text-red-400 border-red-400 bg-red-900/20 animate-pulse scale-110 shadow-lg shadow-red-400/50"
                    : countdown <= 20
                      ? "text-orange-400 border-orange-400 bg-orange-900/20 scale-105 shadow-lg shadow-orange-400/50"
                      : "text-yellow-300 border-yellow-300 bg-yellow-900/20 shadow-lg shadow-yellow-300/50"
                }`}
              >
                <span className="drop-shadow-lg">{countdown}</span>
              </div>

              {/* 魔法のきらめき */}
              <div className="absolute -top-2 -right-2 text-yellow-300 text-2xl animate-bounce">
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
            /* 魔法の開始前画面 */
            <div className="max-w-lg w-full space-y-8 relative z-10">
              {/* 魔法の書物風枠 */}
              <div className="bg-gradient-to-br from-purple-900/80 to-indigo-900/80 backdrop-blur-sm rounded-2xl border-4 border-yellow-400/50 p-12 shadow-2xl shadow-purple-500/30">
                <div className="text-center">
                  <div className="text-6xl mb-8">✨</div>
                  <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-300 mb-6 font-serif">
                    魔法の天秤
                  </h2>

                  {/* テーマ表示（設定されている場合） */}
                  {debateTheme && (
                    <div className="mb-6 p-4 bg-purple-800/30 rounded-xl border border-purple-400/30">
                      <p className="text-purple-200 text-sm mb-2">
                        論争のテーマ:
                      </p>
                      <p className="text-white text-lg font-semibold">
                        "{debateTheme}"
                      </p>
                    </div>
                  )}

                  {/* 録音状態による表示切り替え */}
                  {themeRecordingPhase === "recording" ? (
                    <div className="space-y-4">
                      <div className="w-16 h-16 mx-auto bg-red-500 rounded-full animate-pulse flex items-center justify-center">
                        <div className="w-8 h-8 bg-white rounded-full"></div>
                      </div>
                      <p className="text-red-300 text-lg font-semibold">
                        🎤 録音中... {themeRecordingCountdown}秒
                      </p>
                      <p className="text-purple-200 text-sm">
                        テーマを話してください
                      </p>
                    </div>
                  ) : themeRecordingPhase === "processing" ? (
                    <div className="space-y-4">
                      <div className="w-16 h-16 mx-auto border-4 border-yellow-300 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-yellow-300 text-lg font-semibold">
                        🔮 精霊が囁きを集めています...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="text-8xl mb-4 animate-bounce">⌨️</div>
                      <p className="text-2xl font-bold text-yellow-300 mb-2">
                        {debateTheme ? "" : "スペースキーでテーマ入力"}
                      </p>
                      <p className="text-purple-200 text-sm italic">
                        {debateTheme
                          ? "〜 魔法の儀式を開始するのじゃ 〜"
                          : "〜 音声で論争のテーマを入力するのじゃ 〜"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ディベート中画面 */
            <div className="w-full max-w-6xl">
              {/* 立場表示エリア */}
              {session?.theme && (
                <div className="mb-8 relative z-10">
                  {/* テーマ表示 */}
                  {/* <div className="text-center mb-6">
                    <div className="inline-block bg-gradient-to-r from-purple-900/80 to-indigo-900/80 backdrop-blur-sm rounded-2xl border-2 border-yellow-400/50 px-6 py-4 shadow-xl shadow-purple-500/30">
                      <div className="text-purple-200 text-sm mb-2">
                        論争のテーマ
                      </div>
                      <div className="text-white text-lg font-semibold">
                        "{session.theme}"
                      </div>
                      {session.currentTurn > 0 && (
                        <div className="text-yellow-300 text-xs mt-2">
                          第{session.currentTurn}ターン進行中
                        </div>
                      )}
                    </div>
                  </div> */}

                  {/* 立場表示 */}
                  <div className="flex justify-between items-center max-w-4xl mx-auto">
                    {/* 月側（左側）の立場 */}
                    <div className="flex-1 text-center">
                      <div className="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 backdrop-blur-sm rounded-xl border-2 border-indigo-400/50 p-4 shadow-lg shadow-indigo-500/30">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <span className="text-2xl">🌙</span>
                          <span className="text-indigo-200 font-bold">
                            月側
                          </span>
                        </div>
                        <div className="text-white text-[30px] font-bold">
                          {session.positions?.left ||
                            getDebatePositions(session.theme).leftPosition}
                        </div>
                        {session?.state?.includes("LEFT") && (
                          <div className="mt-2 text-indigo-300 text-xs animate-pulse">
                            ✨ 発言中 ✨
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 中央の天秤アイコン */}
                    <div className="px-8">
                      <div className="text-4xl animate-pulse">⚖️</div>
                    </div>

                    {/* 太陽側（右側）の立場 */}
                    <div className="flex-1 text-center">
                      <div className="bg-gradient-to-r from-orange-900/60 to-yellow-900/60 backdrop-blur-sm rounded-xl border-2 border-yellow-400/50 p-4 shadow-lg shadow-yellow-500/30">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <span className="text-2xl">☀️</span>
                          <span className="text-yellow-200 font-bold">
                            太陽側
                          </span>
                        </div>
                        <div className="text-white text-[30px] font-bold">
                          {session.positions?.right ||
                            getDebatePositions(session.theme).rightPosition}
                        </div>
                        {session?.state?.includes("RIGHT") && (
                          <div className="mt-2 text-yellow-300 text-xs animate-pulse">
                            ✨ 発言中 ✨
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 魔法の天秤デバイス表示 */}
              <div className="relative mb-12">
                {/* 天秤周囲の魔法エフェクト */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* 大きな魔法円 */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-purple-400/20 rounded-full animate-spin-slow opacity-50"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-dashed border-blue-400/15 rounded-full animate-reverse-spin opacity-40"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-dotted border-yellow-400/20 rounded-full animate-spin-slow opacity-30"></div>

                  {/* 浮遊する魔法要素 */}
                  <div className="absolute top-20 left-20 w-2 h-2 bg-purple-400 rounded-full animate-bounce opacity-60 shadow-lg shadow-purple-400/50"></div>
                  <div className="absolute top-32 right-24 w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping opacity-50 shadow-lg shadow-blue-400/50"></div>
                  <div className="absolute bottom-24 left-32 w-2.5 h-2.5 bg-pink-400 rounded-full animate-pulse opacity-70 shadow-lg shadow-pink-400/50"></div>
                  <div className="absolute bottom-20 right-20 w-2 h-2 bg-yellow-400 rounded-full animate-bounce delay-500 opacity-60 shadow-lg shadow-yellow-400/50"></div>
                  <div className="absolute top-40 left-1/2 w-1.5 h-1.5 bg-green-400 rounded-full animate-ping delay-1000 opacity-50 shadow-lg shadow-green-400/50"></div>
                  <div className="absolute bottom-40 left-1/4 w-2 h-2 bg-cyan-400 rounded-full animate-pulse delay-1500 opacity-60 shadow-lg shadow-cyan-400/50"></div>
                  <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce delay-2000 opacity-50 shadow-lg shadow-red-400/50"></div>

                  {/* 魔法的なオーラ */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-radial from-purple-500/10 via-blue-500/5 to-transparent rounded-full animate-pulse"></div>
                </div>
                {/* 魔法の台座 */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    {/* メイン台座 */}
                    <div className="w-16 h-48 bg-gradient-to-t from-yellow-700 via-yellow-500 to-yellow-300 rounded-t-xl shadow-2xl border-4 border-yellow-400 relative overflow-hidden">
                      {/* 台座の装飾パターン */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-200/30 to-transparent animate-pulse"></div>
                      {/* 宝石装飾 */}
                      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
                      <div className="absolute top-12 left-2 w-2 h-2 bg-blue-500 rounded-full animate-bounce shadow-lg shadow-blue-500/50"></div>
                      <div className="absolute top-12 right-2 w-2 h-2 bg-green-500 rounded-full animate-bounce delay-300 shadow-lg shadow-green-500/50"></div>
                      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse delay-500 shadow-lg shadow-purple-500/50"></div>
                      <div className="absolute top-28 left-3 w-2 h-2 bg-cyan-500 rounded-full animate-bounce delay-700 shadow-lg shadow-cyan-500/50"></div>
                      <div className="absolute top-28 right-3 w-2 h-2 bg-pink-500 rounded-full animate-bounce delay-1000 shadow-lg shadow-pink-500/50"></div>
                      {/* 古代文字風の装飾 */}
                      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-yellow-200 text-xs opacity-70">
                        ⚡
                      </div>
                      <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 text-yellow-200 text-xs opacity-70">
                        ⭐
                      </div>
                    </div>

                    {/* 台座ベース */}
                    <div className="absolute -bottom-3 -left-6 -right-6 h-8 bg-gradient-to-r from-yellow-800 via-yellow-600 to-yellow-800 rounded-xl border-4 border-yellow-500 shadow-xl">
                      {/* ベースの装飾 */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-300/20 to-transparent animate-pulse rounded-xl"></div>
                      <div className="absolute top-1 left-4 w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></div>
                      <div className="absolute top-1 right-4 w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse delay-500"></div>
                    </div>

                    {/* 魔法の光環 */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-20 h-20 bg-yellow-300 opacity-15 rounded-full blur-2xl animate-pulse"></div>
                    <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-16 h-16 bg-white opacity-10 rounded-full blur-xl animate-pulse delay-1000"></div>

                    {/* 浮遊する魔法粒子 */}
                    <div className="absolute -top-4 -left-4 w-1 h-1 bg-yellow-300 rounded-full animate-ping opacity-70"></div>
                    <div className="absolute -top-2 right-2 w-1 h-1 bg-pink-300 rounded-full animate-ping delay-500 opacity-70"></div>
                    <div className="absolute top-8 -right-6 w-1 h-1 bg-blue-300 rounded-full animate-ping delay-1000 opacity-70"></div>
                    <div className="absolute top-16 -left-6 w-1 h-1 bg-green-300 rounded-full animate-ping delay-1500 opacity-70"></div>
                  </div>
                </div>

                {/* 判定中のローディングメッセージ */}
                {isJudging && (
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="bg-gradient-to-r from-purple-800/90 via-blue-800/90 to-indigo-800/90 backdrop-blur-md rounded-full border border-purple-300/50 px-4 py-2 shadow-lg">
                      <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300 animate-pulse text-center whitespace-nowrap">
                        {judgingMessage || "賢者が判定中..."}
                      </p>
                      <div className="flex justify-center space-x-1 mt-1">
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-150"></div>
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-300"></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 魔法の天秤アーム */}
                <div
                  className="relative flex justify-center"
                  style={{
                    transform: `rotate(${scaleRotation}deg)`,
                    animation:
                      isJudging && !verdict
                        ? "judgmentSpin 3s ease-in-out infinite"
                        : undefined,
                    transition: isSessionFinished
                      ? "transform 3s ease-in-out"
                      : showFinalResult
                        ? "transform 2s ease-out"
                        : "transform 0.7s ease-in-out",
                  }}
                >
                  {/* メインアーム */}
                  <div
                    className={`w-96 h-4 bg-gradient-to-r from-gray-600 via-gray-200 to-gray-600 rounded-full shadow-2xl border-2 border-gray-400 relative ${
                      isJudging && !verdict ? "animate-pulse" : ""
                    }`}
                  >
                    {/* アームの装飾パターン */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>

                    {/* 中央の装飾 */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full border-2 border-yellow-300 shadow-lg">
                      <div className="absolute inset-1 bg-gradient-to-r from-yellow-300 to-yellow-400 rounded-full animate-pulse"></div>
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
                    </div>

                    {/* アーム両端の装飾 */}
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full border border-blue-300 animate-pulse delay-300"></div>
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-gradient-to-r from-red-400 to-pink-500 rounded-full border border-red-300 animate-pulse delay-700"></div>

                    {/* 装飾的な刻印 */}
                    <div className="absolute left-16 top-1/2 transform -translate-y-1/2 text-gray-600 text-xs opacity-60">
                      ⚡
                    </div>
                    <div className="absolute right-16 top-1/2 transform -translate-y-1/2 text-gray-600 text-xs opacity-60">
                      ⚡
                    </div>
                    <div className="absolute left-32 top-1/2 transform -translate-y-1/2 text-gray-600 text-xs opacity-60">
                      ✦
                    </div>
                    <div className="absolute right-32 top-1/2 transform -translate-y-1/2 text-gray-600 text-xs opacity-60">
                      ✦
                    </div>
                  </div>

                  {/* 左側のチェーンと皿 */}
                  <div className="absolute left-[353px] top-2">
                    {/* チェーン */}
                    <div className="w-0.5 h-8 bg-gradient-to-b from-gray-400 to-gray-600 mx-auto"></div>
                    {/* 左の魔法皿 */}
                    <div
                      className={`${getPlateSize("LEFT")} bg-gradient-to-br from-indigo-500/40 to-purple-600/40 border-4 border-indigo-400 rounded-full flex items-center justify-center transition-all duration-300 ${getPlateEffects("LEFT")} ${session?.state?.includes("LEFT") ? "animate-pulse shadow-2xl shadow-indigo-400/70" : "shadow-xl shadow-indigo-400/30"} backdrop-blur-sm relative`}
                    >
                      {/* 皿の装飾背景 */}
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-300/20 to-purple-500/20 rounded-full animate-pulse"></div>

                      {/* 外側の魔法のルーン */}
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-300 opacity-70 animate-spin-slow"></div>
                      <div className="absolute inset-2 rounded-full border-2 border-dotted border-purple-300 opacity-50 animate-reverse-spin"></div>

                      {/* 装飾的な宝石 */}
                      <div className="absolute -top-1 left-1/4 w-2 h-2 bg-indigo-600 rounded-full animate-pulse shadow-lg shadow-indigo-600/50"></div>
                      <div className="absolute -right-1 top-1/4 w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce shadow-lg shadow-purple-500/50"></div>
                      <div className="absolute -bottom-1 right-1/4 w-2 h-2 bg-indigo-700 rounded-full animate-pulse delay-500 shadow-lg shadow-indigo-700/50"></div>
                      <div className="absolute -left-1 bottom-1/4 w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce delay-700 shadow-lg shadow-purple-600/50"></div>

                      {/* メインシンボル */}
                      <span
                        className={`text-indigo-200 font-bold ${getPlateTextSize("LEFT")} drop-shadow-2xl relative z-10`}
                      >
                        🌙
                      </span>

                      {/* アクティブ時の追加エフェクト */}
                      {session?.state?.includes("LEFT") && (
                        <>
                          <div className="absolute -top-2 -right-2 text-indigo-300 text-lg animate-bounce">
                            ✨
                          </div>
                          <div className="absolute -bottom-2 -left-2 text-purple-300 text-sm animate-pulse">
                            ⭐
                          </div>
                          <div className="absolute top-1/4 -left-3 text-indigo-200 text-xs animate-ping">
                            💫
                          </div>
                          <div className="absolute bottom-1/4 -right-3 text-purple-200 text-xs animate-ping delay-500">
                            ✦
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 右側のチェーンと皿 */}
                  <div className="absolute right-[353px] top-2">
                    {/* チェーン */}
                    <div className="w-0.5 h-8 bg-gradient-to-b from-gray-400 to-gray-600 mx-auto"></div>
                    {/* 右の魔法皿 */}
                    <div
                      className={`${getPlateSize("RIGHT")} bg-gradient-to-br from-yellow-500/40 to-orange-600/40 border-4 border-yellow-400 rounded-full flex items-center justify-center transition-all duration-300 ${getPlateEffects("RIGHT")} ${session?.state?.includes("RIGHT") ? "animate-pulse shadow-2xl shadow-yellow-400/70" : "shadow-xl shadow-yellow-400/30"} backdrop-blur-sm relative`}
                    >
                      {/* 皿の装飾背景 */}
                      <div className="absolute inset-0 bg-gradient-to-br from-yellow-300/20 to-orange-500/20 rounded-full animate-pulse"></div>

                      {/* 外側の魔法のルーン */}
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-yellow-300 opacity-70 animate-reverse-spin"></div>
                      <div className="absolute inset-2 rounded-full border-2 border-dotted border-orange-300 opacity-50 animate-spin-slow"></div>

                      {/* 装飾的な宝石 */}
                      <div className="absolute -top-1 right-1/4 w-2 h-2 bg-yellow-600 rounded-full animate-pulse shadow-lg shadow-yellow-600/50"></div>
                      <div className="absolute -left-1 top-1/4 w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce shadow-lg shadow-orange-500/50"></div>
                      <div className="absolute -bottom-1 left-1/4 w-2 h-2 bg-yellow-700 rounded-full animate-pulse delay-500 shadow-lg shadow-yellow-700/50"></div>
                      <div className="absolute -right-1 bottom-1/4 w-1.5 h-1.5 bg-orange-600 rounded-full animate-bounce delay-700 shadow-lg shadow-orange-600/50"></div>

                      {/* メインシンボル */}
                      <span
                        className={`text-yellow-200 font-bold ${getPlateTextSize("RIGHT")} drop-shadow-2xl relative z-10`}
                      >
                        ☀️
                      </span>

                      {/* アクティブ時の追加エフェクト */}
                      {session?.state?.includes("RIGHT") && (
                        <>
                          <div className="absolute -top-2 -left-2 text-yellow-300 text-lg animate-bounce">
                            ✨
                          </div>
                          <div className="absolute -bottom-2 -right-2 text-orange-300 text-sm animate-pulse">
                            ⭐
                          </div>
                          <div className="absolute top-1/4 -right-3 text-yellow-200 text-xs animate-ping">
                            💫
                          </div>
                          <div className="absolute bottom-1/4 -left-3 text-orange-200 text-xs animate-ping delay-500">
                            ✦
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 魔法のスコア表示 */}
                <div className="text-center mt-12">
                  <div className="text-purple-200 text-lg mb-4 font-serif italic">
                    魔法の天秤の示し
                  </div>
                  <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300 drop-shadow-lg">
                    {isSessionFinished ? (
                      // セッション終了後の表示
                      <>
                        ⚖️ 議論終了
                        {/* <div className="text-lg mt-2 text-purple-300">
                          〜 真実の探求完了 〜
                        </div> */}
                      </>
                    ) : verdict && showFinalResult ? (
                      // 最終判定後の表示（1秒遅延後）
                      verdict.winner === "RIGHT" ? (
                        <>
                          ☀️ 太陽の勝利
                          <div className="text-lg mt-2 text-yellow-300">
                            〜 最終判定 〜
                          </div>
                        </>
                      ) : (
                        <>
                          🌙 月の勝利
                          <div className="text-lg mt-2 text-blue-300">
                            〜 最終判定 〜
                          </div>
                        </>
                      )
                    ) : (
                      // 通常時の表示
                      <>
                        {currentScore > 0
                          ? "☀️ 太陽の勝利"
                          : currentScore < 0
                            ? "🌙 月の勝利"
                            : "⚖️ 均衡"}
                        {currentScore !== 0 && (
                          <span className="text-2xl ml-2 text-purple-200">
                            ({Math.abs(currentScore * 100).toFixed(0)}%)
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* 魔法のターン評価詳細 */}
                  {Object.keys(turnResults).length > 0 && (
                    <div className="mt-6 text-sm text-purple-200">
                      {/* <div className="text-center mb-3 text-purple-300 font-serif italic">
                        〜 各章の記録 〜
                      </div> */}
                      <div className="flex justify-center space-x-6">
                        {Object.entries(turnResults).map(
                          ([turnIndex, score]) => (
                            <div key={turnIndex} className="text-center">
                              <div className="text-xs text-gradient-gem mb-1 drop-shadow-gem">
                                第{turnIndex}章
                              </div>
                              <div
                                className={`text-lg font-bold ${
                                  score > 0
                                    ? "text-gradient-silver drop-shadow-silver"
                                    : score < 0
                                      ? "text-gradient-gold drop-shadow-gold"
                                      : "text-gradient-gem drop-shadow-gem"
                                }`}
                              >
                                {score > 0 ? "☀️" : score < 0 ? "🌙" : "⚖️"}
                                <div className="text-xs">
                                  ({(score * 100).toFixed(0)})
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* 最終判定の理由 */}
                  {verdict && showFinalResult && (
                    <div className="mt-6 text-sm text-purple-200">
                      {/* <div className="text-center mb-3 text-purple-300 font-serif italic">
                        〜 賢者の託宣 〜
                      </div> */}
                      {/* <div className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 backdrop-blur-sm rounded-xl border border-purple-400/30 p-4 mx-auto max-w-lg">
                        <p className="text-center leading-relaxed">
                          {verdict.rationale}
                        </p>
                      </div> */}
                    </div>
                  )}
                </div>
              </div>

              {/* 魔法の字幕エリア */}
              <div className="bg-gradient-to-br from-purple-900/80 to-indigo-900/80 backdrop-blur-sm rounded-2xl border-2 border-purple-400/30 p-8 mb-8 shadow-2xl shadow-purple-500/20 relative overflow-hidden">
                {/* 魔法のオーラエフェクト */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent animate-pulse"></div>

                <div className="text-center relative z-10">
                  <div className="text-purple-300 text-lg mb-4 font-serif italic flex items-center justify-center gap-2">
                    <span>✨</span>
                    <span>〜 魔法使いの託宣 〜</span>
                    <span>✨</span>
                  </div>
                  <div className="text-3xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300 font-bold leading-relaxed magic-subtitle">
                    {aiSubtitle}
                  </div>
                </div>
              </div>

              {/* 魔法の録音状態表示 */}
              <div className="flex justify-center space-x-6">
                <div className="h-[5rem]"></div>
                {/* <div className="relative"> */}
                {/* <div
                  className={`
                    w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold transition-all relative overflow-hidden
                    ${
                      isRecordingAudio
                        ? "bg-gradient-to-br from-red-500 to-pink-500 animate-pulse shadow-lg shadow-red-500/50"
                        : "bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg"
                    }
                  `}
                >
                  <span className="relative z-10">🎤</span>
                  {isRecordingAudio && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-sweep"></div>
                      <div className="absolute -inset-2 border-4 border-red-400/50 rounded-full animate-ping"></div>
                    </>
                  )}
                </div> */}
                {/* </div> */}

                {/* 録音状態表示 */}
                {isRecordingAudio && (
                  <div className="flex items-center space-x-3">
                    <div className="text-red-300 text-lg font-bold animate-pulse">
                      🔴 魔法の記録中
                    </div>
                    <div className="flex space-x-1">
                      <div className="w-2 h-8 bg-red-400 rounded animate-bounce"></div>
                      <div
                        className="w-2 h-6 bg-red-400 rounded animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-10 bg-red-400 rounded animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <div
                        className="w-2 h-7 bg-red-400 rounded animate-bounce"
                        style={{ animationDelay: "0.3s" }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* セッション情報 */}
              {session && (
                <div className="mt-8 text-center text-purple-200 text-sm">
                  <div className="mb-2">📜 論争の書: {session.theme}</div>
                  <div className="flex items-center justify-center gap-4 text-xs">
                    <span>状態: {session.state}</span>
                    <span>|</span>
                    <span>章: {session.currentTurn || 0}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* エラー表示 */}
        {error && (
          <div className="fixed bottom-4 left-4 right-4 p-4 bg-gradient-to-r from-red-900/90 to-pink-900/90 backdrop-blur-sm text-white rounded-xl border-2 border-red-400/50 shadow-lg">
            <div className="text-center">
              <strong>🚨 魔法の障害:</strong> {error}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
