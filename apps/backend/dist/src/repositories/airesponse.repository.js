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
exports.AIResponseRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
let AIResponseRepository = class AIResponseRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.aIResponse.create({
            data,
        });
    }
    async findAll(include) {
        return this.prisma.aIResponse.findMany({
            include,
            orderBy: { createdAt: "desc" },
        });
    }
    async findById(id, include) {
        return this.prisma.aIResponse.findUnique({
            where: { id },
            include,
        });
    }
    async findBySessionId(sessionId, include) {
        return this.prisma.aIResponse.findMany({
            where: { sessionId },
            include,
            orderBy: { createdAt: "asc" },
        });
    }
    async findBySessionAndTurn(sessionId, turnIndex, include) {
        return this.prisma.aIResponse.findMany({
            where: {
                sessionId,
                turnIndex,
            },
            include,
            orderBy: { createdAt: "asc" },
        });
    }
    async update(id, data) {
        return this.prisma.aIResponse.update({
            where: { id },
            data,
        });
    }
    async delete(id) {
        return this.prisma.aIResponse.delete({
            where: { id },
        });
    }
    async deleteBySessionId(sessionId) {
        return this.prisma.aIResponse.deleteMany({
            where: { sessionId },
        });
    }
    async findLatestBySession(sessionId, include) {
        return this.prisma.aIResponse.findFirst({
            where: { sessionId },
            include,
            orderBy: { createdAt: "desc" },
        });
    }
    async findLatestBySessionAndTurn(sessionId, turnIndex, include) {
        return this.prisma.aIResponse.findFirst({
            where: {
                sessionId,
                turnIndex,
            },
            include,
            orderBy: { createdAt: "desc" },
        });
    }
    async countBySession(sessionId) {
        return this.prisma.aIResponse.count({
            where: { sessionId },
        });
    }
    async countBySessionAndTurn(sessionId, turnIndex) {
        return this.prisma.aIResponse.count({
            where: {
                sessionId,
                turnIndex,
            },
        });
    }
    async findResponsesInTimeRange(sessionId, startTime, endTime, include) {
        return this.prisma.aIResponse.findMany({
            where: {
                sessionId,
                createdAt: {
                    gte: startTime,
                    lte: endTime,
                },
            },
            include,
            orderBy: { createdAt: "asc" },
        });
    }
    async getResponsesByTurnIndex(turnIndex, include) {
        return this.prisma.aIResponse.findMany({
            where: { turnIndex },
            include,
            orderBy: { createdAt: "desc" },
        });
    }
};
exports.AIResponseRepository = AIResponseRepository;
exports.AIResponseRepository = AIResponseRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AIResponseRepository);
//# sourceMappingURL=airesponse.repository.js.map