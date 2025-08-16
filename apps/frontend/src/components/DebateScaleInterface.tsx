"use client";

import { useState, useEffect } from "react";
import { useDebateWebSocket } from "../hooks/useDebateWebSocket";

export default function DebateScaleInterface() {
  const [debateTheme, setDebateTheme] = useState("");
  const [isDebateStarted, setIsDebateStarted] = useState(false);
  const [currentScore, setCurrentScore] = useState(0); // -1 to 1, 左(-1) ← → 右(1)
  const [aiSubtitle, setAiSubtitle] = useState("AIジャッジの準備ができました");
  const [isRecording, setIsRecording] = useState(false);

  const {
    isConnected,
    session,
    messages,
    error,
    createSession,
    startSession,
  } = useDebateWebSocket();

  // AIメッセージを字幕として表示
  useEffect(() => {
    const latestAiMessage = messages
      .filter(msg => msg.type === "system" || msg.type === "moderator")
      .slice(-1)[0];
    
    if (latestAiMessage) {
      setAiSubtitle(latestAiMessage.text);
    }
  }, [messages]);

  // セッション状態に応じてスコア更新（仮実装）
  useEffect(() => {
    if (session?.state?.includes("RIGHT")) {
      setCurrentScore(0.3); // 右に傾く
    } else if (session?.state?.includes("LEFT")) {
      setCurrentScore(-0.3); // 左に傾く
    } else {
      setCurrentScore(0); // 中央
    }
  }, [session?.state]);

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
    setIsRecording(!isRecording);
    // TODO: 実際の録音開始/停止処理
  };

  // 天秤の傾きを計算（-45度から+45度）
  const scaleRotation = currentScore * 45;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-purple-900 flex flex-col">
      {/* ヘッダー */}
      <header className="p-6 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">
          AI審判官ディベートシステム
        </h1>
        <div className="flex items-center justify-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}></div>
          <span className="text-white/80">
            {isConnected ? "AI審判官 接続中" : "AI審判官 未接続"}
          </span>
        </div>
      </header>

      {/* メインコンテンツエリア */}
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
                  <div className="absolute -left-4 -top-8 w-16 h-16 bg-red-500/20 border-4 border-red-500 rounded-full flex items-center justify-center">
                    <span className="text-red-500 font-bold text-lg">左</span>
                  </div>
                  
                  {/* 右の皿 */}
                  <div className="absolute -right-4 -top-8 w-16 h-16 bg-blue-500/20 border-4 border-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-blue-500 font-bold text-lg">右</span>
                  </div>
                </div>
              </div>
              
              {/* スコア表示 */}
              <div className="text-center mt-8">
                <div className="text-white/60 text-sm mb-2">現在のスコア</div>
                <div className="text-2xl font-bold text-white">
                  {currentScore > 0 ? "右優勢" : currentScore < 0 ? "左優勢" : "互角"}
                  {currentScore !== 0 && (
                    <span className="text-lg ml-2">
                      ({Math.abs(currentScore * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* AI字幕エリア */}
            <div className="bg-black/30 backdrop-blur-sm rounded-lg p-6 mb-8">
              <div className="text-center">
                <div className="text-white/60 text-sm mb-2">AI審判官からのメッセージ</div>
                <div className="text-xl text-white font-medium leading-relaxed">
                  {aiSubtitle}
                </div>
              </div>
            </div>

            {/* 音声入力コントロール */}
            <div className="flex justify-center space-x-6">
              <button
                onClick={handleMicToggle}
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold transition-all
                  ${isRecording 
                    ? "bg-red-500 hover:bg-red-600 animate-pulse" 
                    : "bg-gray-600 hover:bg-gray-700"
                  }
                `}
              >
                🎤
              </button>
              
              {/* 録音状態表示 */}
              {isRecording && (
                <div className="flex items-center space-x-2">
                  <div className="text-white text-sm">🔴 録音中</div>
                </div>
              )}
            </div>

            {/* セッション情報 */}
            {session && (
              <div className="mt-8 text-center text-white/60 text-sm">
                <div>テーマ: {session.theme}</div>
                <div>状態: {session.state} | ターン: {session.currentTurn || 0}</div>
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
