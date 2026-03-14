import type { StreamTranscriptionDelta, StreamTranscriptionResult } from '@xsai/stream-transcription'

import { toWav } from '@proj-airi/audio/encoding'

import { transcribeWithBrowserLocalWhisper } from './browser-local-transcription'

interface BrowserLocalStreamTranscriptionOptions {
  abortSignal?: AbortSignal
  file?: Blob
  inputAudioStream?: ReadableStream<ArrayBuffer>
  language?: string
  sampleRate?: number
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function resolveAudioStream(options: BrowserLocalStreamTranscriptionOptions) {
  const stream = options.inputAudioStream ?? options.file?.stream()
  if (!stream)
    throw new TypeError('Audio stream or file is required for local streaming transcription.')

  return stream as ReadableStream<ArrayBuffer>
}

function int16ChunkToFloat32(chunk: ArrayBuffer) {
  const pcm16 = new Int16Array(chunk)
  const float32 = new Float32Array(pcm16.length)

  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768
  }

  return float32
}

function joinFloat32Chunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function normalizeTranscript(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
}

function cloneFloat32(buffer: Float32Array) {
  const clone = new Float32Array(buffer.length)
  clone.set(buffer)
  return clone
}

function splitWords(text: string) {
  return text.split(/\s+/).filter(Boolean)
}

function commonPrefixLength(left: string[], right: string[]) {
  const max = Math.min(left.length, right.length)
  let index = 0
  while (index < max && left[index]?.toLowerCase() === right[index]?.toLowerCase()) {
    index++
  }
  return index
}

function commonSuffixPrefixOverlap(existing: string[], next: string[]) {
  const max = Math.min(existing.length, next.length)

  for (let size = max; size > 0; size--) {
    let matches = true
    for (let index = 0; index < size; index++) {
      const existingWord = existing[existing.length - size + index]
      const nextWord = next[index]
      if (existingWord?.toLowerCase() !== nextWord?.toLowerCase()) {
        matches = false
        break
      }
    }

    if (matches)
      return size
  }

  return 0
}

export function streamBrowserLocalTranscription(options: BrowserLocalStreamTranscriptionOptions): StreamTranscriptionResult {
  const audioStream = resolveAudioStream(options)
  const deferredText = createDeferred<string>()

  let fullText = ''
  let textStreamCtrl: ReadableStreamDefaultController<string> | undefined
  let fullStreamCtrl: ReadableStreamDefaultController<StreamTranscriptionDelta> | undefined

  const fullStream = new ReadableStream<StreamTranscriptionDelta>({
    start(controller) {
      fullStreamCtrl = controller
    },
  })

  const textStream = new ReadableStream<string>({
    start(controller) {
      textStreamCtrl = controller
    },
  })

  void (async () => {
    const reader = audioStream.getReader()
    const sampleRate = options.sampleRate ?? 16000
    const transcribeEverySamples = sampleRate * 2
    const maxWindowSamples = sampleRate * 12
    const retainedHistorySamples = sampleRate * 4

    let bufferedChunks: Float32Array[] = []
    let bufferedSamples = 0
    let samplesSinceLastTranscription = 0
    let committedWords: string[] = []
    let lastHypothesisWords: string[] = []
    let aborted = false

    const emitDelta = (delta: string) => {
      const deltaWords = splitWords(normalizeTranscript(delta))
      if (deltaWords.length === 0)
        return

      const existingWords = splitWords(fullText)
      const overlap = commonSuffixPrefixOverlap(existingWords, deltaWords)
      const uniqueWords = deltaWords.slice(overlap)
      if (uniqueWords.length === 0)
        return

      const normalized = uniqueWords.join(' ')

      fullText = fullText ? `${fullText} ${normalized}`.trim() : normalized
      fullStreamCtrl?.enqueue({
        type: 'transcript.text.delta',
        delta: normalized,
      })
      textStreamCtrl?.enqueue(normalized)
    }

    const commitStableTranscript = (transcript: string, force = false) => {
      const nextWords = splitWords(transcript)
      if (nextWords.length === 0)
        return

      const stableLength = force
        ? nextWords.length
        : commonPrefixLength(lastHypothesisWords, nextWords)

      const stableDeltaLength = stableLength - committedWords.length

      if (stableLength > committedWords.length && (force || stableDeltaLength >= 2)) {
        const deltaWords = nextWords.slice(committedWords.length, stableLength)
        emitDelta(deltaWords.join(' '))
        committedWords = nextWords.slice(0, stableLength)
      }

      lastHypothesisWords = nextWords
    }

    const flushTranscript = async (force = false) => {
      if (bufferedSamples === 0)
        return

      if (!force && samplesSinceLastTranscription < transcribeEverySamples)
        return

      const merged = joinFloat32Chunks(bufferedChunks)
      const start = Math.max(0, merged.length - maxWindowSamples)
      const windowed = merged.subarray(start)
      const wav = toWav(cloneFloat32(windowed).buffer, sampleRate)
      const blob = new Blob([wav], { type: 'audio/wav' })
      const transcript = normalizeTranscript(await transcribeWithBrowserLocalWhisper(blob, options.language))

      if (transcript) {
        commitStableTranscript(transcript, force)
      }

      const retainStart = Math.max(0, merged.length - retainedHistorySamples)
      bufferedChunks = [merged.subarray(retainStart)]
      bufferedSamples = bufferedChunks[0].length
      samplesSinceLastTranscription = 0
    }

    const finish = async () => {
      try {
        await flushTranscript(true)
        if (lastHypothesisWords.length > committedWords.length) {
          emitDelta(lastHypothesisWords.slice(committedWords.length).join(' '))
          committedWords = [...lastHypothesisWords]
        }
        if (!aborted) {
          fullStreamCtrl?.enqueue({
            type: 'transcript.text.done',
            delta: '',
          })
          fullStreamCtrl?.close()
          textStreamCtrl?.close()
          deferredText.resolve(fullText)
        }
      }
      catch (error) {
        fullStreamCtrl?.error(error)
        textStreamCtrl?.error(error)
        deferredText.reject(error)
      }
    }

    const abortHandler = async () => {
      aborted = true
      await reader.cancel(options.abortSignal?.reason)
      const error = options.abortSignal?.reason ?? new DOMException('Aborted', 'AbortError')
      fullStreamCtrl?.error(error)
      textStreamCtrl?.error(error)
      deferredText.reject(error)
    }

    options.abortSignal?.addEventListener('abort', abortHandler, { once: true })

    try {
      while (true) {
        if (options.abortSignal?.aborted) {
          return
        }

        const { done, value } = await reader.read()
        if (done)
          break
        if (!value)
          continue

        const chunk = int16ChunkToFloat32(value)
        bufferedChunks.push(chunk)
        bufferedSamples += chunk.length
        samplesSinceLastTranscription += chunk.length

        if (samplesSinceLastTranscription >= transcribeEverySamples) {
          await flushTranscript()
        }
      }

      await finish()
    }
    catch (error) {
      fullStreamCtrl?.error(error)
      textStreamCtrl?.error(error)
      deferredText.reject(error)
    }
    finally {
      options.abortSignal?.removeEventListener('abort', abortHandler)
      reader.releaseLock()
    }
  })()

  return {
    fullStream,
    text: deferredText.promise,
    textStream,
  }
}
