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

  // 音声データを蓄積するためのストレージ
  private audioBuffers = new Map<string, Buffer[]>();

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
    // クライアントサイドマッピングをクリーンアップ
    for (const [
      sessionId,
      sessionMapping,
    ] of this.clientSideMapping.entries()) {
      if (sessionMapping.has(client.id)) {
        sessionMapping.delete(client.id);
        this.logger.log(
          `[サイドマッピング削除] クライアント ${client.id} をセッション ${sessionId} から削除`
        );

        // セッションが空になった場合はセッション全体を削除
        if (sessionMapping.size === 0) {
          this.clientSideMapping.delete(sessionId);
          this.logger.log(
            `[セッションマッピング削除] セッション ${sessionId} のマッピングを削除`
          );
        }
      }
    }

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

      // セッションを作成（既存セッションがあれば自動的に停止される）
      const sessionId = await this.debateSession.createSession({
        theme: payload.theme,
        maxTurns: payload.maxTurns || 3,
      });

      // クライアントをモデレーターとしてセッションに参加
      const joinSuccess = this.wsConnection.joinSession(
        client.id,
        sessionId,
        "moderator"
      );

      if (joinSuccess) {
        // セッション作成成功をクライアントに通知
        client.emit(S2C_EVENTS.SESSION_CREATED, {
          sessionId,
          config: payload,
        });

        // モデレーターとして参加したことも通知
        client.emit("session:joined", {
          sessionId,
          role: "moderator",
          side: undefined, // モデレーターは特定のサイドに属さない
        });

        this.logger.log(
          `Session created: ${sessionId} for client ${client.id} as moderator`
        );
      } else {
        throw new Error("Failed to join session as moderator");
      }
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

      // 制約解除：誰でもセッション開始可能
      const clientData = this.wsConnection.getClient(client.id);
      if (!clientData) {
        client.emit(S2C_EVENTS.ERROR, {
          message: "クライアントデータが見つかりません",
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

    // クライアントの音声バッファをリセット
    this.audioBuffers.set(client.id, []);

    // 音声認識開始の通知
    this.wsConnection.broadcastToSession(payload.sessionId, "audio:start", {
      clientId: client.id,
      sessionId: payload.sessionId,
    });
  }

  @SubscribeMessage(C2S_EVENTS.AUDIO_CHUNK)
  async handleAudioChunk(
    @MessageBody() payload: any, // AudioChunkPayloadの型定義を一時的にanyで回避
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      this.logger.log(`[DEBUG] Audio chunk received from client ${client.id}`);

      // 音声チャンクをバッファに変換（実際の形式に応じて調整）
      let audioBuffer: Buffer;

      if (typeof payload.chunk === "string") {
        // Base64エンコードされたデータの場合
        audioBuffer = Buffer.from(payload.chunk, "base64");
        this.logger.log(
          `[DEBUG] Processed Base64 audio chunk: ${audioBuffer.length} bytes`
        );
      } else if (payload.chunk instanceof ArrayBuffer) {
        // ArrayBufferの場合
        audioBuffer = Buffer.from(payload.chunk);
        this.logger.log(
          `[DEBUG] Processed ArrayBuffer audio chunk: ${audioBuffer.length} bytes`
        );
      } else {
        this.logger.warn(
          `Unexpected audio chunk format from ${client.id}:`,
          typeof payload.chunk
        );
        return;
      }

      // クライアントごとの音声バッファに追加
      const clientBuffers = this.audioBuffers.get(client.id) || [];
      clientBuffers.push(audioBuffer);
      this.audioBuffers.set(client.id, clientBuffers);

      this.logger.log(
        `[DEBUG] Total audio chunks for client ${client.id}: ${clientBuffers.length}, total bytes: ${clientBuffers.reduce((sum, buf) => sum + buf.length, 0)}`
      );
    } catch (error) {
      this.logger.error(`Failed to process audio chunk: ${error.message}`);
    }
  }

  @SubscribeMessage(C2S_EVENTS.AUDIO_STOP)
  async handleAudioStop(
    @MessageBody() payload: AudioStopPayload,
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      this.logger.log(`Audio stop from client ${client.id}`);

      // 音声チャンクが遅れて到着する可能性があるため、少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      const clientData = this.wsConnection.getClient(client.id);
      // 循環参照を避けるために必要な情報のみをログ出力
      this.logger.debug(
        `Client data for ${client.id}: sessionId=${clientData?.sessionId}, role=${clientData?.role}, side=${clientData?.participantSide}`
      );

      if (!clientData?.sessionId) {
        this.logger.log(
          `[テーマ入力] Client ${client.id} not connected to session - treating as theme input`
        );

        // テーマ入力用の処理として続行
        // 音声認識だけ行って結果を返す
      } else {
        // 制約解除：participantSideがなくても処理を続行
        // （後でeffectiveSideとして扱う）
      }

      // 蓄積された音声データを取得
      const clientBuffers = this.audioBuffers.get(client.id) || [];
      this.audioBuffers.delete(client.id); // クリーンアップ

      this.logger.log(
        `[DEBUG] Audio buffer check - client ${client.id} has ${clientBuffers.length} chunks, total bytes: ${clientBuffers.reduce((sum, buf) => sum + buf.length, 0)}`
      );

      if (clientBuffers.length === 0) {
        this.logger.warn(`No audio data received from client ${client.id}`);
        return;
      }

      // 全ての音声チャンクを結合
      const combinedAudioBuffer = Buffer.concat(clientBuffers);
      this.logger.log(
        `Processing ${combinedAudioBuffer.length} bytes of audio data from client ${client.id}`
      );

      // OpenAI Whisper APIで音声認識
      let finalText: string;
      try {
        this.logger.log(
          `[STT] 音声認識を開始 - クライアント: ${client.id}, 音声サイズ: ${combinedAudioBuffer.length} bytes`
        );
        finalText =
          await this.debateSession.transcribeAudio(combinedAudioBuffer);
        this.logger.log(
          `[STT] 音声認識成功 - クライアント: ${client.id}, 結果: "${finalText}"`
        );
      } catch (error) {
        this.logger.error(
          `[STT] 音声認識失敗 - クライアント: ${client.id}, エラー: ${error.message}`
        );
        client.emit(S2C_EVENTS.ERROR, {
          message: `音声認識に失敗しました: ${error.message}`,
        });
        return;
      }

      // テーマ入力の場合は音声認識結果を直接返す
      if (!clientData?.sessionId) {
        this.logger.log(
          `[テーマ入力] 音声認識結果をクライアントに直接送信: "${finalText}"`
        );

        client.emit(S2C_EVENTS.TRANSCRIPT_FINAL, {
          text: finalText,
          clientId: client.id,
          isThemeInput: true,
        });

        return;
      }

      // 現在のターンとサイドを取得
      const sessionRoom = this.wsConnection.getSessionRoom(
        clientData.sessionId
      );

      this.logger.log(
        `[DEBUG] セッション ${clientData.sessionId} の状態確認 - sessionRoom: ${sessionRoom ? "あり" : "なし"}, state: ${sessionRoom?.state}`
      );

      const currentTurn = this.getCurrentTurnFromState(sessionRoom?.state);

      this.logger.log(
        `[DEBUG] 現在のターン計算結果: ${currentTurn} (state: ${sessionRoom?.state})`
      );

      if (currentTurn > 0) {
        // 制約解除：誰でも発話をDB保存できるように
        // participantSideがない場合は現在のターン状態に基づいて自動的にサイドを割り当て
        let effectiveSide = clientData.participantSide;

        if (!effectiveSide) {
          // セッション状態に基づいてサイドを決定
          effectiveSide = this.getSideFromSessionState(sessionRoom?.state);
          this.logger.log(
            `[自動サイド割り当て] セッション状態 ${sessionRoom?.state} から ${effectiveSide} を割り当て`
          );
        }

        this.logger.log(
          `[STT→DB] クライアント ${client.id} (role: ${clientData.role}, side: ${effectiveSide}) の発話を記録開始: "${finalText}"`
        );

        this.logger.log(
          `[DB保存前] processUtteranceパラメータ確認 - sessionId: ${clientData.sessionId}, turnIndex: ${currentTurn}, side: ${effectiveSide}, text: "${finalText}"`
        );

        // 発話を保存（各発言終了時に即座に実行）
        await this.debateSession.processUtterance(
          clientData.sessionId,
          currentTurn,
          effectiveSide,
          finalText
        );

        this.logger.log(`[STT→DB] クライアント ${client.id} の発話記録完了`);

        // 最終認識結果をブロードキャスト
        this.wsConnection.broadcastToSession(
          clientData.sessionId,
          S2C_EVENTS.TRANSCRIPT_FINAL,
          {
            text: finalText,
            clientId: client.id,
            side: effectiveSide,
            turnIndex: currentTurn,
          }
        );

        this.logger.log(
          `[STT→DB] セッション ${clientData.sessionId}, ターン ${currentTurn}, ${effectiveSide}側に発話処理完了: "${finalText}"`
        );
      } else {
        this.logger.warn(`Client ${client.id} spoke but no active turn found`);
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

      // 制約解除：誰でも発話可能
      let effectiveSide = clientData.participantSide;

      if (!effectiveSide) {
        // クライアントIDベースで自動割り当て
        effectiveSide = this.getEffectiveSideForClient(
          client.id,
          clientData.sessionId
        );
      }

      // 発話を保存
      await this.debateSession.processUtterance(
        clientData.sessionId,
        currentTurn,
        effectiveSide,
        payload.text
      );

      // 最終認識結果をブロードキャスト
      this.wsConnection.broadcastToSession(
        clientData.sessionId,
        S2C_EVENTS.TRANSCRIPT_FINAL,
        {
          text: payload.text,
          clientId: client.id,
          side: effectiveSide,
          turnIndex: currentTurn,
        }
      );

      this.logger.log(
        `Text processed for session ${clientData.sessionId}, turn ${currentTurn}, side ${effectiveSide}`
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

  @SubscribeMessage("audio:playback_completed")
  handleAudioPlaybackCompleted(
    @MessageBody()
    payload: {
      sessionId: string;
      text: string;
      error?: boolean;
      noAudio?: boolean;
    },
    @ConnectedSocket() client: Socket
  ): void {
    this.logger.log(
      `Audio playback completed for session: ${payload.sessionId}`
    );

    // DebateSessionServiceに音声再生完了を通知
    this.debateSession.onAudioPlaybackCompleted(
      payload.sessionId,
      payload.text,
      {
        error: payload.error,
        noAudio: payload.noAudio,
      }
    );
  }

  // セッション内のクライアント接続順序でサイドを自動割り当て
  private clientSideMapping = new Map<string, Map<string, Side>>();

  private getEffectiveSideForClient(clientId: string, sessionId: string): Side {
    // セッション毎のマッピングを取得または作成
    if (!this.clientSideMapping.has(sessionId)) {
      this.clientSideMapping.set(sessionId, new Map());
    }

    const sessionMapping = this.clientSideMapping.get(sessionId)!;

    // 既にマッピングが存在する場合はそれを返す
    if (sessionMapping.has(clientId)) {
      return sessionMapping.get(clientId)!;
    }

    // 新しいクライアントの場合、接続順序でサイドを決定
    const existingClients = Array.from(sessionMapping.keys());
    const assignedSide =
      existingClients.length % 2 === 0 ? Side.RIGHT : Side.LEFT;

    sessionMapping.set(clientId, assignedSide);

    this.logger.log(
      `[サイド自動割り当て] クライアント ${clientId} をセッション ${sessionId} の ${assignedSide} に割り当て (接続順: ${existingClients.length + 1})`
    );

    return assignedSide;
  }

  // セッション状態から現在のサイドを決定
  private getSideFromSessionState(state?: any): Side {
    if (!state) return Side.RIGHT; // デフォルトはRIGHT

    const stateStr = state.toString();
    if (stateStr.includes("LEFT")) {
      return Side.LEFT;
    } else if (stateStr.includes("RIGHT")) {
      return Side.RIGHT;
    }

    // 明確でない場合はRIGHTをデフォルト
    return Side.RIGHT;
  }
}
