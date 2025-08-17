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
      // DEBUG: IDLEに戻す
      // this.wrapUpTurn(sessionId, 2);

      // return;
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
      const startMessage = `ディベートを開始します。テーマは「${session.theme}」です。3ターン、各10秒で進行します。右が${result.right}、左が${result.left}の立場で行います。先行は右側です。`;

      // AIアナウンスを保存
      await this.aiResponseRepository.create({
        sessionId,
        turnIndex: 0,
        text: startMessage,
      });

      // TTSでアナウンス音声を生成・配信、完了後に第1ターンを開始
      await this.generateAndBroadcastAudioSync(sessionId, startMessage, () => {
        this.wsConnection.broadcastToSession(sessionId, "session:started", {
          sessionId,
          theme: session.theme,
          message: startMessage,
        });
      });

      // 音声再生完了後に第1ターンを開始
      await this.startTurn(sessionId, 1, Side.RIGHT);

      this.logger.log(`Session ${sessionId} started`);
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
      const message = `${sideText}の方、どうぞ。10秒でお話してください。`;

      // AIアナウンスを保存
      await this.aiResponseRepository.create({
        sessionId,
        turnIndex,
        text: message,
      });

      if (side === Side.RIGHT) {
        const turnMessage =
          turnIndex === 3
            ? "最終弁論です。内容をまとめてください。"
            : `第${turnIndex}ターン`;
        await this.generateAndBroadcastAudioSync(sessionId, turnMessage, () => {
          this.wsConnection.broadcastToSession(sessionId, "turn:started", {
            sessionId,
            turnIndex,
            side,
            message: turnMessage,
          });
        });
      }

      // TTSでアナウンス、完了後にタイマー開始
      await this.generateAndBroadcastAudioSync(sessionId, message, () => {
        // ターン開始通知
        this.wsConnection.broadcastToSession(sessionId, "turn:started", {
          sessionId,
          turnIndex,
          side,
          message,
        });

        // 特定のサイドに発話開始を通知
        this.wsConnection.sendToSessionSide(sessionId, side, "turn:your_turn", {
          turnIndex,
          duration: 30,
          message: "あなたの発話時間です",
        });
      });

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
          // DEBUG: 10秒に戻す
          duration: 2,
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
      // DEBUG: 10秒に戻す
    }, 2000); // 10秒

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
      const rate = await this.evaluateTurn(
        sessionId,
        turnIndex,
        exampleUtterance(sessionId)
      );

      // 評価結果を保存
      await this.turnResultRepository.upsertTurnResult({
        sessionId,
        turnIndex,
        rate,
      });

      console.log("評価： ", rate);

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

      // // 判定処理を実行
      const verdict = await this.performFinalJudgment(sessionId);

      await this.generateAndBroadcastAudioSync(sessionId, message);

      // // 判定結果を保存
      await this.verdictRepository.upsertVerdict(verdict);

      console.log(
        `Verdict announced for session ${sessionId}: ${JSON.stringify(verdict)}`
      );

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

      await this.generateAndBroadcastAudioSync(sessionId, message, () => {
        this.wsConnection.broadcastToSession(sessionId, "verdict:announced", {
          sessionId,
          winner,
          rationale,
          message,
        });
      });

      // セッション終了
      await timer(2000);
      this.finishSession(sessionId);
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
            `ターン${turn}: ${result.rate > 0 ? "右" : "左"}優勢 (スコア: ${result.rate})`
          );
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
          content:
            "あなたは公正で経験豊富なディベート審判です。論理性と説得力を重視して判定してください。",
        },
        { role: "user", content: prompt },
      ]);

      // レスポンスをパース
      const lines = response.split("\n");
      let winner: Winner = Winner.RIGHT;
      let rationale = "論理性と根拠の明確さを総合的に判断した結果です。";

      for (const line of lines) {
        if (line.includes("勝者:") || line.includes("Winner:")) {
          if (line.includes("LEFT")) {
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
      "ディベートを開始します。",
      "第1ターン、右の者、どうぞ。10秒でお話してください。",
      "第1ターン、左の者、どうぞ。10秒でお話してください。",
      "時間終了です。",
      "ターンが終了しました。",
      "判定中です。しばらくお待ちください。",
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
