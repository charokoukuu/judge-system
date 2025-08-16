"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DebateGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebateGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const types_1 = require("@repo/types");
const websocket_connection_service_1 = require("../websocket/websocket-connection.service");
const debate_session_service_1 = require("../websocket/debate-session.service");
const client_1 = require("@prisma/client");
let DebateGateway = DebateGateway_1 = class DebateGateway {
    constructor(wsConnection, debateSession) {
        this.wsConnection = wsConnection;
        this.debateSession = debateSession;
        this.logger = new common_1.Logger(DebateGateway_1.name);
        this.audioBuffers = new Map();
    }
    afterInit(server) {
        this.wsConnection.setServer(server);
        this.logger.log("WebSocket Gateway initialized");
    }
    handleConnection(client) {
        this.wsConnection.handleConnection(client);
    }
    handleDisconnect(client) {
        this.wsConnection.handleDisconnection(client);
    }
    async handleSessionCreate(payload, client) {
        try {
            this.logger.log(`Received session:create from ${client.id}`);
            this.logger.log(`Payload: ${JSON.stringify(payload)}`);
            const sessionId = await this.debateSession.createSession({
                theme: payload.theme,
                maxTurns: payload.maxTurns || 3,
            });
            const joinSuccess = this.wsConnection.joinSession(client.id, sessionId, "moderator");
            if (joinSuccess) {
                client.emit(types_1.S2C_EVENTS.SESSION_CREATED, {
                    sessionId,
                    config: payload,
                });
                client.emit("session:joined", {
                    sessionId,
                    role: "moderator",
                    side: undefined,
                });
                this.logger.log(`Session created: ${sessionId} for client ${client.id} as moderator`);
            }
            else {
                throw new Error("Failed to join session as moderator");
            }
        }
        catch (error) {
            this.logger.error(`Failed to create session: ${error.message}`);
            client.emit(types_1.S2C_EVENTS.ERROR, {
                message: `セッション作成に失敗しました: ${error.message}`,
            });
        }
    }
    async handleSessionJoin(payload, client) {
        try {
            this.logger.log(`Client ${client.id} joining session ${payload.sessionId}`);
            const stats = this.wsConnection.getSessionStats(payload.sessionId);
            let role = "participant";
            let side;
            if (stats) {
                if (stats.rightSideCount <= stats.leftSideCount) {
                    side = client_1.Side.RIGHT;
                }
                else {
                    side = client_1.Side.LEFT;
                }
            }
            else {
                client.emit(types_1.S2C_EVENTS.ERROR, {
                    message: "セッションが見つかりません",
                });
                return;
            }
            const success = this.wsConnection.joinSession(client.id, payload.sessionId, role, side);
            if (success) {
                client.emit("session:joined", {
                    sessionId: payload.sessionId,
                    role,
                    side,
                });
                this.logger.log(`Client ${client.id} joined session ${payload.sessionId} as ${side} side`);
            }
            else {
                client.emit(types_1.S2C_EVENTS.ERROR, {
                    message: "セッション参加に失敗しました",
                });
            }
        }
        catch (error) {
            this.logger.error(`Failed to join session: ${error.message}`);
            client.emit(types_1.S2C_EVENTS.ERROR, {
                message: `セッション参加に失敗しました: ${error.message}`,
            });
        }
    }
    async handleSessionStart(payload, client) {
        try {
            this.logger.log(`Starting session ${payload.sessionId} by client ${client.id}`);
            const clientData = this.wsConnection.getClient(client.id);
            if (!clientData || clientData.role !== "moderator") {
                client.emit(types_1.S2C_EVENTS.ERROR, {
                    message: "セッション開始はモデレーターのみ可能です",
                });
                return;
            }
            await this.debateSession.startSession(payload.sessionId);
            this.logger.log(`Session ${payload.sessionId} started`);
        }
        catch (error) {
            this.logger.error(`Failed to start session: ${error.message}`);
            client.emit(types_1.S2C_EVENTS.ERROR, {
                message: `セッション開始に失敗しました: ${error.message}`,
            });
        }
    }
    handleAudioStart(payload, client) {
        this.logger.log(`Audio start for session ${payload.sessionId} from client ${client.id}`);
        this.audioBuffers.set(client.id, []);
        this.wsConnection.broadcastToSession(payload.sessionId, "audio:start", {
            clientId: client.id,
            sessionId: payload.sessionId,
        });
    }
    async handleAudioChunk(payload, client) {
        try {
            let audioBuffer;
            if (typeof payload.chunk === "string") {
                audioBuffer = Buffer.from(payload.chunk, "base64");
            }
            else if (payload.chunk instanceof ArrayBuffer) {
                audioBuffer = Buffer.from(payload.chunk);
            }
            else {
                this.logger.warn(`Unexpected audio chunk format from ${client.id}`);
                return;
            }
            const clientBuffers = this.audioBuffers.get(client.id) || [];
            clientBuffers.push(audioBuffer);
            this.audioBuffers.set(client.id, clientBuffers);
        }
        catch (error) {
            this.logger.error(`Failed to process audio chunk: ${error.message}`);
        }
    }
    async handleAudioStop(payload, client) {
        try {
            this.logger.log(`Audio stop from client ${client.id}`);
            const clientData = this.wsConnection.getClient(client.id);
            this.logger.debug(`Client data for ${client.id}: sessionId=${clientData?.sessionId}, role=${clientData?.role}, side=${clientData?.participantSide}`);
            if (!clientData?.sessionId) {
                this.logger.warn(`Client ${client.id} not connected to session - sessionId: ${clientData?.sessionId}`);
                return;
            }
            if (!clientData.participantSide && clientData.role !== "moderator") {
                this.logger.warn(`Client ${client.id} not properly connected to session - role: ${clientData?.role}, side: ${clientData?.participantSide}`);
                return;
            }
            const clientBuffers = this.audioBuffers.get(client.id) || [];
            this.audioBuffers.delete(client.id);
            if (clientBuffers.length === 0) {
                this.logger.warn(`No audio data received from client ${client.id}`);
                return;
            }
            const combinedAudioBuffer = Buffer.concat(clientBuffers);
            this.logger.log(`Processing ${combinedAudioBuffer.length} bytes of audio data from client ${client.id}`);
            let finalText;
            try {
                this.logger.log(`[STT] 音声認識を開始 - クライアント: ${client.id}, 音声サイズ: ${combinedAudioBuffer.length} bytes`);
                finalText =
                    await this.debateSession.transcribeAudio(combinedAudioBuffer);
                this.logger.log(`[STT] 音声認識成功 - クライアント: ${client.id}, 結果: "${finalText}"`);
            }
            catch (error) {
                this.logger.error(`[STT] 音声認識失敗 - クライアント: ${client.id}, エラー: ${error.message}`);
                client.emit(types_1.S2C_EVENTS.ERROR, {
                    message: `音声認識に失敗しました: ${error.message}`,
                });
                return;
            }
            const sessionRoom = this.wsConnection.getSessionRoom(clientData.sessionId);
            const currentTurn = this.getCurrentTurnFromState(sessionRoom?.state);
            if (currentTurn > 0) {
                if (clientData.role === "moderator") {
                    this.logger.log(`[STT] Moderator ${client.id} spoke: "${finalText}"`);
                    return;
                }
                const canSpeak = this.canClientSpeak(sessionRoom?.state, clientData.participantSide);
                if (!canSpeak) {
                    this.logger.warn(`Client ${client.id} tried to speak but it's not their turn`);
                    client.emit(types_1.S2C_EVENTS.ERROR, {
                        message: "現在はあなたの発話ターンではありません",
                    });
                    return;
                }
                await this.debateSession.processUtterance(clientData.sessionId, currentTurn, clientData.participantSide, finalText);
                this.wsConnection.broadcastToSession(clientData.sessionId, types_1.S2C_EVENTS.TRANSCRIPT_FINAL, {
                    text: finalText,
                    clientId: client.id,
                    side: clientData.participantSide,
                    turnIndex: currentTurn,
                });
                this.logger.log(`[STT→DB] セッション ${clientData.sessionId}, ターン ${currentTurn}, ${clientData.participantSide}側に発話処理完了: "${finalText}"`);
            }
            else {
                this.logger.warn(`Client ${client.id} spoke but no active turn found`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to process audio stop: ${error.message}`);
            client.emit(types_1.S2C_EVENTS.ERROR, {
                message: `音声処理に失敗しました: ${error.message}`,
            });
        }
    }
    async handleTextSend(payload, client) {
        try {
            this.logger.log(`Text received from client ${client.id}: ${payload.text}`);
            const clientData = this.wsConnection.getClient(client.id);
            if (!clientData?.sessionId || !clientData.participantSide) {
                client.emit(types_1.S2C_EVENTS.ERROR, {
                    message: "セッションに参加していません",
                });
                return;
            }
            const sessionRoom = this.wsConnection.getSessionRoom(clientData.sessionId);
            const currentTurn = this.getCurrentTurnFromState(sessionRoom?.state);
            if (currentTurn <= 0) {
                client.emit(types_1.S2C_EVENTS.ERROR, {
                    message: "まだディベートが開始されていません",
                });
                return;
            }
            const canSpeak = this.canClientSpeak(sessionRoom?.state, clientData.participantSide);
            if (!canSpeak) {
                client.emit(types_1.S2C_EVENTS.ERROR, {
                    message: "現在はあなたの発話ターンではありません",
                });
                return;
            }
            await this.debateSession.processUtterance(clientData.sessionId, currentTurn, clientData.participantSide, payload.text);
            this.wsConnection.broadcastToSession(clientData.sessionId, types_1.S2C_EVENTS.TRANSCRIPT_FINAL, {
                text: payload.text,
                clientId: client.id,
                side: clientData.participantSide,
                turnIndex: currentTurn,
            });
            this.logger.log(`Text processed for session ${clientData.sessionId}, turn ${currentTurn}, side ${clientData.participantSide}`);
        }
        catch (error) {
            this.logger.error(`Failed to process text: ${error.message}`);
            client.emit(types_1.S2C_EVENTS.ERROR, {
                message: `テキスト処理に失敗しました: ${error.message}`,
            });
        }
    }
    getCurrentTurnFromState(state) {
        if (!state)
            return 0;
        const stateStr = state.toString();
        if (stateStr.includes("TURN1"))
            return 1;
        if (stateStr.includes("TURN2"))
            return 2;
        if (stateStr.includes("FINAL"))
            return 3;
        return 0;
    }
    canClientSpeak(state, side) {
        if (!state || !side)
            return false;
        const stateStr = state.toString();
        if (side === client_1.Side.RIGHT && stateStr.includes("RIGHT"))
            return true;
        if (side === client_1.Side.LEFT && stateStr.includes("LEFT"))
            return true;
        return false;
    }
    handleSessionStats(payload, client) {
        const stats = this.wsConnection.getSessionStats(payload.sessionId);
        client.emit("session:stats", stats);
    }
    handlePing(client) {
        client.emit("pong", { timestamp: new Date().toISOString() });
    }
    handleAudioPlaybackCompleted(payload, client) {
        this.logger.log(`Audio playback completed for session: ${payload.sessionId}`);
        this.debateSession.onAudioPlaybackCompleted(payload.sessionId, payload.text, {
            error: payload.error,
            noAudio: payload.noAudio,
        });
    }
};
exports.DebateGateway = DebateGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], DebateGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(types_1.C2S_EVENTS.SESSION_CREATE),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], DebateGateway.prototype, "handleSessionCreate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(types_1.C2S_EVENTS.SESSION_JOIN),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], DebateGateway.prototype, "handleSessionJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("session:start"),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], DebateGateway.prototype, "handleSessionStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(types_1.C2S_EVENTS.AUDIO_START),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], DebateGateway.prototype, "handleAudioStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(types_1.C2S_EVENTS.AUDIO_CHUNK),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], DebateGateway.prototype, "handleAudioChunk", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(types_1.C2S_EVENTS.AUDIO_STOP),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], DebateGateway.prototype, "handleAudioStop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("text:send"),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], DebateGateway.prototype, "handleTextSend", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("session:stats"),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], DebateGateway.prototype, "handleSessionStats", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("ping"),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], DebateGateway.prototype, "handlePing", null);
__decorate([
    (0, websockets_1.SubscribeMessage)("audio:playback_completed"),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], DebateGateway.prototype, "handleAudioPlaybackCompleted", null);
exports.DebateGateway = DebateGateway = DebateGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: "*",
        },
    }),
    __metadata("design:paramtypes", [websocket_connection_service_1.WebSocketConnectionService,
        debate_session_service_1.DebateSessionService])
], DebateGateway);
//# sourceMappingURL=debate.gateway.js.map