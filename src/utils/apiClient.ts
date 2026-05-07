import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { getConfig } from './config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  id: string;
  choices: Array<{
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export class OpenWebApiClient {
  private getBaseUrl(): string {
    return getConfig().apiUrl.replace(/\/$/, '');
  }

  private getHeaders(): Record<string, string> {
    const cfg = getConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (cfg.apiKey) {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }
    return headers;
  }

  async chat(messages: ChatMessage[], model?: string): Promise<string> {
    const cfg = getConfig();
    const body = JSON.stringify({
      model: model ?? cfg.model,
      messages,
      stream: false
    });

    const response = await this.request('POST', '/api/chat/completions', body);
    const parsed: ChatResponse = JSON.parse(response);
    return parsed.choices[0]?.message?.content ?? '';
  }

  async *chatStream(messages: ChatMessage[], model?: string): AsyncGenerator<StreamChunk> {
    const cfg = getConfig();
    const body = JSON.stringify({
      model: model ?? cfg.model,
      messages,
      stream: true
    });

    yield* this.requestStream('POST', '/api/chat/completions', body);
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.request('GET', '/api/models');
      const parsed = JSON.parse(response);
      return (parsed.data ?? []).map((m: { id: string }) => m.id);
    } catch {
      return [];
    }
  }

  private request(method: string, path: string, body?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const baseUrl = this.getBaseUrl();
      const url = new URL(path, baseUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          ...this.getHeaders(),
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }
      };

      const req = lib.request(options, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`API error ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  private async *requestStream(method: string, path: string, body: string): AsyncGenerator<StreamChunk> {
    const baseUrl = this.getBaseUrl();
    const url = new URL(path, baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        ...this.getHeaders(),
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const chunks: StreamChunk[] = [];
    let done = false;
    let error: Error | null = null;
    const resolvers: Array<() => void> = [];

    const req = lib.request(options, res => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) { continue; }
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            chunks.push({ delta: '', done: true });
          } else {
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                chunks.push({ delta, done: false });
              }
            } catch { /* ignore malformed SSE */ }
          }
          resolvers.shift()?.();
        }
      });
      res.on('end', () => {
        done = true;
        resolvers.shift()?.();
      });
      res.on('error', err => {
        error = err;
        done = true;
        resolvers.shift()?.();
      });
    });

    req.on('error', err => {
      error = err;
      done = true;
      resolvers.shift()?.();
    });

    req.write(body);
    req.end();

    while (!done || chunks.length > 0) {
      if (chunks.length === 0 && !done) {
        await new Promise<void>(resolve => resolvers.push(resolve));
      }
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }
    }

    if (error) { throw error; }
  }
}

export const apiClient = new OpenWebApiClient();
