import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { AIResponse, Prisma } from "@prisma/client";

export interface CreateAIResponseDto {
  sessionId: string;
  turnIndex: number;
  text: string;
}

export interface UpdateAIResponseDto {
  text?: string;
}

@Injectable()
export class AIResponseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAIResponseDto): Promise<AIResponse> {
    return this.prisma.aIResponse.create({
      data,
    });
  }

  async findAll(include?: Prisma.AIResponseInclude): Promise<AIResponse[]> {
    return this.prisma.aIResponse.findMany({
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(
    id: string,
    include?: Prisma.AIResponseInclude
  ): Promise<AIResponse | null> {
    return this.prisma.aIResponse.findUnique({
      where: { id },
      include,
    });
  }

  async findBySessionId(
    sessionId: string,
    include?: Prisma.AIResponseInclude
  ): Promise<AIResponse[]> {
    return this.prisma.aIResponse.findMany({
      where: { sessionId },
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  async findBySessionAndTurn(
    sessionId: string,
    turnIndex: number,
    include?: Prisma.AIResponseInclude
  ): Promise<AIResponse[]> {
    return this.prisma.aIResponse.findMany({
      where: {
        sessionId,
        turnIndex,
      },
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  async update(id: string, data: UpdateAIResponseDto): Promise<AIResponse> {
    return this.prisma.aIResponse.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<AIResponse> {
    return this.prisma.aIResponse.delete({
      where: { id },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.aIResponse.deleteMany({
      where: { sessionId },
    });
  }

  async findLatestBySession(
    sessionId: string,
    include?: Prisma.AIResponseInclude
  ): Promise<AIResponse | null> {
    return this.prisma.aIResponse.findFirst({
      where: { sessionId },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async findLatestBySessionAndTurn(
    sessionId: string,
    turnIndex: number,
    include?: Prisma.AIResponseInclude
  ): Promise<AIResponse | null> {
    return this.prisma.aIResponse.findFirst({
      where: {
        sessionId,
        turnIndex,
      },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async countBySession(sessionId: string): Promise<number> {
    return this.prisma.aIResponse.count({
      where: { sessionId },
    });
  }

  async countBySessionAndTurn(
    sessionId: string,
    turnIndex: number
  ): Promise<number> {
    return this.prisma.aIResponse.count({
      where: {
        sessionId,
        turnIndex,
      },
    });
  }

  async findResponsesInTimeRange(
    sessionId: string,
    startTime: Date,
    endTime: Date,
    include?: Prisma.AIResponseInclude
  ): Promise<AIResponse[]> {
    return this.prisma.aIResponse.findMany({
      where: {
        sessionId,
        createdAt: {
          gte: startTime,
          lte: endTime,
        },
      },
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  async getResponsesByTurnIndex(
    turnIndex: number,
    include?: Prisma.AIResponseInclude
  ): Promise<AIResponse[]> {
    return this.prisma.aIResponse.findMany({
      where: { turnIndex },
      include,
      orderBy: { createdAt: "desc" },
    });
  }
}
