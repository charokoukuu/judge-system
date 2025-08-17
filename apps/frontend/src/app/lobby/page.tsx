"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ActiveSession {
  sessionId: string;
  theme: string;
  state: string;
  participantCount: number;
  createdAt: string;
}

export default function LobbyPage() {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [newSessionTheme, setNewSessionTheme] = useState("");

  // デモ用のアクティブセッション（実際はAPIから取得）
  useEffect(() => {
    // TODO: バックエンドからアクティブセッション一覧を取得
    const demoSessions: ActiveSession[] = [
      {
        sessionId: "session_demo_1",
        theme: "AIの進歩は人類にとって良いことか",
        state: "READY",
        participantCount: 2,
        createdAt: new Date().toISOString(),
      },
      {
        sessionId: "session_demo_2",
        theme: "リモートワークは生産性を向上させるか",
        state: "TURN1_RIGHT",
        participantCount: 3,
        createdAt: new Date(Date.now() - 100000).toISOString(),
      },
    ];
    setActiveSessions(demoSessions);
  }, []);

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSessionTheme.trim()) {
      // 新しいセッションを作成してそのページに移動
      window.location.href = `/?createSession=${encodeURIComponent(newSessionTheme)}`;
    }
  };

  const getStateText = (state: string) => {
    switch (state) {
      case "IDLE":
        return "開始待ち";
      case "READY":
        return "準備完了";
      case "TURN1_RIGHT":
        return "第1ターン（右）";
      case "TURN1_LEFT":
        return "第1ターン（左）";
      case "TURN2_RIGHT":
        return "第2ターン（右）";
      case "TURN2_LEFT":
        return "第2ターン（左）";
      case "FINAL_RIGHT":
        return "最終弁論（右）";
      case "FINAL_LEFT":
        return "最終弁論（左）";
      case "JUDGING":
        return "判定中";
      case "VERDICT":
        return "結果発表";
      case "FINISHED":
        return "終了";
      default:
        return state;
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case "IDLE":
      case "READY":
        return "bg-blue-100 text-blue-800";
      case "TURN1_RIGHT":
      case "TURN1_LEFT":
      case "TURN2_RIGHT":
      case "TURN2_LEFT":
      case "FINAL_RIGHT":
      case "FINAL_LEFT":
        return "bg-green-100 text-green-800";
      case "JUDGING":
        return "bg-yellow-100 text-yellow-800";
      case "VERDICT":
        return "bg-purple-100 text-purple-800";
      case "FINISHED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2">
            リアルタイムディベート ロビー
          </h1>
          <p className="text-center text-gray-600">
            セッションを作成するか、既存のセッションに参加してください
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 新しいセッション作成 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">新しいセッションを作成</h2>
              <form onSubmit={handleCreateSession} className="space-y-4">
                <div>
                  <label
                    htmlFor="theme"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    ディベートテーマ
                  </label>
                  <textarea
                    id="theme"
                    value={newSessionTheme}
                    onChange={(e) => setNewSessionTheme(e.target.value)}
                    placeholder="例: AIの進歩は人類にとって良いことか"
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-green-500 text-white rounded-md hover:bg-green-600 font-medium"
                >
                  セッション作成
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <Link
                  href="/"
                  className="block w-full py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-center font-medium"
                >
                  メインページに戻る
                </Link>
              </div>
            </div>
          </div>

          {/* アクティブセッション一覧 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">
                アクティブセッション
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({activeSessions.length}件)
                </span>
              </h2>

              {activeSessions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>現在アクティブなセッションはありません</p>
                  <p className="text-sm mt-2">
                    新しいセッションを作成してみてください
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeSessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-lg mb-1">
                            {session.theme}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>参加者: {session.participantCount}人</span>
                            <span>
                              作成:{" "}
                              {new Date(session.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStateColor(session.state)}`}
                        >
                          {getStateText(session.state)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {session.sessionId}
                        </code>
                        <Link
                          href={`/?joinSession=${session.sessionId}`}
                          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium"
                        >
                          参加
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 使い方 */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">使い方</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-medium mb-2">モデレーター（司会者）として</h3>
              <ol className="list-decimal list-inside space-y-1 text-gray-600">
                <li>新しいセッションを作成</li>
                <li>参加者が揃うのを待つ</li>
                <li>セッションを開始</li>
                <li>ディベートの進行を見守る</li>
              </ol>
            </div>
            <div>
              <h3 className="font-medium mb-2">参加者として</h3>
              <ol className="list-decimal list-inside space-y-1 text-gray-600">
                <li>既存のセッションに参加</li>
                <li>右サイドまたは左サイドに配属</li>
                <li>自分のターンで発言</li>
                <li>判定結果を確認</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
