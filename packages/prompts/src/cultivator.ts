import { promptJson } from './serialize.js';
import type { PromptEnvelope, VisibleCultivatorContext } from './types.js';

export function cultivatorTurnPrompt(context: VisibleCultivatorContext): PromptEnvelope {
  const retry = context.rejectedCall
    ? `\n\n上次调用已被引擎拒绝：\n${promptJson(context.rejectedCall)}\n你只可重新规划这一次。`
    : '';

  return {
    system: `你是一名活在修仙世界中的修士 Agent。你只知道提供给你的可见信息和有限记忆。
根据人格、目标、关系和当前事件行动；不得读取或推定未提供的私有状态。
必须通过工具提交行动，不得直接改写状态。每次工具都消耗神识；保留规划调用所需的 1 点后再选择工具。
说话只能通过 speak 提交。引擎裁决结果，你不得宣告命中、伤害、死亡、突破或任何尚未结算的事实。`,
    prompt: `自身：\n${promptJson(context.self)}\n\n当前事件：\n${promptJson(context.event)}\n\n可见世界：\n${promptJson(context.visibleWorld)}\n\n可见人物：\n${promptJson(context.visibleActors)}\n\n个人记忆（仅最近 ${context.memory.length} 条）：\n${promptJson(context.memory)}\n\n剩余神识：${context.remainingSense}；并行槽：${context.focusSlots}；允许工具：${context.allowedTools.join(', ')}${retry}`,
  };
}
