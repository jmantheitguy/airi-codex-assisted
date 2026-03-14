<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  SpeechPlayground,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, FieldSelect } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const providerId = 'browser-local-audio-speech'
const defaultModel = 'q4f16'
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const router = useRouter()

providersStore.initializeProvider(providerId)
providersStore.forceProviderConfigured(providerId)

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})
const providerConfig = computed(() => {
  return providersStore.getProviderConfig(providerId)
})
const hasWebGPU = ref(false)
const voicesLoading = ref(false)
const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})
const modelsLoading = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})
const model = computed({
  get(): string {
    const currentValue = providerConfig.value?.model as string
    if (currentValue)
      return currentValue

    return defaultModel
  },
  set(val: string) {
    const config = providersStore.getProviderConfig(providerId)
    config.model = val
  },
})
const modelOptions = computed(() => {
  return providerModels.value.map(m => ({
    label: m.name,
    value: m.id,
  }))
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const config = providersStore.getProviderConfig(providerId)
  const metadata = providersStore.getProviderMetadata(providerId)
  const selectedModel = config.model as string | undefined || defaultModel

  if (metadata.capabilities.loadModel) {
    voicesLoading.value = true
    try {
      await metadata.capabilities.loadModel({
        ...config,
        model: selectedModel,
      }, {
        onProgress: async () => {},
      })
    }
    finally {
      voicesLoading.value = false
    }
  }

  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  return await speechStore.speech(
    provider,
    selectedModel,
    input,
    voiceId,
    {
      ...config,
    },
  )
}

function resetSettings() {
  const config = providersStore.getProviderConfig(providerId)
  config.model = defaultModel
  providersStore.forceProviderConfigured(providerId)
}

onMounted(async () => {
  hasWebGPU.value = typeof navigator !== 'undefined' && !!navigator.gpu

  const config = providersStore.getProviderConfig(providerId)
  if (!config.model) {
    config.model = defaultModel
  }

  try {
    voicesLoading.value = true
    await providersStore.fetchModelsForProvider(providerId)
    await speechStore.loadVoicesForProvider(providerId)
    providersStore.forceProviderConfigured(providerId)
  }
  finally {
    voicesLoading.value = false
  }
})

watch(model, async (newValue) => {
  if (!newValue) {
    return
  }

  try {
    voicesLoading.value = true

    await speechStore.loadVoicesForProvider(providerId)
    providersStore.forceProviderConfigured(providerId)
  }
  catch (error) {
    console.error('[Browser Local Speech] Error in model watcher:', error)
  }
  finally {
    voicesLoading.value = false
  }
})
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <ProviderBasicSettings
          title="Browser (Local) speech"
          description="Runs local text-to-speech in the browser using the Kokoro engine. No API key is required."
          :on-reset="resetSettings"
        >
          <FieldSelect
            v-model="model"
            label="Model"
            description="Select the local speech model to load."
            :options="modelOptions"
            :disabled="modelsLoading"
            placeholder="Choose a model..."
          />
        </ProviderBasicSettings>
      </ProviderSettingsContainer>

      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <Alert type="info">
          <template #title>
            Browser-local text-to-speech
          </template>
          <template #content>
            This provider runs entirely in the browser. The first load can take a while because the speech model and voices need to warm up locally.
          </template>
        </Alert>

        <Alert type="warning">
          <template #title>
            Hardware requirements
          </template>
          <template #content>
            Browser-local speech works best with WebGPU support. If voices are empty at first, wait for the local model to finish loading and try again.
          </template>
        </Alert>

        <SpeechPlayground
          :available-voices="availableVoices"
          :generate-speech="handleGenerateSpeech"
          :api-key-configured="true"
          :voices-loading="voicesLoading"
          default-text="Hello! This is AIRI speaking locally in your browser."
        />

        <div>
          <Button @click="router.push('/settings/modules/speech')">
            Open Speech Settings
          </Button>
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
