import { LLMService, LLMMessage, LLMConfig, StreamCallbacks } from './types.js';

export class OllamaService implements LLMService {
  private messageHistory: LLMMessage[] = [];
  private model: string;

  constructor(config: LLMConfig) {
    this.model = config.model || 'mistral';
  }

  async chat(message: string, context?: string): Promise<string> {
    try {
      this.messageHistory.push({ role: 'user', content: message });

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...this.messageHistory,
            {
              role: 'user',
              content: context ? `Context: ${context}\n\nUser: ${message}` : message
            }
          ],
          stream: false
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      const assistantMessage = data.message.content;

      this.messageHistory.push({ role: 'assistant', content: assistantMessage });

      return assistantMessage;
    } catch (error) {
      console.error('Failed to get response from Ollama:', error);
      throw error;
    }
  }

  async streamChat(message: string, callbacks: StreamCallbacks, context?: string): Promise<void> {
    try {
      this.messageHistory.push({ role: 'user', content: message });

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...this.messageHistory,
            {
              role: 'user',
              content: context ? `Context: ${context}\n\nUser: ${message}` : message
            }
          ],
          stream: true
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let fullResponse = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              callbacks.onToken(data.message.content);
              fullResponse += data.message.content;
            }
          } catch (e) {
            console.warn('Failed to parse streaming response line:', e);
          }
        }
      }

      this.messageHistory.push({ role: 'assistant', content: fullResponse });
      callbacks.onComplete?.(fullResponse);
    } catch (error) {
      console.error('Failed to stream response from Ollama:', error);
      callbacks.onError?.(error as Error);
      throw error;
    }
  }

  clearHistory(): void {
    this.messageHistory = [];
  }
} 