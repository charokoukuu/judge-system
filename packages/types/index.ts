// -----------------------------
// Enums and Constant Types
// -----------------------------

export enum DebateState {
  IDLE = 'IDLE',
  CONFIGURING = 'CONFIGURING',
  RIGHT_SPEAKING = 'RIGHT_SPEAKING',
  LEFT_SPEAKING = 'LEFT_SPEAKING',
  TURN_WRAPUP = 'TURN_WRAPUP',
  FINAL_RIGHT = 'FINAL_RIGHT',
  FINAL_LEFT = 'FINAL_LEFT',
  JUDGING = 'JUDGING',
  VERDICT = 'VERDICT',
}

export enum ParticipantRole {
  RIGHT = 'Right',
  LEFT = 'Left',
  MODERATOR = 'Moderator',
}

export const ScoreCategories = [
  'logic',
  'evidence',
  'rebuttal',
  'consistency',
  'clarity',
  'factuality',
] as const;

export type ScoreCategory = (typeof ScoreCategories)[number];

// -----------------------------
// Data Structures
// -----------------------------

export interface SessionConfig {
  theme: string;
  maxTurns: number;
}

export interface Turn {
  turnNumber: number;
  speaker: ParticipantRole;
  status: DebateState;
  startTime: string;
  endTime?: string;
}

export interface Score {
  category: ScoreCategory;
  value: number;
}

export interface Verdict {
  winner: ParticipantRole | 'Draw';
  summary: string;
  feedbackRight: string;
  feedbackLeft: string;
}

// -----------------------------
// WebSocket Event Payloads
// -----------------------------

// --- Client to Server Events ---
export const C2S_EVENTS = {
  SESSION_CREATE: 'session:create',
  SESSION_JOIN: 'session:join',
  AUDIO_START: 'audio:start',
  AUDIO_CHUNK: 'audio:chunk',
  AUDIO_STOP: 'audio:stop',
} as const;

export interface SessionCreatePayload extends SessionConfig {}
export interface SessionJoinPayload {
  sessionId: string;
}
export interface AudioStartPayload {
  sessionId: string;
}
export interface AudioChunkPayload {
  chunk: ArrayBuffer; // Raw PCM16LE data
}
export interface AudioStopPayload {}


// --- Server to Client Events ---
export const S2C_EVENTS = {
  SESSION_CREATED: 'session:created',
  SESSION_UPDATED: 'session:updated',
  MODERATOR_MESSAGE: 'moderator:message',
  MODERATOR_AUDIO: 'moderator:audio',
  TRANSCRIPT_PARTIAL: 'transcript:partial',
  TRANSCRIPT_FINAL: 'transcript:final',
  TURN_SCORED: 'turn:scored',
  VERDICT_ISSUED: 'verdict:issued',
  ERROR: 'error',
} as const;

export interface SessionCreatedPayload {
  sessionId: string;
  config: SessionConfig;
}

export interface SessionUpdatedPayload {
  state: DebateState;
  currentTurn: number;
  speaker: ParticipantRole;
  remainingTime: number;
}

export interface ModeratorMessagePayload {
  text: string;
}

export interface ModeratorAudioPayload {
  audio: ArrayBuffer;
}

export interface TranscriptPartialPayload {
  text: string;
}

export interface TranscriptFinalPayload {
  text: string;
}

export interface TurnScoredPayload {
  turnNumber: number;
  scores: Score[];
}

export interface VerdictIssuedPayload extends Verdict {}

export interface ErrorPayload {
  message: string;
}
