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
exports.TurnResultRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
let TurnResultRepository = class TurnResultRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.turnResult.create({
            data,
        });
    }
    async findAll(include) {
        return this.prisma.turnResult.findMany({
            include,
            orderBy: [{ sessionId: "desc" }, { turnIndex: "asc" }],
        });
    }
    async findById(id, include) {
        return this.prisma.turnResult.findUnique({
            where: { id },
            include,
        });
    }
    async findBySessionId(sessionId, include) {
        return this.prisma.turnResult.findMany({
            where: { sessionId },
            include,
            orderBy: { turnIndex: "asc" },
        });
    }
    async findBySessionAndTurn(sessionId, turnIndex, include) {
        return this.prisma.turnResult.findUnique({
            where: {
                sessionId_turnIndex: {
                    sessionId,
                    turnIndex,
                },
            },
            include,
        });
    }
    async update(id, data) {
        return this.prisma.turnResult.update({
            where: { id },
            data,
        });
    }
    async delete(id) {
        return this.prisma.turnResult.delete({
            where: { id },
        });
    }
    async deleteBySessionId(sessionId) {
        return this.prisma.turnResult.deleteMany({
            where: { sessionId },
        });
    }
    async upsertTurnResult(data) {
        return this.prisma.turnResult.upsert({
            where: {
                sessionId_turnIndex: {
                    sessionId: data.sessionId,
                    turnIndex: data.turnIndex,
                },
            },
            update: {
                rate: data.rate,
                scoresJson: data.scoresJson,
            },
            create: data,
        });
    }
    async getAverageRateBySession(sessionId) {
        const result = await this.prisma.turnResult.aggregate({
            where: { sessionId },
            _avg: {
                rate: true,
            },
        });
        return result._avg.rate;
    }
    async getTurnResultsWithScores(sessionId) {
        return this.prisma.turnResult.findMany({
            where: {
                sessionId,
                scoresJson: {
                    not: null,
                },
            },
            orderBy: { turnIndex: "asc" },
        });
    }
    async countBySession(sessionId) {
        return this.prisma.turnResult.count({
            where: { sessionId },
        });
    }
    async findLatestBySession(sessionId, include) {
        return this.prisma.turnResult.findFirst({
            where: { sessionId },
            include,
            orderBy: { turnIndex: "desc" },
        });
    }
};
exports.TurnResultRepository = TurnResultRepository;
exports.TurnResultRepository = TurnResultRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TurnResultRepository);
//# sourceMappingURL=turnresult.repository.js.map