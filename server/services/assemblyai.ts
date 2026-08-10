import axios from 'axios';

const ASSEMBLYAI_BASE_URL = 'https://api.assemblyai.com/v2';

export class AssemblyAIService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.ASSEMBLYAI_API_KEY;
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error('ASSEMBLYAI_API_KEY environment variable is not set');
    }
    return this.apiKey;
  }

  /**
   * Create a real-time transcription session
   */
  async createRealtimeSession(): Promise<{
    sessionId: string;
    wsUrl: string;
  }> {
    try {
      const response = await axios.post(
        `${ASSEMBLYAI_BASE_URL}/realtime/token`,
        { expires_in: 3600 }, // 1 hour
        {
          headers: {
            'Authorization': this.requireApiKey(),
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        sessionId: response.data.session_id,
        wsUrl: `wss://api.assemblyai.com/v2/realtime/ws?session_token=${response.data.token}`
      };
    } catch (error) {
      console.error('Error creating real-time session:', error);
      throw new Error('Failed to create real-time session');
    }
  }

  /**
   * Upload audio file to AssemblyAI
   */
  async uploadAudio(audioBuffer: Buffer): Promise<string> {
    try {
      const response = await axios.post(
        `${ASSEMBLYAI_BASE_URL}/upload`,
        audioBuffer,
        {
          headers: {
            'Authorization': this.requireApiKey(),
            'Content-Type': 'application/octet-stream',
          },
        }
      );

      return response.data.upload_url;
    } catch (error) {
      console.error('Error uploading audio to AssemblyAI:', error);
      throw new Error('Failed to upload audio');
    }
  }

  /**
   * Start transcription job
   */
  async startTranscription(audioUrl: string): Promise<string> {
    try {
      const response = await axios.post(
        `${ASSEMBLYAI_BASE_URL}/transcript`,
        {
          audio_url: audioUrl,
          language_detection: true,
          punctuate: true,
          format_text: true,
        },
        {
          headers: {
            'Authorization': this.requireApiKey(),
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.id;
    } catch (error) {
      console.error('Error starting transcription:', error);
      throw new Error('Failed to start transcription');
    }
  }

  /**
   * Get transcription result
   */
  async getTranscription(transcriptId: string): Promise<{
    status: string;
    text?: string;
    error?: string;
  }> {
    try {
      const response = await axios.get(
        `${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`,
        {
          headers: {
            'Authorization': this.requireApiKey(),
          },
        }
      );

      return {
        status: response.data.status,
        text: response.data.text,
        error: response.data.error,
      };
    } catch (error) {
      console.error('Error getting transcription:', error);
      throw new Error('Failed to get transcription');
    }
  }

  /**
   * Complete transcription process with polling
   */
  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Upload audio
      const audioUrl = await this.uploadAudio(audioBuffer);
      
      // Start transcription
      const transcriptId = await this.startTranscription(audioUrl);
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max
      
      while (attempts < maxAttempts) {
        const result = await this.getTranscription(transcriptId);
        
        if (result.status === 'completed') {
          return result.text || '';
        } else if (result.status === 'error') {
          throw new Error(result.error || 'Transcription failed');
        }
        
        // Wait 1 second before next attempt
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      throw new Error('Transcription timeout');
    } catch (error) {
      console.error('AssemblyAI transcription error:', error);
      throw error;
    }
  }
}

export const assemblyAIService = new AssemblyAIService();