import { Controller, Get, Param, Query } from "@nestjs/common";
import { UtteranceRepository } from "../repositories";
import { Side } from "@prisma/client";

@Controller("utterances")
export class UtterancesController {
  constructor(private readonly utteranceRepository: UtteranceRepository) {}

  /**
   * セッションの全発話を取得
   */
  @Get("session/:sessionId")
  async getSessionUtterances(@Param("sessionId") sessionId: string) {
    const utterances =
      await this.utteranceRepository.findBySessionId(sessionId);

    return {
      sessionId,
      utterances: utterances.map((utterance) => ({
        id: utterance.id,
        turnIndex: utterance.turnIndex,
        side: utterance.side,
        sideText: utterance.side === Side.RIGHT ? "右" : "左",
        text: utterance.text,
        createdAt: utterance.createdAt,
      })),
      total: utterances.length,
    };
  }

  /**
   * 特定のターンの発話を取得
   */
  @Get("session/:sessionId/turn/:turnIndex")
  async getTurnUtterances(
    @Param("sessionId") sessionId: string,
    @Param("turnIndex") turnIndex: string
  ) {
    const turnNum = parseInt(turnIndex, 10);
    const utterances = await this.utteranceRepository.findBySessionAndTurn(
      sessionId,
      turnNum
    );

    return {
      sessionId,
      turnIndex: turnNum,
      utterances: utterances.map((utterance) => ({
        id: utterance.id,
        side: utterance.side,
        sideText: utterance.side === Side.RIGHT ? "右" : "左",
        text: utterance.text,
        createdAt: utterance.createdAt,
      })),
      total: utterances.length,
    };
  }
}
