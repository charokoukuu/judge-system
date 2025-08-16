export declare enum DebateState {
    IDLE = "IDLE",
    CONFIGURING = "CONFIGURING",
    RIGHT_SPEAKING = "RIGHT_SPEAKING",
    LEFT_SPEAKING = "LEFT_SPEAKING",
    TURN_WRAPUP = "TURN_WRAPUP",
    FINAL_RIGHT = "FINAL_RIGHT",
    FINAL_LEFT = "FINAL_LEFT",
    JUDGING = "JUDGING",
    VERDICT = "VERDICT"
}
export declare enum ParticipantRole {
    RIGHT = "Right",
    LEFT = "Left",
    MODERATOR = "Moderator"
}
export declare const ScoreCategories: readonly ["logic", "evidence", "rebuttal", "consistency", "clarity", "factuality"];
export type ScoreCategory = (typeof ScoreCategories)[number];
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
export declare const C2S_EVENTS: {
    readonly SESSION_CREATE: "session:create";
    readonly SESSION_JOIN: "session:join";
    readonly AUDIO_START: "audio:start";
    readonly AUDIO_CHUNK: "audio:chunk";
    readonly AUDIO_STOP: "audio:stop";
};
export interface SessionCreatePayload extends SessionConfig {
}
export interface SessionJoinPayload {
    sessionId: string;
}
export interface AudioStartPayload {
    sessionId: string;
}
export interface AudioChunkPayload {
    chunk: ArrayBuffer;
}
export interface AudioStopPayload {
}
export declare const S2C_EVENTS: {
    readonly SESSION_CREATED: "session:created";
    readonly SESSION_UPDATED: "session:updated";
    readonly MODERATOR_MESSAGE: "moderator:message";
    readonly MODERATOR_AUDIO: "moderator:audio";
    readonly TRANSCRIPT_PARTIAL: "transcript:partial";
    readonly TRANSCRIPT_FINAL: "transcript:final";
    readonly TURN_SCORED: "turn:scored";
    readonly VERDICT_ISSUED: "verdict:issued";
    readonly ERROR: "error";
};
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
export interface VerdictIssuedPayload extends Verdict {
}
export interface ErrorPayload {
    message: string;
}
