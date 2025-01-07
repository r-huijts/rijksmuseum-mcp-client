import { LLMService, LLMConfig } from './types.js';
import { OllamaService } from './ollama.js';
import { ClaudeService } from './claude.js';

export type LLMProvider = 'ollama' | 'claude';

export function createLLMService(provider: LLMProvider, config: LLMConfig): LLMService {
  switch (provider) {
    case 'ollama':
      return new OllamaService(config);
    case 'claude':
      return new ClaudeService(config);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
} 