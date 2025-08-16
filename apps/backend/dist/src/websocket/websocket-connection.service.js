"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var WebSocketConnectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketConnectionService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let WebSocketConnectionService = WebSocketConnectionService_1 = class WebSocketConnectionService {
    constructor() {
        this.logger = new common_1.Logger(WebSocketConnectionService_1.name);
        this.connectedClients = new Map();
        this.sessionRooms = new Map();
    }
    setServer(server) {
        this.server = server;
    }
    handleConnection(socket) {
        this.logger.log(`Client connected: ${socket.id}`);
        const client = {
            socket,
            joinedAt: new Date(),
        };
        this.connectedClients.set(socket.id, client);
        socket.emit("connection:confirmed", {
            clientId: socket.id,
            timestamp: new Date().toISOString(),
        });
    }
    handleDisconnection(socket) {
        this.logger.log(`Client disconnected: ${socket.id}`);
        const client = this.connectedClients.get(socket.id);
        if (client?.sessionId) {
            this.leaveSession(socket.id, client.sessionId);
        }
        this.connectedClients.delete(socket.id);
    }
    joinSession(clientId, sessionId, role, side) {
        const client = this.connectedClients.get(clientId);
        if (!client) {
            this.logger.warn(`Client ${clientId} not found for session join`);
            return false;
        }
        if (client.sessionId) {
            this.leaveSession(clientId, client.sessionId);
        }
        let sessionRoom = this.sessionRooms.get(sessionId);
        if (!sessionRoom) {
            sessionRoom = {
                sessionId,
                clients: new Map(),
                state: client_1.SessionState.IDLE,
                createdAt: new Date(),
            };
            this.sessionRooms.set(sessionId, sessionRoom);
            this.logger.log(`Created new session room: ${sessionId}`);
        }
        client.sessionId = sessionId;
        client.role = role;
        client.participantSide = side;
        sessionRoom.clients.set(clientId, client);
        client.socket.join(sessionId);
        this.logger.log(`Client ${clientId} joined session ${sessionId} as ${role}${side ? ` (${side} side)` : ""}`);
        client.socket.emit("session:joined", {
            sessionId,
            role,
            side,
            participantCount: sessionRoom.clients.size,
        });
        client.socket.to(sessionId).emit("session:participant_joined", {
            clientId,
            role,
            side,
            participantCount: sessionRoom.clients.size,
        });
        return true;
    }
    leaveSession(clientId, sessionId) {
        const client = this.connectedClients.get(clientId);
        const sessionRoom = this.sessionRooms.get(sessionId);
        if (!client || !sessionRoom) {
            return false;
        }
        client.socket.leave(sessionId);
        sessionRoom.clients.delete(clientId);
        client.sessionId = undefined;
        client.role = undefined;
        client.participantSide = undefined;
        this.logger.log(`Client ${clientId} left session ${sessionId}`);
        client.socket.emit("session:left", { sessionId });
        client.socket.to(sessionId).emit("session:participant_left", {
            clientId,
            participantCount: sessionRoom.clients.size,
        });
        if (sessionRoom.clients.size === 0) {
            this.sessionRooms.delete(sessionId);
            this.logger.log(`Removed empty session room: ${sessionId}`);
        }
        return true;
    }
    broadcastToSession(sessionId, event, data) {
        if (!this.server) {
            this.logger.warn("Server not set, cannot broadcast");
            return;
        }
        this.server.to(sessionId).emit(event, data);
        this.logger.debug(`Broadcasted ${event} to session ${sessionId}`);
    }
    sendToClient(clientId, event, data) {
        const client = this.connectedClients.get(clientId);
        if (!client) {
            this.logger.warn(`Client ${clientId} not found for message send`);
            return false;
        }
        client.socket.emit(event, data);
        this.logger.debug(`Sent ${event} to client ${clientId}`);
        return true;
    }
    sendToSessionRole(sessionId, role, event, data) {
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
    sendToSessionSide(sessionId, side, event, data) {
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
    updateSessionState(sessionId, state) {
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
    getSessionRoom(sessionId) {
        return this.sessionRooms.get(sessionId);
    }
    getClient(clientId) {
        return this.connectedClients.get(clientId);
    }
    getSessionParticipantCount(sessionId) {
        const sessionRoom = this.sessionRooms.get(sessionId);
        return sessionRoom ? sessionRoom.clients.size : 0;
    }
    getActiveSessions() {
        return Array.from(this.sessionRooms.keys());
    }
    getConnectedClientCount() {
        return this.connectedClients.size;
    }
    getSessionStats(sessionId) {
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
            }
            else if (client.participantSide === client_1.Side.RIGHT) {
                rightSideCount++;
            }
            else if (client.participantSide === client_1.Side.LEFT) {
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
};
exports.WebSocketConnectionService = WebSocketConnectionService;
exports.WebSocketConnectionService = WebSocketConnectionService = WebSocketConnectionService_1 = __decorate([
    (0, common_1.Injectable)()
], WebSocketConnectionService);
//# sourceMappingURL=websocket-connection.service.js.map