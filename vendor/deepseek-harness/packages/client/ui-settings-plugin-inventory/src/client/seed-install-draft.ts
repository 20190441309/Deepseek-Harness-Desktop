/** Open a blank session and prefill the composer with a marketplace install request. */

import type { ClientContext, SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'

/** Structural conversation face; this package must not value-import ui-conversation. */
interface ConversationDraftFace {
  input: {
    for: (actx: unknown) => {
      setDraft: (text: string) => void
    }
  }
}

/** Catalog fields the install draft needs. */
export interface InstallDraftItem {
  /** Repository name shown in the spoken request. */
  repo: string
  /** Exact github: spec the agent tool consumes. */
  installSpec: string
}

/**
 * Fill the locale template with the plugin repo and install spec.
 * @param template - `marketInstallDraft` copy with `{repo}` and `{spec}` placeholders.
 * @param item - marketplace row the operator picked.
 * @returns composer draft text.
 */
export function formatInstallDraft(template: string, item: InstallDraftItem): string {
  return template.replaceAll('{repo}', item.repo).replaceAll('{spec}', item.installSpec)
}

/**
 * Resolve the Workspace that should own a new install-draft session: the
 * current session's Workspace when it is accounted, otherwise the recency
 * projection.
 * @param ctx - client root context.
 * @returns a Workspace id, or undefined when none is registered.
 */
function targetWorkspaceId(ctx: ClientContext): WorkspaceId | undefined {
  const workspaces = ctx.workspaces.list.getSnapshot()
  const current = ctx.sessions.list.getSnapshot().current
  if (current !== undefined) {
    const owning = workspaces.items.find(item => item.sessionIds.includes(current))
    if (owning !== undefined) return owning.workspaceId
  }
  return workspaces.recentWorkspaceId
}

/**
 * Connect the workspace's reusable-or-new blank session (the sanctioned New
 * Session entry; the sessions contract deliberately exposes no create), open
 * it, and write the install draft. Does not submit.
 * @param ctx - client root context (sessions, workspaces, conversation).
 * @param item - marketplace row the operator picked.
 * @param template - localized `marketInstallDraft` string.
 * @returns the opened session id.
 */
export async function seedInstallDraft(
  ctx: ClientContext,
  item: InstallDraftItem,
  template: string,
): Promise<SessionId> {
  const workspaceId = targetWorkspaceId(ctx)
  if (workspaceId === undefined) {
    throw new Error('marketplace install draft: no workspace to open')
  }
  const sessionId = await ctx.workspaces.connectWorkspace(workspaceId)
  ctx.sessions.open(sessionId)
  const scope = ctx.sessions.scope(sessionId)
  if (scope === undefined) {
    throw new Error(`marketplace install draft: session scope unavailable: ${sessionId}`)
  }
  const conversation = ctx.get('conversation') as ConversationDraftFace | undefined
  if (conversation === undefined) {
    throw new Error('marketplace install draft: conversation unavailable')
  }
  conversation.input.for(scope).setDraft(formatInstallDraft(template, item))
  return sessionId
}
