<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const providerId = 'browser-local-audio-transcription'
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

providersStore.initializeProvider(providerId)
providersStore.forceProviderConfigured(providerId)

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const language = computed({
  get: () => providers.value[providerId]?.language || 'en-US',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].language = value
  },
})

const languageOptions = [
  { label: 'English (US)', value: 'en-US' },
  { label: 'English (UK)', value: 'en-GB' },
  { label: 'Spanish', value: 'es-ES' },
  { label: 'French', value: 'fr-FR' },
  { label: 'German', value: 'de-DE' },
  { label: 'Italian', value: 'it-IT' },
  { label: 'Portuguese', value: 'pt-BR' },
  { label: 'Japanese', value: 'ja-JP' },
  { label: 'Korean', value: 'ko-KR' },
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Chinese (Traditional)', value: 'zh-TW' },
  { label: 'Russian', value: 'ru-RU' },
]

function handleResetSettings() {
  providers.value[providerId] = {
    language: 'en-US',
  }
  providersStore.forceProviderConfigured(providerId)
}

onMounted(() => {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {
      language: 'en-US',
    }
  }

  providersStore.forceProviderConfigured(providerId)
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
          title="Browser (Local) transcription"
          description="Runs local Whisper transcription in the browser. No API key is required."
          :on-reset="handleResetSettings"
        >
          <FieldSelect
            v-model="language"
            label="Language"
            description="Sets the transcription language hint for local streaming and recording transcription."
            :options="languageOptions"
            placeholder="Select language"
          />
        </ProviderBasicSettings>
      </ProviderSettingsContainer>

      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <Alert type="info">
          <template #title>
            Local streaming speech-to-text
          </template>
          <template #content>
            This provider uses AIRI's local browser Whisper worker for both live chunked transcription and recording fallback. The first run may take time while the model loads.
          </template>
        </Alert>

        <Alert type="warning">
          <template #title>
            Hardware requirements
          </template>
          <template #content>
            Browser-local transcription works best on machines with WebGPU support and enough memory. If it loads slowly, wait for the model warm-up to finish before testing.
          </template>
        </Alert>

        <div>
          <Button @click="router.push('/settings/modules/hearing')">
            Open Hearing Test
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
