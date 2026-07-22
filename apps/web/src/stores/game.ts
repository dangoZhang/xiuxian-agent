import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, useGameApi } from '../composables/useGameApi'
import type { CapabilityResult, GameProjection, ModelConfig, RunningCall, StreamEnvelope } from '../types'

export const useGameStore = defineStore('game', () => {
  const api = useGameApi()
  const modelConfig = ref<ModelConfig | null>(null)
  const capabilities = ref<CapabilityResult | null>(null)
  const sessionId = ref<string | null>(null)
  const game = ref<GameProjection | null>(null)
  const activeCalls = ref<Record<string, RunningCall>>({})
  const streamText = ref<Record<string, string>>({})
  const busy = ref(false)
  const testing = ref(false)
  const error = ref<string | null>(null)
  const streamDisconnected = ref(false)
  const pendingCommand = ref<string | null>(null)
  let stopStream: (() => void) | undefined

  const modelReady = computed(() => Boolean(
    capabilities.value?.structuredOutput
    && capabilities.value?.toolCalling
    && capabilities.value?.streaming,
  ))
  const protagonist = computed(() => {
    if (!game.value) return undefined
    return game.value.cultivators.find((item) => item.id === game.value?.protagonistId)
      ?? game.value.cultivators.find((item) => item.isPlayer)
  })

  function clearError() {
    error.value = null
  }

  function describeError(cause: unknown): string {
    return cause instanceof ApiError || cause instanceof Error ? cause.message : '发生未知错误。'
  }

  async function validateModel(config: ModelConfig) {
    testing.value = true
    error.value = null
    capabilities.value = null
    try {
      modelConfig.value = config.roleModels
        ? { ...config, roleModels: { ...config.roleModels } }
        : { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, maxConcurrency: config.maxConcurrency }
      const session = await api.createSession(modelConfig.value)
      const result = session.capabilities
      capabilities.value = result
      if (!result.structuredOutput || !result.toolCalling || !result.streaming) {
        throw new ApiError(result.message || '模型未通过全部能力校验。')
      }
      sessionId.value = session.sessionId
    } catch (cause) {
      error.value = describeError(cause)
      throw cause
    } finally {
      testing.value = false
    }
  }

  async function begin(origin: string) {
    if (!modelReady.value || !modelConfig.value) {
      error.value = '请先完成模型能力校验。'
      return
    }
    busy.value = true
    error.value = null
    try {
      if (!sessionId.value) sessionId.value = (await api.createSession(modelConfig.value)).sessionId
      game.value = await api.createGame(sessionId.value, origin)
      connectStream()
    } catch (cause) {
      error.value = describeError(cause)
      throw cause
    } finally {
      busy.value = false
    }
  }

  async function sendCommand(text: string) {
    if (!game.value || busy.value) return
    const startingRevision = game.value.revision
    pendingCommand.value = text
    busy.value = true
    error.value = null
    try {
      const projection = await api.command(game.value.id, text)
      if (projection) {
        game.value = projection
        pendingCommand.value = null
      }
    } catch (cause) {
      error.value = describeError(cause)
      try {
        const latest = await api.getGame(game.value.id)
        if (latest.revision > startingRevision) {
          game.value = latest
          pendingCommand.value = null
        }
      } catch {
        // Keep the original error and command so an uncommitted turn can be retried.
      }
    } finally {
      busy.value = false
    }
  }

  async function retry() {
    if (!game.value) return
    busy.value = true
    error.value = null
    try {
      const projection = pendingCommand.value
        ? await api.command(game.value.id, pendingCommand.value)
        : await api.retry(game.value.id)
      if (projection) game.value = projection
      else game.value = await api.getGame(game.value.id)
      pendingCommand.value = null
    } catch (cause) {
      error.value = describeError(cause)
    } finally {
      busy.value = false
    }
  }

  function handleStream(envelope: StreamEnvelope) {
    streamDisconnected.value = false
    const callId = envelope.callId
    if (envelope.type === 'call.started' && callId && envelope.source) {
      const actorName = game.value?.cultivators.find((item) => item.id === envelope.actorId)?.name
      activeCalls.value[callId] = {
        callId,
        source: envelope.source,
        ...(envelope.actorId ? { actorId: envelope.actorId } : {}),
        ...(actorName ? { actorName } : {}),
        sequence: envelope.sequence ?? 0,
        state: 'running',
        startedAt: Date.now(),
      }
    } else if (envelope.type === 'tool.called' && callId && activeCalls.value[callId]) {
      activeCalls.value[callId] = {
        ...activeCalls.value[callId],
        state: 'tool',
        ...(envelope.tool ? { tool: envelope.tool } : {}),
      }
    } else if (envelope.type === 'text.delta' && callId && typeof envelope.delta === 'string') {
      streamText.value[callId] = (streamText.value[callId] ?? '') + envelope.delta
    } else if (envelope.type === 'call.completed' && callId) {
      delete activeCalls.value[callId]
      delete streamText.value[callId]
    } else if (envelope.type === 'entry.resolved') {
      if (envelope.game) game.value = envelope.game
      else if (envelope.entry && game.value && !game.value.entries.some((item) => item.id === envelope.entry?.id)) {
        game.value.entries.push(envelope.entry)
        game.value.day = Math.max(game.value.day, envelope.entry.day)
      }
    } else if (envelope.type === 'game.paused' && game.value) {
      game.value.paused = true
      game.value.pauseReason = envelope.reason ?? '模型调用暂停。'
      error.value = game.value.pauseReason
      activeCalls.value = {}
    }
  }

  function connectStream() {
    stopStream?.()
    if (!game.value) return
    stopStream = api.subscribe(game.value.id, handleStream, () => {
      streamDisconnected.value = true
    })
  }

  async function exportSave() {
    if (!game.value) return
    try {
      await api.exportGame(game.value.id)
    } catch (cause) {
      error.value = describeError(cause)
    }
  }

  async function importSave(file: File) {
    if (!sessionId.value) {
      error.value = '导入存档前需先通过模型校验。'
      return
    }
    busy.value = true
    error.value = null
    try {
      game.value = await api.importGame(file, sessionId.value)
      connectStream()
    } catch (cause) {
      error.value = describeError(cause)
    } finally {
      busy.value = false
    }
  }

  return {
    modelConfig, capabilities, modelReady, sessionId, game, protagonist, activeCalls,
    streamText, busy, testing, error, streamDisconnected, clearError, validateModel,
    begin, sendCommand, retry, exportSave, importSave, connectStream,
  }
})
