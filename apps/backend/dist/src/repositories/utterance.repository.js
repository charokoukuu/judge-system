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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UtteranceRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
let UtteranceRepository = class UtteranceRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.utterance.create({
            data,
        });
    }
    async findAll(include) {
        return this.prisma.utterance.findMany({
            include,
            orderBy: { createdAt: "asc" },
        });
    }
    async findById(id, include) {
        return this.prisma.utterance.findUnique({
            where: { id },
            include,
        });
    }
    async findBySessionId(sessionId, include) {
        return this.prisma.utterance.findMany({
            where: { sessionId },
            include,
            orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }],
        });
    }
    async findBySessionAndTurn(sessionId, turnIndex, include) {
        return this.prisma.utterance.findMany({
            where: {
                sessionId,
                turnIndex,
            },
            include,
            orderBy: { createdAt: "asc" },
        });
    }
    async findBySessionTurnAndSide(sessionId, turnIndex, side, include) {
        return this.prisma.utterance.findUnique({
            where: {
                unique_utterance_per_side_per_turn: {
                    sessionId,
                    turnIndex,
                    side,
                },
            },
            include,
        });
    }
    async update(id, data) {
        return this.prisma.utterance.update({
            where: { id },
            data,
        });
    }
    async delete(id) {
        return this.prisma.utterance.delete({
            where: { id },
        });
    }
    async deleteBySessionId(sessionId) {
        return this.prisma.utterance.deleteMany({
            where: { sessionId },
        });
    }
    async upsertUtterance(data) {
        return this.prisma.utterance.upsert({
            where: {
                unique_utterance_per_side_per_turn: {
                    sessionId: data.sessionId,
                    turnIndex: data.turnIndex,
                    side: data.side,
                },
            },
            update: {
                text: data.text,
            },
            create: data,
        });
    }
    async countBySession(sessionId) {
        return this.prisma.utterance.count({
            where: { sessionId },
        });
    }
    async findBySide(sessionId, side, include) {
        return this.prisma.utterance.findMany({
            where: {
                sessionId,
                side,
            },
            include,
            orderBy: { turnIndex: "asc" },
        });
    }
};
exports.UtteranceRepository = UtteranceRepository;
exports.UtteranceRepository = UtteranceRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UtteranceRepository);
//# sourceMappingURL=utterance.repository.js.map