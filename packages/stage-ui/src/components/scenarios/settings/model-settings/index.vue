<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'

import { Button, Callout } from '@proj-airi/ui'
import { useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { defineAsyncComponent, ref, watch } from 'vue'

import { DisplayModelFormat } from '../../../../stores/display-models'
import { useLive2d } from '../../../../stores/live2d'
import { useSettings } from '../../../../stores/settings'
import { ModelSelectorDialog } from '../../dialogs/model-selector'

const props = defineProps<{
  palette: string[]
  settingsClass?: string | string[]

  live2dSceneClass?: string | string[]
  vrmSceneClass?: string | string[]
}>()
defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()
const Live2D = defineAsyncComponent(() => import('./live2d.vue'))
const VRM = defineAsyncComponent(() => import('./vrm.vue'))
const Live2DScene = defineAsyncComponent(async () => {
  const module = await import('@proj-airi/stage-ui-live2d')
  return module.Live2DScene
})
const ThreeScene = defineAsyncComponent(async () => {
  const module = await import('@proj-airi/stage-ui-three')
  return module.ThreeScene
})

const selectedModel = ref<DisplayModel | undefined>()

const positionCursor = useMouse()
const settingsStore = useSettings()
const { scale: live2dScale } = storeToRefs(useLive2d())
const {
  live2dDisableFocus,
  stageModelSelectedUrl,
  stageModelSelected,
  stageModelRenderer,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
} = storeToRefs(settingsStore)

watch(selectedModel, async () => {
  stageModelSelected.value = selectedModel.value?.id ?? ''
  await settingsStore.updateStageModel()

  if (selectedModel.value) {
    switch (selectedModel.value.format) {
      case DisplayModelFormat.Live2dZip:
        ;(await import('../../../../stores/live2d')).useLive2d().shouldUpdateView()
        break
      case DisplayModelFormat.VRM:
        ;(await import('@proj-airi/stage-ui-three')).useModelStore().shouldUpdateView()
        break
    }
  }
}, { deep: true })
</script>

<template>
  <div
    flex="~ col gap-2" z-10 overflow-y-scroll p-2 :class="[
      ...(props.settingsClass
        ? (typeof props.settingsClass === 'string' ? [props.settingsClass] : props.settingsClass)
        : []),
    ]"
  >
    <Callout label="We support both 2D and 3D models">
      <p>
        Click <strong>Select Model</strong> to import different formats of
        models into catalog, currently, <code>.zip</code> (Live2D) and <code>.vrm</code> (VRM) are supported.
      </p>
      <p>
        Neuro-sama uses 2D model driven by Live2D Inc. developed framework.
        While Grok Ani (first female character announced in Grok Companion)
        uses 3D model that is driven by VRM / MMD open formats.
      </p>
    </Callout>
    <ModelSelectorDialog v-model="selectedModel">
      <Button variant="secondary">
        Select Model
      </Button>
    </ModelSelectorDialog>
    <Live2D
      v-if="stageModelRenderer === 'live2d'"
      :palette="palette"
      @extract-colors-from-model="$emit('extractColorsFromModel')"
    />
    <VRM
      v-if="stageModelRenderer === 'vrm'"
      :palette="palette"
      @extract-colors-from-model="$emit('extractColorsFromModel')"
    />
  </div>
  <!-- Live2D component for 2D stage view -->
  <template v-if="stageModelRenderer === 'live2d'">
    <div :class="[...(props.live2dSceneClass ? (typeof props.live2dSceneClass === 'string' ? [props.live2dSceneClass] : props.live2dSceneClass) : [])]">
      <Live2DScene
        :focus-at="{ x: positionCursor.x.value, y: positionCursor.y.value }"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :disable-focus-at="live2dDisableFocus"
        :scale="live2dScale"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
      />
    </div>
  </template>
  <!-- VRM component for 3D stage view -->
  <template v-if="stageModelRenderer === 'vrm'">
    <div :class="[...(props.vrmSceneClass ? (typeof props.vrmSceneClass === 'string' ? [props.vrmSceneClass] : props.vrmSceneClass) : [])]">
      <ThreeScene :model-src="stageModelSelectedUrl" />
    </div>
  </template>
</template>
