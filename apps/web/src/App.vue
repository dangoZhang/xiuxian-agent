<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from './stores/game'
import ModelSetup from './components/ModelSetup.vue'
import OriginSetup from './components/OriginSetup.vue'
import GameDesk from './components/GameDesk.vue'

const store = useGameStore()
const { game, modelReady, error } = storeToRefs(store)
const step = ref<'model' | 'origin'>('model')
</script>

<template>
  <GameDesk v-if="game" />
  <main v-else class="gateway">
    <header class="gateway-header">
      <h1>修仙agent</h1>
      <p>天道定规则 · 命运生事件 · 你用一句话行动 · 修士并行决策</p>
    </header>
    <nav class="steps" aria-label="开局步骤">
      <span :class="{ active: step === 'model', done: modelReady }">1 模型</span>
      <span aria-hidden="true">→</span>
      <span :class="{ active: step === 'origin' }">2 身世</span>
    </nav>
    <section class="setup-sheet">
      <div v-if="error" class="setup-error" role="alert">
        <p>{{ error }}</p><button type="button" aria-label="关闭错误" @click="store.clearError">×</button>
      </div>
      <ModelSetup v-if="step === 'model'" @validated="step = 'origin'" />
      <OriginSetup v-else @back="step = 'model'" />
    </section>
  </main>
</template>

<style scoped>
.gateway { width: min(100% - 2rem, 40rem); min-height: 100dvh; margin: 0 auto; padding: clamp(2rem, 8vh, 5rem) 0 3rem; }
.gateway-header { border-bottom: 1px solid var(--line); padding-bottom: 1.25rem; }
.gateway-header h1 { margin: 0; font: 600 clamp(1.8rem, 5vw, 2.4rem)/1.2 var(--font-serif); letter-spacing: 0.04em; }
.gateway-header p { margin: 0.65rem 0 0; color: var(--muted); font-size: 0.82rem; line-height: 1.7; }
.steps { display: flex; align-items: center; gap: 0.6rem; margin: 1.1rem 0 2.5rem; color: var(--faint); font-size: 0.76rem; }
.steps .active { color: var(--text); font-weight: 600; }.steps .done { color: var(--player); }
.setup-sheet { min-width: 0; }
.setup-error { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 1rem; margin-bottom: 1.5rem; border-left: 3px solid var(--battle); background: #fff8f7; padding: 0.75rem 0.9rem; color: var(--battle); }
.setup-error p { margin: 0; font-size: 0.78rem; line-height: 1.5; }.setup-error button { border: 0; background: transparent; color: inherit; cursor: pointer; }
@media (max-width: 560px) { .gateway { width: min(100% - 1.5rem, 40rem); padding-top: 1.5rem; }.gateway-header p { max-width: 22rem; }.steps { margin-bottom: 2rem; } }
</style>
