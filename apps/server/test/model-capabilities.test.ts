import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testModelEndpoint } from '../src/model/gateway.js';

describe('real OpenAI-compatible capability probes', () => {
  let baseUrl = '';
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => { raw += String(chunk); });
      request.on('end', () => {
        const body = JSON.parse(raw) as { stream?: boolean; tools?: unknown[] };
        if (body.stream) {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.write('data: {"id":"s","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"role":"assistant","content":"道心澄明"},"finish_reason":null}]}\n\n');
          response.write('data: {"id":"s","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n');
          response.end('data: [DONE]\n\n');
          return;
        }
        const toolCall = Array.isArray(body.tools);
        const message = toolCall
          ? { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'capabilityProbe', arguments: '{"value":"xiuxian-capability-ok"}' } }] }
          : { role: 'assistant', content: '{"value":"xiuxian-capability-ok"}' };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          id: 'c', object: 'chat.completion', created: 1, model: 'test',
          choices: [{ index: 0, message, finish_reason: toolCall ? 'tool_calls' : 'stop' }],
          usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
    close = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  afterAll(async () => close());

  it('proves structured output, forced tool calling and streamed text independently', async () => {
    const result = await testModelEndpoint({ baseUrl, apiKey: 'memory-only', model: 'test' }, 2_000);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      capabilities: { structuredOutput: true, toolCalling: true, streamingText: true },
      failures: [],
    }));
  });
});
