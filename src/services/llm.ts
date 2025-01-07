import Anthropic from '@anthropic-ai/sdk';

export class LLMService {
  private client: Anthropic;
  private messageHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];
  
  constructor() {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY environment variable is not set');
    }
    
    this.client = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });
  }

  async chat(message: string, context?: string) {
    try {
      if (!this.client) {
        throw new Error('Claude client not initialized');
      }

      console.log('LLM attempting to send message:', message);

      const response = await this.client.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: message
        }]
      });

      console.log('LLM received response:', response);

      if (!response.content || response.content.length === 0) {
        throw new Error('Empty response from Claude');
      }

      const text = response.content[0].type === 'text' 
        ? response.content[0].text 
        : 'Unable to process response';

      return text;
    } catch (error) {
      console.error('LLM error:', error);
      throw error;
    }
  }

  clearHistory() {
    this.messageHistory = [];
  }
} 