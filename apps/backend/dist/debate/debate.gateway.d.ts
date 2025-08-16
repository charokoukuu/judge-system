import { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { SessionCreatePayload } from "@repo/types";
export declare class DebateGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    private readonly logger;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleSessionCreate(payload: SessionCreatePayload, client: Socket): void;
    handleAudioChunk(payload: {
        chunk: ArrayBuffer;
    }): void;
}
