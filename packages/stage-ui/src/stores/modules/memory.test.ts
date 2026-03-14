import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMemoryStore } from './memory'

describe('useMemoryStore', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size
      },
    })

    setActivePinia(createPinia())
  })

  it('starts with seed memories and exposes metrics', () => {
    const store = useMemoryStore()

    expect(store.records.length).toBeGreaterThan(0)
    expect(store.metrics.total).toBe(store.activeRecords.length)
  })

  it('adds and recalls a relevant memory', () => {
    const store = useMemoryStore()
    const memory = store.addManualMemory('AIRI should remember the user preference for strict code review.', {
      tags: ['review', 'memory'],
      importance: 9,
      emotionalIntensity: 6,
    })

    const results = store.recall('strict code review preference')

    expect(results.some(result => result.memory.id === memory.id)).toBe(true)
  })

  it('promotes a memory into long-term storage', () => {
    const store = useMemoryStore()
    const memory = store.addManualMemory('The memory system must preserve important user preferences.', {
      importance: 10,
      emotionalIntensity: 8,
      tags: ['preferences'],
    })

    store.promoteMemory(memory.id)

    expect(store.records.find(record => record.id === memory.id)?.kind).toBe('long_term')
  })
})
