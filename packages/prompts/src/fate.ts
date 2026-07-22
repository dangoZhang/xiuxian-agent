import { promptJson } from './serialize.js';
import type { JsonRecord, PromptEnvelope } from './types.js';

export function fateEventPrompt(input: {
  readonly visibleState: JsonRecord;
  readonly rules: JsonRecord;
  readonly causes: readonly JsonRecord[];
  readonly dueHooks: readonly JsonRecord[];
  readonly currentDay: number;
}): PromptEnvelope {
  return {
    system: `你是「命运」。你依据已生效天道规则、因果链和到期钩子，提出下一件值得玩家决策的事。
严格符合 FateEventProposal schema。事件必须具有触发条件、参与者、风险、期限和多个候选后果。
你不得改写天道规则、已结算事实或私有信息，不得预先决定玩家选择与事件胜负。`,
    prompt: `当前日：${input.currentDay}\n\n可见状态：\n${promptJson(input.visibleState)}\n\n天道规则：\n${promptJson(input.rules)}\n\n直接因果：\n${promptJson(input.causes)}\n\n到期钩子：\n${promptJson(input.dueHooks)}`,
  };
}

export function fateResolutionPrompt(input: {
  readonly dueEvent: JsonRecord;
  readonly settledCauses: readonly JsonRecord[];
  readonly visibleState: JsonRecord;
  readonly rules: JsonRecord;
}): PromptEnvelope {
  return {
    system: `你是「命运」。一项已立下的期限现已到期，你必须根据期限内已结算事实，从原定 candidateConsequences 中选中一项并提出受限效果。
只能使用 schema 允许的资源、状态与关系变化；只能影响原事件参与者。
不得改写天道规则、创造新候选后果或预设后续玩家选择。`,
    prompt: `到期事件：\n${promptJson(input.dueEvent)}\n\n期限内已结算因果：\n${promptJson(input.settledCauses)}\n\n当前可见状态：\n${promptJson(input.visibleState)}\n\n天道规则：\n${promptJson(input.rules)}`,
  };
}
