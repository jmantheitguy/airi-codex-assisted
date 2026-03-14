<script setup lang="ts">
import { scoreMemoryStrength } from '@proj-airi/stage-shared/memory'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { Button, FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const memoryStore = useMemoryStore()
const { t } = useI18n()
const {
  enabled,
  shortTermEnabled,
  longTermEnabled,
  autoIngestEnabled,
  recallContextEnabled,
  activeRecords,
  lastInjectedContext,
  metrics,
} = storeToRefs(memoryStore)

const topMemories = computed(() => {
  return [...activeRecords.value]
    .sort((left, right) => {
      return scoreMemoryStrength(right, memoryStore.config, Date.now()) - scoreMemoryStrength(left, memoryStore.config, Date.now())
    })
    .slice(0, 6)
    .map(memory => ({
      ...memory,
      strength: Math.round(scoreMemoryStrength(memory, memoryStore.config, Date.now()) * 100),
    }))
})
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
      <div :class="['flex flex-col gap-2']">
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          {{ t('settings.pages.memory.title') }}
        </h2>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          {{ t('settings.pages.memory.description') }}
        </p>
      </div>

      <div :class="['grid gap-3 md:grid-cols-3']">
        <div :class="['rounded-lg bg-white p-4 dark:bg-neutral-900/60', 'flex flex-col gap-1']">
          <span class="text-xs text-neutral-400 tracking-wide uppercase">Total</span>
          <span class="text-2xl font-semibold">{{ metrics.total }}</span>
        </div>
        <div :class="['rounded-lg bg-white p-4 dark:bg-neutral-900/60', 'flex flex-col gap-1']">
          <span class="text-xs text-neutral-400 tracking-wide uppercase">Short-term</span>
          <span class="text-2xl font-semibold">{{ metrics.shortTerm }}</span>
        </div>
        <div :class="['rounded-lg bg-white p-4 dark:bg-neutral-900/60', 'flex flex-col gap-1']">
          <span class="text-xs text-neutral-400 tracking-wide uppercase">Long-term</span>
          <span class="text-2xl font-semibold">{{ metrics.longTerm }}</span>
        </div>
      </div>

      <div :class="['grid gap-4 md:grid-cols-3']">
        <FieldCheckbox
          v-model="enabled"
          label="Enable memory system"
          description="Turns recall, maintenance, and memory inspection on or off."
        />
        <FieldCheckbox
          v-model="shortTermEnabled"
          label="Enable short-term memory"
          description="Keeps recent conversational fragments active for promotion and recall."
        />
        <FieldCheckbox
          v-model="longTermEnabled"
          label="Enable long-term memory"
          description="Keeps promoted memories persistent with a slower forgetting curve."
        />
        <FieldCheckbox
          v-model="autoIngestEnabled"
          label="Auto-ingest chat turns"
          description="Extracts candidate memories from chat turns after responses complete."
        />
        <FieldCheckbox
          v-model="recallContextEnabled"
          label="Inject recalled context"
          description="Recalls relevant memories before sending a new message and injects them as chat context."
        />
      </div>

      <div :class="['flex flex-wrap gap-3']">
        <Button @click="memoryStore.runMaintenance()">
          Run maintenance
        </Button>
        <Button @click="memoryStore.seedExamples()">
          Seed examples
        </Button>
        <Button @click="memoryStore.clearAllMemories()">
          Clear all memories
        </Button>
      </div>
    </div>

    <div :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
      <div :class="['flex items-center justify-between gap-4']">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            Strongest memories
          </h2>
          <p class="text-sm text-neutral-400 dark:text-neutral-500">
            Current memory strength after applying decay, access history, and retention floor.
          </p>
        </div>
      </div>

      <div v-if="topMemories.length" :class="['grid gap-3 lg:grid-cols-2']">
        <article
          v-for="memory in topMemories"
          :key="memory.id"
          :class="['rounded-lg bg-white p-4 dark:bg-neutral-900/60', 'flex flex-col gap-3']"
        >
          <div :class="['flex items-start justify-between gap-3']">
            <div :class="['flex flex-col gap-1']">
              <span class="text-xs text-neutral-400 tracking-wide uppercase">{{ memory.kind.replace('_', ' ') }}</span>
              <h3 class="font-medium">
                {{ memory.summary }}
              </h3>
            </div>
            <span class="rounded-full bg-primary-100 px-2 py-1 text-xs text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              {{ memory.strength }}%
            </span>
          </div>

          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ memory.content }}
          </p>

          <div :class="['flex flex-wrap gap-2 text-xs text-neutral-400']">
            <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">source: {{ memory.source }}</span>
            <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">importance: {{ memory.importance }}/10</span>
            <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">accesses: {{ memory.accessCount }}</span>
          </div>
        </article>
      </div>

      <div
        v-else
        :class="['rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-400 dark:border-neutral-700 dark:text-neutral-500']"
      >
        No memories yet. Seed examples or create memories from the short-term page.
      </div>
    </div>

    <div :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
      <div>
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          Latest injected context
        </h2>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          The most recent memory context added to the chat orchestrator before a send.
        </p>
      </div>

      <pre
        v-if="lastInjectedContext"
        :class="['overflow-x-auto rounded-lg bg-white p-4 text-xs text-neutral-600 whitespace-pre-wrap dark:bg-neutral-900/60 dark:text-neutral-300']"
      >{{ lastInjectedContext }}</pre>
      <div
        v-else
        :class="['rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-400 dark:border-neutral-700 dark:text-neutral-500']"
      >
        No memory context has been injected yet. Send a message that matches existing memories to populate this panel.
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
