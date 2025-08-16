"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIResponseRepository = exports.VerdictRepository = exports.TurnResultRepository = exports.UtteranceRepository = exports.SessionRepository = exports.PrismaService = void 0;
var prisma_service_1 = require("./prisma.service");
Object.defineProperty(exports, "PrismaService", { enumerable: true, get: function () { return prisma_service_1.PrismaService; } });
var session_repository_1 = require("./session.repository");
Object.defineProperty(exports, "SessionRepository", { enumerable: true, get: function () { return session_repository_1.SessionRepository; } });
var utterance_repository_1 = require("./utterance.repository");
Object.defineProperty(exports, "UtteranceRepository", { enumerable: true, get: function () { return utterance_repository_1.UtteranceRepository; } });
var turnresult_repository_1 = require("./turnresult.repository");
Object.defineProperty(exports, "TurnResultRepository", { enumerable: true, get: function () { return turnresult_repository_1.TurnResultRepository; } });
var verdict_repository_1 = require("./verdict.repository");
Object.defineProperty(exports, "VerdictRepository", { enumerable: true, get: function () { return verdict_repository_1.VerdictRepository; } });
var airesponse_repository_1 = require("./airesponse.repository");
Object.defineProperty(exports, "AIResponseRepository", { enumerable: true, get: function () { return airesponse_repository_1.AIResponseRepository; } });
//# sourceMappingURL=index.js.map