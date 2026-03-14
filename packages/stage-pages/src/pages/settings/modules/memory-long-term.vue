<script setup lang="ts">
import { scoreMemoryStrength } from '@proj-airi/stage-shared/memory'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { Button, FieldCheckbox, FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memoryStore = useMemoryStore()
const {
  longTermEnabled,
  longTermHalfLifeDays,
  retentionFloor,
  recencyBias,
  emotionalBias,
  maxRecallResults,
  longTermMemories,
  recallQuery,
  lastRecallResults,
} = storeToRefs(memoryStore)

const displayedLongTermMemories = computed(() => {
  return longTermMemories.value.map(memory => ({
    ...memory,
    strength: Math.round(scoreMemoryStrength(memory, memoryStore.config, Date.now()) * 100),
  }))
})

const displayedRecallResults = computed(() => {
  return lastRecallResults.value.map((result) => {
    return {
      ...result,
      scoreLabel: Math.round(result.score * 100),
      strengthLabel: Math.round(result.strength * 100),
    }
  })
})
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div :class="['grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]']">
      <section :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-long-term.title') }}
          </h2>
          <p class="text-sm text-neutral-400 dark:text-neutral-500">
            Persistent memory decays slowly, preserves a retention floor, and should remain queryable even after long gaps.
          </p>
        </div>

        <FieldCheckbox
          v-model="longTermEnabled"
          label="Enable long-term memory"
          description="Keeps promoted memories available for future recall."
        />

        <FieldRange
          v-model="longTermHalfLifeDays"
          label="Half-life"
          description="How slowly long-term memories fade when they are not revisited."
          :min="7"
          :max="365"
          :step="1"
          :format-value="value => `${value}d`"
        />

        <FieldRange
          v-model="retentionFloor"
          label="Retention floor"
          description="Minimum strength retained by long-term memories even after heavy decay."
          :min="0"
          :max="0.5"
          :step="0.01"
          :format-value="value => `${Math.round(value * 100)}%`"
        />

        <FieldRange
          v-model="recencyBias"
          label="Recency bias"
          description="How much recently accessed memories outrank older ones during recall."
          :min="0"
          :max="0.5"
          :step="0.01"
          :format-value="value => `${Math.round(value * 100)}%`"
        />

        <FieldRange
          v-model="emotionalBias"
          label="Emotional bias"
          description="How strongly emotional intensity affects long-term recall ranking."
          :min="0"
          :max="0.5"
          :step="0.01"
          :format-value="value => `${Math.round(value * 100)}%`"
        />

        <FieldRange
          v-model="maxRecallResults"
          label="Recall limit"
          description="Maximum number of memories returned per recall attempt."
          :min="1"
          :max="12"
          :step="1"
          :format-value="value => `${value} results`"
        />
      </section>

      <section :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            Recall playground
          </h2>
          <p class="text-sm text-neutral-400 dark:text-neutral-500">
            Query the current memory set with lightweight lexical matching plus strength, access history, and bias weights.
          </p>
        </div>

        <FieldInput
          v-model="recallQuery"
          label="Recall query"
          description="Try a topic, preference, or event. Empty query returns the strongest memories."
          placeholder="memory system architecture"
        />

        <div :class="['flex flex-wrap gap-3']">
          <Button @click="memoryStore.recall()">
            Recall memories
          </Button>
          <Button @click="memoryStore.runMaintenance()">
            Run maintenance
          </Button>
        </div>

        <div v-if="displayedRecallResults.length" :class="['grid gap-3']">
          <article
            v-for="result in displayedRecallResults"
            :key="result.memory.id"
            :class="['rounded-lg bg-white p-4 dark:bg-neutral-900/60', 'flex flex-col gap-3']"
          >
            <div :class="['flex items-start justify-between gap-3']">
              <div :class="['flex flex-col gap-1']">
                <span class="text-xs text-neutral-400 tracking-wide uppercase">{{ result.memory.source }}</span>
                <h3 class="font-medium">
                  {{ result.memory.summary }}
                </h3>
              </div>
              <span class="rounded-full bg-primary-100 px-2 py-1 text-xs text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                {{ result.scoreLabel }} pts
              </span>
            </div>

            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              {{ result.memory.content }}
            </p>

            <div :class="['flex flex-wrap gap-2 text-xs text-neutral-400']">
              <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">strength: {{ result.strengthLabel }}%</span>
              <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">importance: {{ result.memory.importance }}/10</span>
              <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">emotion: {{ result.memory.emotionalIntensity }}/10</span>
              <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">accesses: {{ result.memory.accessCount }}</span>
            </div>
          </article>
        </div>

        <div
          v-else
          :class="['rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-400 dark:border-neutral-700 dark:text-neutral-500']"
        >
          No recall results yet. Run a recall query to inspect how the current ranking behaves.
        </div>
      </section>
    </div>

    <section :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
      <div>
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          Stored long-term memories
        </h2>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          These are the memories currently retained after promotion or manual persistence.
        </p>
      </div>

      <div v-if="displayedLongTermMemories.length" :class="['grid gap-3 lg:grid-cols-2']">
        <article
          v-for="memory in displayedLongTermMemories"
          :key="memory.id"
          :class="['rounded-lg bg-white p-4 dark:bg-neutral-900/60', 'flex flex-col gap-3']"
        >
          <div :class="['flex items-start justify-between gap-3']">
            <div :class="['flex flex-col gap-1']">
              <span class="text-xs text-neutral-400 tracking-wide uppercase">{{ memory.source }}</span>
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
            <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">importance: {{ memory.importance }}/10</span>
            <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">emotion: {{ memory.emotionalIntensity }}/10</span>
            <span class="rounded-full bg-neutral-100 px-2 py-1 dark:bg-neutral-800">accesses: {{ memory.accessCount }}</span>
          </div>

          <div :class="['flex flex-wrap gap-3']">
            <Button @click="memoryStore.reinforceMemoryById(memory.id)">
              Reinforce
            </Button>
            <Button @click="memoryStore.forgetMemory(memory.id)">
              Forget
            </Button>
          </div>
        </article>
      </div>

      <div
        v-else
        :class="['rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-400 dark:border-neutral-700 dark:text-neutral-500']"
      >
        No long-term memories yet. Promote a short-term memory or seed the example dataset first.
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
