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

describe('openAI provider defaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('migrates persisted Ollama chat selection to OpenAI', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock({
      'settings/consciousness/active-provider': 'ollama',
      'settings/consciousness/active-model': 'gpt-oss:20b',
    }))

    const store = useConsciousnessStore()

    expect(store.activeProvider).toBe('openai')
    expect(store.activeModel).toBe('gpt-4o')
  })

  it('migrates browser-local speech selection to OpenAI speech', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock({
      'settings/speech/active-provider': 'browser-local-audio-speech',
      'settings/speech/active-model': 'q4f16',
      'settings/speech/voice': 'af_bella',
    }))

    const store = useSpeechStore()

    expect(store.activeSpeechProvider).toBe('openai-audio-speech')
    expect(store.activeSpeechModel).toBe('gpt-4o-mini-tts')
    expect(store.activeSpeechVoiceId).toBe('alloy')
  })

  it('migrates browser-local transcription selection to OpenAI transcription', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock({
      'settings/hearing/active-provider': 'browser-local-audio-transcription',
      'settings/hearing/active-model': 'browser-local-whisper',
    }))

    const store = useHearingStore()

    expect(store.activeTranscriptionProvider).toBe('openai-audio-transcription')
    expect(store.activeTranscriptionModel).toBe('gpt-4o-transcribe')
  })
})
