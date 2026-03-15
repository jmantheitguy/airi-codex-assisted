import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'
import type { AiriCard } from './modules/airi-card'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { parse } from 'valibot'
import { ref } from 'vue'

import { client } from '../composables/api'
import { useLocalFirstRequest } from '../composables/use-local-first'
import { charactersRepo } from '../database/repos/characters.repo'
import { CharacterWithRelationsSchema } from '../types/character'
import { useAuthStore } from './auth'
import { useAiriCardStore } from './modules'

function buildLocalCharacter(userId: string, payload: CreateCharacterPayload) {
  const id = payload.character.id ?? nanoid()
  const now = new Date()

  return parse(CharacterWithRelationsSchema, {
    id,
    version: payload.character.version,
    coverUrl: payload.character.coverUrl,
    avatarUrl: undefined,
    characterAvatarUrl: undefined,
    coverBackgroundUrl: undefined,
    creatorRole: undefined,
    priceCredit: '0',
    likesCount: 0,
    bookmarksCount: 0,
    interactionsCount: 0,
    forksCount: 0,
    creatorId: userId,
    ownerId: userId,
    characterId: payload.character.characterId,
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    capabilities: payload.capabilities?.map(capability => ({
      id: nanoid(),
      characterId: id,
      type: capability.type,
      config: capability.config,
    })),
    avatarModels: payload.avatarModels?.map(model => ({
      id: nanoid(),
      characterId: id,
      name: model.name,
      type: model.type,
      description: model.description,
      config: model.config,
      createdAt: now,
      updatedAt: now,
    })),
    i18n: payload.i18n?.map(item => ({
      id: nanoid(),
      characterId: id,
      language: item.language,
      name: item.name,
      tagline: item.tagline,
      description: item.description,
      tags: item.tags,
      createdAt: now,
      updatedAt: now,
    })),
    prompts: payload.prompts?.map(prompt => ({
      id: nanoid(),
      characterId: id,
      language: prompt.language,
      type: prompt.type,
      content: prompt.content,
    })),
    likes: [],
    bookmarks: [],
  })
}

