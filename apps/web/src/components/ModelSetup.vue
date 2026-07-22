<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useGameStore } from '../stores/game'
import type { ModelConfig } from '../types'

const store = useGameStore()
const showKey = ref(false)
const form = reactive<ModelConfig>({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  maxConcurrency: 4,
})

const complete = computed(() => {
  try {
    new URL(form.baseUrl)
    return Boolean(form.apiKey.trim() && form.model.trim() && form.maxConcurrency >= 1 && form.maxConcurrency <= 32)
  } catch {
    return false
  }
})

async function test() {
  if (!complete.value) return
  try {
    await store.validateModel({
      baseUrl: form.baseUrl.trim().replace(/\/$/, ''),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      maxConcurrency: form.maxConcurrency,
    })
    await store.begin()
  } catch {
    // Store presents the actionable server error.
  }
}
</script>

<template>
  <form class="model-form" @submit.prevent="test">
    <h2>模型</h2>

    <label class="field">
      <span>Base URL</span>
      <input v-model="form.baseUrl" type="url" inputmode="url" autocomplete="url" required placeholder="https://…/v1" />
    </label>
    <label class="field">
      <span>API Key</span>
      <span class="secret-field">
        <input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" autocomplete="off" required placeholder="sk-…" />
        <button type="button" class="text-button" :aria-label="showKey ? '隐藏密钥' : '显示密钥'" @click="showKey = !showKey">
          {{ showKey ? '隐藏' : '显示' }}
        </button>
      </span>
    </label>
    <label class="field">
      <span>模型</span>
      <input v-model="form.model" autocomplete="off" required placeholder="例如：gpt-4.1" />
    </label>

    <button class="primary-button model-submit" type="submit" :disabled="!complete || store.testing || store.busy">
      <span>{{ store.testing ? '验证中…' : store.busy ? '生成开篇中…' : '开始' }}</span>
    </button>
  </form>
</template>

<style scoped>
.model-form { width: 100%; min-width: 0; }
h2 { margin: 0 0 1.5rem; font: 600 1.35rem/1.3 var(--font-ui); }
.field { display: grid; gap: 0.45rem; margin-top: 1rem; color: var(--muted); font-size: 0.78rem; }
.field input { width: 100%; min-height: 2.8rem; border: 1px solid var(--line-strong); border-radius: 0; background: var(--surface); color: var(--text); padding: 0.65rem 0.75rem; font-size: 0.88rem; }
.field input:focus { border-color: var(--text); }
.secret-field { position: relative; display: block; }
.secret-field input { padding-right: 3rem; }
.text-button { position: absolute; right: 0; inset-block: 0; width: 3.5rem; border: 0; background: transparent; color: var(--muted); font-size: 0.75rem; cursor: pointer; }
.model-submit { width: 100%; margin-top: 1.5rem; }
</style>
