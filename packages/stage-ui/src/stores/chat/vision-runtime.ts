import type { PerceptionState } from '@proj-airi/model-driver-mediapipe'

import { createMediaPipeBackend, createMocapEngine } from '@proj-airi/model-driver-mediapipe'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

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
  let stream: MediaStream | undefined
  let engine: ReturnType<typeof createMocapEngine> | undefined
  let trackEndedHandler: (() => void) | undefined
  let lastFrameCapturedAt = 0
  const video = typeof document !== 'undefined' ? document.createElement('video') : undefined
  const frameCaptureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : undefined

  if (video) {
    video.muted = true
    video.playsInline = true
  }

  function currentConfig() {
    return {
      enabled: {
        pose: visionStore.poseEnabled,
        hands: visionStore.handsEnabled,
        face: visionStore.faceEnabled,
      },
      hz: {
        pose: visionStore.poseHz,
        hands: visionStore.handsHz,
        face: visionStore.faceHz,
      },
      maxPeople: 1 as const,
    }
  }

  function setRuntimeSummary(state: PerceptionState | undefined = visionStore.latestPerceptionState) {
    if (!state) {
      visionStore.setLatestSummary(undefined)
      return
    }

    const quality = state.quality
    visionStore.setLatestSummary({
      inputLabel: visionStore.activeInputLabel,
      captureSource: visionStore.captureSource,
      fps: quality?.fps ?? 0,
      latencyMs: quality?.latencyMs ?? 0,
      droppedFrames: quality?.droppedFrames ?? 0,
      hasFace: state.face?.hasFace ?? false,
      handCount: state.hands?.length ?? 0,
      posePoints: state.pose?.worldLandmarks?.filter(point => (point.visibility ?? 0) >= visionStore.minPoseVisibility).length ?? 0,
      lastUpdatedAt: Date.now(),
    })
  }

  function captureVisionFrame() {
    if (!frameCaptureCanvas || !video || !visionStore.frameAttachmentEnabled)
      return

    const now = Date.now()
    if (now - lastFrameCapturedAt < visionStore.frameAttachmentIntervalMs)
      return

    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    if (!sourceWidth || !sourceHeight)
      return

    const maxSize = Math.max(128, Math.min(2048, visionStore.frameAttachmentMaxSize || 512))
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    frameCaptureCanvas.width = width
    frameCaptureCanvas.height = height
    const context = frameCaptureCanvas.getContext('2d')
    if (!context)
      return

    context.drawImage(video, 0, 0, width, height)
    const mimeType = 'image/jpeg'
    const dataUrl = frameCaptureCanvas.toDataURL(mimeType, 0.72)
    const [, data = ''] = dataUrl.split(',', 2)
    if (!data)
      return

    lastFrameCapturedAt = now
    visionStore.setLatestFrame({
      data,
      mimeType,
      width,
      height,
      capturedAt: now,
    })
  }

  function stopCapture(options?: { keepStatus?: boolean }) {
    engine?.stop()
    engine = undefined
    visionStore.setLatestPerceptionState(undefined)
    visionStore.setLatestSummary(undefined)
    visionStore.setLatestFrame(undefined)
    lastFrameCapturedAt = 0

    const [videoTrack] = stream?.getVideoTracks() ?? []
    if (videoTrack && trackEndedHandler) {
      videoTrack.removeEventListener('ended', trackEndedHandler)
    }
    trackEndedHandler = undefined

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }

    stream = undefined
    visionStore.setActiveStream(undefined)
    visionStore.setActiveInputLabel('')

    if (video)
      video.srcObject = null

    if (!options?.keepStatus) {
      visionStore.setRuntimeStatus('idle')
    }
  }

  async function requestVisionStream() {
    if (visionStore.captureSource === 'screen') {
      if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
        throw new TypeError('Screen capture is not available in this browser.')
      }

      return navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          frameRate: { ideal: 30, max: 30 },
        },
      })
    }

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: visionStore.selectedVideoInput
        ? {
            deviceId: { ideal: visionStore.selectedVideoInput },
          }
        : true,
    }

    return navigator.mediaDevices.getUserMedia(constraints)
  }

  async function startCapture() {
    if (!visionStore.enabled) {
      stopCapture()
      return
    }

    if (!video)
      throw new Error('Vision runtime is not available outside a browser document.')

    try {
      stopCapture()
      visionStore.setRuntimeStatus('starting')

      stream = await requestVisionStream()
      visionStore.setActiveStream(stream)
      visionStore.setPermissionState('granted')

      const [track] = stream.getVideoTracks()
      const settings = track?.getSettings()
      const inputLabel = track?.label
        || (visionStore.captureSource === 'screen'
          ? (typeof settings?.displaySurface === 'string' ? `Screen (${settings.displaySurface})` : 'Shared screen')
          : 'Camera input')
      visionStore.setActiveInputLabel(inputLabel)

      if (visionStore.captureSource === 'camera' && !visionStore.selectedVideoInput && settings?.deviceId) {
        visionStore.selectedVideoInput = settings.deviceId
      }

      trackEndedHandler = () => {
        stopCapture({ keepStatus: true })
        visionStore.setRuntimeStatus('idle')
        visionStore.setPermissionState('unknown')
      }
      track?.addEventListener('ended', trackEndedHandler)

      video.srcObject = stream
      await video.play()

      const backend = createMediaPipeBackend()
      engine = createMocapEngine(backend, currentConfig())
      await engine.init()
      engine.start(
        {
          getFrame: () => video,
        },
        (state: PerceptionState) => {
          visionStore.setLatestPerceptionState(state)
          setRuntimeSummary(state)
          captureVisionFrame()
        },
        {
          onError: (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            visionStore.setRuntimeStatus('error', message)
          },
        },
      )

      visionStore.setRuntimeStatus('running')
      if (visionStore.captureSource === 'camera') {
        await visionStore.refreshVideoInputs()
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
        visionStore.setPermissionState('denied')
      }
      visionStore.setRuntimeStatus('error', message)
      stopCapture({ keepStatus: true })
    }
  }

  function initialize() {
    if (initialized.value) {
      return
    }

    initialized.value = true

    void visionStore.refreshVideoInputs()

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

    const stopConfigWatch = watch(
      () => [
        visionStore.poseEnabled,
        visionStore.handsEnabled,
        visionStore.faceEnabled,
        visionStore.poseHz,
        visionStore.handsHz,
        visionStore.faceHz,
        visionStore.minPoseVisibility,
      ],
      () => {
        engine?.updateConfig(currentConfig())
        setRuntimeSummary()
      },
      { deep: false },
    )
    teardownCallbacks.value.push(stopConfigWatch)

    const stopSourceWatch = watch(
      () => [visionStore.enabled, visionStore.selectedVideoInput, visionStore.captureSource],
      async ([isEnabled, deviceId, source], oldValue) => {
        const [wasEnabled, previousDeviceId, previousSource] = oldValue ?? []
        if (!isEnabled) {
          stopCapture()
          return
        }

        if (!wasEnabled || deviceId !== previousDeviceId || source !== previousSource) {
          await startCapture()
        }
      },
      { immediate: true },
    )
    teardownCallbacks.value.push(stopSourceWatch)
  }

  function dispose() {
    teardownCallbacks.value.forEach(callback => callback())
    teardownCallbacks.value = []
    initialized.value = false
    chatContextStore.clearContextSource(VISION_CONTEXT_SOURCE)
    stopCapture()
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
    startCapture,
    stopCapture,
    getLastContextText,
  }
})
