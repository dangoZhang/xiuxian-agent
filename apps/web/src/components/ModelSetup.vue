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
    <div class="form-heading">
      <span class="step-number">壹</span>
      <div>
        <p class="eyebrow">立契 · MODEL COVENANT</p>
        <h2>接引大模型</h2>
      </div>
    </div>
    <p class="form-intro">
      天道、命运与众修皆由此端点生念。密钥仅送往本地服务进程，不写入浏览器存储与存档。
    </p>

    <label class="field">
      <span>Base URL</span>
      <input v-model="form.baseUrl" type="url" inputmode="url" autocomplete="url" required placeholder="https://…/v1" />
    </label>
    <label class="field">
      <span>API Key</span>
      <span class="secret-field">
        <input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" autocomplete="off" required placeholder="sk-…" />
        <button type="button" class="text-button" :aria-label="showKey ? '隐藏密钥' : '显示密钥'" @click="showKey = !showKey">
          {{ showKey ? '隐' : '显' }}
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
      <span>{{ advanced ? '收起' : '展开' }}分路模型</span>
      <span aria-hidden="true">{{ advanced ? '−' : '＋' }}</span>
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
      <span>{{ store.testing ? '正在叩问模型…' : store.modelReady ? '已通过三重验证' : '验证模型并立契' }}</span>
      <span aria-hidden="true">→</span>
    </button>
  </form>
</template>

<style scoped>
.model-form { width: 100%; min-width: 0; }
.form-heading { display: flex; align-items: center; gap: 1rem; }
.step-number { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 1px solid var(--gold-dim); color: var(--gold); font: 1.15rem var(--font-serif); transform: rotate(-2deg); }
.form-heading h2 { margin: 0.12rem 0 0; color: var(--paper); font: 500 clamp(1.5rem, 4vw, 2rem)/1.15 var(--font-serif); letter-spacing: 0.1em; }
.eyebrow { margin: 0; color: var(--gold); font: 0.66rem var(--font-ui); letter-spacing: 0.2em; }
.form-intro { max-width: 35rem; margin: 1.25rem 0 1.5rem 3.8rem; color: var(--ink-muted); font: 0.88rem/1.8 var(--font-serif); }
.field { display: grid; gap: 0.45rem; margin-top: 1rem; color: var(--ink-muted); font: 0.7rem var(--font-ui); letter-spacing: 0.1em; }
.field input { width: 100%; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; outline: none; background: color-mix(in srgb, var(--night-2) 88%, transparent); color: var(--paper); padding: 0.78rem 0.75rem; font: 0.9rem var(--font-ui); transition: border-color 150ms, background 150ms; }
.field input:focus { border-color: var(--gold); background: var(--night-2); box-shadow: 0 2px 0 color-mix(in srgb, var(--gold) 20%, transparent); }
.field-row { display: flex; gap: 1rem; }
.field--grow { flex: 1; }
.field--narrow { width: 8.5rem; }
.secret-field { position: relative; display: block; }
.secret-field input { padding-right: 3rem; }
.text-button { position: absolute; right: 0; inset-block: 0; width: 2.7rem; border: 0; background: transparent; color: var(--gold); cursor: pointer; }
.advanced-toggle { display: flex; width: 100%; justify-content: space-between; margin-top: 1.2rem; padding: 0.65rem 0; border: 0; border-top: 1px solid var(--line-faint); background: transparent; color: var(--ink-muted); font: 0.72rem var(--font-ui); letter-spacing: 0.1em; cursor: pointer; }
.advanced-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.capabilities { display: flex; flex-wrap: wrap; gap: 1.25rem; margin: 1.4rem 0; padding: 1rem 0; border-block: 1px solid var(--line-faint); }
.model-submit { width: 100%; }
@media (max-width: 640px) {
  .form-intro { margin-left: 0; }
  .field-row { display: grid; }
  .field--narrow { width: auto; }
  .advanced-grid { grid-template-columns: 1fr; }
  .capabilities { gap: 0.85rem; }
}
</style>
