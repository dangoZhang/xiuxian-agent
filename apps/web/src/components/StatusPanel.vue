<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Cultivator, RunningCall } from '../types'
import ResourceMeter from './ResourceMeter.vue'

const props = defineProps<{
  cultivators: Cultivator[]
  protagonistId?: string | undefined
  calls: Record<string, RunningCall>
}>()
const activeId = ref<string>()
const active = computed(() => props.cultivators.find((item) => item.id === activeId.value)
  ?? props.cultivators.find((item) => item.id === props.protagonistId)
  ?? props.cultivators[0])
const callCounts = computed(() => Object.values(props.calls).reduce<Record<string, number>>((counts, call) => {
  if (call.actorId) counts[call.actorId] = (counts[call.actorId] ?? 0) + 1
  return counts
}, {}))
</script>

<template>
  <section class="status-panel" aria-label="角色状态">
    <header class="panel-title"><h2>修士</h2></header>
    <div class="roster">
      <button v-for="person in cultivators" :key="person.id" type="button" :class="{ active: person.id === active?.id }" :aria-pressed="person.id === active?.id" @click="activeId = person.id">
        <span><strong>{{ person.name }}</strong><small>{{ person.realm }}</small></span>
        <i v-if="callCounts[person.id]" aria-label="神念运行中">运行中</i>
      </button>
    </div>
    <div v-if="active" class="character-sheet">
      <div class="identity">
        <div><h3>{{ active.name }} <small v-if="active.isPlayer || active.id === protagonistId">你</small></h3><p>{{ active.realm }} · {{ active.location || '所在未明' }}</p></div>
      </div>
      <div class="resources">
        <ResourceMeter label="气血" :value="active.hp" :max="active.hpMax ?? active.hp" tone="hp" />
        <ResourceMeter label="灵力" :value="active.qi" :max="active.qiMax ?? active.qi" tone="qi" />
        <ResourceMeter label="神识" :value="active.sense ?? active.senseMax" :max="active.senseMax" tone="sense" />
        <ResourceMeter v-if="active.lifespan != null" label="寿元" :value="active.lifespan" :max="active.lifespanMax ?? active.lifespan" tone="life" />
      </div>
      <div class="focus-slots">
        <span>并行神念</span>
        <div class="slot-row" :aria-label="`${callCounts[active.id] ?? 0} / ${active.focusSlots} 神念占用`">
          <i v-for="slot in active.focusSlots" :key="slot" :class="{ used: slot <= (callCounts[active.id] ?? 0) }" />
          <small>{{ callCounts[active.id] ?? 0 }} / {{ active.focusSlots }}</small>
        </div>
      </div>
      <p v-if="active.plan" class="current-plan"><span>当前所谋</span>{{ active.plan }}</p>

      <details>
        <summary>功法 · {{ active.techniques?.length ?? 0 }}</summary>
        <ul v-if="active.techniques?.length" class="techniques">
          <li v-for="technique in active.techniques" :key="technique.id ?? technique.name">
            <div><strong>{{ technique.name }}</strong><span>{{ technique.route || technique.tags?.join(' · ') || '功法' }}</span></div>
            <small v-if="technique.qiCost != null">灵力 {{ technique.qiCost }}</small>
          </li>
        </ul>
        <p v-else class="empty-note">尚无可知功法</p>
      </details>

      <details>
        <summary>关系与因果 · {{ active.relations?.length ?? 0 }}</summary>
        <ul v-if="active.relations?.length" class="relations">
          <li v-for="relation in active.relations" :key="relation.targetId">
            <span>{{ relation.targetName || cultivators.find(c => c.id === relation.targetId)?.name || relation.targetId }}</span>
            <i>{{ relation.label || (relation.value != null ? relation.value : '因果未明') }}</i>
            <small v-if="relation.karma">债 {{ relation.karma > 0 ? '+' : '' }}{{ relation.karma }}</small>
          </li>
        </ul>
        <p v-else class="empty-note">此人因果尚浅</p>
      </details>

      <div v-if="active.statuses?.length" class="statuses">
        <span v-for="status in active.statuses" :key="status">{{ status }}</span>
      </div>
    </div>

  </section>
</template>

<style scoped>
.status-panel { height: 100%; min-height: 0; overflow-y: auto; padding: 1rem; background: var(--canvas); }
.panel-title { padding-bottom: 0.7rem; border-bottom: 1px solid var(--line); }.panel-title h2 { margin: 0; font-size: 0.86rem; }
.roster { border-bottom: 1px solid var(--line); padding: 0.35rem 0; }.roster button { display: grid; width: 100%; min-height: 2.75rem; grid-template-columns: 1fr auto; align-items: center; gap: 0.5rem; border: 0; background: transparent; color: var(--text); padding: 0.4rem; text-align: left; cursor: pointer; }.roster button.active { background: #ecece7; }.roster strong { display: block; font: 600 0.72rem var(--font-ui); }.roster small { display: block; margin-top: 0.1rem; color: var(--faint); font-size: 0.65rem; }.roster i { color: var(--player); font-size: 0.64rem; font-style: normal; }
.identity { margin-top: 1rem; }.identity h3 { margin: 0; font: 600 1rem var(--font-serif); }.identity h3 small { margin-left: 0.3rem; color: var(--player); font: 0.64rem var(--font-ui); }.identity p { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.68rem; }
.resources { padding-bottom: 0.8rem; border-bottom: 1px solid var(--line); }.focus-slots { display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; color: var(--muted); font-size: 0.68rem; }.slot-row { display: flex; align-items: center; gap: 0.3rem; }.slot-row i { width: 0.45rem; height: 0.45rem; border: 1px solid var(--line-strong); border-radius: 50%; }.slot-row i.used { border-color: var(--player); background: var(--player); }.slot-row small { margin-left: 0.25rem; color: var(--text); }
.current-plan { border-left: 2px solid var(--fate); color: var(--muted); padding: 0.55rem 0.65rem; font: 0.72rem/1.6 var(--font-serif); }.current-plan span { display: block; color: var(--fate); font: 0.62rem var(--font-ui); }
details { border-top: 1px solid var(--line); }summary { min-height: 2.75rem; padding: 0.75rem 0; color: var(--muted); font-size: 0.7rem; cursor: pointer; }ul { margin: 0; padding: 0; list-style: none; }.techniques li, .relations li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0; border-top: 1px dotted var(--line); }.techniques strong { display: block; color: var(--text); font: 0.72rem var(--font-serif); }.techniques span, .techniques small { color: var(--faint); font-size: 0.62rem; }.relations span { color: var(--text); font-size: 0.7rem; }.relations i { flex: 1; color: var(--faint); font-size: 0.62rem; font-style: normal; }.relations small { color: var(--heaven); font-size: 0.62rem; }.empty-note { margin: 0 0 0.8rem; color: var(--faint); font-size: 0.68rem; }.statuses { display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0.7rem 0; }.statuses span { border: 1px solid var(--line-strong); color: var(--muted); padding: 0.2rem 0.4rem; font-size: 0.62rem; }
</style>
