import { WebSocketConnectionService } from "./websocket-connection.service";
import { SessionRepository, UtteranceRepository, TurnResultRepository, VerdictRepository, AIResponseRepository } from "../repositories";
import { Side, Winner } from "@prisma/client";
import { OpenaiService } from "../openai/openai.service";
import { StylebartService } from "../stylebart/stylebart.service";
export interface DebateSessionConfig {
    theme: string;
    maxTurns?: number;
    turnDurationSeconds?: number;
}
export interface TurnTimer {
    sessionId: string;
    turnIndex: number;
    side: Side;
    startTime: Date;
    timeoutId: NodeJS.Timeout;
}
export declare class DebateSessionService {
    private readonly wsConnection;
    private readonly sessionRepository;
    private readonly utteranceRepository;
    private readonly turnResultRepository;
    private readonly verdictRepository;
    private readonly aiResponseRepository;
    private readonly openaiService;
    private readonly stylebartService;
    private readonly logger;
    private readonly activeTurnTimers;
    private readonly pendingAudioPlaybacks;
    private readonly lastSentMessages;
    private isDuplicateMessage;
    constructor(wsConnection: WebSocketConnectionService, sessionRepository: SessionRepository, utteranceRepository: UtteranceRepository, turnResultRepository: TurnResultRepository, verdictRepository: VerdictRepository, aiResponseRepository: AIResponseRepository, openaiService: OpenaiService, stylebartService: StylebartService);
    createSession(config: DebateSessionConfig): Promise<string>;
    private stopAllActiveSessions;
    private forceStopSession;
    private clearSessionTimers;
    private clearPendingAudioPlaybacks;
    startSession(sessionId: string): Promise<void>;
    startTurn(sessionId: string, turnIndex: number, side: Side): Promise<void>;
    private setTurnTimer;
    private clearTurnTimer;
    endTurn(sessionId: string, turnIndex: number, side: Side): Promise<void>;
    wrapUpTurn(sessionId: string, turnIndex: number): Promise<void>;
    private proceedToNext;
    startFinalJudgment(sessionId: string): Promise<void>;
    announceVerdict(sessionId: string, winner: Winner, rationale: string): Promise<void>;
    finishSession(sessionId: string): Promise<void>;
    processUtterance(sessionId: string, turnIndex: number, side: Side, text: string): Promise<void>;
    private evaluateTurn;
    private performFinalJudgment;
    private generateAndBroadcastAudio;
    transcribeAudio(audioBuffer: Buffer): Promise<string>;
    onAudioPlaybackCompleted(sessionId: string, text: string, options?: {
        error?: boolean;
        noAudio?: boolean;
    }): void;
    private generateAndBroadcastAudioSync;
    private generateAndBroadcastAudioAsync;
    preloadCommonAudioMessages(): Promise<void>;
}
