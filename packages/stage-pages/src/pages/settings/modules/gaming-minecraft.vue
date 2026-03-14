<script setup lang="ts">
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useNumberString } from '../../../../../stage-ui/src/composables/use-number-string'
import { useMinecraftStore } from '../../../../../stage-ui/src/stores/modules/gaming-minecraft'

const { t } = useI18n()
const minecraftStore = useMinecraftStore()
const { enabled, serverAddress, serverPort, username, configured } = storeToRefs(minecraftStore)
const serverPortString = useNumberString(serverPort)

function saveSettings() {
  minecraftStore.saveSettings()
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div :class="['rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100']">
      <div :class="['mb-2 flex items-center gap-2 text-base font-semibold']">
        <div class="i-solar:sidebar-code-bold-duotone text-lg" />
        <div>Experimental Integration</div>
      </div>

      <p>
        Minecraft bot integration is still experimental. These settings only configure the app-side connection details.
      </p>

      <p :class="['mt-2 text-xs opacity-80']">
        Run the external bot service from <code>services/minecraft</code> separately.
      </p>
    </div>

    <div flex="~ col gap-6">
      <FieldCheckbox
        v-model="enabled"
        :label="t('settings.pages.modules.gaming-minecraft.enable')"
        :description="t('settings.pages.modules.gaming-minecraft.enable-description')"
      />

      <FieldInput
        v-model="serverAddress"
        :label="t('settings.pages.modules.gaming-minecraft.server-address')"
        :description="t('settings.pages.modules.gaming-minecraft.server-address-description')"
        :placeholder="t('settings.pages.modules.gaming-minecraft.server-address-placeholder')"
      />

      <FieldInput
        v-model="serverPortString"
        type="number"
        :min="1"
        :max="65535"
        :step="1"
        :label="t('settings.pages.modules.gaming-minecraft.server-port')"
        :description="t('settings.pages.modules.gaming-minecraft.server-port-description')"
      />

      <FieldInput
        v-model="username"
        :label="t('settings.pages.modules.gaming-minecraft.username')"
        :description="t('settings.pages.modules.gaming-minecraft.username-description')"
        :placeholder="t('settings.pages.modules.gaming-minecraft.username-placeholder')"
      />

      <div>
        <Button
          :label="t('settings.common.save')"
          variant="primary"
          @click="saveSettings"
        />
      </div>

      <div v-if="configured" :class="['rounded-lg bg-green-100 p-4 text-green-800 dark:bg-green-950/40 dark:text-green-200']">
        {{ t('settings.pages.modules.gaming-minecraft.configured') }}
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.gaming-minecraft.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
