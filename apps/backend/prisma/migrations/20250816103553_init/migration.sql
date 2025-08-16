-- CreateEnum
CREATE TYPE "public"."Side" AS ENUM ('RIGHT', 'LEFT');

-- CreateEnum
CREATE TYPE "public"."SessionState" AS ENUM ('IDLE', 'READY', 'TURN1_RIGHT', 'TURN1_LEFT', 'TURN1_WRAPUP', 'TURN2_RIGHT', 'TURN2_LEFT', 'TURN2_WRAPUP', 'FINAL_RIGHT', 'FINAL_LEFT', 'FINAL_WRAPUP', 'JUDGING', 'VERDICT', 'FINISHED');

-- CreateEnum
CREATE TYPE "public"."Winner" AS ENUM ('RIGHT', 'LEFT');

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "state" "public"."SessionState" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Utterance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "side" "public"."Side" NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utterance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TurnResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "scoresJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Verdict" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "winner" "public"."Winner" NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIResponse" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_state_idx" ON "public"."Session"("state");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "public"."Session"("createdAt");

-- CreateIndex
CREATE INDEX "Utterance_sessionId_turnIndex_idx" ON "public"."Utterance"("sessionId", "turnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Utterance_sessionId_turnIndex_side_key" ON "public"."Utterance"("sessionId", "turnIndex", "side");

-- CreateIndex
CREATE INDEX "TurnResult_sessionId_turnIndex_idx" ON "public"."TurnResult"("sessionId", "turnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TurnResult_sessionId_turnIndex_key" ON "public"."TurnResult"("sessionId", "turnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Verdict_sessionId_key" ON "public"."Verdict"("sessionId");

-- CreateIndex
CREATE INDEX "AIResponse_sessionId_createdAt_idx" ON "public"."AIResponse"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AIResponse_sessionId_turnIndex_idx" ON "public"."AIResponse"("sessionId", "turnIndex");

-- AddForeignKey
ALTER TABLE "public"."Utterance" ADD CONSTRAINT "Utterance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TurnResult" ADD CONSTRAINT "TurnResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Verdict" ADD CONSTRAINT "Verdict_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIResponse" ADD CONSTRAINT "AIResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
