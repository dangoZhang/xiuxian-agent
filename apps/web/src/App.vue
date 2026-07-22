<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGameStore } from './stores/game'
import ModelSetup from './components/ModelSetup.vue'
import GameDesk from './components/GameDesk.vue'

const store = useGameStore()
const { game, error } = storeToRefs(store)
</script>

<template>
  <GameDesk v-if="game" />
  <main v-else class="gateway">
    <header class="gateway-header">
      <h1>修仙agent</h1>
      <p>天道定规则 · 命运生事件 · 你用一句话行动 · 修士并行决策。</p>
    </header>
    <section class="setup-sheet">
      <div v-if="error" class="setup-error" role="alert">
        <p>{{ error }}</p><button type="button" aria-label="关闭错误" @click="store.clearError">×</button>
      </div>
      <ModelSetup />
    </section>
  </main>
</template>

<style scoped>
.gateway { width: min(100% - 2rem, 40rem); min-height: 100dvh; margin: 0 auto; padding: clamp(2rem, 8vh, 5rem) 0 3rem; }
.gateway-header { border-bottom: 1px solid var(--line); padding-bottom: 1.25rem; }
.gateway-header h1 { margin: 0; font: 600 clamp(1.8rem, 5vw, 2.4rem)/1.2 var(--font-serif); letter-spacing: 0.04em; }
.gateway-header p { margin: 0.65rem 0 0; color: var(--muted); font-size: 0.82rem; line-height: 1.7; }
.setup-sheet { min-width: 0; margin-top: 2.5rem; }
.setup-error { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 1rem; margin-bottom: 1.5rem; border-left: 3px solid var(--battle); background: #fff8f7; padding: 0.75rem 0.9rem; color: var(--battle); }
.setup-error p { margin: 0; font-size: 0.78rem; line-height: 1.5; }.setup-error button { border: 0; background: transparent; color: inherit; cursor: pointer; }
@media (max-width: 560px) { .gateway { width: min(100% - 1.5rem, 40rem); padding-top: 1.5rem; }.gateway-header p { max-width: 22rem; }.setup-sheet { margin-top: 2rem; } }
</style>
