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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UtterancesController = void 0;
const common_1 = require("@nestjs/common");
const repositories_1 = require("../repositories");
const client_1 = require("@prisma/client");
let UtterancesController = class UtterancesController {
    constructor(utteranceRepository) {
        this.utteranceRepository = utteranceRepository;
    }
    async getSessionUtterances(sessionId) {
        const utterances = await this.utteranceRepository.findBySessionId(sessionId);
        return {
            sessionId,
            utterances: utterances.map((utterance) => ({
                id: utterance.id,
                turnIndex: utterance.turnIndex,
                side: utterance.side,
                sideText: utterance.side === client_1.Side.RIGHT ? "右" : "左",
                text: utterance.text,
                createdAt: utterance.createdAt,
            })),
            total: utterances.length,
        };
    }
    async getTurnUtterances(sessionId, turnIndex) {
        const turnNum = parseInt(turnIndex, 10);
        const utterances = await this.utteranceRepository.findBySessionAndTurn(sessionId, turnNum);
        return {
            sessionId,
            turnIndex: turnNum,
            utterances: utterances.map((utterance) => ({
                id: utterance.id,
                side: utterance.side,
                sideText: utterance.side === client_1.Side.RIGHT ? "右" : "左",
                text: utterance.text,
                createdAt: utterance.createdAt,
            })),
            total: utterances.length,
        };
    }
};
exports.UtterancesController = UtterancesController;
__decorate([
    (0, common_1.Get)("session/:sessionId"),
    __param(0, (0, common_1.Param)("sessionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UtterancesController.prototype, "getSessionUtterances", null);
__decorate([
    (0, common_1.Get)("session/:sessionId/turn/:turnIndex"),
    __param(0, (0, common_1.Param)("sessionId")),
    __param(1, (0, common_1.Param)("turnIndex")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UtterancesController.prototype, "getTurnUtterances", null);
exports.UtterancesController = UtterancesController = __decorate([
    (0, common_1.Controller)("utterances"),
    __metadata("design:paramtypes", [repositories_1.UtteranceRepository])
], UtterancesController);
//# sourceMappingURL=utterances.controller.js.map