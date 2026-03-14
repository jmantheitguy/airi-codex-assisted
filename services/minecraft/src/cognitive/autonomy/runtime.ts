import type { Logg } from '@guiiai/logg'

import type { Brain } from '../conscious/brain'
import type { ReflexManager } from '../reflex/reflex-manager'
import type { MineflayerWithAgents } from '../types'
import type { PersistedAutonomyState } from './state'

import { craftRecipe, goToPosition } from '../../skills'
import { collectBlock } from '../../skills/actions/collect-block'
import { gatherWood } from '../../skills/actions/gather-wood'
import { eat } from '../../skills/actions/inventory'
import { loadPersistedAutonomyStateSync, savePersistedAutonomyState } from './state'

const AUTONOMY_IDLE_CHECK_MS = 20_000
const AUTONOMY_NORMAL_COOLDOWN_MS = 45_000
const AUTONOMY_CRITICAL_COOLDOWN_MS = 15_000
const AUTONOMY_PLAYER_GRACE_MS = 30_000
const AUTONOMY_GOAL_STALE_MS = 8 * 60_000
const AUTONOMY_EXPLORE_RADIUS = 10

interface AutonomyDrive {
  goal: string
  reason: string
  urgency: 'normal' | 'high'
}

export class AutonomyRuntime {
  private state: PersistedAutonomyState = loadPersistedAutonomyStateSync()
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private persistChain: Promise<void> = Promise.resolve()
  private activeTask: Promise<boolean> | null = null

  constructor(
    private readonly deps: {
      logger: Logg
      brain: Brain
      reflexManager: ReflexManager
    },
  ) {}

  public init(bot: MineflayerWithAgents): void {
    this.syncStateIntoReflex()
    this.captureHomeAnchorIfNeeded(bot)

    if (this.intervalHandle)
      clearInterval(this.intervalHandle)

    this.intervalHandle = setInterval(() => {
      void this.tick(bot)
    }, AUTONOMY_IDLE_CHECK_MS)

    void this.tick(bot)
  }

  public destroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async tick(bot: MineflayerWithAgents): Promise<void> {
    if (!this.state.enabled)
      return

    if (this.activeTask)
      return

    this.captureHomeAnchorIfNeeded(bot)
    this.captureOwnerFromRecentSocialState()

    const snapshot = this.deps.reflexManager.getContextSnapshot()
    const debugSnapshot = this.deps.brain.getDebugSnapshot()
    if (debugSnapshot.paused || debugSnapshot.givenUp || debugSnapshot.isProcessing)
      return

    if (debugSnapshot.actionQueue.counts.total > 0)
      return

    if (snapshot.autonomy.followPlayer)
      return

    if (snapshot.social.lastMessageAt && Date.now() - snapshot.social.lastMessageAt < AUTONOMY_PLAYER_GRACE_MS)
      return

    const drive = this.selectDrive(bot, snapshot.self.health, snapshot.self.food)
    if (!drive)
      return

    if (!this.shouldScheduleAutonomyTurn(drive))
      return

    this.state.currentGoal = drive.goal
    if (!this.state.currentGoalStartedAt || this.isGoalStale()) {
      this.state.currentGoalStartedAt = Date.now()
    }
    this.state.lastAutonomyReason = drive.reason
    this.state.lastAutonomyTurnAt = Date.now()
    this.syncStateIntoReflex()
    this.persistSoon()

    const handledByFallback = await this.runFallbackTask(bot, drive)
    if (handledByFallback)
      return

    try {
      await this.deps.brain.injectDebugEvent({
        type: 'system_alert',
        payload: {
          source: 'autonomy',
          reason: drive.reason,
          urgency: drive.urgency,
          goal: drive.goal,
          homeAnchor: this.state.homeAnchor,
          ownerPlayerName: this.state.ownerPlayerName,
        },
        source: { type: 'system', id: 'autonomy' },
        timestamp: Date.now(),
      })
    }
    catch (error) {
      this.deps.logger.withError(error as Error).warn('AutonomyRuntime: failed to inject autonomy event')
    }
  }

