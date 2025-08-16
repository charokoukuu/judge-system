import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import * as FormData from "form-data";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);
  private readonly apiKey: string;
  private readonly transcribeUrl =
    "https://api.openai.com/v1/audio/transcriptions";
  private readonly chatUrl = "https://api.openai.com/v1/chat/completions";

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set in the environment variables."
      );
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    this.logger.log(`Transcribing audio buffer of size: ${audioBuffer.length}`);

    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename: "audio.webm", // OpenAI requires a filename
      contentType: "audio/webm", // Assuming webm from MediaRecorder, adjust if needed
    });
    formData.append("model", "whisper-1"); // Whisper-1 is the correct model for transcription

    try {
      const response = await axios.post(this.transcribeUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const transcription = response.data.text;
      this.logger.log(`Transcription successful: "${transcription}"`);
      return transcription;
    } catch (error) {
      this.logger.error(
        "Error during transcription:",
        error.response?.data || error.message
      );
      throw new Error("Failed to transcribe audio.");
    }
  }

  async chatCompletion(
    messages: ChatMessage[],
    model: string = "gpt-4o-mini"
  ): Promise<string> {
    this.logger.log(
      `Requesting chat completion with ${messages.length} messages`
    );

    try {
      const response = await axios.post(
        this.chatUrl,
        {
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      const content = response.data.choices[0]?.message?.content;
      this.logger.log(`Chat completion successful`);
      return content;
    } catch (error) {
      this.logger.error(
        "Error during chat completion:",
        error.response?.data || error.message
      );
      throw new Error("Failed to complete chat request.");
    }
  }
}
