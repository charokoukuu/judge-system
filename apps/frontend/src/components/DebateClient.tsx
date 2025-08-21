"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useDebateWebSocket } from "../hooks/useDebateWebSocket";
import Link from "next/link";

export default function DebateClient() {
  const searchParams = useSearchParams();
  const {
    isConnected,
    session,
    messages,
    error,
    isLoading,
    isJudging,
    judgingMessage,
    createSession,
    joinSession,
    startSession,
    sendText,
    disconnect,
    clearError,
  } = useDebateWebSocket();

  const [sessionTheme, setSessionTheme] = useState("");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [textInput, setTextInput] = useState("");

  // URLパラメータから自動実行
  useEffect(() => {
    const createSessionParam = searchParams.get("createSession");
    const joinSessionParam = searchParams.get("joinSession");

    if (createSessionParam && isConnected && !session) {
      setSessionTheme(createSessionParam);
      createSession(createSessionParam);
    } else if (joinSessionParam && isConnected && !session) {
      setJoinSessionId(joinSessionParam);
      joinSession(joinSessionParam);
    }
  }, [searchParams, isConnected, session, createSession, joinSession]);

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionTheme.trim()) {
      createSession(sessionTheme.trim());
    }
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinSessionId.trim()) {
      joinSession(joinSessionId.trim());
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      sendText(textInput.trim());
      setTextInput("");
    }
  };

  const isParticipant = session?.role === "participant";
  const isModerator = session?.role === "moderator";
  const canSpeak =
    isParticipant &&
    ((session?.state?.includes("RIGHT") && session?.side === "RIGHT") ||
      (session?.state?.includes("LEFT") && session?.side === "LEFT"));

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">リアルタイムディベートシステム</h1>
          <Link
            href="/lobby"
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            ロビーに戻る
          </Link>
        </div>

        {/* 接続状態 */}
        <div className="mb-4 p-3 rounded-lg bg-white shadow">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            ></div>
            <span className="font-medium">
              {isConnected ? "サーバーに接続中" : "サーバーに未接続"}
            </span>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <div className="flex justify-between items-center">
              <span>{error}</span>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700 font-bold"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* セッション情報 */}
        {session ? (
          <div className="mb-6 p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold mb-2">セッション情報</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">セッションID:</span>
                <span className="ml-2 font-mono text-xs">
                  {session.sessionId}
                </span>
              </div>
              <div>
                <span className="font-medium">テーマ:</span>
                <span className="ml-2">{session.theme}</span>
              </div>
              <div>
                <span className="font-medium">役割:</span>
                <span className="ml-2">
                  {isModerator
                    ? "モデレーター"
                    : `参加者 (${session.side === "RIGHT" ? "右サイド" : "左サイド"})`}
                </span>
              </div>
              <div>
                <span className="font-medium">状態:</span>
                <span className="ml-2">{session.state}</span>
              </div>
              <div>
                <span className="font-medium">現在のターン:</span>
                <span className="ml-2">{session.currentTurn || 0}</span>
              </div>
              <div>
                <span className="font-medium">参加者数:</span>
                <span className="ml-2">{session.participantCount}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {isModerator && (
                <button
                  onClick={startSession}
                  disabled={session.state !== "IDLE"}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  セッション開始
                </button>
              )}
              {/* デバッグ用ローディングテストボタン */}
              <button
                onClick={() => {
                  console.log("Debug: Force toggling isJudging");
                  console.log("Current isJudging:", isJudging);
                }}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
              >
                ローディング状態: {isJudging ? "ON" : "OFF"}
              </button>
              <button
                onClick={disconnect}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                セッション退出
              </button>
            </div>
          </div>
        ) : (
          /* セッション作成・参加フォーム */
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* セッション作成 */}
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">新しいセッションを作成</h2>
              <form onSubmit={handleCreateSession} className="space-y-3">
                <div>
                  <label
                    htmlFor="theme"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    ディベートテーマ
                  </label>
                  <input
                    type="text"
                    id="theme"
                    value={sessionTheme}
                    onChange={(e) => setSessionTheme(e.target.value)}
                    placeholder="例: AIの進歩は人類にとって良いことか"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={!isConnected || isLoading}
                  className="w-full py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isLoading ? "作成中..." : "セッション作成"}
                </button>
              </form>
            </div>

            {/* セッション参加 */}
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">既存のセッションに参加</h2>
              <form onSubmit={handleJoinSession} className="space-y-3">
                <div>
                  <label
                    htmlFor="sessionId"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    セッションID
                  </label>
                  <input
                    type="text"
                    id="sessionId"
                    value={joinSessionId}
                    onChange={(e) => setJoinSessionId(e.target.value)}
                    placeholder="セッションIDを入力"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={!isConnected || isLoading}
                  className="w-full py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isLoading ? "参加中..." : "セッション参加"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* メッセージ表示エリア */}
        <div className="mb-6 p-4 bg-white rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">
            メッセージ
            {/* デバッグ用 */}
            <span className="text-sm text-gray-500 ml-2">
              (ローディング状態: {isJudging ? "ON" : "OFF"})
            </span>
          </h2>
          <div className="h-96 overflow-y-auto border border-gray-200 rounded-md p-3 space-y-2">
            {/* 判定中のローディングアニメーション */}
            {isJudging && (
              <div className="relative p-6 mb-4 rounded-lg bg-gradient-to-r from-purple-100 via-blue-100 to-indigo-100 border-2 border-purple-300">
                <div className="text-center">
                  <div className="relative inline-block">
                    {/* 魔法の天秤アニメーション */}
                    <div className="flex items-center justify-center mb-4">
                      <div className="relative">
                        <div className="animate-spin-slow">⚖️</div>
                        <div className="absolute -top-2 -right-2 animate-bounce">
                          ✨
                        </div>
                        <div className="absolute -bottom-2 -left-2 animate-bounce delay-150">
                          🔮
                        </div>
                      </div>
                    </div>

                    {/* パーティクルエフェクト */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className="absolute top-2 left-4 animate-ping delay-75">
                        ⭐
                      </div>
                      <div className="absolute top-8 right-6 animate-ping delay-150">
                        ✨
                      </div>
                      <div className="absolute bottom-4 left-8 animate-ping delay-300">
                        🌟
                      </div>
                      <div className="absolute bottom-8 right-4 animate-ping delay-450">
                        💫
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-lg font-bold text-purple-800 animate-pulse">
                      {judgingMessage || "賢者が最終判定を下しています..."}
                    </p>
                    <div className="flex justify-center space-x-1">
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-150"></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-300"></div>
                    </div>
                    <p className="text-sm text-purple-600 italic">
                      知恵の結晶が形作られています 🔮✨
                    </p>
                  </div>
                </div>
              </div>
            )}

            {messages.length === 0 ? (
              <p className="text-gray-500 text-center">
                メッセージはありません
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-2 rounded-md ${
                    message.type === "system"
                      ? "bg-blue-100 text-blue-800"
                      : message.type === "moderator"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm">{message.text}</p>
                    </div>
                    <span className="text-xs text-gray-500 ml-2">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* テキスト入力エリア（参加者のみ、自分のターンの時のみ） */}
        {isParticipant && (
          <div className="p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">発話入力</h2>
            <form onSubmit={handleSendText} className="space-y-3">
              <div>
                <label
                  htmlFor="textInput"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  あなたの発言
                </label>
                <textarea
                  id="textInput"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={
                    canSpeak
                      ? "発言を入力してください..."
                      : "現在はあなたの発話ターンではありません"
                  }
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  disabled={!canSpeak}
                />
              </div>
              <button
                type="submit"
                disabled={!canSpeak || !textInput.trim()}
                className="w-full py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {canSpeak ? "発言を送信" : "発話ターンではありません"}
              </button>
            </form>

            {session?.side && (
              <div className="mt-2 text-sm text-gray-600">
                あなたは
                <strong>
                  {session.side === "RIGHT" ? "右サイド" : "左サイド"}
                </strong>
                の参加者です
                {canSpeak && (
                  <span className="text-green-600 font-medium ml-2">
                    （発話可能）
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
