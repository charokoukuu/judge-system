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
export declare class AIResponseRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateAIResponseDto): Promise<AIResponse>;
    findAll(include?: Prisma.AIResponseInclude): Promise<AIResponse[]>;
    findById(id: string, include?: Prisma.AIResponseInclude): Promise<AIResponse | null>;
    findBySessionId(sessionId: string, include?: Prisma.AIResponseInclude): Promise<AIResponse[]>;
    findBySessionAndTurn(sessionId: string, turnIndex: number, include?: Prisma.AIResponseInclude): Promise<AIResponse[]>;
    update(id: string, data: UpdateAIResponseDto): Promise<AIResponse>;
    delete(id: string): Promise<AIResponse>;
    deleteBySessionId(sessionId: string): Promise<Prisma.BatchPayload>;
    findLatestBySession(sessionId: string, include?: Prisma.AIResponseInclude): Promise<AIResponse | null>;
    findLatestBySessionAndTurn(sessionId: string, turnIndex: number, include?: Prisma.AIResponseInclude): Promise<AIResponse | null>;
    countBySession(sessionId: string): Promise<number>;
    countBySessionAndTurn(sessionId: string, turnIndex: number): Promise<number>;
    findResponsesInTimeRange(sessionId: string, startTime: Date, endTime: Date, include?: Prisma.AIResponseInclude): Promise<AIResponse[]>;
    getResponsesByTurnIndex(turnIndex: number, include?: Prisma.AIResponseInclude): Promise<AIResponse[]>;
}
