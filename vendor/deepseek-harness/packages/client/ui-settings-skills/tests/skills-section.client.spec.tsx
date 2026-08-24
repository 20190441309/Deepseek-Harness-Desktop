// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { SkillInventoryDetail, SkillInventoryEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { SkillsSection } from '../src/client/SkillsSection.tsx'
import type { SkillsSectionInjected, SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import { en, type SkillsSettingsKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: SkillsSettingsKey): string => en[key])

const writableSkill = {
  name: 'demo-skill',
  description: 'Reviews a proposed change',
  whenToUse: 'Use before merging code',
  source: 'user-dsh',
  provider: 'filesystem',
  path: '/home/me/.dsh/skills/demo-skill/SKILL.md',
  directory: '/home/me/.dsh/skills/demo-skill',
  writable: true,
  modelInvocable: true,
  userInvocable: true,
} as const

const readOnlySkill = {
  name: 'shipped-skill',
  description: 'Bundled guidance',
  whenToUse: 'Use for shipped workflows',
  source: 'bundled',
  provider: 'filesystem',
  path: '/app/skills/shipped-skill/SKILL.md',
  directory: '/app/skills/shipped-skill',
  writable: false,
  modelInvocable: true,
  userInvocable: false,
} as const

function detail(skill: SkillInventoryEntry = writableSkill): SkillInventoryDetail {
  return {
    name: skill.name,
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    ...skill.group === undefined ? {} : { group: skill.group },
    source: skill.source,
    ...skill.path === undefined ? {} : { path: skill.path },
    writable: skill.writable,
    modelInvocable: skill.modelInvocable,
    userInvocable: skill.userInvocable,
    content: '# Instructions\n\nFollow every step carefully.',
  }
}

