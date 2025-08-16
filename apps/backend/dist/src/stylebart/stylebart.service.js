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
var StylebartService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StylebartService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
let StylebartService = StylebartService_1 = class StylebartService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(StylebartService_1.name);
        this.apiUrl = this.configService.get('STYLE_BART_API_URL');
        if (!this.apiUrl) {
            throw new Error('STYLE_BART_API_URL is not set in the environment variables.');
        }
    }
    async textToSpeech(text) {
        this.logger.log(`Requesting TTS for text: "${text}"`);
        try {
            const response = await axios_1.default.post(this.apiUrl, { text }, {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'arraybuffer',
            });
            this.logger.log(`TTS audio received, buffer size: ${response.data.length}`);
            return response.data;
        }
        catch (error) {
            this.logger.error('Error during TTS request:', error.response?.data || error.message);
            throw new Error('Failed to generate speech from text.');
        }
    }
};
exports.StylebartService = StylebartService;
exports.StylebartService = StylebartService = StylebartService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StylebartService);
//# sourceMappingURL=stylebart.service.js.map