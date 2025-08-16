import { ConfigService } from "@nestjs/config";
interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export declare class OpenaiService {
    private readonly configService;
    private readonly logger;
    private readonly apiKey;
    private readonly transcribeUrl;
    private readonly chatUrl;
    constructor(configService: ConfigService);
    transcribeAudio(audioBuffer: Buffer): Promise<string>;
    chatCompletion(messages: ChatMessage[], model?: string): Promise<string>;
}
export {};
