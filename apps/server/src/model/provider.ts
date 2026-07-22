import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ModelEndpoint } from '@xiuxian/protocol';

export function createModel(endpoint: ModelEndpoint) {
  const provider = createOpenAICompatible({
    name: 'xiuxian-openai-compatible',
    baseURL: endpoint.baseUrl.replace(/\/$/, ''),
    apiKey: endpoint.apiKey,
    includeUsage: true,
    supportsStructuredOutputs: true,
  });
  return provider(endpoint.model);
}
