import { randomUUID } from 'node:crypto';
import {
  generateText,
  InvalidToolInputError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSuchToolError,
  Output,
  streamText,
  tool,
  type LanguageModelUsage,
  type ToolSet,
} from 'ai';
import { z, type ZodType } from 'zod';
import {
  modelTestResultSchema,
  toolCallSchema,
  type ModelConfig,
  type ModelEndpoint,
  type ModelTestResult,
  type Source,
  type ToolCall,
  type ToolName,
} from '@xiuxian/protocol';
import type { PromptEnvelope } from '@xiuxian/prompts';
import { WeightedSemaphore } from '@xiuxian/engine';
import { AppError } from '../errors.js';
import { GameEventBus } from '../events.js';
import { createModel } from './provider.js';
import { cultivatorTools } from './tools.js';

export type ModelRole = 'heaven' | 'fate' | 'cultivator' | 'narration';

interface CallContext {
  readonly gameId: string;
  readonly source: Source;
  readonly actorId: string | null;
  readonly requestType: string;
}

function usageNumbers(usage: LanguageModelUsage): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

function endpointKey(endpoint: ModelEndpoint): string {
  return `${endpoint.baseUrl.replace(/\/$/, '')}\u0000${endpoint.model}`;
}

function modelFailure(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('429') || message.includes('rate limit')) {
    return new AppError('MODEL_RATE_LIMITED', '模型端点限流或额度不足', 503);
  }
  if (name.includes('Timeout') || message.includes('timeout') || message.includes('aborted')) {
    return new AppError('MODEL_TIMEOUT', '模型调用超时', 504);
  }
  return new AppError('MODEL_UNREACHABLE', '模型端点调用失败', 502);
}

export async function testModelEndpoint(endpoint: ModelEndpoint, timeoutMs: number): Promise<ModelTestResult> {
  const started = performance.now();
  const capabilities = { structuredOutput: false, toolCalling: false, streamingText: false };
  const failures: string[] = [];
  const model = createModel(endpoint);

  try {
    const result = await generateText({
      model,
      maxRetries: 0,
      timeout: timeoutMs,
      output: Output.object({ schema: z.object({ value: z.literal('xiuxian-capability-ok') }) }),
      prompt: 'Return the required capability probe object.',
    });
    capabilities.structuredOutput = result.output.value === 'xiuxian-capability-ok';
    if (!capabilities.structuredOutput) failures.push('structuredOutput');
  } catch { failures.push('structuredOutput'); }

  try {
    const result = await generateText({
      model,
      maxRetries: 0,
      timeout: timeoutMs,
      tools: {
        capabilityProbe: tool({
          description: 'Call this tool exactly once with the required value.',
          strict: true,
          inputSchema: z.object({ value: z.literal('xiuxian-capability-ok') }),
        }),
      },
      toolChoice: { type: 'tool', toolName: 'capabilityProbe' },
      prompt: 'Call capabilityProbe now.',
    });
    const call = result.toolCalls[0];
    const input = z.object({ value: z.literal('xiuxian-capability-ok') }).safeParse(call?.input);
    capabilities.toolCalling = call?.toolName === 'capabilityProbe' && input.success;
    if (!capabilities.toolCalling) failures.push('toolCalling');
  } catch { failures.push('toolCalling'); }

  try {
    const result = streamText({
      model,
      maxRetries: 0,
      timeout: timeoutMs,
      prompt: 'Reply with one short Chinese sentence.',
    });
    let received = '';
    for await (const delta of result.textStream) received += delta;
    capabilities.streamingText = received.trim().length > 0;
    if (!capabilities.streamingText) failures.push('streamingText');
  } catch { failures.push('streamingText'); }

  return modelTestResultSchema.parse({
    ok: failures.length === 0,
    capabilities,
    latencyMs: Math.round(performance.now() - started),
    failures,
  });
}

export async function testModelConfig(config: ModelConfig, timeoutMs: number): Promise<ModelTestResult> {
  const endpoints = [config.default, ...Object.values(config.roles).filter((value): value is ModelEndpoint => value !== undefined)];
  const unique = [...new Map(endpoints.map((endpoint) => [endpointKey(endpoint), endpoint])).values()];
  const results = await Promise.all(unique.map((endpoint) => testModelEndpoint(endpoint, timeoutMs)));
  return modelTestResultSchema.parse({
    ok: results.every((result) => result.ok),
    capabilities: {
      structuredOutput: results.every((result) => result.capabilities.structuredOutput),
      toolCalling: results.every((result) => result.capabilities.toolCalling),
      streamingText: results.every((result) => result.capabilities.streamingText),
    },
    latencyMs: Math.max(0, ...results.map((result) => result.latencyMs)),
    failures: [...new Set(results.flatMap((result) => result.failures))],
  });
}

export class ModelGateway {
  readonly #semaphore: WeightedSemaphore;

