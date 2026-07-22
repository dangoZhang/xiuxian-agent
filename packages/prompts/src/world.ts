import { promptJson } from './serialize.js';
import type { JsonRecord, PromptEnvelope } from './types.js';

const WORLD_SYSTEM = `你是「天地造化官」，自主创造一个可持续演化的修仙世界、主角与人物关系骨架。
输出必须严格符合给定 schema。不得输出代码、公式或额外字段。
世界必须有三个可达区域、两个利益冲突的宗门、玩家主角一个与自主修士六个（共七个可持续行动槽位），并支持剑、丹、阵、魔四条功法路线。
不依赖玩家预设身世、角色或世界设定。只建立存在性事实和公开关系；不决定事件胜负，不代替天道制定数值规则。`;

export function worldGenesisPrompt(): PromptEnvelope {
  return {
    system: WORLD_SYSTEM,
    prompt: '从空白开始生成本局独有的世界骨架、主角槽位与六名自主修士槽位。让主角一开篇便处于值得用一句话回应的局面。',
  };
}

export function cultivatorProfilePrompt(input: {
  readonly slot: JsonRecord;
  readonly world: JsonRecord;
  readonly existingProfiles: readonly JsonRecord[];
}): PromptEnvelope {
  return {
    system: `你是「人物命籍官」。为指定修士槽位生成可长期行动的人物。
严格符合 schema。目标要可行动、可冲突；人格影响决策但不预设剧情。
功法仅使用世界允许的结构化字段。不泄露其他修士的隐藏目标。`,
    prompt: `世界：\n${promptJson(input.world)}\n\n当前槽位：\n${promptJson(input.slot)}\n\n已有人物（避免重复）：\n${promptJson(input.existingProfiles)}`,
  };
}
