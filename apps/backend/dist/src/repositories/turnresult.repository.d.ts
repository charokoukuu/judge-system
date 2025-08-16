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
export declare class TurnResultRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateTurnResultDto): Promise<TurnResult>;
    findAll(include?: Prisma.TurnResultInclude): Promise<TurnResult[]>;
    findById(id: string, include?: Prisma.TurnResultInclude): Promise<TurnResult | null>;
    findBySessionId(sessionId: string, include?: Prisma.TurnResultInclude): Promise<TurnResult[]>;
    findBySessionAndTurn(sessionId: string, turnIndex: number, include?: Prisma.TurnResultInclude): Promise<TurnResult | null>;
    update(id: string, data: UpdateTurnResultDto): Promise<TurnResult>;
    delete(id: string): Promise<TurnResult>;
    deleteBySessionId(sessionId: string): Promise<Prisma.BatchPayload>;
    upsertTurnResult(data: CreateTurnResultDto): Promise<TurnResult>;
    getAverageRateBySession(sessionId: string): Promise<number | null>;
    getTurnResultsWithScores(sessionId: string): Promise<TurnResult[]>;
    countBySession(sessionId: string): Promise<number>;
    findLatestBySession(sessionId: string, include?: Prisma.TurnResultInclude): Promise<TurnResult | null>;
}
