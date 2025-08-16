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
export declare class VerdictRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateVerdictDto): Promise<Verdict>;
    findAll(include?: Prisma.VerdictInclude): Promise<Verdict[]>;
    findById(id: string, include?: Prisma.VerdictInclude): Promise<Verdict | null>;
    findBySessionId(sessionId: string, include?: Prisma.VerdictInclude): Promise<Verdict | null>;
    update(id: string, data: UpdateVerdictDto): Promise<Verdict>;
    updateBySessionId(sessionId: string, data: UpdateVerdictDto): Promise<Verdict>;
    delete(id: string): Promise<Verdict>;
    deleteBySessionId(sessionId: string): Promise<Verdict>;
    upsertVerdict(data: CreateVerdictDto): Promise<Verdict>;
    findByWinner(winner: Winner, include?: Prisma.VerdictInclude): Promise<Verdict[]>;
    getWinnerStatistics(): Promise<{
        winner: Winner;
        count: number;
    }[]>;
    hasVerdict(sessionId: string): Promise<boolean>;
    getRecentVerdicts(limit?: number, include?: Prisma.VerdictInclude): Promise<Verdict[]>;
}
