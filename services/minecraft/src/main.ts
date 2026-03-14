import type { Mineflayer } from './libs/mineflayer'

import process, { exit } from 'node:process'

import MineflayerArmorManager from 'mineflayer-armor-manager'

import { Client } from '@proj-airi/server-sdk'
import { loader as MineflayerAutoEat } from 'mineflayer-auto-eat'
import { plugin as MineflayerCollectBlock } from 'mineflayer-collectblock'
import { pathfinder as MineflayerPathfinder } from 'mineflayer-pathfinder'
import { plugin as MineflayerPVP } from 'mineflayer-pvp'
import { plugin as MineflayerTool } from 'mineflayer-tool'

import { CognitiveEngine } from './cognitive'
import { initBot, stopBot } from './composables/bot'
import { config, initEnv } from './composables/config'
import {
  applyPersistedMinecraftUiConfig,
  isPersistedMinecraftUiConfig,
  savePersistedMinecraftUiConfig,
} from './composables/ui-config'
import { DebugService } from './debug'
import { setupMineflayerViewer } from './debug/mineflayer-viewer'
import { setupToolExecutor } from './debug/tool-executor'
import { wrapPlugin } from './libs/mineflayer'
import { PlayableCommands } from './plugins/playable'
import { initLogger, useLogger } from './utils/logger'

let activeBot: Mineflayer | null = null
let runtimeTransition: Promise<void> = Promise.resolve()
let viewerStarted = false

function getBotConfig() {
  const { enabled: _enabled, ...botConfig } = config.bot
  return botConfig
}

async function startBotRuntime(airiClient: Client) {
  if (!config.bot.enabled || activeBot) {
    return
  }

  const { bot } = await initBot({
    botConfig: getBotConfig(),
    plugins: [
      wrapPlugin(MineflayerArmorManager),
      wrapPlugin(MineflayerAutoEat),
      wrapPlugin(MineflayerCollectBlock),
      wrapPlugin(MineflayerPathfinder),
      wrapPlugin(MineflayerPVP),
      wrapPlugin(MineflayerTool),
    ],
    reconnect: {
      enabled: true,
      maxRetries: 5,
    },
  })

  activeBot = bot

  if (config.debug.viewer && !viewerStarted) {
    setupMineflayerViewer(bot, { port: 3007, firstPerson: true })
    viewerStarted = true
  }

  await bot.loadPlugin(CognitiveEngine({ airiClient }))
  await bot.loadPlugin(PlayableCommands())
  setupToolExecutor(bot)

  useLogger().withFields({
    enabled: config.bot.enabled,
    host: config.bot.host,
    port: config.bot.port,
    username: config.bot.username,
  }).log('Minecraft bot runtime started')
}

async function stopBotRuntime() {
  if (!activeBot) {
    return
  }

  activeBot = null
  await stopBot()
  useLogger().log('Minecraft bot runtime stopped')
}

function queueRuntimeTransition(task: () => Promise<void>) {
  runtimeTransition = runtimeTransition.then(task, task)
  return runtimeTransition
}

async function applyUiConfiguration(airiClient: Client, nextConfig: unknown) {
  if (!isPersistedMinecraftUiConfig(nextConfig)) {
    useLogger().warn('Received invalid Minecraft configuration payload from AIRI UI')
    return
  }

  await savePersistedMinecraftUiConfig(nextConfig)

  const mergedConfig = applyPersistedMinecraftUiConfig(config, nextConfig)
  config.bot = mergedConfig.bot

  await queueRuntimeTransition(async () => {
    await stopBotRuntime()
    await startBotRuntime(airiClient)
  })
}

async function main() {
  initLogger()
  initEnv()

  if (config.debug.server || config.debug.viewer || config.debug.mcp) {
    useLogger().warn(
      [
        '==============================================================================',
        'SECURITY NOTICE:',
        'The MCP Server, Debug Server, and/or Prismarine Viewer endpoints are currently',
        'enabled. These endpoints are completely unauthenticated. Enabling these exposes',
        'your bot\'s internal state and capabilities to anyone who can reach the ports.',
        'This can lead to Remote Code Execution (RCE) and full compromise of the bot',
        'if exposed to the internet or untrusted local networks. Ensure they are not',
        'externally accessible.',
        '==============================================================================',
      ].join('\n'),
    )
  }

  if (config.debug.server) {
    DebugService.getInstance().start()
  }

  const airiClient = new Client({
    name: 'minecraft',
    url: config.airi.wsBaseUrl,
    possibleEvents: ['module:configure'],
  })

  airiClient.onEvent('module:configure', async (event) => {
    try {
      await applyUiConfiguration(airiClient, event.data.config)
    }
    catch (error) {
      useLogger().errorWithError('Failed to apply Minecraft configuration from AIRI UI', error as Error)
    }
  })

  void airiClient.connect().catch((error) => {
    useLogger().warn('Failed to connect to AIRI websocket server, continuing without live configurator sync.')
    useLogger().errorWithError('AIRI websocket connection error', error as Error)
  })
  await startBotRuntime(airiClient)

  process.on('SIGINT', () => {
    void queueRuntimeTransition(async () => {
      await stopBotRuntime()
      airiClient.close()
      exit(0)
    })
  })
}

main().catch((err: Error) => {
  useLogger().errorWithError('Fatal error', err)
  exit(1)
})
