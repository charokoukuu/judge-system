import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { TurnResult, Prisma } from "@prisma/client";

export interface CreateTurnResultDto {
  sessionId: string;
  turnIndex: number;
  rate: number;
  scoresJson?: any;
}

export interface UpdateTurnResultDto {
  rate?: number;
  scoresJson?: any;
}

@Injectable()
export class TurnResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTurnResultDto): Promise<TurnResult> {
    return this.prisma.turnResult.create({
      data,
    });
  }

  async findAll(include?: Prisma.TurnResultInclude): Promise<TurnResult[]> {
    return this.prisma.turnResult.findMany({
      include,
      orderBy: [{ sessionId: "desc" }, { turnIndex: "asc" }],
    });
  }

  async findById(
    id: string,
    include?: Prisma.TurnResultInclude
  ): Promise<TurnResult | null> {
    return this.prisma.turnResult.findUnique({
      where: { id },
      include,
    });
  }

  async findBySessionId(
    sessionId: string,
    include?: Prisma.TurnResultInclude
  ): Promise<TurnResult[]> {
    return this.prisma.turnResult.findMany({
      where: { sessionId },
      include,
      orderBy: { turnIndex: "asc" },
    });
  }

  async findBySessionAndTurn(
    sessionId: string,
    turnIndex: number,
    include?: Prisma.TurnResultInclude
  ): Promise<TurnResult | null> {
    return this.prisma.turnResult.findUnique({
      where: {
        sessionId_turnIndex: {
          sessionId,
          turnIndex,
        },
      },
      include,
    });
  }

  async update(id: string, data: UpdateTurnResultDto): Promise<TurnResult> {
    return this.prisma.turnResult.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<TurnResult> {
    return this.prisma.turnResult.delete({
      where: { id },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.turnResult.deleteMany({
      where: { sessionId },
    });
  }

  async upsertTurnResult(data: CreateTurnResultDto): Promise<TurnResult> {
    return this.prisma.turnResult.upsert({
      where: {
        sessionId_turnIndex: {
          sessionId: data.sessionId,
          turnIndex: data.turnIndex,
        },
      },
      update: {
        rate: data.rate,
        scoresJson: data.scoresJson,
      },
      create: data,
    });
  }

  async getAverageRateBySession(sessionId: string): Promise<number | null> {
    const result = await this.prisma.turnResult.aggregate({
      where: { sessionId },
      _avg: {
        rate: true,
      },
    });
    return result._avg.rate;
  }

  async getTurnResultsWithScores(sessionId: string): Promise<TurnResult[]> {
    return this.prisma.turnResult.findMany({
      where: {
        sessionId,
        scoresJson: {
          not: null,
        },
      },
      orderBy: { turnIndex: "asc" },
    });
  }

  async countBySession(sessionId: string): Promise<number> {
    return this.prisma.turnResult.count({
      where: { sessionId },
    });
  }

  async findLatestBySession(
    sessionId: string,
    include?: Prisma.TurnResultInclude
  ): Promise<TurnResult | null> {
    return this.prisma.turnResult.findFirst({
      where: { sessionId },
      include,
      orderBy: { turnIndex: "desc" },
    });
  }
}
