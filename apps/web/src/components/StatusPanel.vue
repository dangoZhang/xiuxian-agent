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
    <header class="panel-title"><span>众生簿</span><small>CULTIVATORS</small></header>
    <div v-if="active" class="character-sheet">
      <div class="identity">
        <span class="portrait-mark">{{ active.name.slice(0, 1) }}</span>
        <div><h2>{{ active.name }}</h2><p>{{ active.realm }} · {{ active.location || '所在未明' }}</p></div>
        <span v-if="active.isPlayer || active.id === protagonistId" class="self-seal">本我</span>
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

      <details open>
        <summary>功法 · {{ active.techniques?.length ?? 0 }}</summary>
        <ul v-if="active.techniques?.length" class="techniques">
          <li v-for="technique in active.techniques" :key="technique.id ?? technique.name">
            <div><strong>{{ technique.name }}</strong><span>{{ technique.route || technique.tags?.join(' · ') || '功法' }}</span></div>
            <small v-if="technique.qiCost != null">灵力 {{ technique.qiCost }}</small>
          </li>
        </ul>
        <p v-else class="empty-note">尚无可知功法</p>
      </details>

      <details open>
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

    <div class="roster">
      <button v-for="person in cultivators" :key="person.id" type="button" :class="{ active: person.id === active?.id }" @click="activeId = person.id">
        <span class="roster-mark">{{ person.name.slice(0, 1) }}</span>
        <span><strong>{{ person.name }}</strong><small>{{ person.realm }}</small></span>
        <i v-if="callCounts[person.id]" aria-label="神念运行中">念</i>
      </button>
    </div>
  </section>
</template>

<style scoped>
.status-panel { height: 100%; min-height: 0; overflow-y: auto; padding: 1rem; background: linear-gradient(-90deg, color-mix(in srgb, var(--jade) 3%, transparent), transparent 35%); }
.panel-title { padding: 0 0.2rem 0.8rem; border-bottom: 1px solid var(--line-faint); }.panel-title span { display: block; color: var(--paper); font: 0.92rem var(--font-serif); letter-spacing: 0.14em; }.panel-title small { color: var(--jade-bright); font: 0.57rem var(--font-ui); letter-spacing: 0.18em; }
.identity { position: relative; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.75rem; margin-top: 1rem; }.portrait-mark { display: grid; width: 2.7rem; height: 2.7rem; place-items: center; border: 1px solid var(--line); color: var(--paper); font: 1.2rem var(--font-serif); }.identity h2 { margin: 0; color: var(--paper); font: 1rem var(--font-serif); letter-spacing: 0.08em; }.identity p { margin: 0.15rem 0 0; color: var(--ink-faint); font: 0.62rem var(--font-ui); }.self-seal { border: 1px solid var(--cinnabar); color: var(--cinnabar-bright); padding: 0.25rem; font: 0.6rem var(--font-serif); transform: rotate(3deg); }
.resources { padding-bottom: 0.8rem; border-bottom: 1px solid var(--line-faint); }.focus-slots { display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; color: var(--ink-muted); font: 0.63rem var(--font-ui); }.slot-row { display: flex; align-items: center; gap: 0.3rem; }.slot-row i { width: 0.48rem; height: 0.48rem; border: 1px solid var(--jade-dim); border-radius: 50%; }.slot-row i.used { background: var(--jade-bright); box-shadow: 0 0 7px var(--jade); }.slot-row small { margin-left: 0.25rem; color: var(--paper); }
.current-plan { border-left: 2px solid var(--fate); color: var(--ink-muted); padding: 0.6rem 0.75rem; font: 0.72rem/1.6 var(--font-serif); }.current-plan span { display: block; color: var(--fate-bright); font: 0.55rem var(--font-ui); letter-spacing: 0.14em; }
details { border-top: 1px solid var(--line-faint); }summary { padding: 0.7rem 0; color: var(--ink-muted); font: 0.66rem var(--font-ui); letter-spacing: 0.08em; cursor: pointer; }ul { margin: 0; padding: 0; list-style: none; }.techniques li, .relations li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0; border-top: 1px dotted var(--line-faint); }.techniques strong { display: block; color: var(--paper); font: 0.72rem var(--font-serif); }.techniques span, .techniques small { color: var(--ink-faint); font: 0.56rem var(--font-ui); }.relations span { color: var(--paper); font: 0.7rem var(--font-serif); }.relations i { flex: 1; color: var(--ink-faint); font: 0.58rem var(--font-ui); font-style: normal; }.relations small { color: var(--gold); font: 0.58rem var(--font-ui); }.empty-note { margin: 0 0 0.8rem; color: var(--ink-faint); font: 0.65rem var(--font-serif); }.statuses { display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0.7rem 0; }.statuses span { border: 1px solid var(--cinnabar); color: var(--cinnabar-bright); padding: 0.2rem 0.45rem; font: 0.58rem var(--font-ui); }
.roster { margin-top: 0.7rem; border-top: 3px double var(--line); }.roster button { display: grid; width: 100%; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.55rem; border: 0; border-bottom: 1px solid var(--line-faint); background: transparent; color: var(--paper); padding: 0.55rem 0.2rem; text-align: left; cursor: pointer; }.roster button.active { background: color-mix(in srgb, var(--jade) 8%, transparent); }.roster-mark { display: grid; width: 1.7rem; height: 1.7rem; place-items: center; border: 1px solid var(--line); font: 0.72rem var(--font-serif); }.roster strong { display: block; font: 0.68rem var(--font-serif); }.roster small { display: block; color: var(--ink-faint); font: 0.55rem var(--font-ui); }.roster i { color: var(--jade-bright); font: 0.6rem var(--font-serif); font-style: normal; }
</style>
