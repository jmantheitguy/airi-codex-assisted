export type MemoryKind = 'short_term' | 'long_term'

export interface MemoryRecord {
  id: string
  kind: MemoryKind
  content: string
  summary: string
  source: string
  tags: string[]
  importance: number
  emotionalIntensity: number
  createdAt: number
  updatedAt: number
  lastAccessedAt: number
  accessCount: number
  reinforcementCount: number
  baseStrength: number
  decayModifier: number
}

export interface MemorySystemConfig {
  shortTermHalfLifeHours: number
  longTermHalfLifeDays: number
  promotionThreshold: number
  retentionFloor: number
  recencyBias: number
  importanceBias: number
  emotionalBias: number
  accessBias: number
  maxShortTermItems: number
  maxRecallResults: number
}

export interface CreateMemoryInput {
  id?: string
  kind?: MemoryKind
  content: string
  source?: string
  tags?: string[]
  importance?: number
  emotionalIntensity?: number
  createdAt?: number
  summary?: string
  baseStrength?: number
  decayModifier?: number
}

export interface MemoryRecallResult {
  memory: MemoryRecord
  score: number
  strength: number
  lexicalScore: number
}

export interface ConversationTurnMemoryInput {
  userMessage: string
  assistantMessage?: string
  userName?: string
  assistantName?: string
}

export const DEFAULT_MEMORY_SYSTEM_CONFIG: MemorySystemConfig = {
  shortTermHalfLifeHours: 12,
  longTermHalfLifeDays: 45,
  promotionThreshold: 0.72,
  retentionFloor: 0.12,
  recencyBias: 0.2,
  importanceBias: 0.15,
  emotionalBias: 0.12,
  accessBias: 0.08,
  maxShortTermItems: 24,
  maxRecallResults: 5,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function tokenize(text: string) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length > 1)
}

function uniqueTokens(text: string) {
  return [...new Set(tokenize(text))]
}

const MEMORY_STOP_WORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'do',
  'for',
  'from',
  'had',
  'has',
  'have',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'please',
  'so',
  'that',
  'the',
  'their',
  'them',
  'there',
  'they',
  'this',
  'to',
  'us',
  'was',
  'we',
  'were',
  'will',
  'with',
  'you',
  'your',
])

function createSummary(content: string) {
  const normalized = normalizeWhitespace(content)
  if (normalized.length <= 120) {
    return normalized
  }

  return `${normalized.slice(0, 117).trimEnd()}...`
}

function splitSentences(text: string) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
}

export function deriveMemoryTags(text: string, limit = 5) {
  return uniqueTokens(text)
    .filter(token => !MEMORY_STOP_WORDS.has(token))
    .slice(0, limit)
}

function lexicalOverlap(query: string, memory: MemoryRecord) {
  const queryTokens = uniqueTokens(query)
  if (!queryTokens.length) {
    return 0
  }

  const memoryTokens = new Set([
    ...uniqueTokens(memory.content),
    ...memory.tags.map(tag => tag.toLowerCase()),
    memory.source.toLowerCase(),
  ])

  let matches = 0
  for (const token of queryTokens) {
    if (memoryTokens.has(token)) {
      matches += 1
    }
  }

  return matches / queryTokens.length
}

function computeHalfLifeMs(memory: MemoryRecord, config: MemorySystemConfig) {
  const baseHalfLifeMs = memory.kind === 'short_term'
    ? config.shortTermHalfLifeHours * 60 * 60 * 1000
    : config.longTermHalfLifeDays * 24 * 60 * 60 * 1000

  const importanceFactor = 1 + ((memory.importance - 5) / 5) * 0.35
  const emotionalFactor = 1 + (memory.emotionalIntensity / 10) * 0.3
  const reinforcementFactor = 1 + (memory.reinforcementCount * 0.18)
  const accessFactor = 1 + (Math.max(memory.accessCount - 1, 0) * config.accessBias)
  const stabilityFactor = importanceFactor * emotionalFactor * reinforcementFactor * accessFactor

  return Math.max(baseHalfLifeMs * stabilityFactor * memory.decayModifier, 1)
}

