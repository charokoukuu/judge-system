"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OpenaiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenaiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const FormData = require("form-data");
let OpenaiService = OpenaiService_1 = class OpenaiService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(OpenaiService_1.name);
        this.transcribeUrl = 'https://api.openai.com/v1/audio/transcriptions';
        this.apiKey = this.configService.get('OPENAI_API_KEY');
        if (!this.apiKey) {
            throw new Error('OPENAI_API_KEY is not set in the environment variables.');
        }
    }
    async transcribeAudio(audioBuffer) {
        this.logger.log(`Transcribing audio buffer of size: ${audioBuffer.length}`);
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm',
        });
        formData.append('model', 'whisper-1');
        try {
            const response = await axios_1.default.post(this.transcribeUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });
            const transcription = response.data.text;
            this.logger.log(`Transcription successful: "${transcription}"`);
            return transcription;
        }
        catch (error) {
            this.logger.error('Error during transcription:', error.response?.data || error.message);
            throw new Error('Failed to transcribe audio.');
        }
    }
};
exports.OpenaiService = OpenaiService;
exports.OpenaiService = OpenaiService = OpenaiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenaiService);
//# sourceMappingURL=openai.service.js.map