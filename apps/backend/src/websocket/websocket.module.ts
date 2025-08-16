import { Module } from "@nestjs/common";
import { WebSocketConnectionService } from "./websocket-connection.service";
import { DebateSessionService } from "./debate-session.service";
import { RepositoriesModule } from "../repositories/repositories.module";
import { OpenaiModule } from "../openai/openai.module";
import { StylebartModule } from "../stylebart/stylebart.module";

@Module({
  imports: [RepositoriesModule, OpenaiModule, StylebartModule],
  providers: [WebSocketConnectionService, DebateSessionService],
  exports: [WebSocketConnectionService, DebateSessionService],
})
export class WebSocketModule {}
