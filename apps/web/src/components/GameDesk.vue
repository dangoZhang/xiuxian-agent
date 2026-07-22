<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/game'
import StoryPanel from './StoryPanel.vue'

const store = useGameStore()
const { game, busy, error } = storeToRefs(store)
</script>

<template>
  <div v-if="game" class="game-desk">
    <main class="story-shell">
      <StoryPanel :entries="game.entries" :cultivators="game.cultivators" :busy="busy" :paused="game.paused" :ended="Boolean(game.ending)" :error="error || game.pauseReason" @command="store.sendCommand" @retry="store.retry" />
    </main>
  </div>
</template>

<style scoped>
.game-desk { height: 100dvh; min-width: 0; overflow: hidden; background: var(--surface); }
.story-shell { width: min(100%, 58rem); height: 100%; margin: 0 auto; background: var(--surface); }
</style>