export function scoreMemoryStrength(memory: MemoryRecord, config: MemorySystemConfig, now = Date.now()) {
  const elapsedMs = Math.max(now - memory.updatedAt, 0)
  const halfLifeMs = computeHalfLifeMs(memory, config)
  const decay = Math.exp((-Math.log(2) * elapsedMs) / halfLifeMs)
  const decayedStrength = memory.baseStrength * decay

  if (memory.kind === 'long_term') {
    return clamp(Math.max(config.retentionFloor, decayedStrength), 0, 1)
  }

  return clamp(decayedStrength, 0, 1)
}

export function createMemoryRecord(input: CreateMemoryInput, now = Date.now()): MemoryRecord {
  const content = normalizeWhitespace(input.content)
  const importance = clamp(input.importance ?? 5, 1, 10)
  const emotionalIntensity = clamp(input.emotionalIntensity ?? 3, 0, 10)

  return {
    id: input.id ?? `memory-${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind ?? 'short_term',
    content,
    summary: input.summary ? normalizeWhitespace(input.summary) : createSummary(content),
    source: normalizeWhitespace(input.source ?? 'manual'),
    tags: (input.tags ?? []).map(tag => normalizeWhitespace(tag)).filter(Boolean),
    importance,
    emotionalIntensity,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    lastAccessedAt: now,
    accessCount: 1,
    reinforcementCount: 0,
    baseStrength: clamp(input.baseStrength ?? 0.52 + (importance / 20), 0.2, 1),
    decayModifier: clamp(input.decayModifier ?? 1, 0.5, 2),
  }
}

function scoreUserSentence(sentence: string) {
  const normalized = sentence.toLowerCase()
  const preferencePattern = /\b(?:i (?:like|love|hate|prefer|want|need|usually|always|never|use|work|live)|my name is|call me|remember that|please remember)\b/
  const durablePattern = /\b(?:prefer|always|never|important|goal|deadline|working on|building|implementing)\b/

  let importance = 5
  let emotionalIntensity = 3

  if (preferencePattern.test(normalized)) {
    importance += 3
    emotionalIntensity += 2
  }

  if (durablePattern.test(normalized)) {
    importance += 1
  }

  return {
    importance: clamp(importance, 1, 10),
    emotionalIntensity: clamp(emotionalIntensity, 0, 10),
  }
}

function scoreAssistantSentence(sentence: string) {
  const normalized = sentence.toLowerCase()
  const commitmentPattern = /\b(?:i will|i can|we should|next step|i added|i implemented|i changed|i found|remember)\b/

  let importance = 4
  const emotionalIntensity = 2

  if (commitmentPattern.test(normalized)) {
    importance += 2
  }

  return {
    importance: clamp(importance, 1, 10),
    emotionalIntensity: clamp(emotionalIntensity, 0, 10),
  }
}

export function extractConversationMemoriesFromTurn(input: ConversationTurnMemoryInput): CreateMemoryInput[] {
  const userSentences = splitSentences(input.userMessage)
    .filter(sentence => sentence.length >= 24)
    .slice(0, 2)
  const assistantSentences = splitSentences(input.assistantMessage ?? '')
    .filter(sentence => sentence.length >= 32)
    .slice(0, 1)

  const memories: CreateMemoryInput[] = []

  for (const sentence of userSentences) {
    const scoring = scoreUserSentence(sentence)
    memories.push({
      kind: 'short_term',
      content: sentence,
      source: input.userName ? `conversation:${input.userName}` : 'conversation:user',
      tags: deriveMemoryTags(sentence),
      importance: scoring.importance,
      emotionalIntensity: scoring.emotionalIntensity,
    })
  }

  for (const sentence of assistantSentences) {
    const scoring = scoreAssistantSentence(sentence)
    memories.push({
      kind: 'short_term',
      content: sentence,
      source: input.assistantName ? `conversation:${input.assistantName}` : 'conversation:assistant',
      tags: deriveMemoryTags(sentence),
      importance: scoring.importance,
      emotionalIntensity: scoring.emotionalIntensity,
    })
  }

  return memories
}

export function reinforceMemory(memory: MemoryRecord, now = Date.now(), amount = 0.16): MemoryRecord {
  return {
    ...memory,
    lastAccessedAt: now,
    updatedAt: now,
    accessCount: memory.accessCount + 1,
    reinforcementCount: memory.reinforcementCount + 1,
    baseStrength: clamp(memory.baseStrength + amount, 0, 1),
  }
}

export function shouldPromoteMemory(memory: MemoryRecord, config: MemorySystemConfig, now = Date.now()) {
  if (memory.kind !== 'short_term') {
    return false
  }

  const strength = scoreMemoryStrength(memory, config, now)
  return strength >= config.promotionThreshold
    && (memory.importance >= 7 || memory.reinforcementCount >= 1 || memory.accessCount >= 3)
}

export function maintainMemories(memories: MemoryRecord[], config: MemorySystemConfig, now = Date.now()) {
  const next = memories.map((memory) => {
    const strength = scoreMemoryStrength(memory, config, now)

    if (shouldPromoteMemory(memory, config, now)) {
      return {
        ...memory,
        kind: 'long_term' as const,
        updatedAt: now,
        baseStrength: clamp(Math.max(strength, config.promotionThreshold + 0.08), 0, 1),
      }
    }

    return memory
  })

  const kept = next.filter((memory) => {
    const strength = scoreMemoryStrength(memory, config, now)
    return memory.kind === 'long_term' || strength >= 0.05
  })

  const shortTerm = kept
    .filter(memory => memory.kind === 'short_term')
    .sort((left, right) => {
      const leftScore = scoreMemoryStrength(left, config, now) + left.importance / 20
      const rightScore = scoreMemoryStrength(right, config, now) + right.importance / 20
      return rightScore - leftScore
    })

  const limitedShortTermIds = new Set(shortTerm.slice(0, config.maxShortTermItems).map(memory => memory.id))

  return kept.filter(memory => memory.kind === 'long_term' || limitedShortTermIds.has(memory.id))
}

export function recallMemories(
  memories: MemoryRecord[],
  query: string,
  config: MemorySystemConfig,
  now = Date.now(),
  limit = config.maxRecallResults,
) {
  const trimmedQuery = normalizeWhitespace(query)

  return memories
    .map((memory): MemoryRecallResult => {
      const strength = scoreMemoryStrength(memory, config, now)
      const lexicalScore = trimmedQuery ? lexicalOverlap(trimmedQuery, memory) : 0
      const recencyScore = 1 / (1 + ((now - memory.lastAccessedAt) / (1000 * 60 * 60 * 24)))
      const score
        = (trimmedQuery ? lexicalScore * 0.55 : 0)
          + (strength * 0.25)
          + ((memory.importance / 10) * config.importanceBias)
          + ((memory.emotionalIntensity / 10) * config.emotionalBias)
          + (recencyScore * config.recencyBias)

      return {
        memory,
        score,
        strength,
        lexicalScore,
      }
    })
    .filter(result => trimmedQuery ? result.score > 0.1 : result.strength > 0.15)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

export function getMemoryMetrics(memories: MemoryRecord[], config: MemorySystemConfig, now = Date.now()) {
  const strengths = memories.map(memory => scoreMemoryStrength(memory, config, now))
  const averageStrength = strengths.length
    ? strengths.reduce((sum, value) => sum + value, 0) / strengths.length
    : 0

  return {
    total: memories.length,
    shortTerm: memories.filter(memory => memory.kind === 'short_term').length,
    longTerm: memories.filter(memory => memory.kind === 'long_term').length,
    averageStrength,
  }
}
