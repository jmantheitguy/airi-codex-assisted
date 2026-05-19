import type { PerceptionState } from '@proj-airi/model-driver-mediapipe'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export interface VisionDeviceOption {
  deviceId: string
  label: string
}

export type VisionCaptureSource = 'camera' | 'screen'

export interface VisionRuntimeSummary {
  inputLabel: string
  captureSource: VisionCaptureSource
  fps: number
  latencyMs: number
  droppedFrames: number
  hasFace: boolean
  handCount: number
  posePoints: number
  lastUpdatedAt: number
}

export interface VisionFrameSnapshot {
  data: string
  mimeType: string
  width: number
  height: number
  capturedAt: number
}

export const useVisionStore = defineStore('vision-store', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/vision/enabled', false)
  const captureSource = useLocalStorageManualReset<VisionCaptureSource>('settings/vision/capture-source', 'camera')
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
  const contextInjectionEnabled = useLocalStorageManualReset<boolean>('settings/vision/context-injection-enabled', true)
  const frameAttachmentEnabled = useLocalStorageManualReset<boolean>('settings/vision/frame-attachment-enabled', false)
  const frameAttachmentMaxSize = useLocalStorageManualReset<number>('settings/vision/frame-attachment-max-size', 512)
  const frameAttachmentIntervalMs = useLocalStorageManualReset<number>('settings/vision/frame-attachment-interval-ms', 5000)

  const permissionState = ref<'unknown' | 'granted' | 'denied'>('unknown')
  const runtimeStatus = ref<'idle' | 'starting' | 'running' | 'error'>('idle')
  const lastError = ref('')
  const availableVideoInputs = ref<VisionDeviceOption[]>([])
  const activeInputLabel = ref('')
  const latestSummary = ref<VisionRuntimeSummary>()
  const latestFrame = ref<VisionFrameSnapshot>()
  const latestPerceptionState = ref<PerceptionState>()
  const activeStream = shallowRef<MediaStream>()

  const configured = computed(() => {
    const hasConfiguredSource = captureSource.value === 'screen'
      ? permissionState.value === 'granted' || activeInputLabel.value.length > 0
      : permissionState.value === 'granted' || selectedVideoInput.value.length > 0

    return enabled.value && hasConfiguredSource
  })

  const hasFreshSummary = computed(() => {
    if (!latestSummary.value) {
      return false
    }

    return Date.now() - latestSummary.value.lastUpdatedAt < 15_000
  })

  const hasFreshFrame = computed(() => {
    if (!latestFrame.value) {
      return false
    }

    return Date.now() - latestFrame.value.capturedAt < Math.max(frameAttachmentIntervalMs.value * 2, 15_000)
  })

  function setPermissionState(next: 'unknown' | 'granted' | 'denied') {
    permissionState.value = next
  }

  function setRuntimeStatus(next: 'idle' | 'starting' | 'running' | 'error', errorMessage = '') {
    runtimeStatus.value = next
    lastError.value = errorMessage
  }

  function setActiveInputLabel(label: string) {
    activeInputLabel.value = label
  }

  function setLatestSummary(summary?: VisionRuntimeSummary) {
    latestSummary.value = summary
  }

  function setLatestPerceptionState(state?: PerceptionState) {
    latestPerceptionState.value = state
  }

  function setLatestFrame(frame?: VisionFrameSnapshot) {
    latestFrame.value = frame
  }

  function setActiveStream(stream?: MediaStream) {
    activeStream.value = stream
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
    captureSource.reset()
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
    contextInjectionEnabled.reset()
    frameAttachmentEnabled.reset()
    frameAttachmentMaxSize.reset()
    frameAttachmentIntervalMs.reset()
    permissionState.value = 'unknown'
    runtimeStatus.value = 'idle'
    lastError.value = ''
    availableVideoInputs.value = []
    activeInputLabel.value = ''
    latestSummary.value = undefined
    latestFrame.value = undefined
    latestPerceptionState.value = undefined
    activeStream.value = undefined
  }

  return {
    enabled,
    captureSource,
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
    contextInjectionEnabled,
    frameAttachmentEnabled,
    frameAttachmentMaxSize,
    frameAttachmentIntervalMs,
    permissionState,
    runtimeStatus,
    lastError,
    availableVideoInputs,
    activeInputLabel,
    latestSummary,
    latestFrame,
    latestPerceptionState,
    activeStream,
    configured,
    hasFreshSummary,
    hasFreshFrame,
    setPermissionState,
    setRuntimeStatus,
    setActiveInputLabel,
    setLatestSummary,
    setLatestPerceptionState,
    setLatestFrame,
    setActiveStream,
    refreshVideoInputs,
    resetState,
  }
})
