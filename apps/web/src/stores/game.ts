import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, useGameApi } from '../composables/useGameApi'
import type { CapabilityResult, GameProjection, ModelConfig, StreamEnvelope } from '../types'

export const useGameStore = defineStore('game', () => {
  const api = useGameApi()
  const modelConfig = ref<ModelConfig | null>(null)
  const capabilities = ref<CapabilityResult | null>(null)
  const sessionId = ref<string | null>(null)
  const game = ref<GameProjection | null>(null)
  const busy = ref(false)
  const testing = ref(false)
  const error = ref<string | null>(null)
  const pendingCommand = ref<string | null>(null)
  let stopStream: (() => void) | undefined

  const modelReady = computed(() => Boolean(
    capabilities.value?.structuredOutput
    && capabilities.value?.toolCalling
    && capabilities.value?.streaming,
  ))
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
      modelConfig.value = { ...config }
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

  async function begin() {
    if (!modelReady.value || !modelConfig.value) {
      error.value = '请先完成模型能力校验。'
      return
    }
    busy.value = true
    error.value = null
    try {
      if (!sessionId.value) sessionId.value = (await api.createSession(modelConfig.value)).sessionId
      game.value = await api.createGame(sessionId.value)
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
          error.value = null
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
    if (envelope.type === 'entry.resolved') {
      if (envelope.game) game.value = envelope.game
      else if (envelope.entry && game.value && !game.value.entries.some((item) => item.id === envelope.entry?.id)) {
        game.value.entries.push(envelope.entry)
        game.value.day = Math.max(game.value.day, envelope.entry.day)
      }
    } else if (envelope.type === 'game.paused' && game.value) {
      game.value.paused = true
      game.value.pauseReason = envelope.reason ?? '模型调用暂停。'
      error.value = game.value.pauseReason
    }
  }

  function connectStream() {
    stopStream?.()
    if (!game.value) return
    stopStream = api.subscribe(game.value.id, handleStream, () => {})
  }

  return {
    modelConfig, capabilities, modelReady, sessionId, game, busy, testing, error,
    clearError, validateModel, begin, sendCommand, retry, connectStream,
  }
})
