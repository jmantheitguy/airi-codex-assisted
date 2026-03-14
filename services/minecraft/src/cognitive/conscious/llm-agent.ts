import type { Message } from '@xsai/shared-chat'

import { generateText } from '@xsai/generate-text'

export interface LLMConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface LLMCallOptions {
  messages: Message[]
  responseFormat?: { type: 'json_object' }
  reasoning?: { effort: 'low' | 'medium' | 'high' }
  abortSignal?: AbortSignal
  timeoutMs?: number
}

export interface LLMResult {
  text: string
  reasoning?: string
  // FIXME unsafe type
  usage: any
}

/**
 * Lightweight LLM agent for text generation using xsai
 */
export class LLMAgent {
  constructor(private config: LLMConfig) { }

  private isCerebrasBaseURL(baseURL: string): boolean {
    const normalized = baseURL.toLowerCase()
    return normalized.includes('cerebras.ai') || normalized.includes('cerebras.com')
  }

  private isOllamaBaseURL(baseURL: string): boolean {
    const normalized = baseURL.toLowerCase()
    return normalized.includes('localhost:11434')
      || normalized.includes('127.0.0.1:11434')
      || normalized.includes('ollama')
  }

  private isReasoningUnsupportedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    const normalized = message.toLowerCase()
    return normalized.includes('does not support thinking')
      || normalized.includes('does not support reasoning')
      || normalized.includes('reasoning is not supported')
  }

  private extractMessageText(content: unknown): string {
    if (typeof content === 'string')
      return content.trim()

    if (!Array.isArray(content))
      return ''

    return content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (!part || typeof part !== 'object')
          return ''

        const typedPart = part as { type?: unknown, text?: unknown }
        if (typedPart.type === 'text' && typeof typedPart.text === 'string')
          return typedPart.text

        return ''
      })
      .join('')
      .trim()
  }

  private extractResponseText(response: unknown): string {
    const typedResponse = response as {
      text?: unknown
      messages?: Array<{ role?: unknown, content?: unknown }>
    }

    if (typeof typedResponse.text === 'string' && typedResponse.text.trim().length > 0)
      return typedResponse.text.trim()

    const messages = Array.isArray(typedResponse.messages) ? typedResponse.messages : []
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message?.role !== 'assistant')
        continue

      const messageText = this.extractMessageText(message.content)
      if (messageText.length > 0)
        return messageText
    }

    return ''
  }

  private createLinkedAbortController(parentSignal?: AbortSignal): {
    controller: AbortController
    dispose: () => void
  } {
    const controller = new AbortController()
    if (!parentSignal) {
      return {
        controller,
        dispose: () => {},
      }
    }

    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason)
      return {
        controller,
        dispose: () => {},
      }
    }

    const onAbort = () => {
      controller.abort(parentSignal.reason)
    }
    parentSignal.addEventListener('abort', onAbort, { once: true })
    return {
      controller,
      dispose: () => parentSignal.removeEventListener('abort', onAbort),
    }
  }

  private async generate(
    options: LLMCallOptions,
    abortSignal: AbortSignal,
    includeReasoning: boolean,
  ): Promise<LLMResult> {
    const response = await generateText({
      baseURL: this.config.baseURL,
      apiKey: this.config.apiKey,
      model: this.config.model,
      messages: options.messages,
      headers: { 'Accept-Encoding': 'identity' },
      abortSignal,
      ...(options.responseFormat && { responseFormat: options.responseFormat }),
      ...(includeReasoning && {
        // Enable reasoning with configurable effort (default: low).
        reasoning: options.reasoning ?? { effort: 'low' },
      }),
    } as Parameters<typeof generateText>[0])

    const extractedText = this.extractResponseText(response)
    const reasoning = typeof (response as any).reasoningText === 'string'
      ? (response as any).reasoningText.trim()
      : undefined

    return {
      text: extractedText || (this.isOllamaBaseURL(this.config.baseURL) ? reasoning ?? '' : ''),
      reasoning,
      usage: response.usage,
    }
  }

  /**
   * Call LLM with the given messages
   */
  async callLLM(options: LLMCallOptions): Promise<LLMResult> {
    const shouldSendReasoning = !this.isCerebrasBaseURL(this.config.baseURL)
      && !this.isOllamaBaseURL(this.config.baseURL)
    const { controller, dispose } = this.createLinkedAbortController(options.abortSignal)
    const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.floor(options.timeoutMs)
      : null
    const timeoutError = timeoutMs
      ? Object.assign(new Error(`LLM provider call timeout after ${timeoutMs}ms`), { name: 'TimeoutError' })
      : null
    const timeoutHandle = timeoutMs
      ? setTimeout(() => {
          if (!controller.signal.aborted)
            controller.abort(timeoutError)
        }, timeoutMs)
      : undefined

    try {
      try {
        return await this.generate(options, controller.signal, shouldSendReasoning)
      }
      catch (error) {
        if (!shouldSendReasoning || this.isReasoningUnsupportedError(error))
          return await this.generate(options, controller.signal, false)

        throw error
      }
    }
    finally {
      if (timeoutHandle)
        clearTimeout(timeoutHandle)
      dispose()
    }
  }
}