  private async runFallbackTask(bot: MineflayerWithAgents, drive: AutonomyDrive): Promise<boolean> {
    const task = this.executeFallbackTask(bot, drive)
      .catch((error) => {
        this.deps.logger.withError(error as Error).warn(`AutonomyRuntime: fallback task failed for ${drive.reason}`)
        return false
      })
      .finally(() => {
        this.activeTask = null
      })

    this.activeTask = task
    return await task
  }

  private async executeFallbackTask(bot: MineflayerWithAgents, drive: AutonomyDrive): Promise<boolean> {
    switch (drive.reason) {
      case 'low_food':
        if (!bot.bot.inventory.items().some((item) => {
          const edibleItem = item as unknown as { foodPoints?: unknown }
          return typeof edibleItem.foodPoints === 'number' && edibleItem.foodPoints > 0
        })) {
          return false
        }
        bot.interrupt('[autonomy:fallback:eat]')
        await eat(bot)
        return true

      case 'needs_wood':
        bot.interrupt('[autonomy:fallback:wood]')
        return await gatherWood(bot, 4)

      case 'missing_crafting_table':
        bot.interrupt('[autonomy:fallback:crafting_table]')
        await craftRecipe(bot, 'crafting_table', 1)
        return true

      case 'missing_pickaxe':
        bot.interrupt('[autonomy:fallback:pickaxe]')
        await craftRecipe(bot, 'wooden_pickaxe', 1)
        return true

      case 'needs_cobblestone': {
        bot.interrupt('[autonomy:fallback:cobblestone]')
        const collected = await collectBlock(bot, 'stone', 8)
        return collected > 0
      }

      case 'upgrade_tools':
        bot.interrupt('[autonomy:fallback:stone_pickaxe]')
        await craftRecipe(bot, 'stone_pickaxe', 1)
        return true

      case 'establish_home':
      case 'idle_progression':
        return await this.exploreNearby(bot)

      default:
        return false
    }
  }

  private async exploreNearby(bot: MineflayerWithAgents): Promise<boolean> {
    const anchor = this.state.homeAnchor ?? {
      x: Math.round(bot.bot.entity.position.x),
      y: Math.round(bot.bot.entity.position.y),
      z: Math.round(bot.bot.entity.position.z),
    }

    const offsetX = Math.floor(Math.random() * ((AUTONOMY_EXPLORE_RADIUS * 2) + 1)) - AUTONOMY_EXPLORE_RADIUS
    const offsetZ = Math.floor(Math.random() * ((AUTONOMY_EXPLORE_RADIUS * 2) + 1)) - AUTONOMY_EXPLORE_RADIUS
    const targetX = anchor.x + offsetX
    const targetZ = anchor.z + offsetZ

    bot.interrupt('[autonomy:fallback:explore]')
    const result = await goToPosition(bot, targetX, anchor.y, targetZ, 2)
    return result.ok
  }