function buildAiriCardFromCharacter(character: Character): AiriCard {
  const primaryI18n = character.i18n?.find(item => item.language === 'en') || character.i18n?.[0]
  const systemPrompt = character.prompts?.find(prompt => prompt.type === 'system')?.content ?? ''
  const personality = character.prompts?.find(prompt => prompt.type === 'personality')?.content ?? ''
  const greetings = character.prompts
    ?.filter(prompt => prompt.type === 'greetings')
    .map(prompt => prompt.content)
    .filter(Boolean) ?? []

  const llmCapability = character.capabilities?.find(capability => capability.type === 'llm')
  const ttsCapability = character.capabilities?.find(capability => capability.type === 'tts')
  const vrmUrls = character.avatarModels
    ?.filter(model => model.type === 'vrm')
    .flatMap(model => model.config.vrm?.urls ?? []) ?? []
  const live2dUrls = character.avatarModels
    ?.filter(model => model.type === 'live2d')
    .flatMap(model => model.config.live2d?.urls ?? []) ?? []

  return {
    name: primaryI18n?.name ?? character.characterId,
    version: character.version,
    description: primaryI18n?.description ?? '',
    notes: primaryI18n?.tagline ?? '',
    personality,
    scenario: '',
    creator: character.creatorRole ?? character.creatorId,
    greetings,
    tags: primaryI18n?.tags ?? [],
    systemPrompt,
    postHistoryInstructions: '',
    messageExample: [],
    extensions: {
      airi: {
        modules: {
          consciousness: {
            provider: 'openai-compatible',
            model: llmCapability?.config.llm?.model ?? '',
          },
          speech: {
            provider: 'browser-local-audio-speech',
            model: '',
            voice_id: ttsCapability?.config.tts?.voiceId ?? '',
            pitch: ttsCapability?.config.tts?.pitch,
            rate: ttsCapability?.config.tts?.speed,
          },
          vrm: vrmUrls.length > 0 ? { source: 'url', url: vrmUrls[0] } : undefined,
          live2d: live2dUrls.length > 0 ? { source: 'url', url: live2dUrls[0] } : undefined,
        },
        agents: {},
      },
    },
  }
}

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())
  const auth = useAuthStore()
  const airiCardStore = useAiriCardStore()
  const activeCharacterId = useLocalStorageManualReset<string>('settings/characters/active-id', '')

  function syncActivatedCharacter() {
    if (!activeCharacterId.value)
      return

    const activeCharacter = characters.value.get(activeCharacterId.value)
    if (!activeCharacter)
      return

    const cardId = getActivationCardId(activeCharacter.id)
    airiCardStore.upsertCard(cardId, buildAiriCardFromCharacter(activeCharacter))
    airiCardStore.activeCardId = cardId
  }

  async function fetchList(all: boolean = false) {
    return useLocalFirstRequest({
      local: async () => {
        const cached = await charactersRepo.getAll()
        if (cached.length > 0) {
          characters.value.clear()
          for (const char of cached) {
            characters.value.set(char.id, char)
          }
          syncActivatedCharacter()
        }
      },
      remote: async () => {
        const res = await client.api.characters.$get({
          query: { all: String(all) },
        })
        if (!res.ok) {
          throw new Error('Failed to fetch characters')
        }
        const data = await res.json()

        characters.value.clear()
        const parsedData: Character[] = []
        for (const char of data) {
          const parsed = parse(CharacterWithRelationsSchema, char)
          characters.value.set(char.id, parsed)
          parsedData.push(parsed)
        }
        await charactersRepo.saveAll(parsedData)
        syncActivatedCharacter()
      },
    })
  }

  async function fetchById(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        const cached = characters.value.get(id) ?? (await charactersRepo.getAll()).find(char => char.id === id)
        if (cached) {
          characters.value.set(cached.id, cached)
          syncActivatedCharacter()
        }
        return cached
      },
      remote: async () => {
        const res = await client.api.characters[':id'].$get({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to fetch character')
        }
        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)

        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        syncActivatedCharacter()
        return character
      },
    })
  }

  async function create(payload: CreateCharacterPayload) {
    let localCharacter: Character
    return useLocalFirstRequest({
      local: async () => {
        localCharacter = buildLocalCharacter(auth.userId, payload)
        characters.value.set(localCharacter.id, localCharacter)
        await charactersRepo.upsert(localCharacter)
        return localCharacter
      },
      remote: async () => {
        const res = await client.api.characters.$post({
          json: payload,
        })
        if (!res.ok) {
          throw new Error('Failed to create character')
        }
        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)

        // Replace local temp character with remote data
        characters.value.delete(localCharacter.id)
        characters.value.set(character.id, character)
        await charactersRepo.remove(localCharacter.id)
        await charactersRepo.upsert(character)
        return character
      },
    })
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    return useLocalFirstRequest({
      local: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return
        }
        if (payload.character?.version !== undefined)
          character.version = payload.character.version
        if (payload.character?.coverUrl !== undefined)
          character.coverUrl = payload.character.coverUrl
        if (payload.character?.characterId !== undefined)
          character.characterId = payload.character.characterId
        if (payload.capabilities !== undefined) {
          character.capabilities = payload.capabilities.map(capability => ({
            id: nanoid(),
            characterId: id,
            type: capability.type,
            config: capability.config,
          }))
        }
        if (payload.avatarModels !== undefined) {
          const now = new Date()
          character.avatarModels = payload.avatarModels.map(model => ({
            id: nanoid(),
            characterId: id,
            name: model.name,
            type: model.type,
            description: model.description,
            config: model.config,
            createdAt: now,
            updatedAt: now,
          }))
        }
        if (payload.i18n !== undefined) {
          const now = new Date()
          character.i18n = payload.i18n.map(item => ({
            id: nanoid(),
            characterId: id,
            language: item.language,
            name: item.name,
            tagline: item.tagline,
            description: item.description,
            tags: item.tags,
            createdAt: now,
            updatedAt: now,
          }))
        }
        if (payload.prompts !== undefined) {
          character.prompts = payload.prompts.map(prompt => ({
            id: nanoid(),
            characterId: id,
            language: prompt.language,
            type: prompt.type,
            content: prompt.content,
          }))
        }
        character.updatedAt = new Date()
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        if (activeCharacterId.value === character.id)
          syncActivatedCharacter()
        return character
      },
      remote: async () => {
        const res = await (client.api.characters[':id'].$patch)({
          param: { id },
          // @ts-expect-error FIXME: hono client typing misses json option for this route
          json: payload,
        })
        if (!res.ok) {
          throw new Error('Failed to update character')
        }
        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)

        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        return character
      },
    })
  }

  function getActivationCardId(id: string) {
    return `character:${id}`
  }

  function activate(id: string) {
    const character = characters.value.get(id)
    if (!character)
      return false

    const cardId = getActivationCardId(id)
    airiCardStore.upsertCard(cardId, buildAiriCardFromCharacter(character))
    airiCardStore.activeCardId = cardId
    activeCharacterId.value = id
    return true
  }

  async function remove(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        characters.value.delete(id)
        await charactersRepo.remove(id)
        if (activeCharacterId.value === id) {
          activeCharacterId.value = ''
        }
      },
      remote: async () => {
        const res = await client.api.characters[':id'].$delete({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to remove character')
        }
        if (activeCharacterId.value === id) {
          activeCharacterId.value = ''
        }
      },
    })
  }

  async function like(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return
        }
        const likes = character.likes ?? []
        if (!likes.some(item => item.userId === auth.userId)) {
          likes.push({ userId: auth.userId, characterId: id })
          character.likes = likes
          character.likesCount += 1
          character.updatedAt = new Date()
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }
      },
      remote: async () => {
        const res = await client.api.characters[':id'].like.$post({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to like character')
        }

        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
      },
    })
  }

  async function bookmark(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return
        }
        const bookmarks = character.bookmarks ?? []
        if (!bookmarks.some(item => item.userId === auth.userId)) {
          bookmarks.push({ userId: auth.userId, characterId: id })
          character.bookmarks = bookmarks
          character.bookmarksCount += 1
          character.updatedAt = new Date()
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }
      },
      remote: async () => {
        const res = await client.api.characters[':id'].bookmark.$post({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to bookmark character')
        }

        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
      },
    })
  }

  function getCharacter(id: string) {
    return characters.value.get(id)
  }

  return {
    characters,

    fetchList,
    fetchById,
    create,
    update,
    remove,
    like,
    bookmark,
    activeCharacterId,
    activate,
    getCharacter,
  }
})
