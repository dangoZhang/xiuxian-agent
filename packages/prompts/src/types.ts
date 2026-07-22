export type JsonRecord = Readonly<Record<string, unknown>>;

export interface PromptEnvelope {
  readonly system: string;
  readonly prompt: string;
}

export interface VisibleCultivatorContext {
  readonly self: JsonRecord;
  readonly visibleWorld: JsonRecord;
  readonly visibleActors: readonly JsonRecord[];
  readonly memory: readonly JsonRecord[];
  readonly event: JsonRecord;
  readonly remainingSense: number;
  readonly focusSlots: number;
  readonly allowedTools: readonly string[];
  readonly rejectedCall?: JsonRecord;
}

export interface NarrationContext {
  readonly source: 'heaven' | 'fate' | 'player' | 'cultivator';
  readonly viewpointName: string;
  readonly settledFacts: readonly JsonRecord[];
  readonly causes: readonly JsonRecord[];
  readonly visibleState: JsonRecord;
}
