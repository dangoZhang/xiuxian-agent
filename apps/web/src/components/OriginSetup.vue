<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/game'

const emit = defineEmits<{ back: [] }>()
const store = useGameStore()
const origin = ref('')
const fileInput = ref<HTMLInputElement>()
const canBegin = computed(() => origin.value.trim().length >= 12 && origin.value.trim().length <= 600)

async function begin() {
  if (!canBegin.value) return
  await store.begin(origin.value.trim())
}

function chooseSave() {
  fileInput.value?.click()
}

async function importSave(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await store.importSave(file)
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<template>
  <form class="origin-form" @submit.prevent="begin">
    <h2>身世</h2>
    <p class="form-intro">姓名、出身、执念，以及一件未偿之事。</p>
    <label class="origin-field">
      <span class="sr-only">主角身世</span>
      <textarea v-model="origin" maxlength="600" placeholder="我生于……" />
      <span class="count">{{ origin.trim().length }} / 600</span>
    </label>
    <p class="hint">12–600 字</p>
    <button class="primary-button" type="submit" :disabled="!canBegin || store.busy">
      <span>{{ store.busy ? '生成世界中…' : '开始' }}</span>
    </button>
    <div class="secondary-actions">
      <button type="button" class="quiet-button" @click="emit('back')">重设模型</button>
      <button type="button" class="quiet-button" :disabled="store.busy" @click="chooseSave">导入旧世</button>
      <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="importSave" />
    </div>
  </form>
</template>

<style scoped>
.origin-form { width: 100%; }
h2 { margin: 0; font: 600 1.35rem/1.3 var(--font-ui); }
.form-intro { margin: 0.5rem 0 1.5rem; color: var(--muted); font-size: 0.78rem; }
.origin-field { position: relative; display: block; }
.origin-field textarea { display: block; width: 100%; min-height: 13rem; resize: vertical; border: 1px solid var(--line-strong); border-radius: 0; background: var(--surface); color: var(--text); padding: 1rem 1rem 2.2rem; font: 1rem/1.8 var(--font-serif); }
.origin-field textarea:focus { border-color: var(--text); }
.origin-field textarea::placeholder { color: var(--faint); }
.count { position: absolute; right: 0.75rem; bottom: 0.65rem; color: var(--faint); font-size: 0.7rem; }
.hint { margin: 0.45rem 0; color: var(--faint); font-size: 0.72rem; }
.primary-button { width: 100%; margin-top: 1.25rem; }
.secondary-actions { display: flex; justify-content: space-between; margin-top: 1rem; }
@media (max-width: 640px) { .origin-field textarea { min-height: 10rem; } }
</style>
