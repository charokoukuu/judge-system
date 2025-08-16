import { Injectable, Logger } from "@nestjs/common";
import { WebSocketConnectionService } from "./websocket-connection.service";
import {
  SessionRepository,
  UtteranceRepository,
  TurnResultRepository,
  VerdictRepository,
  AIResponseRepository,
} from "../repositories";
import { SessionState, Side, Winner } from "@prisma/client";
import { OpenaiService } from "../openai/openai.service";
import { StylebartService } from "../stylebart/stylebart.service";

export interface DebateSessionConfig {
  theme: string;
  maxTurns?: number;
  turnDurationSeconds?: number;
}

export interface TurnTimer {
  sessionId: string;
  turnIndex: number;
  side: Side;
  startTime: Date;
  timeoutId: NodeJS.Timeout;
}

@Injectable()
export class DebateSessionService {
  private readonly logger = new Logger(DebateSessionService.name);
  private readonly activeTurnTimers = new Map<string, TurnTimer>();

  constructor(
    private readonly wsConnection: WebSocketConnectionService,
    private readonly sessionRepository: SessionRepository,
    private readonly utteranceRepository: UtteranceRepository,
    private readonly turnResultRepository: TurnResultRepository,
    private readonly verdictRepository: VerdictRepository,
    private readonly aiResponseRepository: AIResponseRepository,
    private readonly openaiService: OpenaiService,
    private readonly stylebartService: StylebartService
  ) {}

  /**
   * 新しいディベートセッションを作成
   */
  async createSession(config: DebateSessionConfig): Promise<string> {
    try {
      const session = await this.sessionRepository.create({
        theme: config.theme,
        state: SessionState.IDLE,
      });

      this.logger.log(
        `Created new debate session: ${session.id} with theme: "${config.theme}"`
      );

      return session.id;
    } catch (error) {
      this.logger.error(`Failed to create session: ${error.message}`);
      throw error;
    }
  }

