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
var DebateSessionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebateSessionService = void 0;
const common_1 = require("@nestjs/common");
const websocket_connection_service_1 = require("./websocket-connection.service");
const repositories_1 = require("../repositories");
const client_1 = require("@prisma/client");
const openai_service_1 = require("../openai/openai.service");
const stylebart_service_1 = require("../stylebart/stylebart.service");
let DebateSessionService = DebateSessionService_1 = class DebateSessionService {
    constructor(wsConnection, sessionRepository, utteranceRepository, turnResultRepository, verdictRepository, aiResponseRepository, openaiService, stylebartService) {
        this.wsConnection = wsConnection;
        this.sessionRepository = sessionRepository;
        this.utteranceRepository = utteranceRepository;
        this.turnResultRepository = turnResultRepository;
        this.verdictRepository = verdictRepository;
        this.aiResponseRepository = aiResponseRepository;
        this.openaiService = openaiService;
        this.stylebartService = stylebartService;
        this.logger = new common_1.Logger(DebateSessionService_1.name);
        this.activeTurnTimers = new Map();
    }
    async createSession(config) {
        try {
            const session = await this.sessionRepository.create({
                theme: config.theme,
                state: client_1.SessionState.IDLE,
            });
            this.logger.log(`Created new debate session: ${session.id} with theme: "${config.theme}"`);
            return session.id;
        }
        catch (error) {
            this.logger.error(`Failed to create session: ${error.message}`);
            throw error;
        }
    }
    async startSession(sessionId) {
        try {
            const session = await this.sessionRepository.findById(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }
            if (session.state !== client_1.SessionState.IDLE) {
                throw new Error(`Session ${sessionId} is not in IDLE state`);
            }
            await this.sessionRepository.updateState(sessionId, client_1.SessionState.READY);
            this.wsConnection.updateSessionState(sessionId, client_1.SessionState.READY);
            const startMessage = `ディベートを開始します。テーマは「${session.theme}」です。3ターン、各30秒で進行します。`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 0,
                text: startMessage,
            });
            this.wsConnection.broadcastToSession(sessionId, "session:started", {
                sessionId,
                theme: session.theme,
                message: startMessage,
            });
            await this.generateAndBroadcastAudio(sessionId, startMessage);
            this.logger.log(`Session ${sessionId} started`);
            setTimeout(() => {
                this.startTurn(sessionId, 1, client_1.Side.RIGHT);
            }, 3000);
        }
        catch (error) {
            this.logger.error(`Failed to start session ${sessionId}: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `セッション開始に失敗しました: ${error.message}`,
            });
        }
    }
    async startTurn(sessionId, turnIndex, side) {
        try {
            let newState;
            if (turnIndex === 1) {
                newState =
                    side === client_1.Side.RIGHT
                        ? client_1.SessionState.TURN1_RIGHT
                        : client_1.SessionState.TURN1_LEFT;
            }
            else if (turnIndex === 2) {
                newState =
                    side === client_1.Side.RIGHT
                        ? client_1.SessionState.TURN2_RIGHT
                        : client_1.SessionState.TURN2_LEFT;
            }
            else if (turnIndex === 3) {
                newState =
                    side === client_1.Side.RIGHT
                        ? client_1.SessionState.FINAL_RIGHT
                        : client_1.SessionState.FINAL_LEFT;
            }
            else {
                throw new Error(`Invalid turn index: ${turnIndex}`);
            }
            await this.sessionRepository.updateState(sessionId, newState);
            this.wsConnection.updateSessionState(sessionId, newState);
            const sideText = side === client_1.Side.RIGHT ? "右" : "左";
            const turnText = turnIndex === 3 ? "最終弁論" : `第${turnIndex}ターン`;
            const message = `${turnText}、${sideText}の者、どうぞ。30秒でお話しください。`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex,
                text: message,
            });
            this.wsConnection.broadcastToSession(sessionId, "turn:started", {
                sessionId,
                turnIndex,
                side,
                message,
                duration: 30,
            });
            this.wsConnection.sendToSessionSide(sessionId, side, "turn:your_turn", {
                turnIndex,
                duration: 30,
                message: "あなたの発話時間です",
            });
            await this.generateAndBroadcastAudio(sessionId, message);
            this.setTurnTimer(sessionId, turnIndex, side);
            this.logger.log(`Started turn ${turnIndex} for ${side} side in session ${sessionId}`);
        }
        catch (error) {
            this.logger.error(`Failed to start turn: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `ターン開始に失敗しました: ${error.message}`,
            });
        }
    }
    setTurnTimer(sessionId, turnIndex, side) {
        this.clearTurnTimer(sessionId);
        const timeoutId = setTimeout(() => {
            this.endTurn(sessionId, turnIndex, side);
        }, 30000);
        const timer = {
            sessionId,
            turnIndex,
            side,
            startTime: new Date(),
            timeoutId,
        };
        this.activeTurnTimers.set(sessionId, timer);
    }
    clearTurnTimer(sessionId) {
        const timer = this.activeTurnTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer.timeoutId);
            this.activeTurnTimers.delete(sessionId);
        }
    }
    async endTurn(sessionId, turnIndex, side) {
        try {
            this.clearTurnTimer(sessionId);
            this.wsConnection.sendToSessionSide(sessionId, side, "turn:time_up", {
                turnIndex,
                side,
                message: "時間終了です",
            });
            this.wsConnection.broadcastToSession(sessionId, "turn:ended", {
                sessionId,
                turnIndex,
                side,
            });
            if (side === client_1.Side.RIGHT) {
                setTimeout(() => {
                    this.startTurn(sessionId, turnIndex, client_1.Side.LEFT);
                }, 2000);
            }
            else {
                setTimeout(() => {
                    this.wrapUpTurn(sessionId, turnIndex);
                }, 2000);
            }
            this.logger.log(`Ended turn ${turnIndex} for ${side} side in session ${sessionId}`);
        }
        catch (error) {
            this.logger.error(`Failed to end turn: ${error.message}`);
        }
    }
    async wrapUpTurn(sessionId, turnIndex) {
        try {
            let wrapUpState;
            if (turnIndex === 1) {
                wrapUpState = client_1.SessionState.TURN1_WRAPUP;
            }
            else if (turnIndex === 2) {
                wrapUpState = client_1.SessionState.TURN2_WRAPUP;
            }
            else if (turnIndex === 3) {
                wrapUpState = client_1.SessionState.FINAL_WRAPUP;
            }
            else {
                throw new Error(`Invalid turn index for wrap up: ${turnIndex}`);
            }
            await this.sessionRepository.updateState(sessionId, wrapUpState);
            this.wsConnection.updateSessionState(sessionId, wrapUpState);
            const utterances = await this.utteranceRepository.findBySessionAndTurn(sessionId, turnIndex);
            if (utterances.length === 0) {
                this.logger.warn(`No utterances found for session ${sessionId} turn ${turnIndex}`);
                setTimeout(() => {
                    this.proceedToNext(sessionId, turnIndex);
                }, 2000);
                return;
            }
            const rate = await this.evaluateTurn(sessionId, turnIndex, utterances);
            await this.turnResultRepository.upsertTurnResult({
                sessionId,
                turnIndex,
                rate,
            });
            const message = `第${turnIndex}ターンの評価が完了しました。`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex,
                text: message,
            });
            this.wsConnection.broadcastToSession(sessionId, "turn:evaluated", {
                sessionId,
                turnIndex,
                rate,
                message,
            });
            await this.generateAndBroadcastAudio(sessionId, message);
            setTimeout(() => {
                this.proceedToNext(sessionId, turnIndex);
            }, 3000);
        }
        catch (error) {
            this.logger.error(`Failed to wrap up turn: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `ターン評価に失敗しました: ${error.message}`,
            });
        }
    }
    async proceedToNext(sessionId, turnIndex) {
        if (turnIndex < 3) {
            setTimeout(() => {
                this.startTurn(sessionId, turnIndex + 1, client_1.Side.RIGHT);
            }, 2000);
        }
        else {
            setTimeout(() => {
                this.startFinalJudgment(sessionId);
            }, 2000);
        }
    }
    async startFinalJudgment(sessionId) {
        try {
            await this.sessionRepository.updateState(sessionId, client_1.SessionState.JUDGING);
            this.wsConnection.updateSessionState(sessionId, client_1.SessionState.JUDGING);
            const message = "全ての発言が出揃いました。最終判定を行います。";
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 3,
                text: message,
            });
            this.wsConnection.broadcastToSession(sessionId, "judgment:started", {
                sessionId,
                message,
            });
            await this.generateAndBroadcastAudio(sessionId, message);
            const verdict = await this.performFinalJudgment(sessionId);
            await this.verdictRepository.upsertVerdict(verdict);
            await this.announceVerdict(sessionId, verdict.winner, verdict.rationale);
        }
        catch (error) {
            this.logger.error(`Failed to start final judgment: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `最終判定に失敗しました: ${error.message}`,
            });
        }
    }
    async announceVerdict(sessionId, winner, rationale) {
        try {
            await this.sessionRepository.updateState(sessionId, client_1.SessionState.VERDICT);
            this.wsConnection.updateSessionState(sessionId, client_1.SessionState.VERDICT);
            const winnerText = winner === client_1.Winner.RIGHT ? "右" : "左";
            const message = `判定結果を発表します。勝者は${winnerText}の者です。${rationale}`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 3,
                text: message,
            });
            this.wsConnection.broadcastToSession(sessionId, "verdict:announced", {
                sessionId,
                winner,
                rationale,
                message,
            });
            await this.generateAndBroadcastAudio(sessionId, message);
            setTimeout(() => {
                this.finishSession(sessionId);
            }, 10000);
        }
        catch (error) {
            this.logger.error(`Failed to announce verdict: ${error.message}`);
        }
    }
    async finishSession(sessionId) {
        try {
            await this.sessionRepository.endSession(sessionId);
            this.wsConnection.updateSessionState(sessionId, client_1.SessionState.FINISHED);
            this.clearTurnTimer(sessionId);
            this.wsConnection.broadcastToSession(sessionId, "session:finished", {
                sessionId,
                message: "ディベートセッションが終了しました。",
            });
            this.logger.log(`Session ${sessionId} finished`);
        }
        catch (error) {
            this.logger.error(`Failed to finish session: ${error.message}`);
        }
    }
    async processUtterance(sessionId, turnIndex, side, text) {
        try {
            await this.utteranceRepository.upsertUtterance({
                sessionId,
                turnIndex,
                side,
                text,
            });
            this.wsConnection.broadcastToSession(sessionId, "utterance:received", {
                sessionId,
                turnIndex,
                side,
                text,
            });
            this.logger.log(`Processed utterance for session ${sessionId}, turn ${turnIndex}, side ${side}`);
        }
        catch (error) {
            this.logger.error(`Failed to process utterance: ${error.message}`);
        }
    }
    async evaluateTurn(sessionId, turnIndex, utterances) {
        try {
            const session = await this.sessionRepository.findById(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }
            const rightUtterances = utterances.filter((u) => u.side === client_1.Side.RIGHT);
            const leftUtterances = utterances.filter((u) => u.side === client_1.Side.LEFT);
            const rightText = rightUtterances.map((u) => u.text).join(" ");
            const leftText = leftUtterances.map((u) => u.text).join(" ");
            const prompt = `
ディベートのターン評価を行ってください。
テーマ: ${session.theme}
ターン: ${turnIndex}

右側の発言:
${rightText}

左側の発言:
${leftText}

以下の観点で評価し、右側を基準として-1.0から1.0のスコアを返してください:
- 論理性: 論理的一貫性と根拠の明確さ
- 説得力: 聞き手を納得させる力
- 反論への対応: 相手の主張への適切な対応

スコア（数値のみ）:
- 1.0: 右側が圧倒的に優勢
- 0.5: 右側がやや優勢
- 0.0: 引き分け
- -0.5: 左側がやや優勢
- -1.0: 左側が圧倒的に優勢

数値のみで回答してください（例: 0.3）
`;
            const response = await this.openaiService.chatCompletion([
                {
                    role: "system",
                    content: "あなたは公平で経験豊富なディベート審判です。",
                },
                { role: "user", content: prompt },
            ]);
            const score = parseFloat(response.trim());
            if (isNaN(score) || score < -1 || score > 1) {
                this.logger.warn(`Invalid evaluation score: ${response}, using 0`);
                return 0;
            }
            this.logger.log(`Turn ${turnIndex} evaluation score: ${score}`);
            return score;
        }
        catch (error) {
            this.logger.error(`Failed to evaluate turn: ${error.message}`);
            return 0;
        }
    }
    async performFinalJudgment(sessionId) {
        try {
            const session = await this.sessionRepository.findById(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }
            const allUtterances = [];
            for (let turn = 1; turn <= 3; turn++) {
                const utterances = await this.utteranceRepository.findBySessionAndTurn(sessionId, turn);
                allUtterances.push(...utterances);
            }
            const rightUtterances = allUtterances.filter((u) => u.side === client_1.Side.RIGHT);
            const leftUtterances = allUtterances.filter((u) => u.side === client_1.Side.LEFT);
            const rightSummary = rightUtterances
                .sort((a, b) => a.turnIndex - b.turnIndex)
                .map((u) => `ターン${u.turnIndex}: ${u.text}`)
                .join("\n");
            const leftSummary = leftUtterances
                .sort((a, b) => a.turnIndex - b.turnIndex)
                .map((u) => `ターン${u.turnIndex}: ${u.text}`)
                .join("\n");
            const turnResults = [];
            for (let turn = 1; turn <= 3; turn++) {
                const result = await this.turnResultRepository.findBySessionAndTurn(sessionId, turn);
                if (result) {
                    turnResults.push(`ターン${turn}: ${result.rate > 0 ? "右" : "左"}優勢 (スコア: ${result.rate})`);
                }
            }
            const prompt = `
ディベートの最終判定を行ってください。

テーマ: ${session.theme}

右側の発言:
${rightSummary}

左側の発言:
${leftSummary}

各ターンの評価結果:
${turnResults.join("\n")}

以下の観点で総合的に判断してください:
1. 論理性と一貫性
2. 根拠の明確さと説得力
3. 相手の主張への反駁の的確さ
4. 全体的な議論の構成力

勝者を「RIGHT」または「LEFT」で答え、その後に理由を100文字程度で説明してください。

回答形式:
勝者: RIGHT または LEFT
理由: [判定理由]
`;
            const response = await this.openaiService.chatCompletion([
                {
                    role: "system",
                    content: "あなたは公正で経験豊富なディベート審判です。論理性と説得力を重視して判定してください。",
                },
                { role: "user", content: prompt },
            ]);
            const lines = response.split("\n");
            let winner = client_1.Winner.RIGHT;
            let rationale = "論理性と根拠の明確さを総合的に判断した結果です。";
            for (const line of lines) {
                if (line.includes("勝者:") || line.includes("Winner:")) {
                    if (line.includes("LEFT")) {
                        winner = client_1.Winner.LEFT;
                    }
                    else if (line.includes("RIGHT")) {
                        winner = client_1.Winner.RIGHT;
                    }
                }
                else if (line.includes("理由:") || line.includes("Reason:")) {
                    const reasonMatch = line.match(/理由:\s*(.+)/) || line.match(/Reason:\s*(.+)/);
                    if (reasonMatch) {
                        rationale = reasonMatch[1].trim();
                    }
                }
            }
            this.logger.log(`Final judgment: ${winner}, rationale: ${rationale}`);
            return {
                sessionId,
                winner,
                rationale,
            };
        }
        catch (error) {
            this.logger.error(`Failed to perform final judgment: ${error.message}`);
            const winner = Math.random() > 0.5 ? client_1.Winner.RIGHT : client_1.Winner.LEFT;
            return {
                sessionId,
                winner,
                rationale: "システムエラーのため、ランダムに判定されました。",
            };
        }
    }
    async generateAndBroadcastAudio(sessionId, text) {
        try {
            this.logger.log(`Generating audio for text: "${text}"`);
            const audioBuffer = await this.stylebartService.textToSpeech(text);
            const audioBase64 = audioBuffer.toString("base64");
            this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
                text,
                audioData: audioBase64,
                audioType: "audio/wav",
            });
            this.logger.log(`Audio generated and broadcasted for session ${sessionId}`);
        }
        catch (error) {
            this.logger.error(`Failed to generate audio: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
                text,
                audioData: null,
                audioType: null,
                error: "Audio generation failed",
            });
        }
    }
};
exports.DebateSessionService = DebateSessionService;
exports.DebateSessionService = DebateSessionService = DebateSessionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [websocket_connection_service_1.WebSocketConnectionService,
        repositories_1.SessionRepository,
        repositories_1.UtteranceRepository,
        repositories_1.TurnResultRepository,
        repositories_1.VerdictRepository,
        repositories_1.AIResponseRepository,
        openai_service_1.OpenaiService,
        stylebart_service_1.StylebartService])
], DebateSessionService);
//# sourceMappingURL=debate-session.service.js.map