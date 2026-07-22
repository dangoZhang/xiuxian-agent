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
    <div class="form-heading">
      <span class="step-number">贰</span>
      <div>
        <p class="eyebrow">投胎 · ORIGIN</p>
        <h2>写下一句身世</h2>
      </div>
    </div>
    <p class="form-intro">这句话将成为世界的第一段因果。天道据此立法，命运由此落子，众修士各怀所求。</p>
    <label class="origin-field">
      <span class="sr-only">主角身世</span>
      <textarea v-model="origin" maxlength="600" autofocus placeholder="我生于……" />
      <span class="count">{{ origin.trim().length }} / 600</span>
    </label>
    <p class="hint">至少 12 字。姓名、出身、执念与一件未偿之事，都会让命运更锋利。</p>
    <button class="primary-button" type="submit" :disabled="!canBegin || store.busy">
      <span>{{ store.busy ? '天地正在开辟…' : '以此身世，入世' }}</span>
      <span aria-hidden="true">天地开卷</span>
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
.form-heading { display: flex; align-items: center; gap: 1rem; }
.step-number { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 1px solid var(--jade); color: var(--jade-bright); font: 1.15rem var(--font-serif); transform: rotate(2deg); }
.form-heading h2 { margin: 0.12rem 0 0; color: var(--paper); font: 500 clamp(1.5rem, 4vw, 2rem)/1.15 var(--font-serif); letter-spacing: 0.1em; }
.eyebrow { margin: 0; color: var(--jade-bright); font: 0.66rem var(--font-ui); letter-spacing: 0.2em; }
.form-intro { max-width: 35rem; margin: 1.25rem 0 1.5rem 3.8rem; color: var(--ink-muted); font: 0.9rem/1.8 var(--font-serif); }
.origin-field { position: relative; display: block; }
.origin-field textarea { display: block; width: 100%; min-height: 13rem; resize: vertical; border: 1px solid var(--jade-dim); border-radius: 0; outline: 1px solid transparent; outline-offset: -6px; background: color-mix(in srgb, var(--jade) 5%, var(--night-2)); color: var(--paper); padding: 1.3rem 1.35rem 2.5rem; font: 1.08rem/2 var(--font-serif); letter-spacing: 0.04em; }
.origin-field textarea:focus { border-color: var(--jade-bright); outline-color: color-mix(in srgb, var(--jade) 32%, transparent); }
.origin-field textarea::placeholder { color: color-mix(in srgb, var(--jade-bright) 45%, var(--night)); }
.count { position: absolute; right: 1rem; bottom: 0.75rem; color: var(--ink-faint); font: 0.65rem var(--font-ui); }
.hint { color: var(--ink-faint); font: 0.72rem/1.6 var(--font-ui); }
.primary-button { width: 100%; margin-top: 1.25rem; }
.secondary-actions { display: flex; justify-content: space-between; margin-top: 1rem; }
@media (max-width: 640px) { .form-intro { margin-left: 0; } .origin-field textarea { min-height: 10rem; } }
</style>
