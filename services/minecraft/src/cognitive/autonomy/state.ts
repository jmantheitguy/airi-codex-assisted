import fs from 'node:fs'
import path from 'node:path'

import { cwd } from 'node:process'

export interface AutonomyHomeAnchor {
  x: number
  y: number
  z: number
  setAt: number
}

export interface PersistedAutonomyState {
  enabled: boolean
  ownerPlayerName: string | null
  homeAnchor: AutonomyHomeAnchor | null
  currentGoal: string | null
  currentGoalStartedAt: number | null
  lastAutonomyTurnAt: number | null
  lastAutonomyReason: string | null
}

const persistedAutonomyStatePath = path.resolve(cwd(), '.airi.minecraft-autonomy.json')

const defaultPersistedAutonomyState: PersistedAutonomyState = {
  enabled: true,
  ownerPlayerName: null,
  homeAnchor: null,
  currentGoal: null,
  currentGoalStartedAt: null,
  lastAutonomyTurnAt: null,
  lastAutonomyReason: null,
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidHomeAnchor(value: unknown): value is AutonomyHomeAnchor {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as Record<string, unknown>
  return isFiniteNumber(candidate.x)
    && isFiniteNumber(candidate.y)
    && isFiniteNumber(candidate.z)
    && isFiniteNumber(candidate.setAt)
}

function normalizePersistedAutonomyState(value: unknown): PersistedAutonomyState | null {
  if (!value || typeof value !== 'object')
    return null

  const candidate = value as Record<string, unknown>
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    ownerPlayerName: typeof candidate.ownerPlayerName === 'string' && candidate.ownerPlayerName.trim().length > 0
      ? candidate.ownerPlayerName.trim()
      : null,
    homeAnchor: isValidHomeAnchor(candidate.homeAnchor) ? candidate.homeAnchor : null,
    currentGoal: typeof candidate.currentGoal === 'string' && candidate.currentGoal.trim().length > 0
      ? candidate.currentGoal.trim()
      : null,
    currentGoalStartedAt: isFiniteNumber(candidate.currentGoalStartedAt) ? candidate.currentGoalStartedAt : null,
    lastAutonomyTurnAt: isFiniteNumber(candidate.lastAutonomyTurnAt) ? candidate.lastAutonomyTurnAt : null,
    lastAutonomyReason: typeof candidate.lastAutonomyReason === 'string' && candidate.lastAutonomyReason.trim().length > 0
      ? candidate.lastAutonomyReason.trim()
      : null,
  }
}

export function loadPersistedAutonomyStateSync(): PersistedAutonomyState {
  try {
    if (!fs.existsSync(persistedAutonomyStatePath))
      return { ...defaultPersistedAutonomyState }

    const raw = fs.readFileSync(persistedAutonomyStatePath, 'utf-8')
    const parsed = normalizePersistedAutonomyState(JSON.parse(raw))
    return parsed ?? { ...defaultPersistedAutonomyState }
  }
  catch {
    return { ...defaultPersistedAutonomyState }
  }
}

export async function savePersistedAutonomyState(state: PersistedAutonomyState): Promise<void> {
  await fs.promises.writeFile(
    persistedAutonomyStatePath,
    JSON.stringify(state, null, 2),
    'utf-8',
  )
}
