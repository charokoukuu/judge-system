"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepositoriesModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
const session_repository_1 = require("./session.repository");
const utterance_repository_1 = require("./utterance.repository");
const turnresult_repository_1 = require("./turnresult.repository");
const verdict_repository_1 = require("./verdict.repository");
const airesponse_repository_1 = require("./airesponse.repository");
let RepositoriesModule = class RepositoriesModule {
};
exports.RepositoriesModule = RepositoriesModule;
exports.RepositoriesModule = RepositoriesModule = __decorate([
    (0, common_1.Module)({
        providers: [
            prisma_service_1.PrismaService,
            session_repository_1.SessionRepository,
            utterance_repository_1.UtteranceRepository,
            turnresult_repository_1.TurnResultRepository,
            verdict_repository_1.VerdictRepository,
            airesponse_repository_1.AIResponseRepository,
        ],
        exports: [
            prisma_service_1.PrismaService,
            session_repository_1.SessionRepository,
            utterance_repository_1.UtteranceRepository,
            turnresult_repository_1.TurnResultRepository,
            verdict_repository_1.VerdictRepository,
            airesponse_repository_1.AIResponseRepository,
        ],
    })
], RepositoriesModule);
//# sourceMappingURL=repositories.module.js.map