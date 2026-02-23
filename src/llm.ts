/**
 * Engram Trace — LLM Providers
 *
 * Used only for consolidation summaries. Entirely optional.
 */
import type { LLM, LLMConfig } from './types.js';

// =============================================================================
// Ollama LLM
// =============================================================================

export class OllamaLLM implements LLM {
  private url: string;
  private model: string;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.url = config.url || 'http://localhost:11434';
    this.model = config.model;
    this.maxTokens = config.maxTokens || 300;
  }

  async generate(prompt: string, system?: string): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      stream: false,
      options: { num_predict: this.maxTokens },
    };
    if (system) body.system = system;

    const res = await fetch(`${this.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`);
    const data = await res.json() as { response: string };
    return data.response;
  }
}

// =============================================================================
// Anthropic LLM
// =============================================================================

export class AnthropicLLM implements LLM {
  private apiKey: string;
  private model: string;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = config.model;
    this.maxTokens = config.maxTokens || 300;
    if (!this.apiKey) throw new Error('Anthropic LLM requires apiKey or ANTHROPIC_API_KEY env');
  }

  async generate(prompt: string, system?: string): Promise<string> {
    const messages = [{ role: 'user', content: prompt }];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: system || undefined,
        messages,
      }),
    });

    if (!res.ok) throw new Error(`Anthropic generate failed: ${res.status}`);
    const data = await res.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text || '';
  }
}

// =============================================================================
// OpenAI LLM
// =============================================================================

export class OpenAILLM implements LLM {
  private apiKey: string;
  private model: string;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = config.model;
    this.maxTokens = config.maxTokens || 300;
    if (!this.apiKey) throw new Error('OpenAI LLM requires apiKey or OPENAI_API_KEY env');
  }

  async generate(prompt: string, system?: string): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI generate failed: ${res.status}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createLLM(config?: LLMConfig): LLM | null {
  if (!config) return null;

  switch (config.provider) {
    case 'ollama': return new OllamaLLM(config);
    case 'anthropic': return new AnthropicLLM(config);
    case 'openai': return new OpenAILLM(config);
    default: throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
