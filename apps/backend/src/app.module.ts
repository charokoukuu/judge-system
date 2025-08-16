import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DebateGateway } from "./debate/debate.gateway";
import { OpenaiService } from "./openai/openai.service";
import { StylebartService } from "./stylebart/stylebart.service";
import { RepositoriesModule } from "./repositories/repositories.module";
import { WebSocketModule } from "./websocket/websocket.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Make ConfigService available globally
      envFilePath: ".env",
    }),
    RepositoriesModule,
    WebSocketModule,
  ],
  controllers: [], // No REST controllers for now
  providers: [DebateGateway, OpenaiService, StylebartService],
})
export class AppModule {}
