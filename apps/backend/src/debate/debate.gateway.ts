import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { C2S_EVENTS, S2C_EVENTS, SessionCreatePayload } from '@repo/types';

@WebSocketGateway(8080, {
  cors: {
    origin: '*', // Allow all origins for simplicity in MVP
  },
})
export class DebateGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DebateGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage(C2S_EVENTS.SESSION_CREATE)
  handleSessionCreate(
    @MessageBody() payload: SessionCreatePayload,
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log(`Received session:create from ${client.id}`);
    this.logger.log(`Payload: ${JSON.stringify(payload)}`);

    // TODO: Implement session creation logic
    // 1. Call a SessionService to create a session in the DB
    // 2. Get a session ID back
    const sessionId = `session_${Date.now()}`; // Placeholder

    // 3. Respond to the client with the new session ID
    client.emit(S2C_EVENTS.SESSION_CREATED, {
      sessionId,
      config: payload,
    });

    this.logger.log(`Emitted session:created to ${client.id} with ID ${sessionId}`);
  }

  // Placeholder for audio chunk handling
  @SubscribeMessage(C2S_EVENTS.AUDIO_CHUNK)
  handleAudioChunk(@MessageBody() payload: { chunk: ArrayBuffer }): void {
    // This will be a high-frequency event, so logging might be too noisy.
    // For now, let's just acknowledge it's here.
    // console.log(`Received audio chunk of size: ${payload.chunk.byteLength}`);
  }
}
