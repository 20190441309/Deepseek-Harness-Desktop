import { createRequire } from 'node:module'
import { defineTool } from '@deepseek-ai/dsh-tools'

const { executeInstallDshPlugin, renderInstall } = createRequire(import.meta.url)('./install-dsh-plugin-client.js')

export const name = 'dsh-desktop-plugin-install'
export const inject = ['tools']

const DESCRIPTION = 'Install a DeepSeek Harness plugin into the desktop web profile from a github:owner/repo[#sha] spec. Prepare scripts run on this machine, outside the sandbox. Call only for the spec the user named. If needsAllowBuilds is true, ask the user, then retry with those allowBuilds keys. A successful install restarts the desktop app to load the plugin.'

function controlConfig() {
  const url = process.env.DSH_DESKTOP_INSTALL_URL
  const token = process.env.DSH_DESKTOP_INSTALL_TOKEN
  if (!url || !token) return null
  return { url, token }
}

/**
 * Register install_dsh_plugin when the desktop control endpoint is in the environment.
 * @param ctx - Host context with the tools registry.
 */
export function apply(ctx) {
  const control = controlConfig()
  if (control === null) return
  ctx.tools.register(defineTool({
    name: 'install_dsh_plugin',
    description: DESCRIPTION,
    parameters: {
      spec: {
        type: 'string',
        required: true,
        description: 'github:owner/repo or github:owner/repo#sha from the user request.',
      },
      allowBuilds: {
        type: 'array',
        items: { type: 'string' },
        description: 'pnpm allowBuilds keys after the user approved prepare scripts.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          needsAllowBuilds: { type: 'boolean', required: true },
          allowBuilds: { type: 'array', required: true, items: { type: 'string' } },
          spec: { type: 'string', required: true },
          error: { type: 'string', required: true },
          log: { type: 'string', required: true },
          restarting: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderInstall(value) }],
    },
    async execute(args) {
      return executeInstallDshPlugin(control, args.spec, args.allowBuilds ?? [])
    },
    presentCall: args => ({ card: 'generic', title: '安装插件', kind: 'other', rawInput: args.spec }),
  }))
}
