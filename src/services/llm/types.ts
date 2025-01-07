export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  model: string;
  apiKey?: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export interface LLMService {
  chat(message: string, context?: string): Promise<string>;
  streamChat(message: string, callbacks: StreamCallbacks, context?: string): Promise<void>;
  clearHistory(): void;
} 