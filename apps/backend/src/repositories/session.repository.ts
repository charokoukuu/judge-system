import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Session, SessionState, Prisma } from "@prisma/client";

export interface CreateSessionDto {
  theme: string;
  state?: SessionState;
}

export interface UpdateSessionDto {
  theme?: string;
  state?: SessionState;
  endedAt?: Date;
}

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateSessionDto): Promise<Session> {
    return this.prisma.session.create({
      data: {
        theme: data.theme,
        state: data.state || SessionState.IDLE,
      },
    });
  }

  async findAll(include?: Prisma.SessionInclude): Promise<Session[]> {
    return this.prisma.session.findMany({
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(
    id: string,
    include?: Prisma.SessionInclude
  ): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { id },
      include,
    });
  }

  async findByState(
    state: SessionState,
    include?: Prisma.SessionInclude
  ): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { state },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id: string, data: UpdateSessionDto): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Session> {
    return this.prisma.session.delete({
      where: { id },
    });
  }

  async findWithAllRelations(id: string): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { id },
      include: {
        utterances: {
          orderBy: { createdAt: "asc" },
        },
        verdict: true,
        turnResults: {
          orderBy: { turnIndex: "asc" },
        },
        AIResponse: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async updateState(id: string, state: SessionState): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: { state },
    });
  }

  async endSession(id: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: {
        state: SessionState.FINISHED,
        endedAt: new Date(),
      },
    });
  }
}
