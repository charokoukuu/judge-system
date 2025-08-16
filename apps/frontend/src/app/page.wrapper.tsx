"use client";

import { Suspense } from "react";
import DebateClient from "../components/DebateClient";

function DebateClientWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <DebateClient />
    </Suspense>
  );
}

export default function Home() {
  return <DebateClientWrapper />;
}
