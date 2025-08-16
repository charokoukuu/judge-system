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
        this.apiUrl = this.configService.get("STYLE_BART_API_URL");
        if (!this.apiUrl) {
            throw new Error("STYLE_BART_API_URL is not set in the environment variables.");
        }
    }
    async textToSpeech(text) {
        this.logger.log(`Requesting TTS for text: "${text}"`);
        if (!this.apiUrl || this.apiUrl === "") {
            this.logger.warn("Style-BART API URL is not configured, skipping TTS");
            return null;
        }
        try {
            this.logger.log("Converting text to mora-tone list...");
            const g2pResponse = await axios_1.default.post(`${this.apiUrl}/api/g2p`, { text }, {
                headers: { "Content-Type": "application/json" },
                timeout: 10000,
            });
            const moraToneList = g2pResponse.data;
            this.logger.log(`G2P conversion successful: ${moraToneList.length} morae`);
            this.logger.log("Requesting speech synthesis...");
            const synthesisRequest = {
                model: "jvnv-F1-jp",
                modelFile: "model_assets/jvnv-F1-jp/jvnv-F1-jp_e160_s14000.safetensors",
                text: text,
                moraToneList: moraToneList,
                style: "Neutral",
                styleWeight: 1.0,
                speed: 1.0,
                noise: 0.6,
                noisew: 0.8,
                language: "JP",
                speaker: "jvnv-F1-jp",
            };
            const response = await axios_1.default.post(`${this.apiUrl}/api/synthesis`, synthesisRequest, {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "audio/wav",
                },
                responseType: "arraybuffer",
                timeout: 30000,
                validateStatus: (status) => status >= 200 && status < 300,
            });
            const contentType = response.headers?.["content-type"] ?? "unknown";
            const buf = Buffer.from(response.data);
            this.logger.log(`TTS audio received: ${buf.byteLength} bytes (content-type: ${contentType})`);
            return buf;
        }
        catch (err) {
            const ax = err;
            const status = ax.response?.status;
            const ctype = ax.response?.headers?.["content-type"];
            let detail;
            if (ax.response?.data instanceof ArrayBuffer) {
                detail = `(binary ${ax.response.data.byteLength} bytes)`;
            }
            else if (typeof ax.response?.data === "string") {
                detail = ax.response?.data;
            }
            else if (Buffer.isBuffer(ax.response?.data)) {
                try {
                    detail = JSON.parse(ax.response.data.toString());
                }
                catch {
                    detail = `(buffer ${ax.response.data.length} bytes)`;
                }
            }
            else {
                detail = JSON.stringify(ax.response?.data);
            }
            this.logger.warn(`TTS request failed: status=${status} content-type=${ctype} detail=${detail ?? ax.message}. Continuing without audio.`);
            return null;
        }
    }
};
exports.StylebartService = StylebartService;
exports.StylebartService = StylebartService = StylebartService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StylebartService);
//# sourceMappingURL=stylebart.service.js.map