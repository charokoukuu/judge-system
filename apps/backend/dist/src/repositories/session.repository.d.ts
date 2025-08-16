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
export declare class SessionRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateSessionDto): Promise<Session>;
    findAll(include?: Prisma.SessionInclude): Promise<Session[]>;
    findById(id: string, include?: Prisma.SessionInclude): Promise<Session | null>;
    findByState(state: SessionState, include?: Prisma.SessionInclude): Promise<Session[]>;
    update(id: string, data: UpdateSessionDto): Promise<Session>;
    delete(id: string): Promise<Session>;
    findWithAllRelations(id: string): Promise<Session | null>;
    updateState(id: string, state: SessionState): Promise<Session>;
    endSession(id: string): Promise<Session>;
}
