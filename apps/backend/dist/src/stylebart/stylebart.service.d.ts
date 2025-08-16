import { ConfigService } from "@nestjs/config";
export declare class StylebartService {
    private readonly configService;
    private readonly logger;
    private readonly apiUrl;
    constructor(configService: ConfigService);
    textToSpeech(text: string): Promise<Buffer | null>;
}
