import { describe, expect, it } from 'vitest'

import {
  createMemoryRecord,
  DEFAULT_MEMORY_SYSTEM_CONFIG,
  extractConversationMemoriesFromTurn,
  maintainMemories,
  recallMemories,
  reinforceMemory,
  scoreMemoryStrength,
} from './index'

describe('memory domain', () => {
  it('decays short-term memory strength over time', () => {
    const createdAt = Date.UTC(2026, 2, 1)
    const memory = createMemoryRecord({
      content: 'We promised to continue the rendering refactor tomorrow.',
      createdAt,
    }, createdAt)

    const initial = scoreMemoryStrength(memory, DEFAULT_MEMORY_SYSTEM_CONFIG, createdAt)
    const oneDayLater = scoreMemoryStrength(memory, DEFAULT_MEMORY_SYSTEM_CONFIG, createdAt + (24 * 60 * 60 * 1000))

    expect(initial).toBeGreaterThan(oneDayLater)
  })

  it('promotes reinforced memories into long-term memory', () => {
    const createdAt = Date.UTC(2026, 2, 1)
    const memory = createMemoryRecord({
      content: 'Johnathan prefers progressive refactors over compatibility shims.',
      createdAt,
      importance: 9,
      emotionalIntensity: 8,
      baseStrength: 0.8,
    }, createdAt)

    const reinforced = reinforceMemory(reinforceMemory(memory, createdAt + 1000), createdAt + 2000)
    const maintained = maintainMemories([reinforced], DEFAULT_MEMORY_SYSTEM_CONFIG, createdAt + 3000)

    expect(maintained[0]?.kind).toBe('long_term')
  })

  it('recalls semantically relevant memories first', () => {
    const now = Date.UTC(2026, 2, 1)
    const relevant = createMemoryRecord({
      content: 'We discussed memory decay and retrieval ranking for AIRI.',
      tags: ['memory', 'retrieval'],
      importance: 8,
    }, now)
    const unrelated = createMemoryRecord({
      content: 'The speech synthesis provider needs a new API key.',
      tags: ['speech'],
      importance: 7,
    }, now)

    const results = recallMemories(
      [relevant, unrelated],
      'memory retrieval ranking',
      DEFAULT_MEMORY_SYSTEM_CONFIG,
      now,
      2,
    )

    expect(results[0]?.memory.id).toBe(relevant.id)
  })

  it('extracts durable memories from a chat turn', () => {
    const results = extractConversationMemoriesFromTurn({
      userMessage: 'I prefer deterministic memory scoring and I always want review findings first.',
      assistantMessage: 'I will inject memory context before chat sends and keep the logic testable.',
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.some(result => (result.source ?? '').includes('user'))).toBe(true)
    expect(results.some(result => (result.source ?? '').includes('assistant'))).toBe(true)
  })
})
