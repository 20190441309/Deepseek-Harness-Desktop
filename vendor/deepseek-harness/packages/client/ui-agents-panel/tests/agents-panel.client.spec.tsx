// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { SessionId, SessionListState, SubagentCatalogSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { AgentsPanelProps } from '../src/client/AgentsPanel.tsx'
import { AgentsPanel } from '../src/client/AgentsPanel.tsx'
import { en } from '../src/client/locales.ts'

const t: AgentsPanelProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('agents must not read this hook') }) as never
const PARENT = 'session-parent' as SessionId
const CHILD = 'session-child' as SessionId

function sessionList(opts: {
  catalog?: SubagentCatalogSnapshot
  childInList?: boolean
}): SessionListState {
  return {
    ids: [PARENT],
    byId: {
      [PARENT]: {
        id: PARENT,
        displayTitle: 'root',
        running: true,
        blank: false,
        updatedAt: 1,
      },
      ...(opts.childInList === true
        ? {
            [CHILD]: {
              id: CHILD,
              displayTitle: 'writer',
              running: true,
              blank: false,
              updatedAt: 2,
              parentId: PARENT,
              origin: 'subagent' as const,
            },
          }
        : {}),
    },
    current: PARENT,
    phase: 'ready',
    subagentsByParent: opts.catalog === undefined ? {} : { [PARENT]: opts.catalog },
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function mount(state: SessionListState) {
  render(
    <AgentsPanel {...({
      sessionId: PARENT,
      useSession: neverHook,
      useSessions: (sel: (s: SessionListState) => unknown) => sel(state),
      useWorkspaces: neverHook,
      useProjection: neverHook,
      t,
    } as unknown as AgentsPanelProps)} />,
  )
}

afterEach(cleanup)

describe('AgentsPanel', () => {
  it('shows the empty state when the session has no subagents', () => {
    mount(sessionList({}))
    expect(screen.getByText('No agents yet')).toBeTruthy()
    expect(screen.getByText('When this session spawns subagents, they show up here.')).toBeTruthy()
    expect(screen.queryByText('writer')).toBeNull()
  })

  it('lists catalog children with label and activity', () => {
    mount(sessionList({
      catalog: {
        entries: [{
          kind: 'child',
          id: CHILD,
          activity: 'running',
          hasChildren: false,
          mode: 'continuable',
          label: 'writer',
        }],
        parentAvailable: true,
        state: 'ready',
        error: null,
      },
    }))
    expect(screen.getByText('writer')).toBeTruthy()
    expect(screen.getByText(/running/)).toBeTruthy()
    expect(screen.queryByText('No agents yet')).toBeNull()
  })

  it('lists byId children when the catalog is absent', () => {
    mount(sessionList({ childInList: true }))
    expect(screen.getByText('writer')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
  })
})
