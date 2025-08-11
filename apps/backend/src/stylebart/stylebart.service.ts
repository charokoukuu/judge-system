import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class StylebartService {
  private readonly logger = new Logger(StylebartService.name);
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('STYLE_BART_API_URL');
    if (!this.apiUrl) {
      throw new Error('STYLE_BART_API_URL is not set in the environment variables.');
    }
  }

  async textToSpeech(text: string): Promise<Buffer> {
    this.logger.log(`Requesting TTS for text: "${text}"`);
    try {
      const response = await axios.post(
        this.apiUrl,
        { text },
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'arraybuffer', // Important to get the response as a buffer
        },
      );

      this.logger.log(`TTS audio received, buffer size: ${response.data.length}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error during TTS request:', error.response?.data || error.message);
      throw new Error('Failed to generate speech from text.');
    }
  }
}
