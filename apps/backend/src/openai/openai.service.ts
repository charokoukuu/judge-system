import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';

@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);
  private readonly apiKey: string;
  private readonly transcribeUrl = 'https://api.openai.com/v1/audio/transcriptions';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not set in the environment variables.');
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    this.logger.log(`Transcribing audio buffer of size: ${audioBuffer.length}`);

    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.webm', // OpenAI requires a filename
      contentType: 'audio/webm', // Assuming webm from MediaRecorder, adjust if needed
    });
    formData.append('model', 'whisper-1'); // Using whisper-1 as gpt-4o-mini-transcribe is not a valid model name for this endpoint.

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
      this.logger.error('Error during transcription:', error.response?.data || error.message);
      throw new Error('Failed to transcribe audio.');
    }
  }
}
