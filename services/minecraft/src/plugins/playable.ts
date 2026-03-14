import type { Mineflayer } from '../libs/mineflayer'
import type { MineflayerPlugin } from '../libs/mineflayer/plugin'

import {
  attackEntity,
  attackNearest,
  craftRecipe,
  equip,
  giveToPlayer,
  goToPlayer,
  goToPosition,
} from '../skills'
import { collectBlock } from '../skills/actions/collect-block'
import { useLogger } from '../utils/logger'

const HELP_LINES = [
  '#help',
  '#come [player]',
  '#follow [player] [distance]',
  '#unfollow',
  '#goto <x> <y> <z> [closeness]',
  '#stop',
  '#where',
  '#inventory',
  '#collect <block> [count]',
  '#craft <item> [count]',
  '#give <item> [count] [player]',
  '#equip <item>',
  '#attack <mob|player>',
]

function parseOptionalInt(value: string | undefined, fallback: number) {
  if (!value)
    return fallback

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseRequiredNumber(value: string | undefined, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    throw new Error(`Invalid ${field}: ${value ?? '(missing)'}`)
  return parsed
}

function formatInventory(mineflayer: Mineflayer) {
  const items = mineflayer.bot.inventory.items()
  if (items.length === 0)
    return 'Inventory empty.'

  return items
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 8)
    .map(item => `${item.count} ${item.name}`)
    .join(', ')
}

function setFollowTarget(mineflayer: Mineflayer, playerName: string, distance: number) {
  const reflexManager = (mineflayer as Mineflayer & {
    reflexManager?: {
      setFollowTarget?: (playerName: string, distance: number) => void
      clearFollowTarget?: () => void
    }
  }).reflexManager

  if (!reflexManager?.setFollowTarget)
    throw new Error('Follow runtime unavailable')

  reflexManager.setFollowTarget(playerName, distance)
}

function clearFollowTarget(mineflayer: Mineflayer) {
  const reflexManager = (mineflayer as Mineflayer & {
    reflexManager?: {
      clearFollowTarget?: () => void
    }
  }).reflexManager

  reflexManager?.clearFollowTarget?.()
}

function reply(mineflayer: Mineflayer, message: string) {
  mineflayer.bot.chat(message)
}

function registerAsyncCommand(
  mineflayer: Mineflayer,
  name: string,
  handler: (sender: string, args: string[]) => Promise<string | void>,
) {
  const logger = useLogger()

  mineflayer.onCommand(name, (ctx) => {
    const sender = ctx.command?.sender
    const args = ctx.command?.args ?? []
    if (!sender)
      return

    void handler(sender, args)
      .then((message) => {
        if (typeof message === 'string' && message.trim().length > 0)
          reply(mineflayer, message)
      })
      .catch((error) => {
        logger.errorWithError(`Command failed: #${name}`, error as Error)
        reply(mineflayer, `#${name} failed: ${(error as Error).message}`)
      })
  })
}

