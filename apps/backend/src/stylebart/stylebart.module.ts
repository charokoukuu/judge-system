import { Module } from "@nestjs/common";
import { StylebartService } from "./stylebart.service";

@Module({
  providers: [StylebartService],
  exports: [StylebartService],
})
export class StylebartModule {}
