import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError } from "axios";

@Injectable()
export class StylebartService {
  private readonly logger = new Logger(StylebartService.name);
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>("STYLE_BART_API_URL");
    if (!this.apiUrl) {
      throw new Error(
        "STYLE_BART_API_URL is not set in the environment variables."
      );
    }
  }

  async textToSpeech(text: string): Promise<Buffer | null> {
    this.logger.log(`Requesting TTS for text: "${text}"`);

    // APIが利用できない場合の事前チェック
    if (!this.apiUrl || this.apiUrl === "") {
      this.logger.warn("Style-BART API URL is not configured, skipping TTS");
      return null;
    }

    try {
      // Step 1: テキストをモーラトーンリストに変換
      this.logger.log("Converting text to mora-tone list...");
      const g2pResponse = await axios.post(
        `${this.apiUrl}/api/g2p`,
        { text },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        }
      );

      const moraToneList = g2pResponse.data;
      this.logger.log(
        `G2P conversion successful: ${moraToneList.length} morae`
      );

      // Step 2: 音声合成リクエスト
      this.logger.log("Requesting speech synthesis...");
      const synthesisRequest = {
        model: "kinichiro-asamoto",
        modelFile:
          "model_assets/kinichiro-asamoto/kinichiro-asamoto.safetensors",
        text: text,
        moraToneList: moraToneList,
        style: "Neutral",
        styleWeight: 1.0,
        speed: 1.0,
        noise: 0.6,
        noisew: 0.8,
        language: "JP",
        speaker: "kinichiro-asamoto",
      };

      const response = await axios.post<ArrayBuffer>(
        `${this.apiUrl}/api/synthesis`,
        synthesisRequest,
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "audio/wav",
          },
          responseType: "arraybuffer",
          timeout: 30000, // 音声合成は時間がかかる場合があるので長めに設定
          validateStatus: (status) => status >= 200 && status < 300,
        }
      );

      const contentType = response.headers?.["content-type"] ?? "unknown";
      const buf = Buffer.from(response.data);
      this.logger.log(
        `TTS audio received: ${buf.byteLength} bytes (content-type: ${contentType})`
      );
      return buf;
    } catch (err) {
      const ax = err as AxiosError;
      const status = ax.response?.status;
      const ctype = ax.response?.headers?.["content-type"];

      let detail: string;
      if (ax.response?.data instanceof ArrayBuffer) {
        detail = `(binary ${ax.response.data.byteLength} bytes)`;
      } else if (typeof ax.response?.data === "string") {
        detail = ax.response?.data;
      } else if (Buffer.isBuffer(ax.response?.data)) {
        try {
          detail = JSON.parse(ax.response.data.toString());
        } catch {
          detail = `(buffer ${ax.response.data.length} bytes)`;
        }
      } else {
        detail = JSON.stringify(ax.response?.data);
      }

      this.logger.warn(
        `TTS request failed: status=${status} content-type=${ctype} detail=${detail ?? ax.message}. Continuing without audio.`
      );

      // エラーではなく null を返してシステムを継続
      return null;
    }
  }
}
