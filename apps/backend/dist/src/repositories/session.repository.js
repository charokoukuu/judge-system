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
exports.SessionRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
const client_1 = require("@prisma/client");
let SessionRepository = class SessionRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.session.create({
            data: {
                theme: data.theme,
                state: data.state || client_1.SessionState.IDLE,
            },
        });
    }
    async findAll(include) {
        return this.prisma.session.findMany({
            include,
            orderBy: { createdAt: "desc" },
        });
    }
    async findById(id, include) {
        return this.prisma.session.findUnique({
            where: { id },
            include,
        });
    }
    async findByState(state, include) {
        return this.prisma.session.findMany({
            where: { state },
            include,
            orderBy: { createdAt: "desc" },
        });
    }
    async update(id, data) {
        return this.prisma.session.update({
            where: { id },
            data,
        });
    }
    async delete(id) {
        return this.prisma.session.delete({
            where: { id },
        });
    }
    async findWithAllRelations(id) {
        return this.prisma.session.findUnique({
            where: { id },
            include: {
                utterances: {
                    orderBy: { createdAt: "asc" },
                },
                verdict: true,
                turnResults: {
                    orderBy: { turnIndex: "asc" },
                },
                AIResponse: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });
    }
    async updateState(id, state) {
        return this.prisma.session.update({
            where: { id },
            data: { state },
        });
    }
    async endSession(id) {
        return this.prisma.session.update({
            where: { id },
            data: {
                state: client_1.SessionState.FINISHED,
                endedAt: new Date(),
            },
        });
    }
};
exports.SessionRepository = SessionRepository;
exports.SessionRepository = SessionRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SessionRepository);
//# sourceMappingURL=session.repository.js.map