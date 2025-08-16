"use client";

import { Suspense } from "react";
import DebateScaleInterface from "../components/DebateScaleInterface";

function DebateScaleWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-900 to-purple-900">
          <div className="text-white text-xl">Loading...</div>
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
