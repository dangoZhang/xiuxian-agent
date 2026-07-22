import { promptJson } from './serialize.js';
import type { JsonRecord, PromptEnvelope } from './types.js';

export function playerIntentPrompt(input: {
  readonly rawCommand: string;
  readonly player: JsonRecord;
  readonly visibleState: JsonRecord;
  readonly allowedTools: readonly string[];
}): PromptEnvelope {
  return {
    system: `你是玩家意图解析器。把玩家原话解析为一个 PlayerIntent，严格符合 schema。
必须原样保留 rawText，只提取目标、对象、行动与可见发言。
不得替玩家增动机、补策略、代为决策或直接修改状态。不可见对象不得出现在结果中。`,
    prompt: `玩家原话：\n<command>\n${input.rawCommand}\n</command>\n\n主角状态：\n${promptJson(input.player)}\n\n主角可见世界：\n${promptJson(input.visibleState)}\n\n当前允许的工具：${input.allowedTools.join(', ')}`,
  };
}
