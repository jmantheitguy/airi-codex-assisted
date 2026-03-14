import type {
  ModelOutput,
  PreTrainedModel,
  PreTrainedTokenizer,
  Processor,
  ProgressCallback,
  Tensor,
} from '@huggingface/transformers'

import {
  AutoProcessor,
  AutoTokenizer,
  full,
  TextStreamer,
  WhisperForConditionalGeneration,
} from '@huggingface/transformers'

const MAX_NEW_TOKENS = 64
const MODEL_ID = 'onnx-community/whisper-base'

class AutomaticSpeechRecognitionPipeline {
  static model_id: string | null = null
  static tokenizer: Promise<PreTrainedTokenizer>
  static processor: Promise<Processor>
  static model: Promise<PreTrainedModel>

  static async getInstance(progress_callback?: ProgressCallback) {
    this.model_id = MODEL_ID

    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.model ??= WhisperForConditionalGeneration.from_pretrained(this.model_id, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback,
    })

    return Promise.all([this.tokenizer, this.processor, this.model])
  }
}

async function base64ToFeatures(base64Audio: string): Promise<Float32Array> {
  const binaryString = atob(base64Audio)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const view = new DataView(bytes.buffer)
  const audioFormat = view.getUint16(20, true)
  const channelCount = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)
  const dataSize = view.getUint32(40, true)
  const dataOffset = 44

  let decoded: Float32Array

  if (audioFormat === 3 && bitsPerSample === 32) {
    decoded = new Float32Array(bytes.buffer.slice(dataOffset, dataOffset + dataSize))
  }
  else if (audioFormat === 1 && bitsPerSample === 16) {
    const samples = new Int16Array(bytes.buffer.slice(dataOffset, dataOffset + dataSize))
    decoded = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      decoded[i] = samples[i] / 32768.0
    }
  }
  else if (audioFormat === 1 && bitsPerSample === 32) {
    decoded = new Float32Array(dataSize / 4)
    for (let i = 0; i < decoded.length; i++) {
      decoded[i] = view.getInt32(dataOffset + i * 4, true) / 2147483648
    }
  }
  else {
    throw new Error(`Unsupported WAV format: audioFormat=${audioFormat}, bitsPerSample=${bitsPerSample}`)
  }

  const mono = downmixToMono(decoded, Math.max(1, channelCount))
  return resampleTo16k(mono, sampleRate)
}

function downmixToMono(audio: Float32Array, channelCount: number) {
  if (channelCount <= 1) {
    return audio
  }

  const frameCount = Math.floor(audio.length / channelCount)
  const mono = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0
    for (let channel = 0; channel < channelCount; channel++) {
      sum += audio[frame * channelCount + channel] ?? 0
    }
    mono[frame] = sum / channelCount
  }

  return mono
}

function resampleTo16k(audio: Float32Array, sampleRate: number) {
  const targetSampleRate = 16000
  if (!sampleRate || sampleRate === targetSampleRate) {
    return audio
  }

  const ratio = sampleRate / targetSampleRate
  const outputLength = Math.max(1, Math.round(audio.length / ratio))
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const nextIndex = Math.min(index + 1, audio.length - 1)
    const fraction = position - index
    const current = audio[index] ?? 0
    const next = audio[nextIndex] ?? current
    output[i] = current + (next - current) * fraction
  }

  return output
}

let processing = false
async function generate({ audio, language }: { audio: string, language: string }) {
  if (processing)
    return
  processing = true

  try {
    globalThis.postMessage({ status: 'start' })

    const audioData = await base64ToFeatures(audio)
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance()

    let startTime: number | undefined
    let numTokens = 0
    const callback_function = (output: ModelOutput | Tensor) => {
      startTime ??= performance.now()

      let tps
      if (numTokens++ > 0) {
        tps = numTokens / (performance.now() - startTime) * 1000
      }

      globalThis.postMessage({
        status: 'update',
        output,
        tps,
        numTokens,
      })
    }

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      decode_kwargs: {
        skip_special_tokens: true,
      },
      callback_function,
    })

    const inputs = await processor(audioData)
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TOKENS,
      language,
      streamer,
    })

    const outputText = tokenizer.batch_decode(outputs as Tensor, { skip_special_tokens: true })
    globalThis.postMessage({
      status: 'complete',
      output: outputText,
    })
  }
  finally {
    processing = false
  }
}

async function load() {
  globalThis.postMessage({
    status: 'loading',
    data: 'Loading model...',
  })

  const [_tokenizer, _processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance((x) => {
    globalThis.postMessage(x)
  })

  globalThis.postMessage({
    status: 'loading',
    data: 'Compiling shaders and warming up model...',
  })

  await model.generate({
    input_features: full([1, 80, 3000], 0.0),
    max_new_tokens: 1,
  } as Record<string, unknown>)

  globalThis.postMessage({ status: 'ready' })
}

globalThis.addEventListener('message', async (e) => {
  const { type, data } = e.data

  switch (type) {
    case 'load':
      await load()
      break

    case 'generate':
      await generate(data)
      break
  }
})
