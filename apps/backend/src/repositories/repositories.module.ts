import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { SessionRepository } from "./session.repository";
import { UtteranceRepository } from "./utterance.repository";
import { TurnResultRepository } from "./turnresult.repository";
import { VerdictRepository } from "./verdict.repository";
import { AIResponseRepository } from "./airesponse.repository";

@Module({
  providers: [
    PrismaService,
    SessionRepository,
    UtteranceRepository,
    TurnResultRepository,
    VerdictRepository,
    AIResponseRepository,
  ],
  exports: [
    PrismaService,
    SessionRepository,
    UtteranceRepository,
    TurnResultRepository,
    VerdictRepository,
    AIResponseRepository,
  ],
})
export class RepositoriesModule {}
