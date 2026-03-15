<script setup lang="ts">
import type { PerceptionState } from '@proj-airi/model-driver-mediapipe'
import type { VisionCaptureSource } from '@proj-airi/stage-ui/stores/modules'

import { createMediaPipeBackend, createMocapEngine, drawOverlay } from '@proj-airi/model-driver-mediapipe'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules'
import { Button, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const visionStore = useVisionStore()
const {
  activeInputLabel,
  availableVideoInputs,
  captureSource,
  contextInjectionEnabled,
  enabled,
  faceEnabled,
  faceHz,
  handsEnabled,
  handsHz,
  lastError,
  minPoseVisibility,
  mirrorPreview,
  overlayEnabled,
  permissionState,
  poseEnabled,
  poseHz,
  runtimeStatus,
  selectedVideoInput,
} = storeToRefs(visionStore)

const videoRef = ref<HTMLVideoElement>()
const canvasRef = ref<HTMLCanvasElement>()
const latestState = ref<PerceptionState>()

const supportsScreenCapture = computed(() => {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
})

const summary = computed(() => {
  const quality = latestState.value?.quality
  return {
    fps: quality?.fps?.toFixed(1) ?? '0.0',
    latency: quality?.latencyMs?.toFixed(1) ?? '0.0',
    droppedFrames: quality?.droppedFrames ?? 0,
    hasFace: latestState.value?.face?.hasFace ?? false,
    handCount: latestState.value?.hands?.length ?? 0,
    posePoints: latestState.value?.pose?.worldLandmarks?.filter(point => (point.visibility ?? 0) >= minPoseVisibility.value).length ?? 0,
  }
})

const cameraOptions = computed(() => {
  return availableVideoInputs.value.map(device => ({
    label: device.label,
    value: device.deviceId,
  }))
})

const previewStyle = computed(() => ({
  transform: mirrorPreview.value ? 'scaleX(-1)' : 'scaleX(1)',
}))

const sourceDescription = computed(() => {
  if (captureSource.value === 'screen') {
    return 'Share a browser tab, window, or full display and feed it into the local MediaPipe pipeline.'
  }

  return 'Use a camera device for local face, hands, and pose tracking.'
})

let stream: MediaStream | undefined
let engine: ReturnType<typeof createMocapEngine> | undefined
let trackEndedHandler: (() => void) | undefined

function currentConfig() {
  return {
    enabled: {
      pose: poseEnabled.value,
      hands: handsEnabled.value,
      face: faceEnabled.value,
    },
    hz: {
      pose: poseHz.value,
      hands: handsHz.value,
      face: faceHz.value,
    },
    maxPeople: 1 as const,
  }
}

async function syncDeviceList() {
  try {
    await visionStore.refreshVideoInputs()
  }
  catch (error) {
    console.error('Failed to enumerate cameras:', error)
  }
}

function setRuntimeSummary(state?: PerceptionState) {
  if (!state) {
    visionStore.setLatestSummary(undefined)
    return
  }

  const quality = state.quality
  visionStore.setLatestSummary({
    inputLabel: activeInputLabel.value,
    captureSource: captureSource.value,
    fps: quality?.fps ?? 0,
    latencyMs: quality?.latencyMs ?? 0,
    droppedFrames: quality?.droppedFrames ?? 0,
    hasFace: state.face?.hasFace ?? false,
    handCount: state.hands?.length ?? 0,
    posePoints: state.pose?.worldLandmarks?.filter(point => (point.visibility ?? 0) >= minPoseVisibility.value).length ?? 0,
    lastUpdatedAt: Date.now(),
  })
}

function stopPreview(options?: { keepStatus?: boolean }) {
  engine?.stop()
  engine = undefined
  latestState.value = undefined
  setRuntimeSummary(undefined)

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
  visionStore.setActiveInputLabel('')

  if (videoRef.value)
    videoRef.value.srcObject = null

  canvasRef.value?.getContext('2d')?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  if (!options?.keepStatus) {
    visionStore.setRuntimeStatus('idle')
  }
}

async function requestVisionStream(source: VisionCaptureSource) {
  if (source === 'screen') {
    if (!supportsScreenCapture.value) {
      throw new Error('Screen capture is not available in this browser.')
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
    video: selectedVideoInput.value
      ? {
          deviceId: { ideal: selectedVideoInput.value },
        }
      : true,
  }

  return navigator.mediaDevices.getUserMedia(constraints)
}

async function startPreview() {
  if (!enabled.value) {
    stopPreview()
    return
  }

  try {
    stopPreview()
    visionStore.setRuntimeStatus('starting')

    stream = await requestVisionStream(captureSource.value)
    visionStore.setPermissionState('granted')

    const [track] = stream.getVideoTracks()
    const settings = track?.getSettings()
    const inputLabel = track?.label
      || (captureSource.value === 'screen'
        ? (typeof settings?.displaySurface === 'string' ? `Screen (${settings.displaySurface})` : 'Shared screen')
        : 'Camera input')
    visionStore.setActiveInputLabel(inputLabel)

    if (captureSource.value === 'camera' && !selectedVideoInput.value && settings?.deviceId) {
      selectedVideoInput.value = settings.deviceId
    }

    trackEndedHandler = () => {
      stopPreview({ keepStatus: true })
      visionStore.setRuntimeStatus('idle')
      visionStore.setPermissionState('unknown')
    }
    track?.addEventListener('ended', trackEndedHandler)

    if (!videoRef.value)
      throw new Error('Vision preview is not mounted')

    videoRef.value.srcObject = stream
    await videoRef.value.play()

    const backend = createMediaPipeBackend()
    engine = createMocapEngine(backend, currentConfig())
    await engine.init()
    engine.start(
      {
        getFrame: () => videoRef.value as HTMLVideoElement,
      },
      (state) => {
        latestState.value = state
        setRuntimeSummary(state)

        const canvas = canvasRef.value
        const video = videoRef.value
        if (!canvas || !video)
          return

        const width = video.videoWidth || 640
        const height = video.videoHeight || 480
        if (canvas.width !== width)
          canvas.width = width
        if (canvas.height !== height)
          canvas.height = height

        const context = canvas.getContext('2d')
        if (!context)
          return

        context.clearRect(0, 0, width, height)
        if (overlayEnabled.value) {
          drawOverlay(context, state, {
            pose: poseEnabled.value,
            hands: handsEnabled.value,
            face: faceEnabled.value,
          })
        }
      },
      {
        onError: (error) => {
          const message = error instanceof Error ? error.message : String(error)
          visionStore.setRuntimeStatus('error', message)
        },
      },
    )

    visionStore.setRuntimeStatus('running')
    if (captureSource.value === 'camera') {
      await syncDeviceList()
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
      visionStore.setPermissionState('denied')
    }
    visionStore.setRuntimeStatus('error', message)
    stopPreview({ keepStatus: true })
  }
}

watch(
  [poseEnabled, handsEnabled, faceEnabled, poseHz, handsHz, faceHz],
  () => {
    engine?.updateConfig(currentConfig())
    if (latestState.value) {
      setRuntimeSummary(latestState.value)
    }
  },
  { deep: false },
)

watch([enabled, selectedVideoInput, captureSource], async ([isEnabled, deviceId, source], [wasEnabled, previousDeviceId, previousSource]) => {
  if (!isEnabled) {
    stopPreview()
    return
  }

  if (!wasEnabled || deviceId !== previousDeviceId || source !== previousSource) {
    await startPreview()
  }
})

onMounted(async () => {
  await syncDeviceList()
  if (enabled.value) {
    await startPreview()
  }
})

onUnmounted(() => {
  stopPreview()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="border border-neutral-200 rounded-2xl bg-white/70 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-xl text-neutral-900 font-semibold dark:text-neutral-100">
            Vision Pipeline
          </h2>
          <p class="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Run local MediaPipe face, hand, and pose tracking from either a camera or a shared screen, then inject the latest scene summary into chat context.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input v-model="enabled" type="checkbox" class="h-4 w-4 border-neutral-300 rounded">
            Enable vision
          </label>
          <Button v-if="runtimeStatus !== 'running'" @click="startPreview">
            Start preview
          </Button>
          <Button v-else variant="ghost" @click="stopPreview">
            Stop preview
          </Button>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div class="overflow-hidden border border-neutral-200 rounded-2xl bg-black dark:border-neutral-800">
          <div class="relative aspect-video">
            <video
              ref="videoRef"
              muted
              playsinline
              class="absolute inset-0 h-full w-full object-cover opacity-90"
              :style="previewStyle"
            />
            <canvas
              ref="canvasRef"
              class="absolute inset-0 h-full w-full object-cover"
              :style="previewStyle"
            />

            <div class="absolute left-3 top-3 rounded-lg bg-black/55 px-3 py-2 text-xs text-white backdrop-blur">
              <div>Status: {{ runtimeStatus }}</div>
              <div>Permission: {{ permissionState }}</div>
              <div>Source: {{ captureSource === 'screen' ? 'screen share' : 'camera' }}</div>
              <div v-if="activeInputLabel">
                Input: {{ activeInputLabel }}
              </div>
              <div v-if="lastError" class="mt-1 text-red-300">
                {{ lastError }}
              </div>
            </div>
          </div>
        </div>

        <div class="grid gap-4">
          <div class="border border-neutral-200 rounded-2xl bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
            <div class="mb-3 text-sm text-neutral-800 font-medium dark:text-neutral-100">
              Input Source
            </div>

            <div class="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                class="border rounded-xl px-4 py-3 text-left transition"
                :class="captureSource === 'camera'
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950'
                  : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200'"
                @click="captureSource = 'camera'"
              >
                <div class="text-sm font-medium">
                  Camera
                </div>
                <div class="mt-1 text-xs opacity-80">
                  Use a camera device directly.
                </div>
              </button>

              <button
                type="button"
                class="border rounded-xl px-4 py-3 text-left transition"
                :class="captureSource === 'screen'
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950'
                  : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200'"
                :disabled="!supportsScreenCapture"
                @click="captureSource = 'screen'"
              >
                <div class="text-sm font-medium">
                  Screen share
                </div>
                <div class="mt-1 text-xs opacity-80">
                  Track a window, browser tab, or full display.
                </div>
              </button>
            </div>

            <p class="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              {{ sourceDescription }}
            </p>

            <FieldSelect
              v-if="captureSource === 'camera'"
              v-model="selectedVideoInput"
              class="mt-4"
              label="Video input"
              description="Choose the camera used for local vision."
              placeholder="Select camera"
              layout="vertical"
              :options="cameraOptions"
            />

            <div v-else class="mt-4 border border-neutral-300 rounded-xl border-dashed bg-white/70 p-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-300">
              Screen capture uses the browser picker when you start preview. The shared track will stop if you end sharing from the browser UI.
            </div>

            <div class="mt-4 flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              <label class="flex items-center gap-2">
                <input v-model="overlayEnabled" type="checkbox" class="h-4 w-4 border-neutral-300 rounded">
                Show landmark overlay
              </label>
              <label class="flex items-center gap-2">
                <input v-model="mirrorPreview" type="checkbox" class="h-4 w-4 border-neutral-300 rounded">
                Mirror preview
              </label>
              <label class="flex items-center gap-2">
                <input v-model="contextInjectionEnabled" type="checkbox" class="h-4 w-4 border-neutral-300 rounded">
                Inject latest vision summary into chat context
              </label>
            </div>
          </div>

          <div class="border border-neutral-200 rounded-2xl bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
            <div class="mb-3 text-sm text-neutral-800 font-medium dark:text-neutral-100">
              Detection Jobs
            </div>

            <div class="grid gap-3">
              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <label class="text-sm text-neutral-700 dark:text-neutral-200">
                  <input v-model="poseEnabled" type="checkbox" class="mr-2 h-4 w-4 border-neutral-300 rounded">
                  Pose
                </label>
                <input v-model.number="poseHz" type="range" min="4" max="30" step="1">
                <span class="text-xs text-neutral-500">{{ poseHz }} Hz</span>
              </div>

              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <label class="text-sm text-neutral-700 dark:text-neutral-200">
                  <input v-model="handsEnabled" type="checkbox" class="mr-2 h-4 w-4 border-neutral-300 rounded">
                  Hands
                </label>
                <input v-model.number="handsHz" type="range" min="4" max="24" step="1">
                <span class="text-xs text-neutral-500">{{ handsHz }} Hz</span>
              </div>

              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <label class="text-sm text-neutral-700 dark:text-neutral-200">
                  <input v-model="faceEnabled" type="checkbox" class="mr-2 h-4 w-4 border-neutral-300 rounded">
                  Face
                </label>
                <input v-model.number="faceHz" type="range" min="4" max="24" step="1">
                <span class="text-xs text-neutral-500">{{ faceHz }} Hz</span>
              </div>

              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 pt-2">
                <label class="text-sm text-neutral-700 dark:text-neutral-200">
                  Pose confidence
                </label>
                <input v-model.number="minPoseVisibility" type="range" min="0" max="1" step="0.05">
                <span class="text-xs text-neutral-500">{{ minPoseVisibility.toFixed(2) }}</span>
              </div>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="border border-neutral-200 rounded-2xl bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
              <div class="text-xs text-neutral-500 tracking-wide uppercase">
                Runtime
              </div>
              <div class="mt-2 text-2xl text-neutral-900 font-semibold dark:text-neutral-100">
                {{ summary.fps }} FPS
              </div>
              <div class="mt-1 text-sm text-neutral-500">
                {{ summary.latency }} ms latency
              </div>
            </div>

            <div class="border border-neutral-200 rounded-2xl bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
              <div class="text-xs text-neutral-500 tracking-wide uppercase">
                Stability
              </div>
              <div class="mt-2 text-2xl text-neutral-900 font-semibold dark:text-neutral-100">
                {{ summary.droppedFrames }}
              </div>
              <div class="mt-1 text-sm text-neutral-500">
                Dropped frames
              </div>
            </div>

            <div class="border border-neutral-200 rounded-2xl bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
              <div class="text-xs text-neutral-500 tracking-wide uppercase">
                Face
              </div>
              <div class="mt-2 text-2xl text-neutral-900 font-semibold dark:text-neutral-100">
                {{ summary.hasFace ? 'Tracked' : 'Not found' }}
              </div>
            </div>

            <div class="border border-neutral-200 rounded-2xl bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
              <div class="text-xs text-neutral-500 tracking-wide uppercase">
                Hands / Pose
              </div>
              <div class="mt-2 text-2xl text-neutral-900 font-semibold dark:text-neutral-100">
                {{ summary.handCount }} / {{ summary.posePoints }}
              </div>
              <div class="mt-1 text-sm text-neutral-500">
                Hands tracked / visible pose points
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.vision.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
