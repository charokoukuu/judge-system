import { UtteranceRepository } from "../repositories";
export declare class UtterancesController {
    private readonly utteranceRepository;
    constructor(utteranceRepository: UtteranceRepository);
    getSessionUtterances(sessionId: string): Promise<{
        sessionId: string;
        utterances: {
            id: string;
            turnIndex: number;
            side: import("@prisma/client").$Enums.Side;
            sideText: string;
            text: string;
            createdAt: Date;
        }[];
        total: number;
    }>;
    getTurnUtterances(sessionId: string, turnIndex: string): Promise<{
        sessionId: string;
        turnIndex: number;
        utterances: {
            id: string;
            side: import("@prisma/client").$Enums.Side;
            sideText: string;
            text: string;
            createdAt: Date;
        }[];
        total: number;
    }>;
}
