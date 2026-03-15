import type { ContextMessage } from '../../../types/chat'
import type { VisionRuntimeSummary } from '../../modules/vision'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const VISION_CONTEXT_ID = 'system:vision'
export const VISION_CONTEXT_SOURCE = VISION_CONTEXT_ID

export function formatVisionContextText(summary: VisionRuntimeSummary) {
  const source = summary.captureSource === 'screen' ? 'screen share' : 'camera'
  const status = [
    `Vision source: ${source}`,
    summary.inputLabel ? `Input label: ${summary.inputLabel}` : '',
    `Face tracked: ${summary.hasFace ? 'yes' : 'no'}`,
    `Hands tracked: ${summary.handCount}`,
    `Visible pose points: ${summary.posePoints}`,
    `Runtime: ${summary.fps.toFixed(1)} FPS, ${summary.latencyMs.toFixed(1)} ms latency, ${summary.droppedFrames} dropped frames`,
    `Observation age: ${Math.max(0, Math.round((Date.now() - summary.lastUpdatedAt) / 1000))} seconds`,
  ].filter(Boolean)

  return status.join('\n')
}

export function createVisionContext(summary: VisionRuntimeSummary): ContextMessage {
  return {
    id: nanoid(),
    contextId: VISION_CONTEXT_ID,
    source: VISION_CONTEXT_SOURCE,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: formatVisionContextText(summary),
    createdAt: Date.now(),
  }
}
