import { Server, Socket } from "socket.io";
import { SessionState, Side } from "@prisma/client";
export interface ConnectedClient {
    socket: Socket;
    sessionId?: string;
    role?: "moderator" | "participant";
    participantSide?: Side;
    joinedAt: Date;
}
export interface SessionRoom {
    sessionId: string;
    clients: Map<string, ConnectedClient>;
    state: SessionState;
    createdAt: Date;
}
export declare class WebSocketConnectionService {
    private readonly logger;
    private readonly connectedClients;
    private readonly sessionRooms;
    private server;
    setServer(server: Server): void;
    handleConnection(socket: Socket): void;
    handleDisconnection(socket: Socket): void;
    joinSession(clientId: string, sessionId: string, role?: "moderator" | "participant", side?: Side): boolean;
    leaveSession(clientId: string, sessionId: string): boolean;
    broadcastToSession(sessionId: string, event: string, data: any): void;
    sendToClient(clientId: string, event: string, data: any): boolean;
    sendToSessionRole(sessionId: string, role: "moderator" | "participant", event: string, data: any): void;
    sendToSessionSide(sessionId: string, side: Side, event: string, data: any): void;
    updateSessionState(sessionId: string, state: SessionState): void;
    getSessionRoom(sessionId: string): SessionRoom | undefined;
    getClient(clientId: string): ConnectedClient | undefined;
    getSessionParticipantCount(sessionId: string): number;
    getActiveSessions(): string[];
    terminateAllSessions(reason?: string): void;
    getSessionDetails(sessionId: string): {
        sessionId: string;
        state: SessionState;
        participantCount: number;
        clients: Array<{
            clientId: string;
            role?: string;
            side?: Side;
            joinedAt: Date;
        }>;
        createdAt: Date;
    } | null;
    getConnectedClientCount(): number;
    getSessionStats(sessionId: string): {
        participantCount: number;
        moderatorCount: number;
        rightSideCount: number;
        leftSideCount: number;
        state: SessionState;
    } | null;
}