  private selectDrive(bot: MineflayerWithAgents, health: number, food: number): AutonomyDrive | null {
    const inventory = bot.bot.inventory.items()
    const names = new Set(inventory.map(item => item.name))
    const counts = inventory.reduce<Record<string, number>>((acc, item) => {
      acc[item.name] = (acc[item.name] ?? 0) + item.count
      return acc
    }, {})

    const hasAnyFood = inventory.some(item =>
      item.name.includes('bread')
      || item.name.includes('beef')
      || item.name.includes('porkchop')
      || item.name.includes('mutton')
      || item.name.includes('chicken')
      || item.name.includes('carrot')
      || item.name.includes('potato')
      || item.name.includes('apple'),
    )

    if (health <= 10) {
      return {
        goal: 'recover safely and avoid danger',
        reason: 'low_health',
        urgency: 'high',
      }
    }

    if (food <= 10) {
      return {
        goal: hasAnyFood ? 'eat available food and stabilize hunger' : 'find food and stabilize hunger',
        reason: 'low_food',
        urgency: 'high',
      }
    }

    if (!names.has('crafting_table') && ((counts.oak_log ?? 0) > 0 || (counts.oak_planks ?? 0) > 0 || (counts.birch_log ?? 0) > 0 || (counts.spruce_log ?? 0) > 0)) {
      return {
        goal: 'craft a crafting table for a basic workstation',
        reason: 'missing_crafting_table',
        urgency: 'normal',
      }
    }

    if (![...names].some(name => name.endsWith('_pickaxe'))) {
      if (![...names].some(name => name.endsWith('_log')) && ![...names].some(name => name.endsWith('_planks'))) {
        return {
          goal: 'gather wood for basic tools',
          reason: 'needs_wood',
          urgency: 'normal',
        }
      }

      return {
        goal: 'craft a basic pickaxe for progression',
        reason: 'missing_pickaxe',
        urgency: 'normal',
      }
    }

    if (!names.has('stone_pickaxe') && (counts.cobblestone ?? 0) < 8) {
      return {
        goal: 'collect cobblestone for stone tools',
        reason: 'needs_cobblestone',
        urgency: 'normal',
      }
    }

    if (!names.has('stone_pickaxe')) {
      return {
        goal: 'craft stone tools from collected cobblestone',
        reason: 'upgrade_tools',
        urgency: 'normal',
      }
    }

    return {
      goal: this.state.homeAnchor
        ? 'explore near home and gather useful basic resources'
        : 'survey the nearby area and establish a home base',
      reason: this.state.homeAnchor ? 'idle_progression' : 'establish_home',
      urgency: 'normal',
    }
  }

  private shouldScheduleAutonomyTurn(drive: AutonomyDrive): boolean {
    const cooldownMs = drive.urgency === 'high'
      ? AUTONOMY_CRITICAL_COOLDOWN_MS
      : AUTONOMY_NORMAL_COOLDOWN_MS

    if (!this.state.lastAutonomyTurnAt)
      return true

    if (this.isGoalStale())
      return true

    return Date.now() - this.state.lastAutonomyTurnAt >= cooldownMs
  }

  private isGoalStale(): boolean {
    return Boolean(this.state.currentGoalStartedAt && (Date.now() - this.state.currentGoalStartedAt >= AUTONOMY_GOAL_STALE_MS))
  }

  private captureHomeAnchorIfNeeded(bot: MineflayerWithAgents): void {
    if (this.state.homeAnchor || !bot.bot.entity?.position)
      return

    this.state.homeAnchor = {
      x: Math.round(bot.bot.entity.position.x),
      y: Math.round(bot.bot.entity.position.y),
      z: Math.round(bot.bot.entity.position.z),
      setAt: Date.now(),
    }
    this.syncStateIntoReflex()
    this.persistSoon()
  }

  private captureOwnerFromRecentSocialState(): void {
    const social = this.deps.reflexManager.getContextSnapshot().social
    if (!social.lastSpeaker || social.lastSpeaker === this.state.ownerPlayerName)
      return

    this.state.ownerPlayerName = social.lastSpeaker
    this.syncStateIntoReflex()
    this.persistSoon()
  }

  private syncStateIntoReflex(): void {
    this.deps.reflexManager.updateAutonomyState({
      enabled: this.state.enabled,
      ownerPlayerName: this.state.ownerPlayerName,
      homeAnchor: this.state.homeAnchor,
      currentGoal: this.state.currentGoal,
      currentGoalStartedAt: this.state.currentGoalStartedAt,
      lastAutonomyTurnAt: this.state.lastAutonomyTurnAt,
      lastAutonomyReason: this.state.lastAutonomyReason,
    })
  }

  private persistSoon(): void {
    this.persistChain = this.persistChain
      .then(async () => {
        await savePersistedAutonomyState(this.state)
      })
      .catch(() => {})
  }
}
