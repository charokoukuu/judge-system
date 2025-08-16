import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Utterance, Side, Prisma } from "@prisma/client";

export interface CreateUtteranceDto {
  sessionId: string;
  side: Side;
  turnIndex: number;
  text: string;
}

export interface UpdateUtteranceDto {
  text?: string;
}

@Injectable()
export class UtteranceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUtteranceDto): Promise<Utterance> {
    return this.prisma.utterance.create({
      data,
    });
  }

  async findAll(include?: Prisma.UtteranceInclude): Promise<Utterance[]> {
    return this.prisma.utterance.findMany({
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  async findById(
    id: string,
    include?: Prisma.UtteranceInclude
  ): Promise<Utterance | null> {
    return this.prisma.utterance.findUnique({
      where: { id },
      include,
    });
  }

  async findBySessionId(
    sessionId: string,
    include?: Prisma.UtteranceInclude
  ): Promise<Utterance[]> {
    return this.prisma.utterance.findMany({
      where: { sessionId },
      include,
      orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }],
    });
  }

  async findBySessionAndTurn(
    sessionId: string,
    turnIndex: number,
    include?: Prisma.UtteranceInclude
  ): Promise<Utterance[]> {
    return this.prisma.utterance.findMany({
      where: {
        sessionId,
        turnIndex,
      },
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  async findBySessionTurnAndSide(
    sessionId: string,
    turnIndex: number,
    side: Side,
    include?: Prisma.UtteranceInclude
  ): Promise<Utterance | null> {
    return this.prisma.utterance.findUnique({
      where: {
        unique_utterance_per_side_per_turn: {
          sessionId,
          turnIndex,
          side,
        },
      },
      include,
    });
  }

  async update(id: string, data: UpdateUtteranceDto): Promise<Utterance> {
    return this.prisma.utterance.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Utterance> {
    return this.prisma.utterance.delete({
      where: { id },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.utterance.deleteMany({
      where: { sessionId },
    });
  }

  async upsertUtterance(data: CreateUtteranceDto): Promise<Utterance> {
    return this.prisma.utterance.upsert({
      where: {
        unique_utterance_per_side_per_turn: {
          sessionId: data.sessionId,
          turnIndex: data.turnIndex,
          side: data.side,
        },
      },
      update: {
        text: data.text,
      },
      create: data,
    });
  }

  async countBySession(sessionId: string): Promise<number> {
    return this.prisma.utterance.count({
      where: { sessionId },
    });
  }

  async findBySide(
    sessionId: string,
    side: Side,
    include?: Prisma.UtteranceInclude
  ): Promise<Utterance[]> {
    return this.prisma.utterance.findMany({
      where: {
        sessionId,
        side,
      },
      include,
      orderBy: { turnIndex: "asc" },
    });
  }
}
