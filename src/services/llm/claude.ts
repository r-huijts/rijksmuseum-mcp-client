import Anthropic from '@anthropic-ai/sdk';
import { LLMService, LLMMessage, LLMConfig, StreamCallbacks } from './types.js';

export class ClaudeService implements LLMService {
  private client: Anthropic;
  private messageHistory: LLMMessage[] = [];
  
  constructor(config: LLMConfig) {
    if (!config.apiKey) {
      throw new Error('CLAUDE_API_KEY is required for Claude service');
    }
    
    this.client = new Anthropic({
      apiKey: config.apiKey
    });
  }

  async chat(message: string, context?: string): Promise<string> {
    try {
      this.messageHistory.push({ role: 'user', content: message });

      const response = await this.client.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [
          ...this.messageHistory,
          {
            role: 'user',
            content: context ? `Context: ${context}\n\nUser: ${message}` : message
          }
        ]
      });

      const assistantMessage = response.content[0].type === 'text' 
        ? response.content[0].text 
        : 'Unable to process response';

      this.messageHistory.push({ role: 'assistant', content: assistantMessage });

      return assistantMessage;
    } catch (error) {
      console.error('Failed to get response from Claude:', error);
      throw error;
    }
  }

  async streamChat(message: string, callbacks: StreamCallbacks, context?: string): Promise<void> {
    try {
      this.messageHistory.push({ role: 'user', content: message });

      const stream = await this.client.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [
          ...this.messageHistory,
          {
            role: 'user',
            content: context ? `Context: ${context}\n\nUser: ${message}` : message
          }
        ],
        stream: true
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          callbacks.onToken(chunk.delta.text);
          fullResponse += chunk.delta.text;
        }
      }

      this.messageHistory.push({ role: 'assistant', content: fullResponse });
      callbacks.onComplete?.(fullResponse);
    } catch (error) {
      console.error('Failed to stream response from Claude:', error);
      callbacks.onError?.(error as Error);
      throw error;
    }
  }

  clearHistory(): void {
    this.messageHistory = [];
  }
} 