  constructor(
    private readonly config: ModelConfig,
    private readonly timeoutMs: number,
    private readonly events: GameEventBus,
    maxConcurrency: number,
    private readonly globalSemaphore?: WeightedSemaphore,
  ) {
    this.#semaphore = new WeightedSemaphore(Math.min(config.maxConcurrency, maxConcurrency));
  }

  async structured<T>(role: ModelRole, envelope: PromptEnvelope, schema: ZodType<T>, context: CallContext): Promise<T> {
    return this.#run(async () => {
      const callId = this.#started(context);
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const result = await generateText({
              model: createModel(this.#endpoint(role)),
              system: attempt === 0 ? envelope.system : `${envelope.system}\n上一次输出未通过 schema。这是唯一一次修复机会，只输出严格合法的结果。`,
              prompt: envelope.prompt,
              output: Output.object({ schema }),
              maxRetries: 0,
              timeout: this.timeoutMs,
            });
            const parsed = schema.parse(result.output);
            this.#completed(context, callId, result.totalUsage);
            return parsed;
          } catch (error) {
            const repairable = NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error) || error instanceof z.ZodError;
            if (!repairable) throw error;
            if (attempt === 1) throw new AppError('MODEL_OUTPUT_INVALID', '模型结构化输出两次未通过 schema', 422);
          }
        }
        throw new AppError('MODEL_OUTPUT_INVALID', '模型结构化输出无效', 422);
      } catch (error) {
        throw modelFailure(error);
      }
    });
  }

  async toolCalls(
    role: 'cultivator',
    envelope: PromptEnvelope,
    context: CallContext,
    allowedTools: readonly ToolName[],
  ): Promise<{ calls: ToolCall[]; reasoning: string; usage: { inputTokens: number; outputTokens: number } }> {
    return this.#run(async () => {
      const callId = this.#started(context);
      try {
        const result = await generateText({
          model: createModel(this.#endpoint(role)),
          system: envelope.system,
          prompt: envelope.prompt,
          tools: cultivatorTools as unknown as ToolSet,
          activeTools: [...allowedTools],
          toolChoice: 'required',
          maxRetries: 0,
          timeout: this.timeoutMs,
        });
        if (result.toolCalls.length === 0) throw new AppError('MODEL_OUTPUT_INVALID', '修士未提交工具调用', 422);
        const calls = result.toolCalls.map((call) => toolCallSchema.parse({
          id: call.toolCallId,
          name: call.toolName,
          arguments: call.input,
        }));
        for (const call of calls) {
          this.events.publish(context.gameId, {
            type: 'tool.called', callId, source: context.source, actorId: context.actorId,
            sequence: this.events.nextSequence(context.gameId), toolCallId: call.id, tool: call.name,
          });
        }
        const usage = usageNumbers(result.totalUsage);
        this.#completed(context, callId, result.totalUsage);
        return { calls, reasoning: result.text.trim(), usage };
      } catch (error) {
        if (error instanceof z.ZodError) throw new AppError('MODEL_OUTPUT_INVALID', '修士工具调用参数无效', 422, error.issues);
        if (InvalidToolInputError.isInstance(error) || NoSuchToolError.isInstance(error)) {
          throw new AppError('MODEL_OUTPUT_INVALID', '修士生成了非法工具调用', 422);
        }
        throw modelFailure(error);
      }
    });
  }

  async narrative(role: 'narration', envelope: PromptEnvelope, context: CallContext): Promise<string> {
    return this.#run(async () => {
      const callId = this.#started(context);
      try {
        const result = streamText({
          model: createModel(this.#endpoint(role)), system: envelope.system, prompt: envelope.prompt,
          maxRetries: 0, timeout: this.timeoutMs,
        });
        let text = '';
        for await (const delta of result.textStream) {
          text += delta;
          this.events.publish(context.gameId, {
            type: 'text.delta', callId, source: context.source, actorId: context.actorId,
            sequence: this.events.nextSequence(context.gameId), delta,
          });
        }
        if (!text.trim()) throw new AppError('MODEL_OUTPUT_INVALID', '模型未生成叙事文本', 422);
        this.#completed(context, callId, await result.totalUsage);
        return text.trim();
      } catch (error) {
        throw modelFailure(error);
      }
    });
  }

  #endpoint(role: ModelRole): ModelEndpoint {
    return this.config.roles[role] ?? this.config.default;
  }

  #run<T>(task: () => Promise<T>): Promise<T> {
    return this.#semaphore.run(() => this.globalSemaphore ? this.globalSemaphore.run(task) : task());
  }

  #started(context: CallContext): string {
    const callId = randomUUID();
    this.events.publish(context.gameId, {
      type: 'call.started', callId, source: context.source, actorId: context.actorId,
      sequence: this.events.nextSequence(context.gameId), requestType: context.requestType,
    });
    return callId;
  }

  #completed(context: CallContext, callId: string, usage: LanguageModelUsage): void {
    this.events.publish(context.gameId, {
      type: 'call.completed', callId, source: context.source, actorId: context.actorId,
      sequence: this.events.nextSequence(context.gameId), usage: usageNumbers(usage),
    });
  }
}
