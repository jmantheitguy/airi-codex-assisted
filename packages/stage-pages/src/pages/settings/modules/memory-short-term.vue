<script setup lang="ts">
import { scoreMemoryStrength } from '@proj-airi/stage-shared/memory'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { Button, FieldCheckbox, FieldInput, FieldRange, FieldSelect, FieldTextArea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memoryStore = useMemoryStore()
const {
  shortTermEnabled,
  shortTermHalfLifeHours,
  promotionThreshold,
  maxShortTermItems,
  shortTermMemories,
} = storeToRefs(memoryStore)

const draftContent = ref('')
const draftSource = ref('conversation')
const draftTags = ref('')
const draftImportance = ref(6)
const draftEmotion = ref(4)

const sourceOptions = [
  { label: 'Conversation', value: 'conversation' },
  { label: 'Observation', value: 'observation' },
  { label: 'Reflection', value: 'reflection' },
  { label: 'Manual', value: 'manual' },
]

const displayedMemories = computed(() => {
  return shortTermMemories.value.map(memory => ({
    ...memory,
    strength: Math.round(scoreMemoryStrength(memory, memoryStore.config, Date.now()) * 100),
  }))
})

function addShortTermMemory() {
  if (!draftContent.value.trim()) {
    return
  }

  memoryStore.addManualMemory(draftContent.value, {
    kind: 'short_term',
    source: draftSource.value,
    tags: draftTags.value.split(',').map(tag => tag.trim()).filter(Boolean),
    importance: draftImportance.value,
    emotionalIntensity: draftEmotion.value,
  })

  draftContent.value = ''
  draftTags.value = ''
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div :class="['grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]']">
      <section :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.modules.memory-short-term.title') }}
          </h2>
          <p class="text-sm text-neutral-400 dark:text-neutral-500">
            Capture recent fragments, decay them quickly, and promote only what keeps proving useful.
          </p>
        </div>

        <FieldCheckbox
          v-model="shortTermEnabled"
          label="Enable short-term memory"
          description="Stores recent fragments that can decay, be reinforced, or be promoted into long-term memory."
        />

        <FieldRange
          v-model="shortTermHalfLifeHours"
          label="Half-life"
          description="How quickly short-term memories decay before they need reinforcement."
          :min="1"
          :max="72"
          :step="1"
          :format-value="value => `${value}h`"
        />

        <FieldRange
          v-model="promotionThreshold"
          label="Promotion threshold"
          description="Minimum strength needed before maintenance can promote a short-term memory."
          :min="0.4"
          :max="0.95"
          :step="0.01"
          :format-value="value => `${Math.round(value * 100)}%`"
        />

        <FieldRange
          v-model="maxShortTermItems"
          label="Working capacity"
          description="Maximum number of short-term memories kept after maintenance trims weaker items."
          :min="4"
          :max="64"
          :step="1"
          :format-value="value => `${value} items`"
        />

        <Button @click="memoryStore.runMaintenance()">
          Run maintenance
        </Button>
      </section>

      <section :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            Add memory
          </h2>
          <p class="text-sm text-neutral-400 dark:text-neutral-500">
            Use this to seed recent events manually while the automatic ingestion pipeline is still being built.
          </p>
        </div>

        <FieldTextArea
          v-model="draftContent"
          label="Memory fragment"
          description="A single recent event, preference, or observation."
          placeholder="Johnathan asked for a memory system that starts with deterministic scoring instead of opaque heuristics."
        />

        <div :class="['grid gap-4 md:grid-cols-2']">
          <FieldSelect
            v-model="draftSource"
            label="Source"
            description="Where this fragment came from."
            :options="sourceOptions"
          />
          <FieldInput
            v-model="draftTags"
            label="Tags"
            description="Comma-separated tags used for lightweight recall matching."
            placeholder="memory, architecture, user-preference"
          />
        </div>

        <div :class="['grid gap-4 md:grid-cols-2']">
          <FieldRange
            v-model="draftImportance"
            label="Importance"
            description="Higher importance resists decay and improves recall rank."
            :min="1"
            :max="10"
            :step="1"
            :format-value="value => `${value}/10`"
          />
          <FieldRange
            v-model="draftEmotion"
            label="Emotional intensity"
            description="Higher emotional weight keeps the fragment easier to retrieve."
            :min="0"
            :max="10"
            :step="1"
            :format-value="value => `${value}/10`"
          />
        </div>

        <div :class="['flex flex-wrap gap-3']">
          <Button @click="addShortTermMemory()">
            Add short-term memory
          </Button>
          <Button @click="memoryStore.seedExamples()">
            Seed examples
          </Button>
        </div>
      </section>
    </div>

    <section :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]', 'flex flex-col gap-4']">
      <div>
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          Active short-term memories
        </h2>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          Maintenance keeps the strongest recent fragments and drops weak ones once capacity is exceeded.
        </p>
      </div>

      <div v-if="displayedMemories.length" :class="['grid gap-3 lg:grid-cols-2']">
        <article
          v-for="memory in displayedMemories"
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

          <div v-if="memory.tags.length" :class="['flex flex-wrap gap-2 text-xs']">
            <span
              v-for="tag in memory.tags"
              :key="tag"
              class="rounded-full bg-neutral-100 px-2 py-1 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            >
              #{{ tag }}
            </span>
          </div>

          <div :class="['flex flex-wrap gap-3']">
            <Button @click="memoryStore.reinforceMemoryById(memory.id)">
              Reinforce
            </Button>
            <Button @click="memoryStore.promoteMemory(memory.id)">
              Promote
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
        No active short-term memories. Add one above or seed the example dataset.
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-short-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
