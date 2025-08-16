import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import {
  C2S_EVENTS,
  S2C_EVENTS,
  SessionCreatePayload,
  SessionJoinPayload,
  AudioChunkPayload,
  AudioStartPayload,
  AudioStopPayload,
} from "@repo/types";
import { WebSocketConnectionService } from "../websocket/websocket-connection.service";
import { DebateSessionService } from "../websocket/debate-session.service";
import { Side } from "@prisma/client";

@WebSocketGateway({
  cors: {
    origin: "*", // Allow all origins for simplicity in MVP
  },
})
export class DebateGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DebateGateway.name);

  constructor(
    private readonly wsConnection: WebSocketConnectionService,
    private readonly debateSession: DebateSessionService
  ) {}

  afterInit(server: Server) {
    this.wsConnection.setServer(server);
    this.logger.log("WebSocket Gateway initialized");
  }

  handleConnection(client: Socket) {
    this.wsConnection.handleConnection(client);
  }

  handleDisconnect(client: Socket) {
    this.wsConnection.handleDisconnection(client);
  }

  @SubscribeMessage(C2S_EVENTS.SESSION_CREATE)
  async handleSessionCreate(
    @MessageBody() payload: SessionCreatePayload,
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      this.logger.log(`Received session:create from ${client.id}`);
      this.logger.log(`Payload: ${JSON.stringify(payload)}`);

      // セッションを作成
      const sessionId = await this.debateSession.createSession({
        theme: payload.theme,
        maxTurns: payload.maxTurns || 3,
      });

      // クライアントをモデレーターとしてセッションに参加
      this.wsConnection.joinSession(client.id, sessionId, "moderator");

      // セッション作成成功をクライアントに通知
      client.emit(S2C_EVENTS.SESSION_CREATED, {
        sessionId,
        config: payload,
      });

      this.logger.log(`Session created: ${sessionId} for client ${client.id}`);
    } catch (error) {
      this.logger.error(`Failed to create session: ${error.message}`);
      client.emit(S2C_EVENTS.ERROR, {
        message: `セッション作成に失敗しました: ${error.message}`,
      });
    }
  }

  @SubscribeMessage(C2S_EVENTS.SESSION_JOIN)
  async handleSessionJoin(
    @MessageBody() payload: SessionJoinPayload,
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      this.logger.log(
        `Client ${client.id} joining session ${payload.sessionId}`
      );

      // セッション統計を取得して参加者の役割を決定
      const stats = this.wsConnection.getSessionStats(payload.sessionId);

      let role: "moderator" | "participant" = "participant";
      let side: Side | undefined;

      if (stats) {
        // 右サイドが少ない場合は右に、そうでなければ左に
        if (stats.rightSideCount <= stats.leftSideCount) {
          side = Side.RIGHT;
        } else {
          side = Side.LEFT;
        }
      } else {
        // セッションが存在しない場合はエラー
        client.emit(S2C_EVENTS.ERROR, {
          message: "セッションが見つかりません",
        });
        return;
      }

      // セッションに参加
      const success = this.wsConnection.joinSession(
        client.id,
        payload.sessionId,
        role,
        side
      );

      if (success) {
        client.emit("session:joined", {
          sessionId: payload.sessionId,
          role,
          side,
        });
        this.logger.log(
          `Client ${client.id} joined session ${payload.sessionId} as ${side} side`
        );
      } else {
        client.emit(S2C_EVENTS.ERROR, {
          message: "セッション参加に失敗しました",
        });
      }
    } catch (error) {
      this.logger.error(`Failed to join session: ${error.message}`);
      client.emit(S2C_EVENTS.ERROR, {
        message: `セッション参加に失敗しました: ${error.message}`,
      });
    }
  }

  @SubscribeMessage("session:start")
  async handleSessionStart(
    @MessageBody() payload: { sessionId: string },
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      this.logger.log(
        `Starting session ${payload.sessionId} by client ${client.id}`
      );

      // クライアントがモデレーターかチェック
      const clientData = this.wsConnection.getClient(client.id);
      if (!clientData || clientData.role !== "moderator") {
        client.emit(S2C_EVENTS.ERROR, {
          message: "セッション開始はモデレーターのみ可能です",
        });
        return;
      }

      await this.debateSession.startSession(payload.sessionId);
      this.logger.log(`Session ${payload.sessionId} started`);
    } catch (error) {
      this.logger.error(`Failed to start session: ${error.message}`);
      client.emit(S2C_EVENTS.ERROR, {
        message: `セッション開始に失敗しました: ${error.message}`,
      });
    }
  }

  @SubscribeMessage(C2S_EVENTS.AUDIO_START)
  handleAudioStart(
    @MessageBody() payload: AudioStartPayload,
    @ConnectedSocket() client: Socket
  ): void {
    this.logger.log(
      `Audio start for session ${payload.sessionId} from client ${client.id}`
    );

    // 音声認識開始の通知
    this.wsConnection.broadcastToSession(payload.sessionId, "audio:start", {
      clientId: client.id,
      sessionId: payload.sessionId,
    });
  }

  @SubscribeMessage(C2S_EVENTS.AUDIO_CHUNK)
  async handleAudioChunk(
    @MessageBody() payload: AudioChunkPayload,
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    // 高頻度イベントのため、ログは最小限に
    // TODO: OpenAI Whisper APIで音声認識を実装

    const clientData = this.wsConnection.getClient(client.id);
    if (clientData?.sessionId) {
      // 部分認識結果があればブロードキャスト
      // this.wsConnection.broadcastToSession(clientData.sessionId, S2C_EVENTS.TRANSCRIPT_PARTIAL, {
      //   text: "認識中...",
      //   clientId: client.id,
      // });
    }
  }

  @SubscribeMessage(C2S_EVENTS.AUDIO_STOP)
  async handleAudioStop(
    @MessageBody() payload: AudioStopPayload,
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      this.logger.log(`Audio stop from client ${client.id}`);

      const clientData = this.wsConnection.getClient(client.id);
      if (!clientData?.sessionId || !clientData.participantSide) {
        return;
      }

      // TODO: 最終的な音声認識結果を処理
      const finalText = "これは仮のテキストです"; // 実際はWhisper APIの結果

      // 現在のターンとサイドを取得
      const sessionRoom = this.wsConnection.getSessionRoom(
        clientData.sessionId
      );
      const currentTurn = this.getCurrentTurnFromState(sessionRoom?.state);

      if (currentTurn > 0) {
        // 発話を保存
        await this.debateSession.processUtterance(
          clientData.sessionId,
          currentTurn,
          clientData.participantSide,
          finalText
        );

        // 最終認識結果をブロードキャスト
        this.wsConnection.broadcastToSession(
          clientData.sessionId,
          S2C_EVENTS.TRANSCRIPT_FINAL,
          {
            text: finalText,
            clientId: client.id,
            side: clientData.participantSide,
            turnIndex: currentTurn,
          }
        );
      }
    } catch (error) {
      this.logger.error(`Failed to process audio stop: ${error.message}`);
      client.emit(S2C_EVENTS.ERROR, {
        message: `音声処理に失敗しました: ${error.message}`,
      });
    }
  }

  @SubscribeMessage("text:send")
  async handleTextSend(
    @MessageBody() payload: { text: string },
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      this.logger.log(
        `Text received from client ${client.id}: ${payload.text}`
      );

      const clientData = this.wsConnection.getClient(client.id);
      if (!clientData?.sessionId || !clientData.participantSide) {
        client.emit(S2C_EVENTS.ERROR, {
          message: "セッションに参加していません",
        });
        return;
      }

      // 現在のターンとサイドを取得
      const sessionRoom = this.wsConnection.getSessionRoom(
        clientData.sessionId
      );
      const currentTurn = this.getCurrentTurnFromState(sessionRoom?.state);

      if (currentTurn <= 0) {
        client.emit(S2C_EVENTS.ERROR, {
          message: "まだディベートが開始されていません",
        });
        return;
      }

      // 現在のターンで発話可能かチェック
      const canSpeak = this.canClientSpeak(
        sessionRoom?.state,
        clientData.participantSide
      );
      if (!canSpeak) {
        client.emit(S2C_EVENTS.ERROR, {
          message: "現在はあなたの発話ターンではありません",
        });
        return;
      }

      // 発話を保存
      await this.debateSession.processUtterance(
        clientData.sessionId,
        currentTurn,
        clientData.participantSide,
        payload.text
      );

      // 最終認識結果をブロードキャスト
      this.wsConnection.broadcastToSession(
        clientData.sessionId,
        S2C_EVENTS.TRANSCRIPT_FINAL,
        {
          text: payload.text,
          clientId: client.id,
          side: clientData.participantSide,
          turnIndex: currentTurn,
        }
      );

      this.logger.log(
        `Text processed for session ${clientData.sessionId}, turn ${currentTurn}, side ${clientData.participantSide}`
      );
    } catch (error) {
      this.logger.error(`Failed to process text: ${error.message}`);
      client.emit(S2C_EVENTS.ERROR, {
        message: `テキスト処理に失敗しました: ${error.message}`,
      });
    }
  }

  private getCurrentTurnFromState(state?: any): number {
    if (!state) return 0;

    const stateStr = state.toString();
    if (stateStr.includes("TURN1")) return 1;
    if (stateStr.includes("TURN2")) return 2;
    if (stateStr.includes("FINAL")) return 3;
    return 0;
  }

  private canClientSpeak(state?: any, side?: Side): boolean {
    if (!state || !side) return false;

    const stateStr = state.toString();
    if (side === Side.RIGHT && stateStr.includes("RIGHT")) return true;
    if (side === Side.LEFT && stateStr.includes("LEFT")) return true;
    return false;
  }

  @SubscribeMessage("session:stats")
  handleSessionStats(
    @MessageBody() payload: { sessionId: string },
    @ConnectedSocket() client: Socket
  ): void {
    const stats = this.wsConnection.getSessionStats(payload.sessionId);
    client.emit("session:stats", stats);
  }

  @SubscribeMessage("ping")
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit("pong", { timestamp: new Date().toISOString() });
  }
}
