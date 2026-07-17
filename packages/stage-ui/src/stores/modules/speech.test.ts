import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useConsciousnessStore } from './consciousness'
import { useHearingStore } from './hearing'
import { toSignedPercent, useSpeechStore } from './speech'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function createLocalStorageMock(initialValues: Record<string, string> = {}) {
  const storage = new Map<string, string>(Object.entries(initialValues))

  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size
    },
  }
}

describe('speech store helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    setActivePinia(createPinia())
  })

  it('formats positive percentages with a plus sign', () => {
    expect(toSignedPercent(25)).toBe('+25%')
  })

  it('formats negative percentages without a double minus', () => {
    expect(toSignedPercent(-20)).toBe('-20%')
    expect(toSignedPercent(-20)).not.toContain('--')
  })

  it('formats zero as 0%', () => {
    expect(toSignedPercent(0)).toBe('0%')
  })
})

describe('cloud provider defaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults new installs to OpenAI and ElevenLabs providers', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock())

    const consciousness = useConsciousnessStore()
    const speech = useSpeechStore()
    const hearing = useHearingStore()

    expect(consciousness.activeProvider).toBe('openai')
    expect(consciousness.activeModel).toBe('gpt-4o-mini')
    expect(speech.activeSpeechProvider).toBe('elevenlabs')
    expect(speech.activeSpeechModel).toBe('eleven_multilingual_v2')
    expect(speech.activeSpeechVoiceId).toBe('21m00Tcm4TlvDq8ikWAM')
    expect(hearing.activeTranscriptionProvider).toBe('openai-audio-transcription')
    expect(hearing.activeTranscriptionModel).toBe('gpt-4o-mini-transcribe')
  })
})
