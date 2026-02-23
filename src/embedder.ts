/**
 * Engram Trace — Embedding Providers
 *
 * Default: local @xenova/transformers (zero-config, no API keys)
 * Optional: Ollama, OpenAI
 */
import type { Embedder, EmbedderConfig } from './types.js';

// =============================================================================
// Local Embedder (default) — @xenova/transformers
// =============================================================================

export class LocalEmbedder implements Embedder {
  private pipeline: any = null;
  private model: string;
  dims: number = 384;

  constructor(model = 'Xenova/all-MiniLM-L6-v2') {
    this.model = model;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.pipeline) {
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', this.model);
    }

    const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
    const data = output.data as Float32Array;
    this.dims = data.length;
    return data;
  }
}

// =============================================================================
// Ollama Embedder
// =============================================================================

export class OllamaEmbedder implements Embedder {
  private url: string;
  private model: string;
  dims: number = 384;
  private initialized = false;

  constructor(model = 'nomic-embed-text', url = 'http://localhost:11434') {
    this.model = model;
    this.url = url;
  }

  async embed(text: string): Promise<Float32Array> {
    const res = await fetch(`${this.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
    const data = await res.json() as { embedding: number[] };
    const vec = new Float32Array(data.embedding);
    this.dims = vec.length;
    return vec;
  }
}

// =============================================================================
// OpenAI Embedder
// =============================================================================

export class OpenAIEmbedder implements Embedder {
  private apiKey: string;
  private model: string;
  dims: number = 1536;

  constructor(apiKey: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async embed(text: string): Promise<Float32Array> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status}`);
    const data = await res.json() as { data: Array<{ embedding: number[] }> };
    const vec = new Float32Array(data.data[0].embedding);
    this.dims = vec.length;
    return vec;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createEmbedder(config?: EmbedderConfig): Embedder {
  if (!config || config.provider === 'local') {
    return new LocalEmbedder(config?.model);
  }

  if (config.provider === 'ollama') {
    return new OllamaEmbedder(config.model, config.url);
  }

  if (config.provider === 'openai') {
    if (!config.apiKey) throw new Error('OpenAI embedder requires apiKey');
    return new OpenAIEmbedder(config.apiKey, config.model);
  }

  throw new Error(`Unknown embedder provider: ${config.provider}`);
}
