import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DebateGateway } from "./debate/debate.gateway";
import { OpenaiModule } from "./openai/openai.module";
import { StylebartModule } from "./stylebart/stylebart.module";
import { RepositoriesModule } from "./repositories/repositories.module";
import { WebSocketModule } from "./websocket/websocket.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Make ConfigService available globally
      envFilePath: ".env",
    }),
    RepositoriesModule,
    OpenaiModule,
    StylebartModule,
    WebSocketModule,
  ],
  controllers: [], // No REST controllers for now
  providers: [DebateGateway],
})
export class AppModule {}
