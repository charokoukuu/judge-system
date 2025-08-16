import { Injectable, Logger } from "@nestjs/common";
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

@Injectable()
export class WebSocketConnectionService {
  private readonly logger = new Logger(WebSocketConnectionService.name);
  private readonly connectedClients = new Map<string, ConnectedClient>();
  private readonly sessionRooms = new Map<string, SessionRoom>();
  private server: Server;

  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * クライアント接続時の処理
   */
  handleConnection(socket: Socket): void {
    this.logger.log(`Client connected: ${socket.id}`);

    const client: ConnectedClient = {
      socket,
      joinedAt: new Date(),
    };

    this.connectedClients.set(socket.id, client);

    // 接続確認のイベントを送信
    socket.emit("connection:confirmed", {
      clientId: socket.id,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * クライアント切断時の処理
   */
  handleDisconnection(socket: Socket): void {
    this.logger.log(`Client disconnected: ${socket.id}`);

    const client = this.connectedClients.get(socket.id);
    if (client?.sessionId) {
      this.leaveSession(socket.id, client.sessionId);
    }

    this.connectedClients.delete(socket.id);
  }

  /**
   * セッションに参加
   */
  joinSession(
    clientId: string,
    sessionId: string,
    role?: "moderator" | "participant",
    side?: Side
  ): boolean {
    const client = this.connectedClients.get(clientId);
    if (!client) {
      this.logger.warn(`Client ${clientId} not found for session join`);
      return false;
    }

    // 既存のセッションから退出
    if (client.sessionId) {
      this.leaveSession(clientId, client.sessionId);
    }

    // セッションルームを取得または作成
    let sessionRoom = this.sessionRooms.get(sessionId);
    if (!sessionRoom) {
      sessionRoom = {
        sessionId,
        clients: new Map(),
        state: SessionState.IDLE,
        createdAt: new Date(),
      };
      this.sessionRooms.set(sessionId, sessionRoom);
      this.logger.log(`Created new session room: ${sessionId}`);
    }

    // クライアントをセッションに追加
    client.sessionId = sessionId;
    client.role = role;
    client.participantSide = side;

    sessionRoom.clients.set(clientId, client);

    // Socket.IOのルームに参加
    client.socket.join(sessionId);

    this.logger.log(
      `Client ${clientId} joined session ${sessionId} as ${role}${side ? ` (${side} side)` : ""}`
    );

    // セッション参加成功を通知
    client.socket.emit("session:joined", {
      sessionId,
      role,
      side,
      participantCount: sessionRoom.clients.size,
    });

    // 他の参加者に新規参加を通知
    client.socket.to(sessionId).emit("session:participant_joined", {
      clientId,
      role,
      side,
      participantCount: sessionRoom.clients.size,
    });

    return true;
  }

  /**
   * セッションから退出
   */
  leaveSession(clientId: string, sessionId: string): boolean {
    const client = this.connectedClients.get(clientId);
    const sessionRoom = this.sessionRooms.get(sessionId);

    if (!client || !sessionRoom) {
      return false;
    }

    // Socket.IOルームから退出
    client.socket.leave(sessionId);

    // セッションルームからクライアントを削除
    sessionRoom.clients.delete(clientId);

    // クライアント情報をクリア
    client.sessionId = undefined;
    client.role = undefined;
    client.participantSide = undefined;

    this.logger.log(`Client ${clientId} left session ${sessionId}`);

    // セッション退出を通知
    client.socket.emit("session:left", { sessionId });

    // 他の参加者に退出を通知
    client.socket.to(sessionId).emit("session:participant_left", {
      clientId,
      participantCount: sessionRoom.clients.size,
    });

    // セッションが空になったら削除
    if (sessionRoom.clients.size === 0) {
      this.sessionRooms.delete(sessionId);
      this.logger.log(`Removed empty session room: ${sessionId}`);
    }

    return true;
  }

  /**
   * セッション内の全クライアントにメッセージを送信
   */
  broadcastToSession(sessionId: string, event: string, data: any): void {
    if (!this.server) {
      this.logger.warn("Server not set, cannot broadcast");
      return;
    }

    this.server.to(sessionId).emit(event, data);
    this.logger.debug(`Broadcasted ${event} to session ${sessionId}`);
  }

  /**
   * 特定のクライアントにメッセージを送信
   */
  sendToClient(clientId: string, event: string, data: any): boolean {
    const client = this.connectedClients.get(clientId);
    if (!client) {
      this.logger.warn(`Client ${clientId} not found for message send`);
      return false;
    }

    client.socket.emit(event, data);
    this.logger.debug(`Sent ${event} to client ${clientId}`);
    return true;
  }

  /**
   * セッション内の特定の役割のクライアントにメッセージを送信
   */
  sendToSessionRole(
    sessionId: string,
    role: "moderator" | "participant",
    event: string,
    data: any
  ): void {
    const sessionRoom = this.sessionRooms.get(sessionId);
    if (!sessionRoom) {
      this.logger.warn(`Session ${sessionId} not found`);
      return;
    }

    sessionRoom.clients.forEach((client) => {
      if (client.role === role) {
        client.socket.emit(event, data);
      }
    });

    this.logger.debug(`Sent ${event} to ${role}s in session ${sessionId}`);
  }

  /**
   * セッション内の特定のサイドのクライアントにメッセージを送信
   */
  sendToSessionSide(
    sessionId: string,
    side: Side,
    event: string,
    data: any
  ): void {
    const sessionRoom = this.sessionRooms.get(sessionId);
    if (!sessionRoom) {
      this.logger.warn(`Session ${sessionId} not found`);
      return;
    }

    sessionRoom.clients.forEach((client) => {
      if (client.participantSide === side) {
        client.socket.emit(event, data);
      }
    });

    this.logger.debug(`Sent ${event} to ${side} side in session ${sessionId}`);
  }

  /**
   * セッションの状態を更新
   */
  updateSessionState(sessionId: string, state: SessionState): void {
    const sessionRoom = this.sessionRooms.get(sessionId);
    if (sessionRoom) {
      sessionRoom.state = state;
      this.broadcastToSession(sessionId, "session:state_changed", {
        sessionId,
        state,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * セッション情報を取得
   */
  getSessionRoom(sessionId: string): SessionRoom | undefined {
    return this.sessionRooms.get(sessionId);
  }

  /**
   * クライアント情報を取得
   */
  getClient(clientId: string): ConnectedClient | undefined {
    return this.connectedClients.get(clientId);
  }

  /**
   * セッション内の参加者数を取得
   */
  getSessionParticipantCount(sessionId: string): number {
    const sessionRoom = this.sessionRooms.get(sessionId);
    return sessionRoom ? sessionRoom.clients.size : 0;
  }

  /**
   * アクティブなセッション一覧を取得
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessionRooms.keys());
  }

  /**
   * 接続中のクライアント数を取得
   */
  getConnectedClientCount(): number {
    return this.connectedClients.size;
  }

  /**
   * セッション統計情報を取得
   */
  getSessionStats(sessionId: string): {
    participantCount: number;
    moderatorCount: number;
    rightSideCount: number;
    leftSideCount: number;
    state: SessionState;
  } | null {
    const sessionRoom = this.sessionRooms.get(sessionId);
    if (!sessionRoom) {
      return null;
    }

    let moderatorCount = 0;
    let rightSideCount = 0;
    let leftSideCount = 0;

    sessionRoom.clients.forEach((client) => {
      if (client.role === "moderator") {
        moderatorCount++;
      } else if (client.participantSide === Side.RIGHT) {
        rightSideCount++;
      } else if (client.participantSide === Side.LEFT) {
        leftSideCount++;
      }
    });

    return {
      participantCount: sessionRoom.clients.size,
      moderatorCount,
      rightSideCount,
      leftSideCount,
      state: sessionRoom.state,
    };
  }
}
