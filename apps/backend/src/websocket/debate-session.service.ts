import { Injectable, Logger } from "@nestjs/common";
import { WebSocketConnectionService } from "./websocket-connection.service";
import {
  SessionRepository,
  UtteranceRepository,
  TurnResultRepository,
  VerdictRepository,
  AIResponseRepository,
} from "../repositories";
import { SessionState, Side, Utterance, Winner } from "@prisma/client";
import { OpenaiService } from "../openai/openai.service";
import { StylebartService } from "../stylebart/stylebart.service";
import { timer } from "src/util/timer";
import { exampleUtterance } from "src/util/exampleMessage";
import { judgeTrigger, ledTrigger, State } from "src/util/judge-trigger";

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
  private readonly pendingAudioPlaybacks = new Map<
    string,
    {
      sessionId: string;
      text: string;
      callback: () => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private readonly lastSentMessages = new Map<
    string,
    { text: string; timestamp: number }
  >(); // 重複メッセージ防止

  // 重複チェック機能
  private isDuplicateMessage(
    sessionId: string,
    text: string,
    windowMs = 3000
  ): boolean {
    const key = `${sessionId}:${text}`;
    const now = Date.now();
    const lastSent = this.lastSentMessages.get(key);

    if (lastSent && now - lastSent.timestamp < windowMs) {
      this.logger.debug(
        `Duplicate message prevented for session ${sessionId}: "${text}"`
      );
      return true; // 重複
    }

    this.lastSentMessages.set(key, { text, timestamp: now });

    // 古いエントリをクリーンアップ（5分以上前のものを削除）
    if (this.lastSentMessages.size % 100 === 0) {
      for (const [k, data] of this.lastSentMessages.entries()) {
        if (now - data.timestamp > 300000) {
          // 5分
          this.lastSentMessages.delete(k);
        }
      }
    }

    return false;
  }

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
    await judgeTrigger("0", { isMute: true });
    await ledTrigger(State.idle);
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
    ledTrigger(State.idle);
    try {
      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.state !== SessionState.IDLE) {
        throw new Error(`Session ${sessionId} is not in IDLE state`);
      }

      // セッション状態をREADYに更新
      // DEBUG: IDLEに戻す
      // this.startTurn(sessionId, 2, Side.LEFT);
      this.wrapUpTurn(sessionId, 3);

      return;
      await this.sessionRepository.updateState(sessionId, SessionState.READY);
      this.wsConnection.updateSessionState(sessionId, SessionState.READY);
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

      const result = JSON.parse(
        await this.openaiService.chatCompletion(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: session.theme },
          ],
          "gpt-4o-mini"
        )
      );

      // 開始アナウンスを作成
      const startMessage = `魔法の天秤で真実を測る時が来たのじゃ。議題は「${session.theme}」じゃ。3回の弁論で真理を探るのじゃ。太陽の皿は${result.right}、月の皿は${result.left}の立場を担うのじゃ。`;

      // AIアナウンスを保存
      await this.aiResponseRepository.create({
        sessionId,
        turnIndex: 0,
        text: startMessage,
      });

      // TTSでアナウンス音声を生成・配信
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

      // ビーバー配置の指示メッセージ（右側用）
      const beaverRightMessage = `それぞれの皿にビーバーを配置するのじゃ。まずは右の者、太陽の皿にビーバーを乗せてくれ。`;

      await this.aiResponseRepository.create({
        sessionId,
        turnIndex: 0,
        text: beaverRightMessage,
      });

      setTimeout(() => {
        ledTrigger(State.right);
        judgeTrigger("35");
      }, 3000);
      await this.generateAndBroadcastAudioSync(
        sessionId,
        beaverRightMessage,
        () => {
          this.wsConnection.broadcastToSession(
            sessionId,
            "beaver:right_instruction",
            {
              sessionId,
              message: beaverRightMessage,
            }
          );
        }
      );
      await timer(4000);
      ledTrigger(State.left);
      await judgeTrigger("-35");

      // ビーバー配置の指示メッセージ（左側用）
      const beaverLeftMessage = `次に左の者、月の皿にビーバーを配置するのじゃ`;

      await this.aiResponseRepository.create({
        sessionId,
        turnIndex: 0,
        text: beaverLeftMessage,
      });

      await this.generateAndBroadcastAudioSync(
        sessionId,
        beaverLeftMessage,
        () => {
          this.wsConnection.broadcastToSession(
            sessionId,
            "beaver:left_instruction",
            {
              sessionId,
              message: beaverLeftMessage,
            }
          );
        }
      );

      await timer(4000);

      await judgeTrigger("0");
      await ledTrigger(State.idle);
      // 弁論開始メッセージ
      const debateStartMessage = `それでは弁論を開始するのじゃ。まずは太陽の代弁者から、15秒で聞かせてくれい。`;

      await this.aiResponseRepository.create({
        sessionId,
        turnIndex: 0,
        text: debateStartMessage,
      });

      await this.generateAndBroadcastAudioSync(
        sessionId,
        debateStartMessage,
        () => {
          this.wsConnection.broadcastToSession(
            sessionId,
            "debate:start_instruction",
            {
              sessionId,
              message: debateStartMessage,
            }
          );
        }
      );

      // 音声再生完了後に第1ターンを開始
      await this.startTurn(sessionId, 1, Side.RIGHT);

      this.logger.log(`Session ${sessionId} started`);
    } catch (error) {
      this.logger.error(
        `Failed to start session ${sessionId}: ${error.message}`
      );
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `セッション開始でエラーが発生しました: ${error.message}`,
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

      const sideText = side === Side.RIGHT ? "太陽の皿" : "月の皿";
      const message = `${sideText}の方、どうぞ話してくれい。15秒でお聞かせくだされ。`;

      // AIアナウンスを保存
      await this.aiResponseRepository.create({
        sessionId,
        turnIndex,
        text: message,
      });

      if (side === Side.RIGHT) {
        if (turnIndex === 1) {
          await judgeTrigger("0", { isMute: true });
        } else {
          await judgeTrigger("0");
        }
        await ledTrigger(State.idle);
        const turnMessage =
          turnIndex === 3
            ? "最終弁論じゃ。これまでの議論をまとめて話してくれい。"
            : `第${turnIndex}回目の弁論を始めるのじゃ。`;
        await this.generateAndBroadcastAudioSync(sessionId, turnMessage, () => {
          this.wsConnection.broadcastToSession(sessionId, "turn:started", {
            sessionId,
            turnIndex,
            message: turnMessage,
          });
        });
      }

      // TTSでアナウンス、完了後にタイマー開始
      await this.generateAndBroadcastAudioSync(sessionId, message, async () => {
        // セッション状態を更新
        await this.sessionRepository.updateState(sessionId, newState);
        this.wsConnection.updateSessionState(sessionId, newState);
        // ターン開始通知
        this.wsConnection.broadcastToSession(sessionId, "turn:started", {
          sessionId,
          turnIndex,
          side,
          message,
        });

        //   // 特定のサイドに発話開始を通知
        this.wsConnection.sendToSessionSide(sessionId, side, "turn:your_turn", {
          turnIndex,
          duration: 30,
          message: "おぬしの発言の時間じゃ。どうぞ話してくれい。",
        });
      });

      ledTrigger(side === Side.RIGHT ? State.recordingR : State.recordingL);

      // 音声再生完了後にタイマーを開始
      this.setTurnTimer(sessionId, turnIndex, side);

      // カウントダウン開始をフロントエンドに通知
      this.wsConnection.broadcastToSession(
        sessionId,
        "turn:countdown_started",
        {
          sessionId,
          turnIndex,
          side,
          // DEBUG: 15秒に戻す
          duration: 15,
        }
      );

      this.logger.log(
        `Timer started for turn ${turnIndex} after audio completion in session ${sessionId}`
      );

      this.logger.log(
        `Started turn ${turnIndex} for ${side} side in session ${sessionId}`
      );
    } catch (error) {
      this.logger.error(`Failed to start turn: ${error.message}`);
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `弁論開始でエラーが発生しました: ${error.message}`,
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
      // DEBUG: 15秒に戻す
    }, 15000);

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
        message: "時間になったのじゃ。ご苦労であった。",
      });

      this.wsConnection.broadcastToSession(sessionId, "turn:ended", {
        sessionId,
        turnIndex,
        side,
      });

      // 次の処理を決定
      if (side === Side.RIGHT) {
        let utterances = null;

        while (!utterances) {
          utterances = await this.utteranceRepository.findBySessionTurnAndSide(
            sessionId,
            turnIndex,
            side
          );
          await timer(300);
        }

        await this.wsConnection.broadcastToSession(sessionId, "turn:started", {
          sessionId,
          turnIndex,
          side,
          message: `内容: ${utterances.text}`,
        });
        await timer(3000);
        // 右が終わったら左のターン
        await this.startTurn(sessionId, turnIndex, Side.LEFT);
        await timer(2000);
      } else {
        // 左が終わったらターンの要約・評価
        let utterances = null;

        while (!utterances) {
          utterances = await this.utteranceRepository.findBySessionTurnAndSide(
            sessionId,
            turnIndex,
            side
          );
          await timer(300);
        }

        await this.wsConnection.broadcastToSession(sessionId, "turn:started", {
          sessionId,
          turnIndex,
          side,
          message: `内容: ${utterances.text}`,
        });
        await timer(3000);
        this.wrapUpTurn(sessionId, turnIndex);
        await timer(2000);
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

      // 発話データのログ出力
      this.logger.log(
        `[DB確認] ターン ${turnIndex} の発話データ取得: ${utterances.length}件`
      );
      utterances.forEach((utterance, index) => {
        const sideText = utterance.side === Side.RIGHT ? "右" : "左";
        this.logger.log(`  ${index + 1}. ${sideText}側: "${utterance.text}"`);
      });

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
      // DEBUG: 実際のメッセージに直す
      const evaluation = await this.evaluateTurn(
        sessionId,
        turnIndex,
        exampleUtterance(sessionId)
      );

      // 評価結果を保存
      await this.turnResultRepository.upsertTurnResult({
        sessionId,
        turnIndex,
        rate: evaluation,
      });

      console.log("評価： ", evaluation);

      // 優勢側を判定してアナウンス
      let advantageMessage = "";
      if (evaluation > 0.3) {
        advantageMessage = "太陽の皿が優勢じゃ。";
      } else if (evaluation < -0.3) {
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

      // 評価完了のアナウンス
      await this.generateAndBroadcastAudioSync(
        sessionId,
        evaluationMessage,
        async () => {
          this.wsConnection.broadcastToSession(sessionId, "turn:evaluated", {
            sessionId,
            turnIndex,
            rate: evaluation,
            message: evaluationMessage,
          });
          // 評価結果をLEDに反映
          ledTrigger(
            evaluation > 0.3
              ? State.right
              : evaluation < -0.3
                ? State.left
                : State.idle
          );
          // ジャッジトリガーを更新
          await judgeTrigger((evaluation * 55).toString());
        }
      );

      // 優勢側のアナウンス（別メッセージとして送信）
      if (advantageMessage) {
        await this.aiResponseRepository.create({
          sessionId,
          turnIndex,
          text: advantageMessage,
        });

        await this.generateAndBroadcastAudioSync(
          sessionId,
          advantageMessage,
          () => {
            this.wsConnection.broadcastToSession(sessionId, "turn:advantage", {
              sessionId,
              turnIndex,
              rate: evaluation,
              message: advantageMessage,
            });
          }
        );
      }

      // 次のステップに進む
      setTimeout(() => {
        this.proceedToNext(sessionId, turnIndex);
      }, 3000);
    } catch (error) {
      this.logger.error(`Failed to wrap up turn: ${error.message}`);
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `弁論評価でエラーが発生しました: ${error.message}`,
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
      await judgeTrigger("0", { isMute: true });
      await this.sessionRepository.updateState(sessionId, SessionState.JUDGING);
      this.wsConnection.updateSessionState(sessionId, SessionState.JUDGING);

      const judgingMessage =
        "全ての弁論が終了したのじゃ。魔法の天秤で最終的な判定を行うぞい。";

      await this.aiResponseRepository.create({
        sessionId,
        turnIndex: 3,
        text: judgingMessage,
      });

      // 判定処理を並行開始（非同期）
      const judgmentPromise = this.performFinalJudgment(sessionId);

      // 判定開始のアナウンス（ローディングアニメーションと同時開始）
      await this.generateAndBroadcastAudioSync(
        sessionId,
        judgingMessage,
        async () => {
          ledTrigger(State.judging);
          await this.wsConnection.broadcastToSession(
            sessionId,
            "judgment:started",
            {
              sessionId,
              message: judgingMessage,
            }
          );
        }
      );
      await timer(2000);

      // ローディングアニメーション開始
      await ledTrigger(State.loading);
      await judgeTrigger("0", { isMute: true, state: State.loading });
      this.wsConnection.broadcastToSession(sessionId, "loading:start", {
        sessionId,
        message: "",
      });
      // 判定処理の完了を待機
      const verdict = await judgmentPromise;

      // 判定結果を保存
      await this.verdictRepository.upsertVerdict(verdict);

      console.log(
        `Verdict announced for session ${sessionId}: ${JSON.stringify(verdict)}`
      );

      // 判定結果を発表
      await this.announceVerdict(sessionId, verdict.winner, verdict.rationale);
    } catch (error) {
      this.logger.error(`Failed to start final judgment: ${error.message}`);
      this.wsConnection.broadcastToSession(sessionId, "error", {
        message: `最終判定でエラーが発生しました: ${error.message}`,
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

      const winnerText = winner === Winner.RIGHT ? "太陽の皿" : "月の皿";
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
        await this.wsConnection.broadcastToSession(
          sessionId,
          "loading:stop",
          {}
        );

        await timer(2000);
        ledTrigger(winner === Side.RIGHT ? State.finishR : State.finishL);
        await judgeTrigger(winner === Side.RIGHT ? "35" : "-35");
      });

      // セッション終了
      await timer(3000);
      ledTrigger(State.idle);
      await judgeTrigger("0");
      await this.finishSession(sessionId);
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

      const message =
        "魔法の天秤による弁論が終了したのじゃ。みなさん、ご苦労であった。";

      await this.generateAndBroadcastAudioSync(sessionId, message, async () => {
        this.wsConnection.broadcastToSession(sessionId, "session:finished", {
          sessionId,
          message,
        });
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
    this.logger.log(
      `[DB処理開始] processUtterance呼び出し - sessionId: ${sessionId}, turnIndex: ${turnIndex}, side: ${side}, text: "${text}"`
    );

    try {
      // データベースに発話を保存
      this.logger.log(`[DB実行中] upsertUtteranceを実行中...`);

      const result = await this.utteranceRepository.upsertUtterance({
        sessionId,
        turnIndex,
        side,
        text,
      });

      this.logger.log(
        `[DB保存成功] 発話ID: ${result.id}, セッション: ${sessionId}, ターン: ${turnIndex}, サイド: ${side}`
      );

      // WebSocketで他のクライアントに通知
      this.wsConnection.broadcastToSession(sessionId, "utterance:received", {
        sessionId,
        turnIndex,
        side,
        text,
      });

      // 詳細ログを出力
      const sideText = side === Side.RIGHT ? "右" : "左";
      this.logger.log(
        `[STT] セッション ${sessionId}, ターン ${turnIndex}, ${sideText}側の発話をDBに保存: "${text}"`
      );
    } catch (error) {
      this.logger.error(
        `[DB保存エラー] Failed to process utterance: ${error.message}`
      );
      this.logger.error(`[DB保存エラー] Stack trace:`, error.stack);
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
    try {
      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // 右と左の発話を分類
      const rightUtterances = utterances.filter((u) => u.side === Side.RIGHT);
      const leftUtterances = utterances.filter((u) => u.side === Side.LEFT);

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
    } catch (error) {
      this.logger.error(`Failed to evaluate turn: ${error.message}`);
      return 0; // デフォルトスコア
    }
  }

  /**
   * 最終判定を実行（OpenAI使用）
   */
  private async performFinalJudgment(
    sessionId: string
  ): Promise<{ sessionId: string; winner: Winner; rationale: string }> {
    try {
      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // 全ターンの発話を取得
      let allUtterances = [];
      for (let turn = 1; turn <= 3; turn++) {
        const utterances = await this.utteranceRepository.findBySessionAndTurn(
          sessionId,
          turn
        );
        allUtterances.push(...utterances);
      }

      // DEBUG: 後で消して定数にする
      allUtterances = exampleUtterance(sessionId);
      // 右と左の発話を分類・整理
      const rightUtterances = allUtterances.filter(
        (u) => u.side === Side.RIGHT
      );
      const leftUtterances = allUtterances.filter((u) => u.side === Side.LEFT);

      const rightSummary = rightUtterances
        .sort((a, b) => a.turnIndex - b.turnIndex)
        .map((u) => `ターン${u.turnIndex}: ${u.text}`)
        .join("\n");

      const leftSummary = leftUtterances
        .sort((a, b) => a.turnIndex - b.turnIndex)
        .map((u) => `ターン${u.turnIndex}: ${u.text}`)
        .join("\n");

      // ターン評価結果も取得
      const turnResults = [];
      for (let turn = 1; turn <= 3; turn++) {
        const result = await this.turnResultRepository.findBySessionAndTurn(
          sessionId,
          turn
        );
        if (result) {
          turnResults.push(
            `ターン${turn}: ${result.rate > 0 ? "太陽の皿" : "月の皿"}優勢 (スコア: ${result.rate})`
          );
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
          content:
            "あなたは魔法の天秤を操る古い賢者です。常に魔法使いの口調（〜じゃ、〜のじゃ、〜であろう等）で話してください。論理性と説得力を重視して公正に判定し、結果を魔法使いらしく発表してください。",
        },
        { role: "user", content: prompt },
      ]);

      // レスポンスをパース
      const lines = response.split("\n");
      let winner: Winner = Winner.RIGHT;
      let rationale = "論理と説得力を総合的に判断した結果じゃ。";

      for (const line of lines) {
        if (line.includes("勝者:") || line.includes("Winner:")) {
          if (line.includes("月")) {
            winner = Winner.LEFT;
          } else if (line.includes("太陽")) {
            winner = Winner.RIGHT;
          } else if (line.includes("LEFT")) {
            winner = Winner.LEFT;
          } else if (line.includes("RIGHT")) {
            winner = Winner.RIGHT;
          }
        } else if (line.includes("理由:") || line.includes("Reason:")) {
          const reasonMatch =
            line.match(/理由:\s*(.+)/) || line.match(/Reason:\s*(.+)/);
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
    } catch (error) {
      this.logger.error(`Failed to perform final judgment: ${error.message}`);
      // デフォルトの判定を返す
      const winner = Math.random() > 0.5 ? Winner.RIGHT : Winner.LEFT;
      return {
        sessionId,
        winner,
        rationale: "システムエラーのため、ランダムに判定されました。",
      };
    }
  }

  /**
   * 音声を生成してブロードキャスト
   */
  private async generateAndBroadcastAudio(
    sessionId: string,
    text: string
  ): Promise<void> {
    try {
      // 重複メッセージチェック
      if (this.isDuplicateMessage(sessionId, text)) {
        this.logger.debug(
          `Skipping duplicate audio generation for session ${sessionId}: "${text}"`
        );
        return;
      }

      this.logger.log(`Generating audio for text: "${text}"`);

      // Style-BART APIを使用して音声を生成
      const audioBuffer = await this.stylebartService.textToSpeech(text);

      if (audioBuffer) {
        // 音声データをBase64エンコード
        const audioBase64 = audioBuffer.toString("base64");

        this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
          sessionId,
          text,
          audioData: audioBase64,
          audioType: "audio/wav", // Style-BARTが返すフォーマットに応じて調整
        });

        this.logger.log(
          `Audio generated and broadcasted for session ${sessionId}`
        );
      } else {
        // TTS APIが利用できない場合はテキストのみ送信
        this.logger.log(
          `TTS API unavailable, sending text only for session ${sessionId}`
        );

        this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
          sessionId,
          text,
          audioData: null,
          audioType: null,
          textOnly: true,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to generate audio: ${error.message}`);

      // エラーの場合はテキストのみ送信
      this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
        text,
        audioData: null,
        audioType: null,
        error: "Audio generation failed",
      });
    }
  }

  /**
   * 音声認識（STT）
   */
  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    this.logger.log(`Transcribing audio buffer of size: ${audioBuffer.length}`);

    try {
      const transcription =
        await this.openaiService.transcribeAudio(audioBuffer);
      this.logger.log(`Transcription successful: "${transcription}"`);
      return transcription;
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      throw new Error(`音声認識に失敗しました: ${error.message}`);
    }
  }

  /**
   * 音声再生完了を処理
   */
  onAudioPlaybackCompleted(
    sessionId: string,
    text: string,
    options: { error?: boolean; noAudio?: boolean } = {}
  ): void {
    this.logger.log(
      `Audio playback completed for session ${sessionId}: "${text}"`
    );

    // 待機中の音声コールバックを探して実行
    const pendingKey = `${sessionId}-${text}`;
    const pending = this.pendingAudioPlaybacks.get(pendingKey);

    if (pending) {
      // タイムアウトをクリア
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }

      // コールバックを実行
      pending.callback();

      // 待機リストから削除
      this.pendingAudioPlaybacks.delete(pendingKey);

      this.logger.log(`Executed pending callback for: "${text}"`);
    } else {
      this.logger.warn(`No pending callback found for: "${text}"`);
    }
  }

  /**
   * 音声を生成し、再生完了を待つ
   */
  private async generateAndBroadcastAudioSync(
    sessionId: string,
    text: string,
    callback?: () => void
  ): Promise<void> {
    try {
      // 重複メッセージチェック
      if (this.isDuplicateMessage(sessionId, text)) {
        this.logger.debug(
          `Skipping duplicate audio generation for session ${sessionId}: "${text}"`
        );
        callback?.();
        return;
      }

      this.logger.log(`Generating audio for text: "${text}"`);

      // Style-BART APIを使用して音声を生成
      const audioBuffer = await this.stylebartService.textToSpeech(text);

      if (audioBuffer) {
        // 音声データをBase64エンコード
        const audioBase64 = audioBuffer.toString("base64");

        // 再生完了を待つためのPromiseを作成
        return new Promise<void>((resolve) => {
          const pendingKey = `${sessionId}-${text}`;

          // 50秒後にタイムアウト（音声が長すぎる場合の保護）
          const timeout = setTimeout(() => {
            this.logger.warn(`Audio playback timeout for: "${text}"`);
            this.pendingAudioPlaybacks.delete(pendingKey);
            resolve();
          }, 50000);

          // 待機中のコールバックを登録
          this.pendingAudioPlaybacks.set(pendingKey, {
            sessionId,
            text,
            callback: resolve,
            timeout,
          });

          // 音声データを送信
          this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
            sessionId,
            text,
            audioData: audioBase64,
            audioType: "audio/wav",
          });

          callback?.();

          this.logger.log(
            `Audio generated and broadcasted for session ${sessionId}, waiting for playback completion`
          );
        });
      } else {
        // TTS APIが利用できない場合はテキストのみ送信
        this.logger.log(
          `TTS API unavailable, sending text only for session ${sessionId}`
        );

        this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
          sessionId,
          text,
          audioData: null,
          audioType: null,
          textOnly: true,
        });

        // 短い待機時間を設ける（テキスト読み込み時間）
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      this.logger.error(`Failed to generate audio: ${error.message}`);

      // エラーの場合はテキストのみ送信
      this.wsConnection.broadcastToSession(sessionId, "audio:generated", {
        sessionId,
        text,
        audioData: null,
        audioType: null,
        error: "Audio generation failed",
      });

      // 短い待機時間を設ける
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * 音声を生成してブロードキャスト（非同期・ノンブロッキング）
   */
  private generateAndBroadcastAudioAsync(
    sessionId: string,
    text: string,
    onAudioCompleted?: () => void
  ): void {
    // 非同期で音声生成を実行（呼び出し元をブロックしない）
    this.generateAndBroadcastAudio(sessionId, text)
      .then(() => {
        // 音声生成が成功した場合、コールバックを実行
        if (onAudioCompleted) {
          onAudioCompleted();
        }
      })
      .catch((error) => {
        this.logger.error(`Async audio generation failed: ${error.message}`);
        // エラーが発生した場合もコールバックを実行（タイマーを開始する）
        if (onAudioCompleted) {
          onAudioCompleted();
        }
      });
  }

  /**
   * 複数のメッセージを事前生成（プリロード）
   */
  async preloadCommonAudioMessages(): Promise<void> {
    const commonMessages = [
      "魔法の天秤が真実を測る時が来たのじゃ。",
      "第1回目の弁論を始めるのじゃ。太陽の皿の方、15秒で話してくれい。",
      "第1回目の弁論を始めるのじゃ。月の皿の方、15秒で話してくれい。",
      "時間になったのじゃ。ご苦労であった。",
      "この回の弁論は終了じゃ。",
      "魔法の天秤で評価中じゃ。少々待つのじゃ。",
    ];

    // バックグラウンドで事前生成（エラーは無視）
    for (const message of commonMessages) {
      try {
        await this.stylebartService.textToSpeech(message);
        this.logger.log(`Preloaded audio for: "${message}"`);
      } catch (error) {
        this.logger.warn(`Failed to preload audio for: "${message}"`);
      }
    }
  }
}
