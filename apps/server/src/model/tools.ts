import { tool } from 'ai';
import { z } from 'zod';

export const cultivatorTools = {
  observe: tool({
    description: '观察可见的人物、地点或异象，消耗 1 点神识', strict: true,
    inputSchema: z.object({ target: z.string().min(1) }),
  }),
  remember: tool({
    description: '检索自己的个人记忆，消耗 1 点神识', strict: true,
    inputSchema: z.object({ query: z.string().min(1) }),
  }),
  move: tool({
    description: '前往相邻地点，消耗 1 点神识', strict: true,
    inputSchema: z.object({ destination: z.string().min(1) }),
  }),
  speak: tool({
    description: '当面说话或在规则允许时传音，消耗 1 点神识', strict: true,
    inputSchema: z.object({ target: z.string().min(1), words: z.string().min(1).max(4000) }),
  }),
  cultivate: tool({
    description: '修炼已知功法或恢复资源，消耗 2 点神识', strict: true,
    inputSchema: z.object({ method: z.string().min(1) }),
  }),
  useTechnique: tool({
    description: '对可见目标施展已掌握功法，消耗 2 点神识', strict: true,
    inputSchema: z.object({ name: z.string().min(1), target: z.string().min(1) }),
  }),
  guard: tool({
    description: '防御自身或保护可见目标，消耗 1 点神识', strict: true,
    inputSchema: z.object({ target: z.string().min(1) }),
  }),
  scheme: tool({
    description: '形成一项跨时间计划，消耗 2 点神识', strict: true,
    inputSchema: z.object({ goal: z.string().min(1).max(4000) }),
  }),
} as const;
