import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Verdict, Winner, Prisma } from "@prisma/client";

export interface CreateVerdictDto {
  sessionId: string;
  winner: Winner;
  rationale: string;
}

export interface UpdateVerdictDto {
  winner?: Winner;
  rationale?: string;
}

@Injectable()
export class VerdictRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateVerdictDto): Promise<Verdict> {
    return this.prisma.verdict.create({
      data,
    });
  }

  async findAll(include?: Prisma.VerdictInclude): Promise<Verdict[]> {
    return this.prisma.verdict.findMany({
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(
    id: string,
    include?: Prisma.VerdictInclude
  ): Promise<Verdict | null> {
    return this.prisma.verdict.findUnique({
      where: { id },
      include,
    });
  }

  async findBySessionId(
    sessionId: string,
    include?: Prisma.VerdictInclude
  ): Promise<Verdict | null> {
    return this.prisma.verdict.findUnique({
      where: { sessionId },
      include,
    });
  }

  async update(id: string, data: UpdateVerdictDto): Promise<Verdict> {
    return this.prisma.verdict.update({
      where: { id },
      data,
    });
  }

  async updateBySessionId(
    sessionId: string,
    data: UpdateVerdictDto
  ): Promise<Verdict> {
    return this.prisma.verdict.update({
      where: { sessionId },
      data,
    });
  }

  async delete(id: string): Promise<Verdict> {
    return this.prisma.verdict.delete({
      where: { id },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<Verdict> {
    return this.prisma.verdict.delete({
      where: { sessionId },
    });
  }

  async upsertVerdict(data: CreateVerdictDto): Promise<Verdict> {
    return this.prisma.verdict.upsert({
      where: { sessionId: data.sessionId },
      update: {
        winner: data.winner,
        rationale: data.rationale,
      },
      create: data,
    });
  }

  async findByWinner(
    winner: Winner,
    include?: Prisma.VerdictInclude
  ): Promise<Verdict[]> {
    return this.prisma.verdict.findMany({
      where: { winner },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async getWinnerStatistics(): Promise<{ winner: Winner; count: number }[]> {
    const stats = await this.prisma.verdict.groupBy({
      by: ["winner"],
      _count: {
        winner: true,
      },
    });

    return stats.map((stat) => ({
      winner: stat.winner,
      count: stat._count.winner,
    }));
  }

  async hasVerdict(sessionId: string): Promise<boolean> {
    const verdict = await this.prisma.verdict.findUnique({
      where: { sessionId },
      select: { id: true },
    });
    return verdict !== null;
  }

  async getRecentVerdicts(
    limit: number = 10,
    include?: Prisma.VerdictInclude
  ): Promise<Verdict[]> {
    return this.prisma.verdict.findMany({
      include,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