  /**
   * セッションを開始（READY状態に移行）
   */
  async startSession(sessionId: string): Promise<void> {
    try {
      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.state !== SessionState.IDLE) {
        throw new Error(`Session ${sessionId} is not in IDLE state`);
      }

      // セッション状態をREADYに更新
      await this.sessionRepository.updateState(sessionId, SessionState.READY);
      this.wsConnection.updateSessionState(sessionId, SessionState.READY);

      // 開始アナウンスを作成
      const startMessage = `ディベートを開始します。テーマは「${session.theme}」です。3ターン、各30秒で進行します。`;

      // AIアナウンスを保存
      await this.aiResponseRepository.create({
        sessionId,
        turnIndex: 0,
        text: startMessage,
      });

      // クライアントに開始通知を送信
      this.wsConnection.broadcastToSession(sessionId, "session:started", {
        sessionId,
        theme: session.theme,
        message: startMessage,
      });

      // TTSでアナウンス音声を生成・配信
      await this.generateAndBroadcastAudio(sessionId, startMessage);

      this.logger.log(`Session ${sessionId} started`);

      // 少し待ってから第1ターンを開始
      setTimeout(() => {
        this.startTurn(sessionId, 1, Side.RIGHT);
      }, 3000);
    } catch (error) {
      this.logger.error(
        `Failed to start session ${sessionId}: ${error.message}`
      );
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `セッション開始に失敗しました: ${error.message}`,
      });
    }
  }

  /**
   * ターンを開始
   */
  async startTurn(
    sessionId: string,
    turnIndex: number,
    side: Side
  ): Promise<void> {
    try {
      let newState: SessionState;

      // ターンに応じた状態を決定
      if (turnIndex === 1) {
        newState =
          side === Side.RIGHT
            ? SessionState.TURN1_RIGHT
            : SessionState.TURN1_LEFT;
      } else if (turnIndex === 2) {
        newState =
          side === Side.RIGHT
            ? SessionState.TURN2_RIGHT
            : SessionState.TURN2_LEFT;
      } else if (turnIndex === 3) {
        newState =
          side === Side.RIGHT
            ? SessionState.FINAL_RIGHT
            : SessionState.FINAL_LEFT;
      } else {
        throw new Error(`Invalid turn index: ${turnIndex}`);
      }

      // セッション状態を更新
      await this.sessionRepository.updateState(sessionId, newState);
      this.wsConnection.updateSessionState(sessionId, newState);

      const sideText = side === Side.RIGHT ? "右" : "左";
      const turnText = turnIndex === 3 ? "最終弁論" : `第${turnIndex}ターン`;
      const message = `${turnText}、${sideText}の者、どうぞ。30秒でお話しください。`;

      // AIアナウンスを保存
      await this.aiResponseRepository.create({
        sessionId,
        turnIndex,
        text: message,
      });

      // ターン開始通知
      this.wsConnection.broadcastToSession(sessionId, "turn:started", {
        sessionId,
        turnIndex,
        side,
        message,
        duration: 30,
      });

      // 特定のサイドに発話開始を通知
      this.wsConnection.sendToSessionSide(sessionId, side, "turn:your_turn", {
        turnIndex,
        duration: 30,
        message: "あなたの発話時間です",
      });

      // TTSでアナウンス
      await this.generateAndBroadcastAudio(sessionId, message);

      // 30秒タイマーを設定
      this.setTurnTimer(sessionId, turnIndex, side);

      this.logger.log(
        `Started turn ${turnIndex} for ${side} side in session ${sessionId}`
      );
    } catch (error) {
      this.logger.error(`Failed to start turn: ${error.message}`);
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `ターン開始に失敗しました: ${error.message}`,
      });
    }
  }

  /**
   * ターンタイマーを設定
   */
  private setTurnTimer(sessionId: string, turnIndex: number, side: Side): void {
    // 既存のタイマーをクリア
    this.clearTurnTimer(sessionId);

    const timeoutId = setTimeout(() => {
      this.endTurn(sessionId, turnIndex, side);
    }, 30000); // 30秒

    const timer: TurnTimer = {
      sessionId,
      turnIndex,
      side,
      startTime: new Date(),
      timeoutId,
    };

    this.activeTurnTimers.set(sessionId, timer);
  }

  /**
   * ターンタイマーをクリア
   */
  private clearTurnTimer(sessionId: string): void {
    const timer = this.activeTurnTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer.timeoutId);
      this.activeTurnTimers.delete(sessionId);
    }
  }

  /**
   * ターンを終了
   */
  async endTurn(
    sessionId: string,
    turnIndex: number,
    side: Side
  ): Promise<void> {
    try {
      this.clearTurnTimer(sessionId);

      // 発話停止を通知
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

      // 次の処理を決定
      if (side === Side.RIGHT) {
        // 右が終わったら左のターン
        setTimeout(() => {
          this.startTurn(sessionId, turnIndex, Side.LEFT);
        }, 2000);
      } else {
        // 左が終わったらターンの要約・評価
        setTimeout(() => {
          this.wrapUpTurn(sessionId, turnIndex);
        }, 2000);
      }

      this.logger.log(
        `Ended turn ${turnIndex} for ${side} side in session ${sessionId}`
      );
    } catch (error) {
      this.logger.error(`Failed to end turn: ${error.message}`);
    }
  }

  /**
   * ターンの要約・評価
   */
  async wrapUpTurn(sessionId: string, turnIndex: number): Promise<void> {
    try {
      let wrapUpState: SessionState;

      if (turnIndex === 1) {
        wrapUpState = SessionState.TURN1_WRAPUP;
      } else if (turnIndex === 2) {
        wrapUpState = SessionState.TURN2_WRAPUP;
      } else if (turnIndex === 3) {
        wrapUpState = SessionState.FINAL_WRAPUP;
      } else {
        throw new Error(`Invalid turn index for wrap up: ${turnIndex}`);
      }

      await this.sessionRepository.updateState(sessionId, wrapUpState);
      this.wsConnection.updateSessionState(sessionId, wrapUpState);

      // ターンの発話を取得
      const utterances = await this.utteranceRepository.findBySessionAndTurn(
        sessionId,
        turnIndex
      );

      if (utterances.length === 0) {
        this.logger.warn(
          `No utterances found for session ${sessionId} turn ${turnIndex}`
        );
        // 次のターンまたは判定に進む
        setTimeout(() => {
          this.proceedToNext(sessionId, turnIndex);
        }, 2000);
        return;
      }

      // AIで評価を実行
      const rate = await this.evaluateTurn(sessionId, turnIndex, utterances);

      // 評価結果を保存
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

      // 次のステップに進む
      setTimeout(() => {
        this.proceedToNext(sessionId, turnIndex);
      }, 3000);
    } catch (error) {
      this.logger.error(`Failed to wrap up turn: ${error.message}`);
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `ターン評価に失敗しました: ${error.message}`,
      });
    }
  }

  /**
   * 次のステップに進む
   */
  private async proceedToNext(
    sessionId: string,
    turnIndex: number
  ): Promise<void> {
    if (turnIndex < 3) {
      // 次のターンを開始
      setTimeout(() => {
        this.startTurn(sessionId, turnIndex + 1, Side.RIGHT);
      }, 2000);
    } else {
      // 最終判定に進む
      setTimeout(() => {
        this.startFinalJudgment(sessionId);
      }, 2000);
    }
  }

  /**
   * 最終判定を開始
   */
  async startFinalJudgment(sessionId: string): Promise<void> {
    try {
      await this.sessionRepository.updateState(sessionId, SessionState.JUDGING);
      this.wsConnection.updateSessionState(sessionId, SessionState.JUDGING);

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

      // 判定処理を実行
      const verdict = await this.performFinalJudgment(sessionId);

      // 判定結果を保存
      await this.verdictRepository.upsertVerdict(verdict);

      // 判定結果を通知
      await this.announceVerdict(sessionId, verdict.winner, verdict.rationale);
    } catch (error) {
      this.logger.error(`Failed to start final judgment: ${error.message}`);
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `最終判定に失敗しました: ${error.message}`,
      });
    }
  }

  /**
   * 判定結果を発表
   */
  async announceVerdict(
    sessionId: string,
    winner: Winner,
    rationale: string
  ): Promise<void> {
    try {
      await this.sessionRepository.updateState(sessionId, SessionState.VERDICT);
      this.wsConnection.updateSessionState(sessionId, SessionState.VERDICT);

      const winnerText = winner === Winner.RIGHT ? "右" : "左";
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

      // セッション終了
      setTimeout(() => {
        this.finishSession(sessionId);
      }, 10000);
    } catch (error) {
      this.logger.error(`Failed to announce verdict: ${error.message}`);
    }
  }

  /**
   * セッションを終了
   */
  async finishSession(sessionId: string): Promise<void> {
    try {
      await this.sessionRepository.endSession(sessionId);
      this.wsConnection.updateSessionState(sessionId, SessionState.FINISHED);

      this.clearTurnTimer(sessionId);

      this.wsConnection.broadcastToSession(sessionId, "session:finished", {
        sessionId,
        message: "ディベートセッションが終了しました。",
      });

      this.logger.log(`Session ${sessionId} finished`);
    } catch (error) {
      this.logger.error(`Failed to finish session: ${error.message}`);
    }
  }

  /**
   * 発話を処理
   */
  async processUtterance(
    sessionId: string,
    turnIndex: number,
    side: Side,
    text: string
  ): Promise<void> {
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

      this.logger.log(
        `Processed utterance for session ${sessionId}, turn ${turnIndex}, side ${side}`
      );
    } catch (error) {
      this.logger.error(`Failed to process utterance: ${error.message}`);
    }
  }

  /**
   * ターンを評価（OpenAI使用）
   */
  private async evaluateTurn(
    sessionId: string,
    turnIndex: number,
    utterances: any[]
  ): Promise<number> {
    // TODO: OpenAI APIを使用して実際の評価を実装
    // 仮の実装として、ランダムな値を返す
    return Math.random() * 2 - 1; // -1 to 1
  }

  /**
   * 最終判定を実行（OpenAI使用）
   */
  private async performFinalJudgment(
    sessionId: string
  ): Promise<{ sessionId: string; winner: Winner; rationale: string }> {
    // TODO: OpenAI APIを使用して実際の判定を実装
    // 仮の実装として、ランダムな勝者を返す
    const winner = Math.random() > 0.5 ? Winner.RIGHT : Winner.LEFT;
    const rationale = "論理性と根拠の明確さを総合的に判断した結果です。";

    return {
      sessionId,
      winner,
      rationale,
    };
  }

  /**
   * 音声を生成してブロードキャスト
   */
  private async generateAndBroadcastAudio(
    sessionId: string,
    text: string
  ): Promise<void> {
    try {
      // TODO: Style-BART APIを使用して音声を生成
      // 現在は仮実装
      this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
        text,
        audioUrl: null, // 実際の音声URLまたはバイナリデータ
      });
    } catch (error) {
      this.logger.error(`Failed to generate audio: ${error.message}`);
    }
  }
}
