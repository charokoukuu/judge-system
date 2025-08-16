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
exports.VerdictRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
let VerdictRepository = class VerdictRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.verdict.create({
            data,
        });
    }
    async findAll(include) {
        return this.prisma.verdict.findMany({
            include,
            orderBy: { createdAt: "desc" },
        });
    }
    async findById(id, include) {
        return this.prisma.verdict.findUnique({
            where: { id },
            include,
        });
    }
    async findBySessionId(sessionId, include) {
        return this.prisma.verdict.findUnique({
            where: { sessionId },
            include,
        });
    }
    async update(id, data) {
        return this.prisma.verdict.update({
            where: { id },
            data,
        });
    }
    async updateBySessionId(sessionId, data) {
        return this.prisma.verdict.update({
            where: { sessionId },
            data,
        });
    }
    async delete(id) {
        return this.prisma.verdict.delete({
            where: { id },
        });
    }
    async deleteBySessionId(sessionId) {
        return this.prisma.verdict.delete({
            where: { sessionId },
        });
    }
    async upsertVerdict(data) {
        return this.prisma.verdict.upsert({
            where: { sessionId: data.sessionId },
            update: {
                winner: data.winner,
                rationale: data.rationale,
            },
            create: data,
        });
    }
    async findByWinner(winner, include) {
        return this.prisma.verdict.findMany({
            where: { winner },
            include,
            orderBy: { createdAt: "desc" },
        });
    }
    async getWinnerStatistics() {
        const stats = await this.prisma.verdict.groupBy({
            by: ["winner"],
            _count: {
                winner: true,
            },
        });
        return stats.map((stat) => ({
            winner: stat.winner,
            count: stat._count.winner,
        }));
    }
    async hasVerdict(sessionId) {
        const verdict = await this.prisma.verdict.findUnique({
            where: { sessionId },
            select: { id: true },
        });
        return verdict !== null;
    }
    async getRecentVerdicts(limit = 10, include) {
        return this.prisma.verdict.findMany({
            include,
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }
};
exports.VerdictRepository = VerdictRepository;
exports.VerdictRepository = VerdictRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], VerdictRepository);
//# sourceMappingURL=verdict.repository.js.map