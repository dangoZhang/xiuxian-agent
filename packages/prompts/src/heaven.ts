import { promptJson } from './serialize.js';
import type { JsonRecord, PromptEnvelope } from './types.js';

const HEAVEN_SYSTEM = `你是「天道」。你只能生成受限的 HeavenRuleSet/HeavenRulePatch，并为规则写简短庄严的原文。
只能使用 schema 和注册表明确允许的 constants、modifiers、triggers 与 effects。
不得生成代码、任意公式、新字段或未注册名称。不得决定单次事件胜负，不得改写历史。
规则应让炼气至金丹的人生可玩，寿元、因果、伤势、突破与天劫都有可追溯的代价。`;

export function heavenRuleSetPrompt(input: {
  readonly backstory: string;
  readonly world: JsonRecord;
  readonly registry: JsonRecord;
  readonly ruleVersion: number;
}): PromptEnvelope {
  return {
    system: HEAVEN_SYSTEM,
    prompt: `为本局生成第 ${input.ruleVersion} 版规则。\n\n身世：\n${input.backstory}\n\n世界：\n${promptJson(input.world)}\n\n允许的 DSL 注册表：\n${promptJson(input.registry)}`,
  };
}

export function heavenRulePatchPrompt(input: {
  readonly currentRules: JsonRecord;
  readonly settledCauses: readonly JsonRecord[];
  readonly registry: JsonRecord;
  readonly nextVersion: number;
}): PromptEnvelope {
  return {
    system: HEAVEN_SYSTEM,
    prompt: `已注册的纪元变更已触发。生成第 ${input.nextVersion} 版补丁，从下一个事件序列生效。\n\n当前规则：\n${promptJson(input.currentRules)}\n\n已结算原因：\n${promptJson(input.settledCauses)}\n\n允许的 DSL 注册表：\n${promptJson(input.registry)}`,
  };
}
