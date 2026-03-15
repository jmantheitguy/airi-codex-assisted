import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useChatOrchestratorStore } from '../chat'
import { useVisionStore } from '../modules/vision'
import { createVisionContext, formatVisionContextText, VISION_CONTEXT_SOURCE } from './context-providers/vision'
import { useChatContextStore } from './context-store'

export const useChatVisionRuntimeStore = defineStore('chat-vision-runtime', () => {
  const initialized = ref(false)
  const teardownCallbacks = ref<Array<() => void>>([])
  const chatOrchestrator = useChatOrchestratorStore()
  const chatContextStore = useChatContextStore()
  const visionStore = useVisionStore()

  function initialize() {
    if (initialized.value) {
      return
    }

    initialized.value = true

    teardownCallbacks.value.push(chatOrchestrator.onBeforeMessageComposed(async () => {
      if (!visionStore.enabled || !visionStore.contextInjectionEnabled) {
        chatContextStore.clearContextSource(VISION_CONTEXT_SOURCE)
        return
      }

      const summary = visionStore.latestSummary
      if (!summary || visionStore.runtimeStatus !== 'running' || !visionStore.hasFreshSummary) {
        chatContextStore.clearContextSource(VISION_CONTEXT_SOURCE)
        return
      }

      const contextMessage = createVisionContext(summary)
      chatContextStore.ingestContextMessage(contextMessage)
    }))
  }

  function dispose() {
    teardownCallbacks.value.forEach(callback => callback())
    teardownCallbacks.value = []
    initialized.value = false
    chatContextStore.clearContextSource(VISION_CONTEXT_SOURCE)
  }

  function getLastContextText() {
    if (!visionStore.latestSummary) {
      return ''
    }

    return formatVisionContextText(visionStore.latestSummary)
  }

  return {
    initialized,
    initialize,
    dispose,
    getLastContextText,
  }
})
