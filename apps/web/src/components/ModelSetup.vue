<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useGameStore } from '../stores/game'
import type { ModelConfig } from '../types'
import CapabilitySeal from './CapabilitySeal.vue'

const emit = defineEmits<{ validated: [] }>()
const store = useGameStore()
const showKey = ref(false)
const advanced = ref(false)
const form = reactive<ModelConfig>({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  maxConcurrency: 4,
  roleModels: {},
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
    const roles = advanced.value
      ? Object.fromEntries(Object.entries({
          heaven: form.roleModels?.heaven?.trim(),
          fate: form.roleModels?.fate?.trim(),
          cultivator: form.roleModels?.cultivator?.trim(),
        }).filter((entry): entry is [string, string] => Boolean(entry[1])))
      : undefined
    await store.validateModel({
      baseUrl: form.baseUrl.trim().replace(/\/$/, ''),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      maxConcurrency: form.maxConcurrency,
      ...(roles ? { roleModels: roles } : {}),
    })
    emit('validated')
  } catch {
    // Store presents the actionable server error.
  }
}
</script>

<template>
  <form class="model-form" @submit.prevent="test">
    <h2>模型</h2>
    <p class="form-intro">需要结构化输出、工具调用和流式文本。密钥只保留在本次服务会话中。</p>

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
    <div class="field-row">
      <label class="field field--grow">
        <span>模型名称</span>
        <input v-model="form.model" autocomplete="off" required placeholder="例如：gpt-4.1" />
      </label>
      <label class="field field--narrow">
        <span>全局并发</span>
        <input v-model.number="form.maxConcurrency" type="number" min="1" max="32" required />
      </label>
    </div>

    <button type="button" class="advanced-toggle" :aria-expanded="advanced" @click="advanced = !advanced">
      <span>分路模型</span>
      <span aria-hidden="true">{{ advanced ? '收起' : '设置' }}</span>
    </button>
    <div v-if="advanced" class="advanced-grid">
      <label class="field"><span>天道模型</span><input v-model="form.roleModels!.heaven" :placeholder="form.model || '同主模型'" /></label>
      <label class="field"><span>命运模型</span><input v-model="form.roleModels!.fate" :placeholder="form.model || '同主模型'" /></label>
      <label class="field"><span>修士模型</span><input v-model="form.roleModels!.cultivator" :placeholder="form.model || '同主模型'" /></label>
    </div>

    <div class="capabilities" aria-label="模型能力校验状态">
      <CapabilitySeal label="结构化输出" :passed="store.capabilities?.structuredOutput" :pending="store.testing" />
      <CapabilitySeal label="工具调用" :passed="store.capabilities?.toolCalling" :pending="store.testing" />
      <CapabilitySeal label="流式文本" :passed="store.capabilities?.streaming" :pending="store.testing" />
    </div>

    <button class="primary-button model-submit" type="submit" :disabled="!complete || store.testing">
      <span>{{ store.testing ? '验证中…' : store.modelReady ? '验证通过' : '验证并继续' }}</span>
    </button>
  </form>
</template>

<style scoped>
.model-form { width: 100%; min-width: 0; }
h2 { margin: 0; font: 600 1.35rem/1.3 var(--font-ui); }
.form-intro { margin: 0.5rem 0 1.75rem; color: var(--muted); font-size: 0.78rem; line-height: 1.6; }
.field { display: grid; gap: 0.45rem; margin-top: 1rem; color: var(--muted); font-size: 0.78rem; }
.field input { width: 100%; min-height: 2.8rem; border: 1px solid var(--line-strong); border-radius: 0; background: var(--surface); color: var(--text); padding: 0.65rem 0.75rem; font-size: 0.88rem; }
.field input:focus { border-color: var(--text); }
.field-row { display: flex; gap: 1rem; }
.field--grow { flex: 1; }
.field--narrow { width: 8.5rem; }
.secret-field { position: relative; display: block; }
.secret-field input { padding-right: 3rem; }
.text-button { position: absolute; right: 0; inset-block: 0; width: 3.5rem; border: 0; background: transparent; color: var(--muted); font-size: 0.75rem; cursor: pointer; }
.advanced-toggle { display: flex; width: 100%; min-height: 2.75rem; align-items: center; justify-content: space-between; margin-top: 1.25rem; padding: 0; border: 0; border-block: 1px solid var(--line); background: transparent; color: var(--muted); font-size: 0.78rem; cursor: pointer; }
.advanced-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.capabilities { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1.25rem 0; color: var(--muted); }
.model-submit { width: 100%; }
@media (max-width: 640px) {
  .field-row { display: grid; }
  .field--narrow { width: auto; }
  .advanced-grid { grid-template-columns: 1fr; }
  .capabilities { gap: 0.85rem; }
}
</style>
