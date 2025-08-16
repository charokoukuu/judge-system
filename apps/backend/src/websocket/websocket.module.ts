import { Module } from "@nestjs/common";
import { WebSocketConnectionService } from "./websocket-connection.service";
import { DebateSessionService } from "./debate-session.service";
import { RepositoriesModule } from "../repositories/repositories.module";

@Module({
  imports: [RepositoriesModule],
  providers: [WebSocketConnectionService, DebateSessionService],
  exports: [WebSocketConnectionService, DebateSessionService],
})
export class WebSocketModule {}
