import type { MessageEvents } from '../../libs/workers/types'

let worker: Worker | null = null
let readyPromise: Promise<void> | null = null
let transcribeChain: Promise<string> = Promise.resolve('')

function sanitizeTranscript(text: string) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return ''
  }

  const artifact = normalized
    .replace(/[[\](){}]/g, '')
    .replace(/[.!?,:;"'`~_-]/g, '')
    .trim()
    .toLowerCase()

  if (['music', 'applause', 'laughter'].includes(artifact)) {
    return ''
  }

  return normalized
}

function getWorker() {
  worker ??= new Worker(new URL('../../libs/workers/worker.ts', import.meta.url), {
    type: 'module',
  })

  return worker
}

function resetWorker() {
  worker?.terminate()
  worker = null
  readyPromise = null
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read audio blob'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const [, base64 = ''] = result.split(',', 2)
      resolve(base64)
    }
    reader.readAsDataURL(blob)
  })
}

async function ensureReady() {
  if (readyPromise)
    return readyPromise

  readyPromise = new Promise<void>((resolve, reject) => {
    const activeWorker = getWorker()

    let onError: ((event: ErrorEvent) => void) | undefined
    const onMessage = (event: MessageEvent<MessageEvents>) => {
      if (event.data.status === 'ready') {
        activeWorker.removeEventListener('message', onMessage)
        activeWorker.removeEventListener('error', onError!)
        resolve()
      }
    }

    onError = (event: ErrorEvent) => {
      activeWorker.removeEventListener('message', onMessage!)
      activeWorker.removeEventListener('error', onError!)
      resetWorker()
      reject(event.error ?? new Error(event.message))
    }

    activeWorker.addEventListener('message', onMessage)
    activeWorker.addEventListener('error', onError)
    activeWorker.postMessage({ type: 'load' })
  })

  return readyPromise.catch((error) => {
    readyPromise = null
    throw error
  })
}

function normalizeLanguage(language?: string) {
  if (!language)
    return 'english'

  const normalized = language.toLowerCase()
  if (normalized.startsWith('en'))
    return 'english'
  if (normalized.startsWith('ja'))
    return 'japanese'
  if (normalized.startsWith('ko'))
    return 'korean'
  if (normalized.startsWith('zh'))
    return 'chinese'
  if (normalized.startsWith('fr'))
    return 'french'
  if (normalized.startsWith('de'))
    return 'german'
  if (normalized.startsWith('es'))
    return 'spanish'
  if (normalized.startsWith('pt'))
    return 'portuguese'
  if (normalized.startsWith('ru'))
    return 'russian'

  return normalized
}

async function transcribeOnce(blob: Blob, language?: string) {
  await ensureReady()

  const base64Audio = await readBlobAsBase64(blob)

  return await new Promise<string>((resolve, reject) => {
    const activeWorker = getWorker()

    let onError: ((event: ErrorEvent) => void) | undefined
    const onMessage = (event: MessageEvent<MessageEvents>) => {
      if (event.data.status === 'complete') {
        activeWorker.removeEventListener('message', onMessage)
        activeWorker.removeEventListener('error', onError!)
        resolve(sanitizeTranscript(event.data.output[0] ?? ''))
      }
    }

    onError = (event: ErrorEvent) => {
      activeWorker.removeEventListener('message', onMessage!)
      activeWorker.removeEventListener('error', onError!)
      resetWorker()
      reject(event.error ?? new Error(event.message))
    }

    activeWorker.addEventListener('message', onMessage)
    activeWorker.addEventListener('error', onError)
    activeWorker.postMessage({
      type: 'generate',
      data: {
        audio: base64Audio,
        language: normalizeLanguage(language),
      },
    })
  })
}

export async function transcribeWithBrowserLocalWhisper(blob: Blob, language?: string) {
  transcribeChain = transcribeChain
    .catch(() => '')
    .then(() => transcribeOnce(blob, language))

  return await transcribeChain
}
