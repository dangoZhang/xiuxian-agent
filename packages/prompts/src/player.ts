import { promptJson } from './serialize.js';
import type { JsonRecord, PromptEnvelope } from './types.js';

export function playerIntentPrompt(input: {
  readonly rawCommand: string;
  readonly player: JsonRecord;
  readonly visibleState: JsonRecord;
  readonly visibleActors: readonly JsonRecord[];
  readonly currentEvent: JsonRecord;
  readonly allowedTools: readonly string[];
}): PromptEnvelope {
  return {
    system: `你是玩家意图解析器。把玩家原话解析为一个 PlayerIntent，严格符合 schema。
必须原样保留 rawText，只提取目标、对象、行动与可见发言。
不得替玩家增动机、补策略、代为决策或直接修改状态。不可见对象不得出现在结果中。
玩家使用姓名时，先从可见人物中映射到对应 id；工具参数与 targetIds 必须使用精确 id。`,
    prompt: `玩家原话：\n<command>\n${input.rawCommand}\n</command>\n\n主角状态：\n${promptJson(input.player)}\n\n当前事件：\n${promptJson(input.currentEvent)}\n\n主角可见世界：\n${promptJson(input.visibleState)}\n\n主角可见人物（工具目标使用 id）：\n${promptJson(input.visibleActors)}\n\n当前允许的工具：${input.allowedTools.join(', ')}`,
  };
}
