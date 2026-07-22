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
    <div class="sky-script" aria-hidden="true">道　命　人　修</div>
    <header class="gateway-header">
      <div class="logo-seal">修</div>
      <div>
        <h1>修仙agent</h1>
        <p>一部由大模型实时驱动的可玩修仙小说</p>
      </div>
    </header>
    <div class="gateway-grid">
      <aside class="manifesto">
        <p class="manifesto-index">卷首 · OPENING</p>
        <h2>一念入世，<br />万般皆成因果。</h2>
        <p>天道立规，命运落子。你用一句话行于世间，六名修士在有限神识中观察、谋划、结盟与厮杀。</p>
        <ol>
          <li :class="{ active: step === 'model', done: modelReady }"><span>壹</span><div><strong>接引模型</strong><small>三重能力验证</small></div></li>
          <li :class="{ active: step === 'origin' }"><span>贰</span><div><strong>写下身世</strong><small>天地因你开卷</small></div></li>
          <li><span>叁</span><div><strong>踏入命线</strong><small>以自然语言游玩</small></div></li>
        </ol>
        <p class="no-fallback">此界没有预写剧情。模型失联，时间即停。</p>
      </aside>
      <section class="setup-sheet">
        <div v-if="error" class="setup-error" role="alert">
          <span>契约未成</span><p>{{ error }}</p><button type="button" aria-label="关闭错误" @click="store.clearError">×</button>
        </div>
        <ModelSetup v-if="step === 'model'" @validated="step = 'origin'" />
        <OriginSetup v-else @back="step = 'model'" />
      </section>
    </div>
    <footer class="gateway-footer"><span>HEAVEN · FATE · PLAYER · CULTIVATOR</span><span>开源修仙叙事引擎</span></footer>
  </main>
</template>

<style scoped>
.gateway { position: relative; min-height: 100dvh; overflow: hidden; background: radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--gold) 8%, transparent), transparent 25%), radial-gradient(circle at 6% 72%, color-mix(in srgb, var(--jade) 5%, transparent), transparent 28%), var(--night); padding: clamp(1rem, 3vw, 2.2rem) clamp(1rem, 4vw, 4rem); }
.gateway::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.27; background-image: repeating-linear-gradient(0deg, transparent 0 4px, color-mix(in srgb, var(--paper) 2%, transparent) 4px 5px); }
.sky-script { position: absolute; right: -1rem; top: 5rem; color: color-mix(in srgb, var(--paper) 2.5%, transparent); font: clamp(6rem, 15vw, 15rem)/1 var(--font-serif); writing-mode: vertical-rl; }
.gateway-header { position: relative; z-index: 1; display: flex; align-items: center; gap: 0.85rem; }.logo-seal { display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border: 2px solid var(--cinnabar); color: var(--cinnabar-bright); font: 1.15rem var(--font-serif); transform: rotate(-3deg); }.gateway-header h1 { margin: 0; color: var(--paper); font: 600 1.1rem var(--font-serif); letter-spacing: 0.14em; }.gateway-header p { margin: 0.15rem 0 0; color: var(--ink-faint); font: 0.6rem var(--font-ui); letter-spacing: 0.08em; }
.gateway-grid { position: relative; z-index: 1; display: grid; width: 100%; max-width: 77rem; min-width: 0; min-height: calc(100dvh - 10rem); grid-template-columns: minmax(17rem, 0.8fr) minmax(31rem, 1.35fr); align-items: center; gap: clamp(3rem, 8vw, 9rem); margin: 1rem auto 0; }.manifesto-index { color: var(--gold); font: 0.62rem var(--font-ui); letter-spacing: 0.22em; }.manifesto h2 { margin: 1rem 0 1.25rem; color: var(--paper); font: 500 clamp(2rem, 4vw, 4rem)/1.35 var(--font-serif); letter-spacing: 0.08em; }.manifesto > p:not(.manifesto-index,.no-fallback) { max-width: 28rem; color: var(--ink-muted); font: 0.92rem/2 var(--font-serif); }.manifesto ol { display: grid; gap: 0.8rem; margin: 2rem 0; padding: 0; list-style: none; }.manifesto li { display: flex; align-items: center; gap: 0.8rem; color: var(--ink-faint); }.manifesto li > span { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid currentColor; font: 0.7rem var(--font-serif); }.manifesto li strong, .manifesto li small { display: block; }.manifesto li strong { font: 0.74rem var(--font-serif); letter-spacing: 0.08em; }.manifesto li small { margin-top: 0.12rem; font: 0.55rem var(--font-ui); }.manifesto li.active { color: var(--paper); }.manifesto li.done { color: var(--jade-bright); }.no-fallback { display: inline-block; border-left: 2px solid var(--cinnabar); color: var(--ink-faint); padding-left: 0.7rem; font: 0.65rem var(--font-ui); }
.setup-sheet { position: relative; min-width: 0; padding: clamp(1.25rem, 4vw, 3.25rem); border: 3px double var(--gold-dim); background: color-mix(in srgb, var(--night-2) 95%, transparent); box-shadow: 1.5rem 1.5rem 0 color-mix(in srgb, var(--paper) 2%, transparent); }.setup-sheet::after { content: ''; position: absolute; inset: 8px; pointer-events: none; border: 1px solid var(--line-faint); }.setup-sheet > * { position: relative; z-index: 1; min-width: 0; }.setup-error { display: grid; grid-template-columns: auto 1fr auto; gap: 0.7rem; align-items: center; margin-bottom: 1rem; border: 1px solid var(--cinnabar); color: var(--cinnabar-bright); padding: 0.6rem 0.75rem; }.setup-error span { font: 0.68rem var(--font-serif); }.setup-error p { margin: 0; color: var(--ink-muted); font: 0.62rem/1.5 var(--font-ui); }.setup-error button { border: 0; background: transparent; color: inherit; cursor: pointer; }
.gateway-footer { position: relative; z-index: 1; display: flex; justify-content: space-between; border-top: 1px solid var(--line-faint); padding-top: 0.7rem; color: var(--ink-faint); font: 0.52rem var(--font-ui); letter-spacing: 0.14em; }
@media (max-width: 850px) { .gateway { padding-bottom: 2rem; }.gateway-grid { min-height: auto; grid-template-columns: minmax(0, 1fr); gap: 2rem; margin-top: 3rem; }.manifesto, .setup-sheet { min-width: 0; }.manifesto h2 { font-size: 2.2rem; }.manifesto ol { grid-template-columns: repeat(3, 1fr); }.manifesto li { align-items: flex-start; }.gateway-footer { margin-top: 2rem; } }
@media (max-width: 560px) { .gateway-header p { display: none; }.gateway-grid { margin-top: 2.5rem; }.manifesto > p:not(.manifesto-index,.no-fallback) { font-size: 0.82rem; }.manifesto ol { display: none; }.setup-sheet { padding: 1.25rem; box-shadow: none; }.gateway-footer span:last-child { display: none; } }
</style>
