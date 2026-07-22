import type { CapabilityResult, Cultivator, GameProjection, ModelConfig, StreamEnvelope } from '../types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code?: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('无法连接游戏服务，请确认服务端已启动。')
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const message = typeof body?.message === 'string'
      ? body.message
      : typeof body?.error === 'string'
        ? body.error
        : `请求失败（${response.status}）`
    throw new ApiError(message, response.status, typeof body?.code === 'string' ? body.code : undefined)
  }
  return body as T
}

function toWireConfig(config: ModelConfig) {
  return {
    default: { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model },
    maxConcurrency: config.maxConcurrency,
    roles: {},
  }
}

function normalizeGame(value: unknown): GameProjection {
  const envelope = value as { game?: unknown; projection?: unknown; state?: unknown }
  const raw = (envelope.projection ?? envelope.game ?? envelope.state ?? value) as Record<string, unknown>
  if (Array.isArray(raw.entries) && Array.isArray(raw.cultivators)) return raw as unknown as GameProjection

  const world = raw.world as Record<string, unknown> | undefined
  const peopleRecord = (world?.cultivators ?? {}) as Record<string, Record<string, unknown>>
  const locations = (world?.locations ?? {}) as Record<string, { name?: string }>
  const people = Object.values(peopleRecord)
  const names = Object.fromEntries(people.map((person) => [String(person.id), String(person.name)]))
  const cultivators: Cultivator[] = people.map((person) => {
    const stats = (person.stats ?? {}) as Record<string, unknown>
    const relations = Array.isArray(person.relations) ? person.relations as Array<Record<string, unknown>> : []
    const plan = person.plan as { goal?: string } | null | undefined
    return {
      id: String(person.id),
      name: String(person.name),
      realm: String(stats.realm ?? '境界未明'),
      location: locations[String(person.locationId)]?.name ?? String(person.locationId ?? ''),
      hp: Number(stats.hp ?? 0),
      hpMax: Number(stats.hpMax ?? stats.hp ?? 0),
      qi: Number(stats.qi ?? 0),
      qiMax: Number(stats.qiMax ?? stats.qi ?? 0),
      sense: Number(stats.senseMax ?? 0),
      senseMax: Number(stats.senseMax ?? 0),
      focusSlots: Number(stats.focusSlots ?? 1),
      lifespan: Number(stats.lifespan ?? 0),
      lifespanMax: Number(stats.lifespan ?? 0),
      statuses: Array.isArray(stats.statuses) ? stats.statuses.map(String) : [],
      techniques: Array.isArray(person.techniques) ? person.techniques as NonNullable<Cultivator['techniques']> : [],
      relations: relations.map((relation) => {
        const targetName = names[String(relation.targetId)]
        const label = Array.isArray(relation.labels) ? relation.labels.map(String).join(' · ') : ''
        return {
          targetId: String(relation.targetId),
          ...(targetName ? { targetName } : {}),
          value: Number(relation.affinity ?? 0),
          ...(label ? { label } : {}),
          karma: Number(relation.karmaDebt ?? 0),
        }
      }),
      ...(plan?.goal ? { plan: plan.goal } : {}),
      isPlayer: Boolean(person.isPlayer),
    }
  })
  const status = String(raw.status ?? '')
  const queue = Array.isArray(raw.queue) ? raw.queue as Array<Record<string, unknown>> : []
  return {
    id: String(raw.id),
    revision: Number(raw.revision ?? 0),
    day: Number(world?.day ?? 0),
    awaitingPlayer: status === 'awaiting_player',
    paused: status === 'paused',
    ...(typeof raw.pauseReason === 'string' ? { pauseReason: raw.pauseReason } : {}),
    ...(cultivators.find((item) => item.isPlayer)?.id ? { protagonistId: cultivators.find((item) => item.isPlayer)!.id } : {}),
    entries: Array.isArray(raw.chronicle) ? raw.chronicle as GameProjection['entries'] : [],
    cultivators,
    queue: queue.map((item) => ({ id: String(item.id), day: Number(item.day), kind: String(item.type ?? '') })),
    ...(typeof raw.ending === 'string' ? { ending: raw.ending } : {}),
  }
}

export function useGameApi() {
  return {
    async createSession(config: ModelConfig): Promise<{ sessionId: string; capabilities: CapabilityResult }> {
      const wireConfig = toWireConfig(config)
      const value = await request<{
        id?: string
        sessionId?: string
        test?: {
          ok?: boolean
          capabilities?: { structuredOutput?: boolean; toolCalling?: boolean; streamingText?: boolean }
          failures?: string[]
        }
      }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ modelConfig: wireConfig, config: wireConfig }),
      })
      const id = value.sessionId ?? value.id
      if (!id) throw new ApiError('服务端未返回会话编号。')
      const tested = value.test
      return {
        sessionId: id,
        capabilities: {
          structuredOutput: Boolean(tested?.capabilities?.structuredOutput),
          toolCalling: Boolean(tested?.capabilities?.toolCalling),
          streaming: Boolean(tested?.capabilities?.streamingText),
          ...(!tested?.ok && tested?.failures?.length ? { message: `模型缺少能力：${tested.failures.join('、')}` } : {}),
        },
      }
    },

    async createGame(sessionId: string): Promise<GameProjection> {
      return normalizeGame(await request('/api/games', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }))
    },

    async getGame(gameId: string): Promise<GameProjection> {
      return normalizeGame(await request(`/api/games/${encodeURIComponent(gameId)}`))
    },

    async command(gameId: string, text: string): Promise<GameProjection | null> {
      const value = await request<unknown>(`/api/games/${encodeURIComponent(gameId)}/commands`, {
        method: 'POST',
        body: JSON.stringify({ text, rawText: text }),
      })
      const envelope = value as { game?: GameProjection; projection?: GameProjection }
      return envelope.game || envelope.projection || (value && typeof value === 'object' && ('entries' in value || 'world' in value))
        ? normalizeGame(value)
        : null
    },

    async advance(gameId: string): Promise<GameProjection | null> {
      const value = await request<unknown>(`/api/games/${encodeURIComponent(gameId)}/advance`, {
        method: 'POST',
        body: '{}',
      })
      const envelope = value as { game?: GameProjection; projection?: GameProjection }
      return envelope.game || envelope.projection || (value && typeof value === 'object' && ('entries' in value || 'world' in value))
        ? normalizeGame(value)
        : null
    },

    async retry(gameId: string): Promise<GameProjection | null> {
      return this.advance(gameId)
    },

    subscribe(gameId: string, onEvent: (event: StreamEnvelope) => void, onError: () => void): () => void {
      const stream = new EventSource(`/api/games/${encodeURIComponent(gameId)}/events`)
      const eventNames: StreamEnvelope['type'][] = [
        'call.started', 'text.delta', 'tool.called', 'call.completed', 'entry.resolved', 'game.paused',
      ]
      const consume = (event: MessageEvent<string>) => {
        try {
          onEvent(JSON.parse(event.data) as StreamEnvelope)
        } catch {
          // Ignore malformed transport frames; server errors arrive as game.paused.
        }
      }
      stream.onmessage = consume
      eventNames.forEach((name) => stream.addEventListener(name, consume as EventListener))
      stream.onerror = onError
      return () => stream.close()
    },
  }
}
