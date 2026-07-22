export type Source = 'heaven' | 'fate' | 'player' | 'cultivator'
export type EntryKind = 'rule' | 'event' | 'dialogue' | 'action' | 'combat' | 'breakthrough'
export type Phase = 'rule' | 'fate' | 'player' | 'agent' | 'resolve' | 'narrate'

export interface ModelConfig {
  baseUrl: string
  apiKey: string
  model: string
  maxConcurrency: number
  roleModels?: {
    heaven?: string | undefined
    fate?: string | undefined
    cultivator?: string | undefined
  } | undefined
}

export interface CapabilityResult {
  structuredOutput: boolean
  toolCalling: boolean
  streaming: boolean
  message?: string
}

export interface ChronicleEntry {
  id: string
  day: number
  phase: Phase
  sequence: number
  source: Source
  kind: EntryKind
  actorIds: string[]
  causeIds: string[]
  visibility: string[]
  text: string
  structuredPayload?: unknown
  cost: { sense: number; qi: number }
}

export interface Technique {
  id?: string
  name: string
  route?: string
  power?: number
  qiCost?: number
  tags?: string[]
}

export interface Relation {
  targetId: string
  targetName?: string
  value?: number
  label?: string
  karma?: number
}

export interface Cultivator {
  id: string
  name: string
  realm: string
  location?: string
  hp: number
  hpMax?: number
  qi: number
  qiMax?: number
  sense?: number
  senseMax: number
  focusSlots: number
  lifespan?: number
  lifespanMax?: number
  karma?: number
  statuses?: string[]
  techniques?: Technique[]
  relations?: Relation[]
  plan?: string
  isPlayer?: boolean
}

export interface RunningCall {
  callId: string
  source: Source
  actorId?: string | undefined
  actorName?: string | undefined
  sequence: number
  state: 'queued' | 'running' | 'tool'
  tool?: string | undefined
  senseCost?: number | undefined
  startedAt: number
}

export interface GameProjection {
  id: string
  revision: number
  day: number
  awaitingPlayer?: boolean
  paused?: boolean
  pauseReason?: string
  protagonistId?: string
  entries: ChronicleEntry[]
  cultivators: Cultivator[]
  queue?: Array<{ id?: string; day: number; title?: string; kind?: string }>
  ending?: string
}

export interface StreamEnvelope {
  type: 'call.started' | 'text.delta' | 'tool.called' | 'call.completed' | 'entry.resolved' | 'game.paused'
  callId?: string
  source?: Source
  actorId?: string
  sequence?: number
  delta?: string
  tool?: string
  entry?: ChronicleEntry
  game?: GameProjection
  reason?: string
  [key: string]: unknown
}
