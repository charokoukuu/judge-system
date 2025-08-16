import { ConfigService } from '@nestjs/config';
export declare class OpenaiService {
    private readonly configService;
    private readonly logger;
    private readonly apiKey;
    private readonly transcribeUrl;
    constructor(configService: ConfigService);
    transcribeAudio(audioBuffer: Buffer): Promise<string>;
}
