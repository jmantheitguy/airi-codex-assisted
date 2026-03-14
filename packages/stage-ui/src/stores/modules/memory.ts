import type { CreateMemoryInput, MemoryKind, MemoryRecallResult, MemoryRecord } from '@proj-airi/stage-shared/memory'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import {

  createMemoryRecord,
  DEFAULT_MEMORY_SYSTEM_CONFIG,
  getMemoryMetrics,
  maintainMemories,

  recallMemories,
  reinforceMemory,
  scoreMemoryStrength,
} from '@proj-airi/stage-shared/memory'
import { refManualReset } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

function createSeedMemories(now = Date.now()) {
  const oneHour = 60 * 60 * 1000

  return maintainMemories([
    createMemoryRecord({
      kind: 'short_term',
      content: 'Johnathan wants AIRI memory to feel deliberate, persistent, and testable.',
      source: 'conversation',
      tags: ['product', 'memory', 'goals'],
      importance: 8,
      emotionalIntensity: 6,
      createdAt: now - (2 * oneHour),
    }, now - (2 * oneHour)),
    createMemoryRecord({
      kind: 'short_term',
      content: 'The memory implementation should avoid one-off patterns and fit the stage-ui store architecture.',
      source: 'reflection',
      tags: ['architecture', 'stage-ui'],
      importance: 7,
      emotionalIntensity: 4,
      createdAt: now - (6 * oneHour),
    }, now - (6 * oneHour)),
    createMemoryRecord({
      kind: 'long_term',
      content: 'AIRI settings pages should be inspectable and useful even while a subsystem is under active development.',
      source: 'manual',
      tags: ['ux', 'settings'],
      importance: 9,
      emotionalIntensity: 5,
      createdAt: now - (14 * 24 * oneHour),
      baseStrength: 0.88,
    }, now - (14 * 24 * oneHour)),
  ], DEFAULT_MEMORY_SYSTEM_CONFIG, now)
}

