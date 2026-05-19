import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_OLLAMA_VISION_MODEL, LOCAL_SPEECH_MODEL, LOCAL_SPEECH_VOICE_ID, LOCAL_TRANSCRIPTION_MODEL } from '../../constants/local-models'
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

describe('local provider defaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('migrates persisted OpenAI chat selection to Ollama', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock({
      'settings/consciousness/active-provider': 'openai',
      'settings/consciousness/active-model': 'gpt-4o',
    }))

    const store = useConsciousnessStore()

    expect(store.activeProvider).toBe('ollama')
    expect(store.activeModel).toBe(LOCAL_OLLAMA_VISION_MODEL)
  })

  it('migrates OpenAI speech selection to browser-local speech', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock({
      'settings/speech/active-provider': 'openai-audio-speech',
      'settings/speech/active-model': 'gpt-4o-mini-tts',
      'settings/speech/voice': 'alloy',
    }))

    const store = useSpeechStore()

    expect(store.activeSpeechProvider).toBe('browser-local-audio-speech')
    expect(store.activeSpeechModel).toBe(LOCAL_SPEECH_MODEL)
    expect(store.activeSpeechVoiceId).toBe(LOCAL_SPEECH_VOICE_ID)
  })

  it('migrates OpenAI transcription selection to browser-local transcription', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock({
      'settings/hearing/active-provider': 'openai-audio-transcription',
      'settings/hearing/active-model': 'gpt-4o-transcribe',
    }))

    const store = useHearingStore()

    expect(store.activeTranscriptionProvider).toBe('browser-local-audio-transcription')
    expect(store.activeTranscriptionModel).toBe(LOCAL_TRANSCRIPTION_MODEL)
  })
})
