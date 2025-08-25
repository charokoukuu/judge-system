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
const timer_1 = require("../util/timer");
const judge_trigger_1 = require("../util/judge-trigger");
let DebateSessionService = DebateSessionService_1 = class DebateSessionService {
    isDuplicateMessage(sessionId, text, windowMs = 3000) {
        const key = `${sessionId}:${text}`;
        const now = Date.now();
        const lastSent = this.lastSentMessages.get(key);
        if (lastSent && now - lastSent.timestamp < windowMs) {
            this.logger.debug(`Duplicate message prevented for session ${sessionId}: "${text}"`);
            return true;
        }
        this.lastSentMessages.set(key, { text, timestamp: now });
        if (this.lastSentMessages.size % 100 === 0) {
            for (const [k, data] of this.lastSentMessages.entries()) {
                if (now - data.timestamp > 300000) {
                    this.lastSentMessages.delete(k);
                }
            }
        }
        return false;
    }
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
        this.pendingAudioPlaybacks = new Map();
        this.lastSentMessages = new Map();
    }
    async createSession(config) {
        await (0, judge_trigger_1.judgeTrigger)("0", { isMute: true });
        await (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.idle);
        try {
            await this.stopAllActiveSessions();
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
    async stopAllActiveSessions() {
        try {
            const activeSessions = this.wsConnection.getActiveSessions();
            if (activeSessions.length === 0) {
                this.logger.log("No active sessions to stop");
                return;
            }
            this.logger.warn(`Stopping ${activeSessions.length} active session(s) before creating new session`);
            for (const sessionId of activeSessions) {
                await this.forceStopSession(sessionId);
            }
            this.logger.log("All active sessions have been stopped");
        }
        catch (error) {
            this.logger.error(`Error stopping active sessions: ${error.message}`);
        }
    }
    async forceStopSession(sessionId) {
        try {
            this.logger.warn(`Force stopping session: ${sessionId}`);
            this.clearSessionTimers(sessionId);
            this.clearPendingAudioPlaybacks(sessionId);
            try {
                await this.sessionRepository.updateState(sessionId, client_1.SessionState.FINISHED);
            }
            catch (dbError) {
                this.logger.warn(`Failed to update session state in DB: ${dbError.message}`);
            }
            this.wsConnection.broadcastToSession(sessionId, "session:force_stopped", {
                sessionId,
                reason: "New session being created",
                timestamp: new Date().toISOString(),
            });
            const sessionRoom = this.wsConnection.getSessionRoom(sessionId);
            if (sessionRoom) {
                const clientIds = Array.from(sessionRoom.clients.keys());
                for (const clientId of clientIds) {
                    this.wsConnection.leaveSession(clientId, sessionId);
                }
            }
            this.logger.log(`Session ${sessionId} has been force stopped`);
        }
        catch (error) {
            this.logger.error(`Error force stopping session ${sessionId}: ${error.message}`);
        }
    }
    clearSessionTimers(sessionId) {
        const timer = this.activeTurnTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer.timeoutId);
            this.activeTurnTimers.delete(sessionId);
            this.logger.log(`Cleared timer for session ${sessionId}`);
        }
    }
    clearPendingAudioPlaybacks(sessionId) {
        const keysToDelete = [];
        for (const [key, playback] of this.pendingAudioPlaybacks.entries()) {
            if (playback.sessionId === sessionId) {
                clearTimeout(playback.timeout);
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach((key) => {
            this.pendingAudioPlaybacks.delete(key);
        });
        if (keysToDelete.length > 0) {
            this.logger.log(`Cleared ${keysToDelete.length} pending audio playbacks for session ${sessionId}`);
        }
    }
    async startSession(sessionId) {
        (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.idle);
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
            const systemPrompt = `
あなたは与えられたテーマ文を読み取り、それを議論可能な2つの立場に分けてください。  
必ずJSON形式で返してください。説明や文章は不要です。  

出力形式:
{
  "right": "立場1",
  "left": "立場2"
}

例1:  
テーマ: 「ずんだもんは人間か動物か」  
出力: {"right": "人間", "left": "動物"}

例2:  
テーマ: 「AIの規制は必要か」  
出力: {"right": "賛成", "left": "反対"}

例3:  
テーマ: 「VRは現実を超えるか」  
出力: {"right": "VR", "left": "現実"}

次のテーマについて出力してください。
`;
            const result = JSON.parse(await this.openaiService.chatCompletion([
                { role: "system", content: systemPrompt },
                { role: "user", content: session.theme },
            ], "gpt-4o-mini"));
            const startMessage = `魔法の天秤で真実を測る時が来たのじゃ。議題は「${session.theme}」じゃ。3回の弁論で真理を探るのじゃ。太陽の皿は${result.right}、月の皿は${result.left}の立場を担うのじゃ。`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 0,
                text: startMessage,
            });
            await this.generateAndBroadcastAudioSync(sessionId, startMessage, () => {
                this.wsConnection.broadcastToSession(sessionId, "session:started", {
                    sessionId,
                    theme: session.theme,
                    message: startMessage,
                    positions: {
                        right: result.right,
                        left: result.left,
                    },
                });
            });
            const beaverRightMessage = `それぞれの皿にビーバーを配置するのじゃ。まずは右の者、太陽の皿にビーバーを乗せてくれ。`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 0,
                text: beaverRightMessage,
            });
            setTimeout(() => {
                (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.right);
                (0, judge_trigger_1.judgeTrigger)("35");
            }, 3000);
            await this.generateAndBroadcastAudioSync(sessionId, beaverRightMessage, () => {
                this.wsConnection.broadcastToSession(sessionId, "beaver:right_instruction", {
                    sessionId,
                    message: beaverRightMessage,
                });
            });
            await (0, timer_1.timer)(4000);
            (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.left);
            await (0, judge_trigger_1.judgeTrigger)("-35");
            const beaverLeftMessage = `次に左の者、月の皿にビーバーを配置するのじゃ`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 0,
                text: beaverLeftMessage,
            });
            await this.generateAndBroadcastAudioSync(sessionId, beaverLeftMessage, () => {
                this.wsConnection.broadcastToSession(sessionId, "beaver:left_instruction", {
                    sessionId,
                    message: beaverLeftMessage,
                });
            });
            await (0, timer_1.timer)(4000);
            await (0, judge_trigger_1.judgeTrigger)("0");
            await (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.idle);
            const debateStartMessage = `それでは弁論を開始するのじゃ`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 0,
                text: debateStartMessage,
            });
            await this.generateAndBroadcastAudioSync(sessionId, debateStartMessage, () => {
                this.wsConnection.broadcastToSession(sessionId, "debate:start_instruction", {
                    sessionId,
                    message: debateStartMessage,
                });
            });
            await this.startTurn(sessionId, 1, client_1.Side.RIGHT);
            this.logger.log(`Session ${sessionId} started`);
        }
        catch (error) {
            this.logger.error(`Failed to start session ${sessionId}: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `セッション開始でエラーが発生しました: ${error.message}`,
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
            const sideText = side === client_1.Side.RIGHT ? "太陽の皿" : "月の皿";
            const message = `${sideText}の方、8秒でお聞かせくだされ。`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex,
                text: message,
            });
            if (side === client_1.Side.RIGHT) {
                if (turnIndex === 1) {
                    await (0, judge_trigger_1.judgeTrigger)("0", { isMute: true });
                }
                else {
                    await (0, judge_trigger_1.judgeTrigger)("0");
                }
                await (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.idle);
                const turnMessage = turnIndex === 3
                    ? "最終弁論じゃ。これまでの議論をまとめて話してくれい。"
                    : `第${turnIndex}回目の弁論を始めるのじゃ。`;
                if (turnIndex !== 1) {
                    await this.generateAndBroadcastAudioSync(sessionId, turnMessage, () => {
                        this.wsConnection.broadcastToSession(sessionId, "turn:started", {
                            sessionId,
                            turnIndex,
                            message: turnMessage,
                        });
                    });
                }
            }
            await this.generateAndBroadcastAudioSync(sessionId, message, async () => {
                await this.sessionRepository.updateState(sessionId, newState);
                this.wsConnection.updateSessionState(sessionId, newState);
                this.wsConnection.broadcastToSession(sessionId, "turn:started", {
                    sessionId,
                    turnIndex,
                    side,
                    message,
                });
                this.wsConnection.sendToSessionSide(sessionId, side, "turn:your_turn", {
                    turnIndex,
                    duration: 30,
                    message: "おぬしの発言の時間じゃ。どうぞ話してくれい。",
                });
            });
            (0, judge_trigger_1.ledTrigger)(side === client_1.Side.RIGHT ? judge_trigger_1.State.recordingR : judge_trigger_1.State.recordingL);
            this.setTurnTimer(sessionId, turnIndex, side);
            this.wsConnection.broadcastToSession(sessionId, "turn:countdown_started", {
                sessionId,
                turnIndex,
                side,
                duration: 8,
            });
            this.logger.log(`Timer started for turn ${turnIndex} after audio completion in session ${sessionId}`);
            this.logger.log(`Started turn ${turnIndex} for ${side} side in session ${sessionId}`);
        }
        catch (error) {
            this.logger.error(`Failed to start turn: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `弁論開始でエラーが発生しました: ${error.message}`,
            });
        }
    }
    setTurnTimer(sessionId, turnIndex, side) {
        this.clearTurnTimer(sessionId);
        const timeoutId = setTimeout(() => {
            this.endTurn(sessionId, turnIndex, side);
        }, 8000);
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
                message: "時間になったのじゃ。ご苦労であった。",
            });
            this.wsConnection.broadcastToSession(sessionId, "turn:ended", {
                sessionId,
                turnIndex,
                side,
            });
            if (side === client_1.Side.RIGHT) {
                let utterances = null;
                while (!utterances) {
                    utterances = await this.utteranceRepository.findBySessionTurnAndSide(sessionId, turnIndex, side);
                    await (0, timer_1.timer)(300);
                }
                await this.wsConnection.broadcastToSession(sessionId, "turn:started", {
                    sessionId,
                    turnIndex,
                    side,
                    message: `内容: ${utterances.text}`,
                });
                await (0, timer_1.timer)(3000);
                await this.startTurn(sessionId, turnIndex, client_1.Side.LEFT);
                await (0, timer_1.timer)(2000);
            }
            else {
                let utterances = null;
                while (!utterances) {
                    utterances = await this.utteranceRepository.findBySessionTurnAndSide(sessionId, turnIndex, side);
                    await (0, timer_1.timer)(300);
                }
                await this.wsConnection.broadcastToSession(sessionId, "turn:started", {
                    sessionId,
                    turnIndex,
                    side,
                    message: `内容: ${utterances.text}`,
                });
                await (0, timer_1.timer)(3000);
                this.wrapUpTurn(sessionId, turnIndex);
                await (0, timer_1.timer)(2000);
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
            this.logger.log(`[DB確認] ターン ${turnIndex} の発話データ取得: ${utterances.length}件`);
            utterances.forEach((utterance, index) => {
                const sideText = utterance.side === client_1.Side.RIGHT ? "右" : "左";
                this.logger.log(`  ${index + 1}. ${sideText}側: "${utterance.text}"`);
            });
            if (utterances.length === 0) {
                this.logger.warn(`No utterances found for session ${sessionId} turn ${turnIndex}`);
                setTimeout(() => {
                    this.proceedToNext(sessionId, turnIndex);
                }, 2000);
                return;
            }
            const evaluation = await this.evaluateTurn(sessionId, turnIndex, utterances);
            await this.turnResultRepository.upsertTurnResult({
                sessionId,
                turnIndex,
                rate: evaluation,
            });
            console.log("評価： ", evaluation);
            let advantageMessage = "";
            if (evaluation > 0.3) {
                advantageMessage = "太陽の皿が優勢じゃ。";
            }
            else if (evaluation < -0.3) {
                advantageMessage = "月の皿が優勢じゃ。";
            }
            const evaluationMessage = `第${turnIndex}回目の弁論の評価が完了したのじゃ。`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex,
                text: evaluationMessage,
            });
            if (turnIndex === 3) {
                this.proceedToNext(sessionId, turnIndex);
                return;
            }
            await this.generateAndBroadcastAudioSync(sessionId, evaluationMessage, async () => {
                this.wsConnection.broadcastToSession(sessionId, "turn:evaluated", {
                    sessionId,
                    turnIndex,
                    rate: evaluation,
                    message: evaluationMessage,
                });
                (0, judge_trigger_1.ledTrigger)(evaluation > 0.3
                    ? judge_trigger_1.State.right
                    : evaluation < -0.3
                        ? judge_trigger_1.State.left
                        : judge_trigger_1.State.idle);
                await (0, judge_trigger_1.judgeTrigger)((evaluation * 55).toString());
            });
            if (advantageMessage) {
                await this.aiResponseRepository.create({
                    sessionId,
                    turnIndex,
                    text: advantageMessage,
                });
                await this.generateAndBroadcastAudioSync(sessionId, advantageMessage, () => {
                    this.wsConnection.broadcastToSession(sessionId, "turn:advantage", {
                        sessionId,
                        turnIndex,
                        rate: evaluation,
                        message: advantageMessage,
                    });
                });
            }
            setTimeout(() => {
                this.proceedToNext(sessionId, turnIndex);
            }, 3000);
        }
        catch (error) {
            this.logger.error(`Failed to wrap up turn: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `弁論評価でエラーが発生しました: ${error.message}`,
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
            await (0, judge_trigger_1.judgeTrigger)("0", { isMute: true });
            await this.sessionRepository.updateState(sessionId, client_1.SessionState.JUDGING);
            this.wsConnection.updateSessionState(sessionId, client_1.SessionState.JUDGING);
            const judgingMessage = "全ての弁論が終了したのじゃ。最終判定を行うぞい。";
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 3,
                text: judgingMessage,
            });
            const judgmentPromise = this.performFinalJudgment(sessionId);
            await this.generateAndBroadcastAudioSync(sessionId, judgingMessage, async () => {
                (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.judging);
                await this.wsConnection.broadcastToSession(sessionId, "judgment:started", {
                    sessionId,
                    message: judgingMessage,
                });
            });
            await (0, timer_1.timer)(2700);
            await (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.loading);
            await (0, judge_trigger_1.judgeTrigger)("0", { isMute: true, state: judge_trigger_1.State.loading });
            this.wsConnection.broadcastToSession(sessionId, "loading:start", {
                sessionId,
                message: "",
            });
            const verdict = await judgmentPromise;
            await this.verdictRepository.upsertVerdict(verdict);
            console.log(`Verdict announced for session ${sessionId}: ${JSON.stringify(verdict)}`);
            await this.announceVerdict(sessionId, verdict.winner, verdict.rationale);
        }
        catch (error) {
            this.logger.error(`Failed to start final judgment: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "error", {
                message: `最終判定でエラーが発生しました: ${error.message}`,
            });
        }
    }
    async announceVerdict(sessionId, winner, rationale) {
        try {
            await this.sessionRepository.updateState(sessionId, client_1.SessionState.VERDICT);
            this.wsConnection.updateSessionState(sessionId, client_1.SessionState.VERDICT);
            const winnerText = winner === client_1.Winner.RIGHT ? "太陽の皿" : "月の皿";
            const message = `魔法の天秤による判定の結果を発表するのじゃ。勝者は${winnerText}じゃ。${rationale}`;
            await this.aiResponseRepository.create({
                sessionId,
                turnIndex: 3,
                text: message,
            });
            await this.generateAndBroadcastAudioSync(sessionId, message, async () => {
                this.wsConnection.broadcastToSession(sessionId, "verdict:announced", {
                    sessionId,
                    winner,
                    rationale,
                    message,
                });
                await this.wsConnection.broadcastToSession(sessionId, "loading:stop", {});
                await (0, timer_1.timer)(2000);
                (0, judge_trigger_1.ledTrigger)(winner === client_1.Side.RIGHT ? judge_trigger_1.State.finishR : judge_trigger_1.State.finishL);
                await (0, judge_trigger_1.judgeTrigger)(winner === client_1.Side.RIGHT ? "35" : "-35");
            });
            await (0, timer_1.timer)(3000);
            (0, judge_trigger_1.ledTrigger)(judge_trigger_1.State.idle);
            await (0, judge_trigger_1.judgeTrigger)("0");
            await this.finishSession(sessionId);
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
            const message = "魔法の天秤による弁論が終了したのじゃ。みなさん、ご苦労であった。";
            await this.generateAndBroadcastAudioSync(sessionId, message, async () => {
                this.wsConnection.broadcastToSession(sessionId, "session:finished", {
                    sessionId,
                    message,
                });
            });
            this.logger.log(`Session ${sessionId} finished`);
        }
        catch (error) {
            this.logger.error(`Failed to finish session: ${error.message}`);
        }
    }
    async processUtterance(sessionId, turnIndex, side, text) {
        this.logger.log(`[DB処理開始] processUtterance呼び出し - sessionId: ${sessionId}, turnIndex: ${turnIndex}, side: ${side}, text: "${text}"`);
        try {
            this.logger.log(`[DB実行中] upsertUtteranceを実行中...`);
            const result = await this.utteranceRepository.upsertUtterance({
                sessionId,
                turnIndex,
                side,
                text,
            });
            this.logger.log(`[DB保存成功] 発話ID: ${result.id}, セッション: ${sessionId}, ターン: ${turnIndex}, サイド: ${side}`);
            this.wsConnection.broadcastToSession(sessionId, "utterance:received", {
                sessionId,
                turnIndex,
                side,
                text,
            });
            const sideText = side === client_1.Side.RIGHT ? "右" : "左";
            this.logger.log(`[STT] セッション ${sessionId}, ターン ${turnIndex}, ${sideText}側の発話をDBに保存: "${text}"`);
        }
        catch (error) {
            this.logger.error(`[DB保存エラー] Failed to process utterance: ${error.message}`);
            this.logger.error(`[DB保存エラー] Stack trace:`, error.stack);
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
            let allUtterances = [];
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
                    turnResults.push(`ターン${turn}: ${result.rate > 0 ? "太陽の皿" : "月の皿"}優勢 (スコア: ${result.rate})`);
                }
            }
            const prompt = `
あなたは古い魔法の天秤を操る賢者です。ディベートの最終判定を行い、魔法使いの口調で結果を発表してください。

議題: ${session.theme}

太陽の皿（右側）の弁論:
${rightSummary}

月の皿（左側）の弁論:
${leftSummary}

各ターンでの天秤の傾き:
${turnResults.join("\n")}

以下の観点で総合的に判断してください:
1. 論理性と一貫性
2. 根拠の明確さと説得力
3. 相手の主張への反駁の的確さ
4. 全体的な議論の構成力

勝者を「太陽」または「月」で答え、その後に理由を100文字程度で魔法使い口調（〜じゃ、〜のじゃ等）で説明してください。

回答形式:
勝者: 太陽 または 月
理由: [魔法使い口調での判定理由]
`;
            const response = await this.openaiService.chatCompletion([
                {
                    role: "system",
                    content: "あなたは魔法の天秤を操る古い賢者です。常に魔法使いの口調（〜じゃ、〜のじゃ、〜であろう等）で話してください。論理性と説得力を重視して公正に判定し、結果を魔法使いらしく発表してください。",
                },
                { role: "user", content: prompt },
            ]);
            const lines = response.split("\n");
            let winner = client_1.Winner.RIGHT;
            let rationale = "論理と説得力を総合的に判断した結果じゃ。";
            for (const line of lines) {
                if (line.includes("勝者:") || line.includes("Winner:")) {
                    if (line.includes("月")) {
                        winner = client_1.Winner.LEFT;
                    }
                    else if (line.includes("太陽")) {
                        winner = client_1.Winner.RIGHT;
                    }
                    else if (line.includes("LEFT")) {
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
            if (this.isDuplicateMessage(sessionId, text)) {
                this.logger.debug(`Skipping duplicate audio generation for session ${sessionId}: "${text}"`);
                return;
            }
            this.logger.log(`Generating audio for text: "${text}"`);
            const audioBuffer = await this.stylebartService.textToSpeech(text);
            if (audioBuffer) {
                const audioBase64 = audioBuffer.toString("base64");
                this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
                    sessionId,
                    text,
                    audioData: audioBase64,
                    audioType: "audio/wav",
                });
                this.logger.log(`Audio generated and broadcasted for session ${sessionId}`);
            }
            else {
                this.logger.log(`TTS API unavailable, sending text only for session ${sessionId}`);
                this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
                    sessionId,
                    text,
                    audioData: null,
                    audioType: null,
                    textOnly: true,
                });
            }
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
    async transcribeAudio(audioBuffer) {
        this.logger.log(`Transcribing audio buffer of size: ${audioBuffer.length}`);
        try {
            const transcription = await this.openaiService.transcribeAudio(audioBuffer);
            this.logger.log(`Transcription successful: "${transcription}"`);
            return transcription;
        }
        catch (error) {
            this.logger.error(`Transcription failed: ${error.message}`);
            throw new Error(`音声認識に失敗しました: ${error.message}`);
        }
    }
    onAudioPlaybackCompleted(sessionId, text, options = {}) {
        this.logger.log(`Audio playback completed for session ${sessionId}: "${text}"`);
        const pendingKey = `${sessionId}-${text}`;
        const pending = this.pendingAudioPlaybacks.get(pendingKey);
        if (pending) {
            if (pending.timeout) {
                clearTimeout(pending.timeout);
            }
            pending.callback();
            this.pendingAudioPlaybacks.delete(pendingKey);
            this.logger.log(`Executed pending callback for: "${text}"`);
        }
        else {
            this.logger.warn(`No pending callback found for: "${text}"`);
        }
    }
    async generateAndBroadcastAudioSync(sessionId, text, callback) {
        try {
            if (this.isDuplicateMessage(sessionId, text)) {
                this.logger.debug(`Skipping duplicate audio generation for session ${sessionId}: "${text}"`);
                callback?.();
                return;
            }
            this.logger.log(`Generating audio for text: "${text}"`);
            const audioBuffer = await this.stylebartService.textToSpeech(text);
            if (audioBuffer) {
                const audioBase64 = audioBuffer.toString("base64");
                return new Promise((resolve) => {
                    const pendingKey = `${sessionId}-${text}`;
                    const timeout = setTimeout(() => {
                        this.logger.warn(`Audio playback timeout for: "${text}"`);
                        this.pendingAudioPlaybacks.delete(pendingKey);
                        resolve();
                    }, 50000);
                    this.pendingAudioPlaybacks.set(pendingKey, {
                        sessionId,
                        text,
                        callback: resolve,
                        timeout,
                    });
                    this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
                        sessionId,
                        text,
                        audioData: audioBase64,
                        audioType: "audio/wav",
                    });
                    callback?.();
                    this.logger.log(`Audio generated and broadcasted for session ${sessionId}, waiting for playback completion`);
                });
            }
            else {
                this.logger.log(`TTS API unavailable, sending text only for session ${sessionId}`);
                this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
                    sessionId,
                    text,
                    audioData: null,
                    audioType: null,
                    textOnly: true,
                });
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        catch (error) {
            this.logger.error(`Failed to generate audio: ${error.message}`);
            this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
                sessionId,
                text,
                audioData: null,
                audioType: null,
                error: "Audio generation failed",
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    generateAndBroadcastAudioAsync(sessionId, text, onAudioCompleted) {
        this.generateAndBroadcastAudio(sessionId, text)
            .then(() => {
            if (onAudioCompleted) {
                onAudioCompleted();
            }
        })
            .catch((error) => {
            this.logger.error(`Async audio generation failed: ${error.message}`);
            if (onAudioCompleted) {
                onAudioCompleted();
            }
        });
    }
    async preloadCommonAudioMessages() {
        const commonMessages = [
            "魔法の天秤が真実を測る時が来たのじゃ。",
            "第1回目の弁論を始めるのじゃ。太陽の皿の方、8秒で話してくれい。",
            "第1回目の弁論を始めるのじゃ。月の皿の方、8秒で話してくれい。",
            "時間になったのじゃ。ご苦労であった。",
            "この回の弁論は終了じゃ。",
            "魔法の天秤で評価中じゃ。少々待つのじゃ。",
        ];
        for (const message of commonMessages) {
            try {
                await this.stylebartService.textToSpeech(message);
                this.logger.log(`Preloaded audio for: "${message}"`);
            }
            catch (error) {
                this.logger.warn(`Failed to preload audio for: "${message}"`);
            }
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