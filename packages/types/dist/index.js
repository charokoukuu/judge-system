"use strict";
// -----------------------------
// Enums and Constant Types
// -----------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.S2C_EVENTS = exports.C2S_EVENTS = exports.ScoreCategories = exports.ParticipantRole = exports.DebateState = void 0;
var DebateState;
(function (DebateState) {
    DebateState["IDLE"] = "IDLE";
    DebateState["CONFIGURING"] = "CONFIGURING";
    DebateState["RIGHT_SPEAKING"] = "RIGHT_SPEAKING";
    DebateState["LEFT_SPEAKING"] = "LEFT_SPEAKING";
    DebateState["TURN_WRAPUP"] = "TURN_WRAPUP";
    DebateState["FINAL_RIGHT"] = "FINAL_RIGHT";
    DebateState["FINAL_LEFT"] = "FINAL_LEFT";
    DebateState["JUDGING"] = "JUDGING";
    DebateState["VERDICT"] = "VERDICT";
})(DebateState || (exports.DebateState = DebateState = {}));
var ParticipantRole;
(function (ParticipantRole) {
    ParticipantRole["RIGHT"] = "Right";
    ParticipantRole["LEFT"] = "Left";
    ParticipantRole["MODERATOR"] = "Moderator";
})(ParticipantRole || (exports.ParticipantRole = ParticipantRole = {}));
exports.ScoreCategories = [
    'logic',
    'evidence',
    'rebuttal',
    'consistency',
    'clarity',
    'factuality',
];
// -----------------------------
// WebSocket Event Payloads
// -----------------------------
// --- Client to Server Events ---
exports.C2S_EVENTS = {
    SESSION_CREATE: 'session:create',
    SESSION_JOIN: 'session:join',
    AUDIO_START: 'audio:start',
    AUDIO_CHUNK: 'audio:chunk',
    AUDIO_STOP: 'audio:stop',
};
// --- Server to Client Events ---
exports.S2C_EVENTS = {
    SESSION_CREATED: 'session:created',
    SESSION_UPDATED: 'session:updated',
    MODERATOR_MESSAGE: 'moderator:message',
    MODERATOR_AUDIO: 'moderator:audio',
    TRANSCRIPT_PARTIAL: 'transcript:partial',
    TRANSCRIPT_FINAL: 'transcript:final',
    TURN_SCORED: 'turn:scored',
    VERDICT_ISSUED: 'verdict:issued',
    ERROR: 'error',
};
