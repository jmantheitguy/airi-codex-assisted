import type { MemoryRecallResult } from '@proj-airi/stage-shared/memory'

import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const MEMORY_CONTEXT_ID = 'system:memory-recall'
export const MEMORY_CONTEXT_SOURCE = MEMORY_CONTEXT_ID

export function formatMemoryContextText(results: MemoryRecallResult[], query: string) {
  const header = query
    ? `Recalled memories for query: "${query}"`
    : 'Recalled memories'

  const lines = results.map((result, index) => {
    return `${index + 1}. ${result.memory.summary} [strength=${Math.round(result.strength * 100)} importance=${result.memory.importance}/10 source=${result.memory.source}]`
  })

  return `${header}\n${lines.join('\n')}`
}

export function createMemoryContext(results: MemoryRecallResult[], query: string): ContextMessage {
  return {
    id: nanoid(),
    contextId: MEMORY_CONTEXT_ID,
    source: MEMORY_CONTEXT_SOURCE,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: formatMemoryContextText(results, query),
    createdAt: Date.now(),
  }
}
