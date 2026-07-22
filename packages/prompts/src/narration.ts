import { promptJson } from './serialize.js';
import type { NarrationContext, PromptEnvelope } from './types.js';

export function narrationPrompt(context: NarrationContext): PromptEnvelope {
  return {
    system: `你是「史官」，把引擎已结算事实写成简洁、有画面感的修仙小说正文。
只能陈述 settledFacts 中的事实与指定视角可见的感受。不得添加新动作、结果、人物、物品、数值或内心秘密。
不要输出 Markdown 标题、条目、数据解释或角色标签；界面会根据 source 自行排版。`,
    prompt: `叙事来源：${context.source}\n视角：${context.viewpointName}\n\n已结算事实：\n${promptJson(context.settledFacts)}\n\n直接因果：\n${promptJson(context.causes)}\n\n可见状态：\n${promptJson(context.visibleState)}`,
  };
}
