import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createOpenAICompatibleValidators } from './openai-compatible'

const {
  generateTextMock,
  listModelsMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  listModelsMock: vi.fn(),
}))

vi.mock('@xsai/generate-text', () => ({
  generateText: generateTextMock,
}))

vi.mock('@xsai/model', () => ({
  listModels: listModelsMock,
}))

function getProviderValidators(options?: Parameters<typeof createOpenAICompatibleValidators>[0]) {
  const validators = createOpenAICompatibleValidators(options)

  return (validators?.validateProvider || []).map(create => create({
    t: (input: string) => input,
  } as any))
}

describe('createOpenAICompatibleValidators', () => {
  const config = {
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1/',
  }
  const provider = {
    model: () => ({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not probe chat completions with a synthetic fallback model', async () => {
    listModelsMock.mockResolvedValue([])

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: ['connectivity', 'chat_completions'],
    })

    const connectivityResult = await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)
    const chatResult = await chatValidator.validator(config, provider as any, undefined as any, undefined as any)

    expect(connectivityResult.valid).toBe(false)
    expect(connectivityResult.reason).toContain('No model available for validation.')
    expect(chatResult.valid).toBe(false)
    expect(chatResult.reason).toContain('No model available for validation.')
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('allows providers to skip chat probing when they do not expose model listing', async () => {
    listModelsMock.mockResolvedValue([])

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: ['connectivity', 'chat_completions'],
      allowValidationWithoutModel: true,
    })

    const connectivityResult = await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)
    const chatResult = await chatValidator.validator(config, provider as any, undefined as any, undefined as any)

    expect(connectivityResult.valid).toBe(true)
    expect(chatResult.valid).toBe(true)
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('uses an explicit validation model before probing model listing', async () => {
    generateTextMock.mockResolvedValue({ text: 'ok' })

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: ['connectivity', 'chat_completions'],
      validationModel: 'gpt-4o',
    })

    const validationCache = new Map<string, unknown>()
    const connectivityResult = await connectivityValidator.validator(config, provider as any, undefined as any, { validationCache } as any)
    const chatResult = await chatValidator.validator(config, provider as any, undefined as any, { validationCache } as any)

    expect(connectivityResult.valid).toBe(true)
    expect(chatResult.valid).toBe(true)
    expect(listModelsMock).not.toHaveBeenCalled()
    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o',
    }))
  })

  it('uses max_completion_tokens for GPT-5 validation models', async () => {
    generateTextMock.mockResolvedValue({ text: 'ok' })

    const [connectivityValidator] = getProviderValidators({
      checks: ['connectivity'],
      validationModel: 'gpt-5.5',
    })

    await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)

    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.5',
      max_completion_tokens: 1,
    }))
    expect(generateTextMock).toHaveBeenCalledWith(expect.not.objectContaining({
      max_tokens: expect.anything(),
    }))
  })
})
