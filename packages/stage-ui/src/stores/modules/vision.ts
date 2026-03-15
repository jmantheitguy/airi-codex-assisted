import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface VisionDeviceOption {
  deviceId: string
  label: string
}

export const useVisionStore = defineStore('vision-store', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/vision/enabled', false)
  const selectedVideoInput = useLocalStorageManualReset<string>('settings/vision/selected-video-input', '')
  const overlayEnabled = useLocalStorageManualReset<boolean>('settings/vision/overlay-enabled', true)
  const mirrorPreview = useLocalStorageManualReset<boolean>('settings/vision/mirror-preview', true)
  const poseEnabled = useLocalStorageManualReset<boolean>('settings/vision/pose-enabled', true)
  const handsEnabled = useLocalStorageManualReset<boolean>('settings/vision/hands-enabled', true)
  const faceEnabled = useLocalStorageManualReset<boolean>('settings/vision/face-enabled', true)
  const poseHz = useLocalStorageManualReset<number>('settings/vision/pose-hz', 24)
  const handsHz = useLocalStorageManualReset<number>('settings/vision/hands-hz', 18)
  const faceHz = useLocalStorageManualReset<number>('settings/vision/face-hz', 18)
  const minPoseVisibility = useLocalStorageManualReset<number>('settings/vision/min-pose-visibility', 0.5)

  const permissionState = ref<'unknown' | 'granted' | 'denied'>('unknown')
  const runtimeStatus = ref<'idle' | 'starting' | 'running' | 'error'>('idle')
  const lastError = ref('')
  const availableVideoInputs = ref<VisionDeviceOption[]>([])

  const configured = computed(() => {
    return enabled.value && (permissionState.value === 'granted' || selectedVideoInput.value.length > 0)
  })

  function setPermissionState(next: 'unknown' | 'granted' | 'denied') {
    permissionState.value = next
  }

  function setRuntimeStatus(next: 'idle' | 'starting' | 'running' | 'error', errorMessage = '') {
    runtimeStatus.value = next
    lastError.value = errorMessage
  }

  async function refreshVideoInputs() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      availableVideoInputs.value = []
      return []
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoInputs = devices
      .filter(device => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }))

    availableVideoInputs.value = videoInputs

    if (!selectedVideoInput.value && videoInputs[0]?.deviceId) {
      selectedVideoInput.value = videoInputs[0].deviceId
    }

    return videoInputs
  }

  function resetState() {
    enabled.reset()
    selectedVideoInput.reset()
    overlayEnabled.reset()
    mirrorPreview.reset()
    poseEnabled.reset()
    handsEnabled.reset()
    faceEnabled.reset()
    poseHz.reset()
    handsHz.reset()
    faceHz.reset()
    minPoseVisibility.reset()
    permissionState.value = 'unknown'
    runtimeStatus.value = 'idle'
    lastError.value = ''
    availableVideoInputs.value = []
  }

  return {
    enabled,
    selectedVideoInput,
    overlayEnabled,
    mirrorPreview,
    poseEnabled,
    handsEnabled,
    faceEnabled,
    poseHz,
    handsHz,
    faceHz,
    minPoseVisibility,
    permissionState,
    runtimeStatus,
    lastError,
    availableVideoInputs,
    configured,
    setPermissionState,
    setRuntimeStatus,
    refreshVideoInputs,
    resetState,
  }
})
