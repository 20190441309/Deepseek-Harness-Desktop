import type { ReactNode } from 'react'
import { IconAgentPresetOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { listSessionAgents } from './agents.ts'
import { NS } from './locales.ts'
import css from './AgentsPanel.module.css'

export type AgentsPanelProps =
  & PropsRuntime<'surfaces.agents'>
  & PropsLocale<typeof NS>

/**
 * Current-session subagent occupant of `surfaces.agents`. Reads the existing
 * session snapshot; it does not dispatch or spawn agents.
 * @param props - session-maybe seats and copy.
 * @returns the agents surface.
 */
export function AgentsPanel({ sessionId, useSessions, t }: AgentsPanelProps): ReactNode {
  const agents = useSessions(state => listSessionAgents(state, sessionId))

  return (
    <div className={css.root} data-agents-panel>
      <div className={css.header} data-surface-subheader>
        <h3 className={css.title}>{t('title')}</h3>
      </div>
      <div className={css.body}>
        {agents.length === 0 ? (
          <div className={css.empty} data-agents-empty>
            <IconAgentPresetOutline16 size={20} />
            <p className={css.emptyTitle}>{t('empty.title')}</p>
            <p className={css.emptyBody}>{t('empty.body')}</p>
          </div>
        ) : (
          <ul className={css.list} aria-label={t('list.aria')}>
            {agents.map(agent => (
              <li key={agent.id} className={css.row} data-agent-id={agent.id}>
                <StateDot state={agent.activity === 'running' ? 'ongoing' : 'done'} />
                <span className={css.label}>{agent.label}</span>
                <span className={css.meta}>
                  {t(agent.activity === 'running' ? 'activity.running' : 'activity.inactive')}
                  {agent.mode === 'one-shot' ? ` · ${t('mode.oneShot')}` : null}
                  {agent.mode === 'continuable' ? ` · ${t('mode.continuable')}` : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
