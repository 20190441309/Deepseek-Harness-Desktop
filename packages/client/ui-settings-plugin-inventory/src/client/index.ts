/** Read-only Host plugin inventory registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { desktopShell } from './desktop-shell.ts'
import { MarketplaceSettingsTab, type MarketplaceSettingsTabInjected } from './MarketplaceSettingsTab.tsx'
import { PluginInventorySettingsTab, type PluginInventorySettingsTabInjected } from './PluginInventorySettingsTab.tsx'
import { seedInstallDraft as writeInstallDraft } from './seed-install-draft.ts'
import { en, zh, type PluginInventoryLocaleKey } from './locales.ts'

export type { PluginInventorySettingsTabInjected, PluginInventorySettingsTabProps } from './PluginInventorySettingsTab.tsx'
export type { MarketplaceSettingsTabInjected, MarketplaceSettingsTabProps } from './MarketplaceSettingsTab.tsx'
export type { PluginInventoryLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Read-only Host plugin inventory copy. */
    'settings.pluginInventory': PluginInventoryLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginInventory'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

/** Contribute the lazy inventory tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-inventory: dictionaries')

  const t = ctx.locale.bind(NS)
  const list: PluginInventorySettingsTabInjected['list'] = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): PluginInventorySettingsTabInjected => ({ list })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'all',
    order: 10,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginInventorySettingsTab))

  const shell = desktopShell()
  if (shell?.listMarketplace && shell.listInstalledPlugins && shell.installPlugin && shell.uninstallPlugin) {
    // Destructure after the guard so closures below keep the narrowed function types.
    const { listMarketplace, listInstalledPlugins, uninstallPlugin } = shell
    ctx.inject(['sessions', 'workspaces', 'conversation'], (scope: ClientContext) => {
      const draft = async (item: { repo: string; installSpec: string }): Promise<void> => {
        await writeInstallDraft(scope, item, t('marketInstallDraft'))
      }
      const market: MarketplaceSettingsTabInjected = {
        listMarketplace: options => listMarketplace(options),
        listInstalled: () => listInstalledPlugins(),
        seedInstallDraft: draft,
        uninstallPlugin: name => uninstallPlugin(name),
        openExternal: url => shell.openExternal?.(url) ?? Promise.resolve(false),
        saveGithubToken: async (token) => { await shell.saveConfig?.({ githubToken: token }) },
        hasGithubToken: async () => Boolean((await shell.getConfig?.())?.hasGithubToken),
        onProgress: handler => shell.onPluginProgress?.(handler) ?? (() => {}),
      }
      scope.slots.inject('settings.plugins.tab', () => scope.slots.register({
        name: 'settings.plugins.tab',
        id: 'marketplace',
        order: 5,
        label: () => t('marketTab'),
        locale: NS,
        inject: () => market,
      }, MarketplaceSettingsTab))
      if (shell.onSeedInstallDraft) {
        const subscribeSeed = shell.onSeedInstallDraft
        // The handler contract returns void; seed drafts fire-and-forget through it.
        scope.effect(() => subscribeSeed((item) => { void draft(item) }), 'ui-settings-plugin-inventory: seed-install-draft')
      }
    })
  }
}
