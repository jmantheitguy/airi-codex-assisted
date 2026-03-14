<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'desktop' | 'mobile'
}>(), {
  variant: 'desktop',
})

const memoryStore = useMemoryStore()
const { lastRecallResults } = storeToRefs(memoryStore)

const visibleResults = computed(() => {
  return lastRecallResults.value.slice(0, props.variant === 'mobile' ? 2 : 3)
})
</script>

<template>
  <div
    v-if="visibleResults.length"
    :class="[
      'rounded-xl border border-primary-200/40 bg-primary-50/70 p-3 backdrop-blur-md dark:border-primary-700/30 dark:bg-primary-950/20',
      'flex flex-col gap-2',
    ]"
  >
    <div class="flex items-center gap-2 text-xs text-primary-700 tracking-wide uppercase dark:text-primary-300">
      <div class="i-solar:book-bookmark-bold-duotone text-sm" />
      Recalled memory context
    </div>

    <div :class="['grid gap-2', props.variant === 'mobile' ? 'grid-cols-1' : 'grid-cols-1']">
      <article
        v-for="result in visibleResults"
        :key="result.memory.id"
        :class="['rounded-lg bg-white/80 p-3 dark:bg-neutral-900/60', 'flex flex-col gap-1']"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-neutral-400 tracking-wide uppercase">{{ result.memory.source }}</span>
          <span class="text-xs text-primary-600 dark:text-primary-300">{{ Math.round(result.strength * 100) }}%</span>
        </div>
        <p class="text-sm text-neutral-700 dark:text-neutral-200">
          {{ result.memory.summary }}
        </p>
      </article>
    </div>
  </div>
</template>
