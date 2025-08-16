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
export declare class UtteranceRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateUtteranceDto): Promise<Utterance>;
    findAll(include?: Prisma.UtteranceInclude): Promise<Utterance[]>;
    findById(id: string, include?: Prisma.UtteranceInclude): Promise<Utterance | null>;
    findBySessionId(sessionId: string, include?: Prisma.UtteranceInclude): Promise<Utterance[]>;
    findBySessionAndTurn(sessionId: string, turnIndex: number, include?: Prisma.UtteranceInclude): Promise<Utterance[]>;
    findBySessionTurnAndSide(sessionId: string, turnIndex: number, side: Side, include?: Prisma.UtteranceInclude): Promise<Utterance | null>;
    update(id: string, data: UpdateUtteranceDto): Promise<Utterance>;
    delete(id: string): Promise<Utterance>;
    deleteBySessionId(sessionId: string): Promise<Prisma.BatchPayload>;
    upsertUtterance(data: CreateUtteranceDto): Promise<Utterance>;
    countBySession(sessionId: string): Promise<number>;
    findBySide(sessionId: string, side: Side, include?: Prisma.UtteranceInclude): Promise<Utterance[]>;
}
