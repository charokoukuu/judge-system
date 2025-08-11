import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DebateGateway } from './debate/debate.gateway';
import { OpenaiService } from './openai/openai.service';
import { StylebartService } from './stylebart/stylebart.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Make ConfigService available globally
      envFilePath: '.env',
    }),
  ],
  controllers: [], // No REST controllers for now
  providers: [DebateGateway, OpenaiService, StylebartService],
})
export class AppModule {}
