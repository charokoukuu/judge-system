import { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { SessionCreatePayload, SessionJoinPayload, AudioStartPayload, AudioStopPayload } from "@repo/types";
import { WebSocketConnectionService } from "../websocket/websocket-connection.service";
import { DebateSessionService } from "../websocket/debate-session.service";
export declare class DebateGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly wsConnection;
    private readonly debateSession;
    server: Server;
    private readonly logger;
    private audioBuffers;
    constructor(wsConnection: WebSocketConnectionService, debateSession: DebateSessionService);
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleSessionCreate(payload: SessionCreatePayload, client: Socket): Promise<void>;
    handleSessionJoin(payload: SessionJoinPayload, client: Socket): Promise<void>;
    handleSessionStart(payload: {
        sessionId: string;
    }, client: Socket): Promise<void>;
    handleAudioStart(payload: AudioStartPayload, client: Socket): void;
    handleAudioChunk(payload: any, client: Socket): Promise<void>;
    handleAudioStop(payload: AudioStopPayload, client: Socket): Promise<void>;
    handleTextSend(payload: {
        text: string;
    }, client: Socket): Promise<void>;
    private getCurrentTurnFromState;
    private canClientSpeak;
    handleSessionStats(payload: {
        sessionId: string;
    }, client: Socket): void;
    handlePing(client: Socket): void;
    handleAudioPlaybackCompleted(payload: {
        sessionId: string;
        text: string;
        error?: boolean;
        noAudio?: boolean;
    }, client: Socket): void;
    private clientSideMapping;
    private getEffectiveSideForClient;
}