export function PlayableCommands(): MineflayerPlugin {
  const logger = useLogger()

  return {
    created(mineflayer) {
      let announcedReady = false

      mineflayer.bot.once('spawn', () => {
        if (announcedReady)
          return
        announcedReady = true
        reply(mineflayer, 'AIRI is ready. Use #help for commands.')
      })

      registerAsyncCommand(mineflayer, 'help', async () => `Commands: ${HELP_LINES.join(' | ')}`)

      registerAsyncCommand(mineflayer, 'come', async (sender, args) => {
        const playerName = args[0] || sender
        clearFollowTarget(mineflayer)
        mineflayer.interrupt(`#come ${playerName}`)
        const result = await goToPlayer(mineflayer, playerName, 2)
        if (!result.ok)
          throw new Error(result.message)
        return `On my way complete. I am near ${playerName}.`
      })

      registerAsyncCommand(mineflayer, 'follow', async (sender, args) => {
        const playerName = args[0] || sender
        const distance = parseOptionalInt(args[1], 2)
        setFollowTarget(mineflayer, playerName, distance)
        return `Following ${playerName} at distance ${distance}.`
      })

      registerAsyncCommand(mineflayer, 'unfollow', async () => {
        clearFollowTarget(mineflayer)
        return 'Follow mode cleared.'
      })

      registerAsyncCommand(mineflayer, 'goto', async (_sender, args) => {
        const x = parseRequiredNumber(args[0], 'x')
        const y = parseRequiredNumber(args[1], 'y')
        const z = parseRequiredNumber(args[2], 'z')
        const closeness = parseOptionalInt(args[3], 1)

        clearFollowTarget(mineflayer)
        mineflayer.interrupt(`#goto ${x} ${y} ${z}`)
        const result = await goToPosition(mineflayer, x, y, z, closeness)
        if (!result.ok)
          throw new Error(result.message)
        return `Reached (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}).`
      })

      registerAsyncCommand(mineflayer, 'stop', async () => {
        clearFollowTarget(mineflayer)
        mineflayer.interrupt('#stop')
        return 'Stopped current action.'
      })

      registerAsyncCommand(mineflayer, 'where', async () => {
        const { x, y, z } = mineflayer.bot.entity.position
        return `Position: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`
      })

      registerAsyncCommand(mineflayer, 'inventory', async () => {
        return formatInventory(mineflayer)
      })

      registerAsyncCommand(mineflayer, 'collect', async (_sender, args) => {
        const blockType = args[0]
        if (!blockType)
          throw new Error('Usage: #collect <block> [count]')

        const count = parseOptionalInt(args[1], 1)
        clearFollowTarget(mineflayer)
        mineflayer.interrupt(`#collect ${blockType}`)
        const collected = await collectBlock(mineflayer, blockType, count)
        if (collected < 1)
          throw new Error(`No ${blockType} collected`)
        return `Collected ${collected} ${blockType}.`
      })

      registerAsyncCommand(mineflayer, 'craft', async (_sender, args) => {
        const itemName = args[0]
        if (!itemName)
          throw new Error('Usage: #craft <item> [count]')

        const count = parseOptionalInt(args[1], 1)
        clearFollowTarget(mineflayer)
        mineflayer.interrupt(`#craft ${itemName}`)
        await craftRecipe(mineflayer, itemName, count)
        return `Crafted ${itemName} x${count}.`
      })

      registerAsyncCommand(mineflayer, 'give', async (sender, args) => {
        const itemName = args[0]
        if (!itemName)
          throw new Error('Usage: #give <item> [count] [player]')

        const maybeCount = args[1]
        const count = maybeCount && /^\d+$/.test(maybeCount) ? parseOptionalInt(maybeCount, 1) : 1
        const playerName = maybeCount && /^\d+$/.test(maybeCount)
          ? (args[2] || sender)
          : (args[1] || sender)

        clearFollowTarget(mineflayer)
        mineflayer.interrupt(`#give ${itemName}`)
        await giveToPlayer(mineflayer, itemName, playerName, count)
        return `Gave ${count} ${itemName} to ${playerName}.`
      })

      registerAsyncCommand(mineflayer, 'equip', async (_sender, args) => {
        const itemName = args[0]
        if (!itemName)
          throw new Error('Usage: #equip <item>')

        mineflayer.interrupt(`#equip ${itemName}`)
        const equipped = await equip(mineflayer, itemName)
        if (!equipped)
          throw new Error(`Could not equip ${itemName}`)
        return `Equipped ${itemName}.`
      })

      registerAsyncCommand(mineflayer, 'attack', async (_sender, args) => {
        const target = args[0]
        if (!target)
          throw new Error('Usage: #attack <mob|player>')

        clearFollowTarget(mineflayer)
        mineflayer.interrupt(`#attack ${target}`)

        const playerEntity = mineflayer.bot.players[target]?.entity
        if (playerEntity) {
          await attackEntity(mineflayer, playerEntity, true)
          return `Attacked player ${target}.`
        }

        const attacked = await attackNearest(mineflayer, target, true)
        if (!attacked)
          throw new Error(`Could not find ${target} to attack`)
        return `Attacked nearest ${target}.`
      })

      logger.log('Playable command plugin loaded')
    },
  }
}