function sessionState(cwd?: string, rawId = 'session-1'): SessionListState {
  const id = rawId as SessionId
  return {
    ids: cwd === undefined ? [] : [id],
    byId: cwd === undefined ? {} : {
      [id]: { id, displayTitle: 'project', cwd, running: false, blank: false, updatedAt: 0 },
    },
    current: cwd === undefined ? undefined : id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function sessionHook(state: SessionListState): SkillsSectionProps['useSessions'] {
  return selector => selector(state)
}

type SkillsOverrides = Partial<SkillsSectionInjected> & Partial<Pick<SkillsSectionProps, 'useSessions'>>

function props(partial: SkillsOverrides = {}): SkillsSectionProps {
  return {
    t,
    useSessions: sessionHook(sessionState()),
    list: async () => ({ skills: [] }),
    get: async () => detail(),
    create: async () => {},
    update: async () => {},
    remove: async () => {},
    setInvocation: async () => {},
    openDirectory: async () => {},
    ...partial,
  } as SkillsSectionProps
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function renderCatalog(partial: SkillsOverrides = {}) {
  render(<SkillsSection {...props({
    list: async () => ({ skills: [writableSkill, readOnlySkill] }),
    get: async name => name === readOnlySkill.name ? detail(readOnlySkill) : detail(),
    ...partial,
  })} />)
  await screen.findByText(writableSkill.name)
}

function openDelete(name = writableSkill.name) {
  fireEvent.click(screen.getByRole('button', { name: `Delete ${name}` }))
}

describe('SkillsSection', () => {
  it('searches name, description, and when-to-use text and applies the source filter', async () => {
    await renderCatalog()

    const search = screen.getByRole('searchbox', { name: en.searchLabel })
    fireEvent.change(search, { target: { value: 'merging' } })
    expect(screen.getByText(writableSkill.name)).toBeTruthy()
    expect(screen.queryByText(readOnlySkill.name)).toBeNull()

    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: en.sourceFilter }))
    fireEvent.click(screen.getByRole('menuitem', { name: en.sourceBundled }))
    expect(screen.queryByText(writableSkill.name)).toBeNull()
    expect(screen.getByText(readOnlySkill.name)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.clearFilters }))
    expect(screen.getByText(writableSkill.name)).toBeTruthy()
    expect(screen.getByText(readOnlySkill.name)).toBeTruthy()
  })

  it('renders flat rows with a source Pill and a model-invocation Switch', async () => {
    await renderCatalog()

    expect(screen.getByText(en.resultCount.replace('{count}', '2'))).toBeTruthy()
    const writableRow = screen.getByText(writableSkill.name).closest('li')
    expect(writableRow).not.toBeNull()
    expect(within(writableRow!).getByText(en.sourceUser)).toBeTruthy()
    expect(within(writableRow!).getByRole('switch', { name: `Model invocation for ${writableSkill.name}` })).toBeTruthy()
    expect(within(writableRow!).getByRole('button', { name: `Delete ${writableSkill.name}` })).toBeTruthy()

    const readOnlyRow = screen.getByText(readOnlySkill.name).closest('li')
    expect(readOnlyRow).not.toBeNull()
    expect(within(readOnlyRow!).getByText(en.sourceBundled)).toBeTruthy()
    expect(within(readOnlyRow!).getByRole<HTMLInputElement>('switch', { name: `Model invocation for ${readOnlySkill.name}` }).disabled).toBe(true)
    expect(within(readOnlyRow!).queryByRole('button', { name: `Delete ${readOnlySkill.name}` })).toBeNull()
  })

  it('sections rows by group, ungrouped last, and keeps sections under search', async () => {
    const groupedA = { ...writableSkill, name: 'group-a', group: 'review' }
    const groupedB = { ...writableSkill, name: 'group-b', group: 'review' }
    const groupedC = { ...writableSkill, name: 'group-c', group: 'docs' }
    const plain: SkillInventoryEntry = {
      name: 'plain-skill',
      description: 'No group label',
      source: 'user-dsh',
      provider: 'filesystem',
      path: '/home/me/.dsh/skills/plain-skill/SKILL.md',
      directory: '/home/me/.dsh/skills/plain-skill',
      writable: true,
      modelInvocable: true,
      userInvocable: true,
    }
    render(<SkillsSection {...props({
      list: async () => ({ skills: [groupedA, plain, groupedB, groupedC] }),
      get: async () => detail(groupedA),
    })} />)
    await screen.findByText(groupedA.name)

    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.map(heading => heading.textContent)).toEqual(['review', 'docs', en.ungrouped])

    const reviewSection = headings[0]!.closest('section')
    expect(reviewSection).not.toBeNull()
    expect(within(reviewSection!).getByText(groupedA.name)).toBeTruthy()
    expect(within(reviewSection!).getByText(groupedB.name)).toBeTruthy()
    expect(within(reviewSection!).queryByText(groupedC.name)).toBeNull()
    expect(within(reviewSection!).queryByText(plain.name)).toBeNull()

    const ungroupedSection = headings[2]!.closest('section')
    expect(within(ungroupedSection!).getByText(plain.name)).toBeTruthy()

    const search = screen.getByRole('searchbox', { name: en.searchLabel })
    fireEvent.change(search, { target: { value: 'docs' } })
    expect(screen.getByText(groupedC.name)).toBeTruthy()
    expect(screen.queryByText(groupedA.name)).toBeNull()
    expect(screen.queryByText(plain.name)).toBeNull()
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['docs'])
  })

  it('shows a section header for a single group without ungrouped rows', async () => {
    const grouped = { ...writableSkill, name: 'lone-grouped', group: 'tooling' }
    render(<SkillsSection {...props({
      list: async () => ({ skills: [grouped] }),
      get: async () => detail(grouped),
    })} />)
    await screen.findByText(grouped.name)
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['tooling'])
  })

  it('opens the skill directory from the row and reports failures', async () => {
    const first = deferred<boolean>()
    const openDirectory = vi.fn(async () => { await first.promise })
    await renderCatalog({ openDirectory })

    const button = screen.getByRole('button', { name: `Open the directory containing ${writableSkill.name}` })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(openDirectory).toHaveBeenCalledTimes(1)
    expect(openDirectory).toHaveBeenCalledWith(writableSkill.directory)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: `Open the directory containing ${writableSkill.name}` }).disabled).toBe(true)
    first.resolve(true)
    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: `Open the directory containing ${writableSkill.name}` }).disabled).toBe(false)
    })

    openDirectory.mockImplementationOnce(async () => { throw new Error('file manager missing') })
    fireEvent.click(screen.getByRole('button', { name: `Open the directory containing ${writableSkill.name}` }))
    expect((await screen.findByRole('alert')).textContent).toContain('file manager missing')
  })

  it('hides the open-directory control for skills without a directory', async () => {
    const runtime: SkillInventoryEntry = {
      name: 'runtime-skill',
      description: 'In-memory guidance',
      source: 'runtime',
      provider: 'runtime',
      writable: false,
      modelInvocable: true,
      userInvocable: false,
    }
    render(<SkillsSection {...props({
      list: async () => ({ skills: [runtime] }),
      get: async () => detail(runtime),
    })} />)
    await screen.findByText(runtime.name)
    expect(screen.queryByRole('button', { name: `Open the directory containing ${runtime.name}` })).toBeNull()
  })

  it('opens the editor from a writable row and ignores a read-only row click', async () => {
    const get = vi.fn(async () => detail())
    await renderCatalog({ get })

    fireEvent.click(screen.getByText(writableSkill.name).closest('button')!)
    expect(await screen.findByRole('dialog', { name: en.editorTitleEdit })).toBeTruthy()
    expect(get).toHaveBeenCalledWith(writableSkill.name, {})

    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    fireEvent.click(screen.getByText(readOnlySkill.name).closest('button')!)
    expect(screen.queryByRole('dialog', { name: en.editorTitleEdit })).toBeNull()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('opens Edit when the same detail request was already started', async () => {
    const request = deferred<SkillInventoryDetail>()
    const get = vi.fn(() => request.promise)
    await renderCatalog({ get })

    fireEvent.click(screen.getByText(writableSkill.name).closest('button')!)
    fireEvent.click(screen.getByText(writableSkill.name).closest('button')!)
    expect(get).toHaveBeenCalledTimes(1)
    request.resolve(detail())

    expect(await screen.findByRole('dialog', { name: en.editorTitleEdit })).toBeTruthy()
  })

  it('updates the model-invocation Switch in place with pending and inline failure states', async () => {
    const first = deferred<boolean>()
    const setInvocation = vi.fn(async () => { await first.promise })
    await renderCatalog({ setInvocation })

    fireEvent.click(screen.getByRole('switch', { name: `Model invocation for ${writableSkill.name}` }))

    expect(setInvocation).toHaveBeenCalledWith(writableSkill.name, false, true, {})
    expect(screen.getByRole<HTMLInputElement>('switch', { name: `Model invocation for ${writableSkill.name}` }).disabled).toBe(true)
    first.resolve(true)
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('switch', { name: `Model invocation for ${writableSkill.name}` }).checked).toBe(false)
    })

    setInvocation.mockImplementationOnce(async () => { throw new Error('frontmatter is locked') })
    fireEvent.click(screen.getByRole('switch', { name: `Model invocation for ${writableSkill.name}` }))
    expect((await screen.findByRole('alert')).textContent).toContain('frontmatter is locked')
  })

  it('reloads for the active project and ignores a late response from the previous project', async () => {
    const first = deferred<{ skills: readonly typeof writableSkill[] }>()
    const projectSkill = { ...writableSkill, name: 'project-skill', source: 'project-dsh' as const }
    const list = vi.fn((scope: { cwd?: string }) => scope.cwd === '/work/one'
      ? first.promise
      : Promise.resolve({ skills: [projectSkill] }))
    const firstSessions = sessionHook(sessionState('/work/one'))
    const secondSessions = sessionHook(sessionState('/work/two'))
    const { rerender } = render(<SkillsSection {...props({ list, useSessions: firstSessions })} />)

    rerender(<SkillsSection {...props({ list, useSessions: secondSessions })} />)
    expect(await screen.findByText(projectSkill.name)).toBeTruthy()
    first.resolve({ skills: [writableSkill] })
    await waitFor(() => { expect(screen.queryByText(writableSkill.name)).toBeNull() })
    expect(list).toHaveBeenCalledWith({ sessionId: 'session-1', cwd: '/work/one' })
    expect(list).toHaveBeenCalledWith({ sessionId: 'session-1', cwd: '/work/two' })
  })

  it('keeps the last known cwd when the sessions store rebuilds without the entry', async () => {
    const projectSkill = { ...writableSkill, name: 'flicker-project', source: 'project-dsh' as const }
    const list = vi.fn(async (scope: { cwd?: string }) => ({ skills: scope.cwd === undefined ? [] : [projectSkill] }))
    const settled = sessionHook(sessionState('/work/x'))
    const { rerender } = render(<SkillsSection {...props({ list, useSessions: settled })} />)
    expect(await screen.findByText(projectSkill.name)).toBeTruthy()

    // Same current session id, but the store entry (and its cwd) reads absent
    // for this render: the catalog must stay scoped to the remembered cwd.
    const rebuilt = { ...sessionState('/work/x'), byId: {} }
    rerender(<SkillsSection {...props({ list, useSessions: sessionHook(rebuilt) })} />)
    await waitFor(() => { expect(list).toHaveBeenLastCalledWith({ sessionId: 'session-1', cwd: '/work/x' }) })
    expect(screen.getByText(projectSkill.name)).toBeTruthy()
    expect(screen.queryByText(en.projectCatalogUnavailable)).toBeNull()
  })

  it('reloads when the active session changes without changing cwd', async () => {
    const first = deferred<{ skills: readonly typeof writableSkill[] }>()
    const secondSkill = { ...writableSkill, name: 'second-session-skill', source: 'project-dsh' as const }
    const list = vi.fn((scope: { sessionId?: SessionId }) => scope.sessionId === 'session-one'
      ? first.promise
      : Promise.resolve({ skills: [secondSkill] }))
    const { rerender } = render(<SkillsSection {...props({
      list,
      useSessions: sessionHook(sessionState('/work/shared', 'session-one')),
    })} />)

    rerender(<SkillsSection {...props({
      list,
      useSessions: sessionHook(sessionState('/work/shared', 'session-two')),
    })} />)
    expect(await screen.findByText(secondSkill.name)).toBeTruthy()
    first.resolve({ skills: [writableSkill] })
    await waitFor(() => { expect(screen.queryByText(writableSkill.name)).toBeNull() })
    expect(list).toHaveBeenCalledWith({ sessionId: 'session-one', cwd: '/work/shared' })
    expect(list).toHaveBeenCalledWith({ sessionId: 'session-two', cwd: '/work/shared' })
  })

  it('ignores a save that finishes after the active project changes', async () => {
    const updateRequest = deferred<undefined>()
    const update = vi.fn(() => updateRequest.promise)
    const projectSkill = { ...writableSkill, name: 'project-skill', source: 'project-dsh' as const }
    const list = vi.fn((scope: { cwd?: string }) => Promise.resolve({
      skills: scope.cwd === '/work/one' ? [writableSkill] : [projectSkill],
    }))
    const get = vi.fn(async () => detail())
    const { rerender } = render(<SkillsSection {...props({
      list,
      get,
      update,
      useSessions: sessionHook(sessionState('/work/one')),
    })} />)
    await screen.findByText(writableSkill.name)
    fireEvent.click(screen.getByText(writableSkill.name).closest('button')!)
    const dialog = await screen.findByRole('dialog', { name: en.editorTitleEdit })
    fireEvent.change(within(dialog).getByLabelText(en.content), { target: { value: 'Late revision' } })
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))

    rerender(<SkillsSection {...props({
      list,
      get,
      update,
      useSessions: sessionHook(sessionState('/work/two')),
    })} />)
    expect(await screen.findByText(projectSkill.name)).toBeTruthy()
    updateRequest.resolve(undefined)
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(screen.queryByText(writableSkill.name)).toBeNull()
    expect(screen.queryByRole('dialog', { name: en.editorTitleEdit })).toBeNull()
  })

  it('creates a project skill with invocation flags and disables project scope without cwd', async () => {
    const create = vi.fn(async () => {})
    render(<SkillsSection {...props({ create })} />)
    await screen.findByRole('button', { name: en.add })
    fireEvent.click(screen.getByRole('button', { name: en.add }))

    const unavailableDialog = screen.getByRole('dialog', { name: en.editorTitleAdd })
    expect(within(unavailableDialog).getByRole<HTMLButtonElement>('button', { name: en.scopeProject }).disabled).toBe(true)
    expect(within(unavailableDialog).getByText(en.projectUnavailable)).toBeTruthy()

    cleanup()
    render(<SkillsSection {...props({
      create,
      useSessions: sessionHook(sessionState('/work/project')),
    })} />)
    await screen.findByRole('button', { name: en.add })
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    const projectDialog = screen.getByRole('dialog', { name: en.editorTitleAdd })
    fireEvent.click(within(projectDialog).getByRole('button', { name: en.scopeProject }))
    fireEvent.change(within(projectDialog).getByLabelText(en.name), { target: { value: 'new-skill' } })
    fireEvent.change(within(projectDialog).getByLabelText(en.description), { target: { value: 'Does work' } })
    fireEvent.change(within(projectDialog).getByLabelText(en.whenToUse), { target: { value: 'Use for releases' } })
    fireEvent.change(within(projectDialog).getByLabelText(en.group), { target: { value: 'releases' } })
    fireEvent.change(within(projectDialog).getByLabelText(en.content), { target: { value: 'Instructions' } })
    const switches = within(projectDialog).getAllByRole('switch')
    fireEvent.click(switches[0]!)
    fireEvent.click(within(projectDialog).getByRole('button', { name: en.save }))

    await waitFor(() => {
      expect(create).toHaveBeenLastCalledWith({
        name: 'new-skill',
        description: 'Does work',
        whenToUse: 'Use for releases',
        group: 'releases',
        content: 'Instructions',
        root: 'project-dsh',
        modelInvocable: false,
        userInvocable: true,
        sessionId: 'session-1',
        cwd: '/work/project',
      })
    })
  })

  it('reports a refresh failure after a successful create and retries the catalog load', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ skills: [] })
      .mockRejectedValueOnce(new Error('refresh unavailable'))
      .mockResolvedValueOnce({ skills: [writableSkill] })
    render(<SkillsSection {...props({ list })} />)
    fireEvent.click(await screen.findByRole('button', { name: en.add }))
    const dialog = screen.getByRole('dialog', { name: en.editorTitleAdd })
    fireEvent.change(within(dialog).getByLabelText(en.name), { target: { value: 'new-skill' } })
    fireEvent.change(within(dialog).getByLabelText(en.description), { target: { value: 'Does work' } })
    fireEvent.change(within(dialog).getByLabelText(en.content), { target: { value: 'Instructions' } })
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))

    expect(await screen.findByText(en.refreshFailed)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: en.editorTitleAdd })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(await screen.findByText(writableSkill.name)).toBeTruthy()
    expect(screen.queryByText(en.refreshFailed)).toBeNull()
  })

  it('shows field errors and preserves the editor while an asynchronous save fails', async () => {
    const create = vi.fn(async () => { throw new Error('directory already exists') })
    render(<SkillsSection {...props({ create })} />)
    await screen.findByRole('button', { name: en.add })
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    const dialog = screen.getByRole('dialog', { name: en.editorTitleAdd })
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))

    expect(within(dialog).getByText(en.nameRequired)).toBeTruthy()
    expect(within(dialog).getByText(en.descriptionRequired)).toBeTruthy()
    expect(within(dialog).getByText(en.contentRequired)).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText(en.name), { target: { value: 'new-skill' } })
    fireEvent.change(within(dialog).getByLabelText(en.description), { target: { value: 'Does work' } })
    fireEvent.change(within(dialog).getByLabelText(en.content), { target: { value: 'A'.repeat(2_000) } })
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))

    expect((await within(dialog).findByRole('alert')).textContent).toContain('directory already exists')
    expect(screen.getByRole('dialog', { name: en.editorTitleAdd })).toBeTruthy()
    expect(within(dialog).getByLabelText<HTMLTextAreaElement>(en.content).value).toBe('A'.repeat(2_000))
  })

  it('loads editing from the row and saves body and invocation changes', async () => {
    const update = vi.fn(async () => {})
    const get = vi.fn(async () => detail())
    await renderCatalog({ get, update })

    fireEvent.click(screen.getByText(writableSkill.name).closest('button')!)
    const dialog = await screen.findByRole('dialog', { name: en.editorTitleEdit })
    expect(get).toHaveBeenCalledWith(writableSkill.name, {})
    expect(within(dialog).getByLabelText<HTMLInputElement>(en.name).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText(en.group), { target: { value: 'workflows' } })
    fireEvent.change(within(dialog).getByLabelText(en.content), { target: { value: 'Revised instructions' } })
    fireEvent.click(within(dialog).getAllByRole('switch')[1]!)
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        name: writableSkill.name,
        description: writableSkill.description,
        whenToUse: writableSkill.whenToUse,
        group: 'workflows',
        content: 'Revised instructions',
        modelInvocable: true,
        userInvocable: false,
      })
    })
  })

  it('confirms directory deletion from the row delete control', async () => {
    const removeRequest = deferred<boolean>()
    const remove = vi.fn(async () => { await removeRequest.promise })
    await renderCatalog({ remove })

    openDelete()
    expect(screen.getByText(/entire skill directory/)).toBeTruthy()
    expect(screen.getByText(/every accompanying file/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.deleteConfirm }))
    expect(remove).toHaveBeenCalledWith(writableSkill.name, {})
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.deleting }).disabled).toBe(true)
    removeRequest.resolve(true)
    await waitFor(() => { expect(screen.queryByText(writableSkill.name)).toBeNull() })
  })
})
