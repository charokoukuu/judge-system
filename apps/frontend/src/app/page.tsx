"use client";

import { Suspense } from "react";
import DebateScaleInterface from "../components/DebateScaleInterface";

function DebateScaleWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-900 via-purple-900 to-violet-900 relative overflow-hidden">
          {/* 魔法的な背景エフェクト */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(white_1px,transparent_1px)] bg-[length:50px_50px] opacity-20 animate-pulse"></div>
            <div className="absolute top-20 left-20 w-3 h-3 bg-yellow-300 rounded-full animate-bounce opacity-60"></div>
            <div className="absolute top-32 right-32 w-2 h-2 bg-pink-300 rounded-full animate-ping opacity-50"></div>
            <div className="absolute bottom-40 left-24 w-4 h-4 bg-blue-300 rounded-full animate-pulse opacity-40"></div>
          </div>

          <div className="text-center relative z-10">
            <div className="text-6xl mb-6">✨</div>
            <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300 mb-4">
              魔法の天秤
            </div>
            <div className="text-purple-200 text-lg font-serif italic animate-pulse">
              〜 召喚の儀式を執行中 〜
            </div>

            {/* 魔法陣ローディング */}
            <div className="relative mt-8">
              <div className="w-16 h-16 border-4 border-dashed border-yellow-300 rounded-full animate-spin-slow opacity-60"></div>
              <div className="absolute inset-2 w-12 h-12 border-2 border-dotted border-pink-300 rounded-full animate-reverse-spin opacity-40"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      }
    >
      <DebateScaleInterface />
    </Suspense>
  );
}

export default function Home() {
  return <DebateScaleWrapper />;
}
