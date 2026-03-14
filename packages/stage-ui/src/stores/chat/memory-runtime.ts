import type { ChatHistoryItem } from '../../types/chat'

import { extractConversationMemoriesFromTurn } from '@proj-airi/stage-shared/memory'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useChatOrchestratorStore } from '../chat'
import { useAiriCardStore } from '../modules/airi-card'
import { useMemoryStore } from '../modules/memory'
import { createMemoryContext, formatMemoryContextText, MEMORY_CONTEXT_SOURCE } from './context-providers/memory'
import { useChatContextStore } from './context-store'

function extractTextContent(message: ChatHistoryItem | { content?: unknown }) {
  const content = message.content

  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }

      if (part && typeof part === 'object' && 'text' in part) {
        return String(part.text ?? '')
      }

      return ''
    })
    .join(' ')
    .trim()
}

export const useChatMemoryRuntimeStore = defineStore('chat-memory-runtime', () => {
  const initialized = ref(false)
  const teardownCallbacks = ref<Array<() => void>>([])
  const memoryStore = useMemoryStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const chatContextStore = useChatContextStore()
  const cardStore = useAiriCardStore()

  function initialize() {
    if (initialized.value) {
      return
    }

    initialized.value = true

    teardownCallbacks.value.push(chatOrchestrator.onBeforeMessageComposed(async (message) => {
      if (!memoryStore.enabled || !memoryStore.recallContextEnabled) {
        return
      }

      const query = message.trim()
      if (query.length < memoryStore.minimumRecallQueryLength) {
        memoryStore.setLastInjectedContext('')
        chatContextStore.clearContextSource(MEMORY_CONTEXT_SOURCE)
        return
      }

      const results = memoryStore.recall(query)
      if (!results.length) {
        memoryStore.setLastInjectedContext('')
        chatContextStore.clearContextSource(MEMORY_CONTEXT_SOURCE)
        return
      }

      const contextMessage = createMemoryContext(results, query)
      memoryStore.setLastInjectedContext(formatMemoryContextText(results, query))
      chatContextStore.ingestContextMessage(contextMessage)
    }))

    teardownCallbacks.value.push(chatOrchestrator.onChatTurnComplete(async (chat, context) => {
      if (!memoryStore.enabled || !memoryStore.autoIngestEnabled) {
        return
      }

      const userMessage = extractTextContent(context.message)
      const assistantMessage = chat.outputText.trim()
      if (!userMessage && !assistantMessage) {
        return
      }

      const extracted = extractConversationMemoriesFromTurn({
        userMessage,
        assistantMessage,
        assistantName: cardStore.activeCard?.name || 'AIRI',
        userName: 'user',
      })

      if (!extracted.length) {
        return
      }

      memoryStore.addMemories(extracted)
    }))
  }

  function dispose() {
    teardownCallbacks.value.forEach(callback => callback())
    teardownCallbacks.value = []
    initialized.value = false
  }

  return {
    initialized,
    initialize,
    dispose,
  }
})