export const useMemoryStore = defineStore('memory', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/memory/enabled', true)
  const shortTermEnabled = useLocalStorageManualReset<boolean>('settings/memory/short-term-enabled', true)
  const longTermEnabled = useLocalStorageManualReset<boolean>('settings/memory/long-term-enabled', true)
  const autoIngestEnabled = useLocalStorageManualReset<boolean>('settings/memory/auto-ingest-enabled', true)
  const recallContextEnabled = useLocalStorageManualReset<boolean>('settings/memory/recall-context-enabled', true)
  const minimumRecallQueryLength = useLocalStorageManualReset<number>('settings/memory/minimum-recall-query-length', 12)
  const shortTermHalfLifeHours = useLocalStorageManualReset<number>('settings/memory/short-term-half-life-hours', DEFAULT_MEMORY_SYSTEM_CONFIG.shortTermHalfLifeHours)
  const longTermHalfLifeDays = useLocalStorageManualReset<number>('settings/memory/long-term-half-life-days', DEFAULT_MEMORY_SYSTEM_CONFIG.longTermHalfLifeDays)
  const promotionThreshold = useLocalStorageManualReset<number>('settings/memory/promotion-threshold', DEFAULT_MEMORY_SYSTEM_CONFIG.promotionThreshold)
  const retentionFloor = useLocalStorageManualReset<number>('settings/memory/retention-floor', DEFAULT_MEMORY_SYSTEM_CONFIG.retentionFloor)
  const recencyBias = useLocalStorageManualReset<number>('settings/memory/recency-bias', DEFAULT_MEMORY_SYSTEM_CONFIG.recencyBias)
  const importanceBias = useLocalStorageManualReset<number>('settings/memory/importance-bias', DEFAULT_MEMORY_SYSTEM_CONFIG.importanceBias)
  const emotionalBias = useLocalStorageManualReset<number>('settings/memory/emotional-bias', DEFAULT_MEMORY_SYSTEM_CONFIG.emotionalBias)
  const accessBias = useLocalStorageManualReset<number>('settings/memory/access-bias', DEFAULT_MEMORY_SYSTEM_CONFIG.accessBias)
  const maxShortTermItems = useLocalStorageManualReset<number>('settings/memory/max-short-term-items', DEFAULT_MEMORY_SYSTEM_CONFIG.maxShortTermItems)
  const maxRecallResults = useLocalStorageManualReset<number>('settings/memory/max-recall-results', DEFAULT_MEMORY_SYSTEM_CONFIG.maxRecallResults)
  const records = useLocalStorageManualReset<MemoryRecord[]>('settings/memory/records', createSeedMemories())
  const recallQuery = refManualReset('')
  const lastRecallResults = refManualReset<MemoryRecallResult[]>([])
  const lastInjectedContext = refManualReset('')

  const config = computed(() => ({
    shortTermHalfLifeHours: shortTermHalfLifeHours.value,
    longTermHalfLifeDays: longTermHalfLifeDays.value,
    promotionThreshold: promotionThreshold.value,
    retentionFloor: retentionFloor.value,
    recencyBias: recencyBias.value,
    importanceBias: importanceBias.value,
    emotionalBias: emotionalBias.value,
    accessBias: accessBias.value,
    maxShortTermItems: maxShortTermItems.value,
    maxRecallResults: maxRecallResults.value,
  }))

  const activeRecords = computed(() => {
    if (!enabled.value) {
      return [] as MemoryRecord[]
    }

    return records.value.filter((memory) => {
      if (memory.kind === 'short_term') {
        return shortTermEnabled.value
      }

      return longTermEnabled.value
    })
  })

  const shortTermMemories = computed(() => {
    return activeRecords.value
      .filter(memory => memory.kind === 'short_term')
      .sort((left, right) => {
        return scoreMemoryStrength(right, config.value) - scoreMemoryStrength(left, config.value)
      })
  })

  const longTermMemories = computed(() => {
    return activeRecords.value
      .filter(memory => memory.kind === 'long_term')
      .sort((left, right) => right.updatedAt - left.updatedAt)
  })

  const metrics = computed(() => getMemoryMetrics(activeRecords.value, config.value))
  const configured = computed(() => enabled.value && (shortTermEnabled.value || longTermEnabled.value))
  const shortTermConfigured = computed(() => enabled.value && shortTermEnabled.value)
  const longTermConfigured = computed(() => enabled.value && longTermEnabled.value)

  function runMaintenance(now = Date.now()) {
    records.value = maintainMemories(records.value, config.value, now)
    return records.value
  }

  function addMemory(input: CreateMemoryInput) {
    const next = createMemoryRecord(input)
    records.value = maintainMemories([...records.value, next], config.value)
    return next
  }

  function addMemories(inputs: CreateMemoryInput[]) {
    if (!inputs.length) {
      return []
    }

    const next = inputs.map(input => createMemoryRecord(input))
    records.value = maintainMemories([...records.value, ...next], config.value)
    return next
  }

  function addManualMemory(content: string, options?: {
    kind?: MemoryKind
    source?: string
    tags?: string[]
    importance?: number
    emotionalIntensity?: number
  }) {
    return addMemory({
      content,
      kind: options?.kind,
      source: options?.source,
      tags: options?.tags,
      importance: options?.importance,
      emotionalIntensity: options?.emotionalIntensity,
    })
  }

  function reinforceMemoryById(id: string, amount = 0.16) {
    records.value = records.value.map(memory => memory.id === id ? reinforceMemory(memory, Date.now(), amount) : memory)
    runMaintenance()
  }

  function forgetMemory(id: string) {
    records.value = records.value.filter(memory => memory.id !== id)
    lastRecallResults.value = lastRecallResults.value.filter(result => result.memory.id !== id)
  }

  function promoteMemory(id: string) {
    records.value = records.value.map((memory) => {
      if (memory.id !== id) {
        return memory
      }

      return {
        ...reinforceMemory(memory, Date.now(), 0.22),
        kind: 'long_term' as const,
      }
    })
    runMaintenance()
  }

  function recall(query = recallQuery.value) {
    runMaintenance()
    recallQuery.value = query
    const results = recallMemories(activeRecords.value, query, config.value)
    lastRecallResults.value = results

    const recalledIds = new Set(results.map(result => result.memory.id))
    records.value = records.value.map((memory) => {
      if (!recalledIds.has(memory.id)) {
        return memory
      }

      return reinforceMemory(memory, Date.now(), 0.08)
    })

    return results
  }

  function setLastInjectedContext(text: string) {
    lastInjectedContext.value = text
  }

  function seedExamples() {
    if (records.value.length > 0) {
      return
    }

    records.value = createSeedMemories()
  }

  function clearAllMemories() {
    records.value = []
    lastRecallResults.value = []
  }

  function resetState() {
    enabled.reset()
    shortTermEnabled.reset()
    longTermEnabled.reset()
    autoIngestEnabled.reset()
    recallContextEnabled.reset()
    minimumRecallQueryLength.reset()
    shortTermHalfLifeHours.reset()
    longTermHalfLifeDays.reset()
    promotionThreshold.reset()
    retentionFloor.reset()
    recencyBias.reset()
    importanceBias.reset()
    emotionalBias.reset()
    accessBias.reset()
    maxShortTermItems.reset()
    maxRecallResults.reset()
    records.value = createSeedMemories()
    recallQuery.reset()
    lastRecallResults.reset()
    lastInjectedContext.reset()
  }

  return {
    enabled,
    shortTermEnabled,
    longTermEnabled,
    autoIngestEnabled,
    recallContextEnabled,
    minimumRecallQueryLength,
    shortTermHalfLifeHours,
    longTermHalfLifeDays,
    promotionThreshold,
    retentionFloor,
    recencyBias,
    importanceBias,
    emotionalBias,
    accessBias,
    maxShortTermItems,
    maxRecallResults,
    records,
    recallQuery,
    lastRecallResults,
    lastInjectedContext,

    config,
    activeRecords,
    shortTermMemories,
    longTermMemories,
    metrics,
    configured,
    shortTermConfigured,
    longTermConfigured,

    addMemory,
    addMemories,
    addManualMemory,
    reinforceMemoryById,
    promoteMemory,
    forgetMemory,
    recall,
    setLastInjectedContext,
    runMaintenance,
    seedExamples,
    clearAllMemories,
    resetState,
  }
})
