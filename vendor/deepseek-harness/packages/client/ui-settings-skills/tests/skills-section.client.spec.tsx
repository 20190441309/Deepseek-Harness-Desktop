// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillsSection } from '../src/client/SkillsSection.tsx'
import type { SkillsSectionInjected, SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import { en, type SkillsSettingsKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: SkillsSettingsKey): string => en[key]) as SkillsSectionInjected['t']

function props(partial: Partial<SkillsSectionInjected>): SkillsSectionProps {
  return {
    t,
    getCwd: () => undefined,
    list: async () => ({ skills: [] }),
    get: async () => ({
      name: 'demo-skill',
      description: 'A demo',
      source: 'user-dsh',
      writable: true,
      modelInvocable: true,
      userInvocable: true,
      content: 'Do it',
    }),
    create: async () => {},
    update: async () => {},
    remove: async () => {},
    setInvocation: async () => {},
    ...partial,
  } as SkillsSectionProps
}

describe('SkillsSection', () => {
  it('groups a user skill and toggles model invocation', async () => {
    const setInvocation = vi.fn(async () => {})
    render(<SkillsSection {...props({
      setInvocation,
      list: async () => ({
        skills: [{
          name: 'demo-skill',
          description: 'A demo',
          source: 'user-dsh',
          provider: 'filesystem',
          writable: true,
          modelInvocable: true,
          userInvocable: true,
        }],
      }),
    })}
    />)
    await waitFor(() => { expect(screen.getByText('demo-skill')).toBeTruthy() })
    expect(screen.getByText(en.groupUser)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.modelOff }))
    await waitFor(() => { expect(setInvocation).toHaveBeenCalledWith('demo-skill', false, true, undefined) })
  })

  it('creates a kebab-case user skill', async () => {
    const create = vi.fn(async () => {})
    render(<SkillsSection {...props({ create })} />)
    await waitFor(() => { expect(screen.getByRole('button', { name: en.add })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    fireEvent.change(screen.getByLabelText(en.name), { target: { value: 'new-skill' } })
    fireEvent.change(screen.getByLabelText(en.description), { target: { value: 'Does work' } })
    fireEvent.change(screen.getByLabelText(en.content), { target: { value: 'Instructions' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        name: 'new-skill',
        description: 'Does work',
        whenToUse: undefined,
        content: 'Instructions',
      })
    })
  })

  it('edits invocation flags on a writable skill', async () => {
    const update = vi.fn(async () => {})
    const get = vi.fn(async () => ({
      name: 'demo-skill',
      description: 'A demo',
      source: 'user-dsh',
      writable: true,
      modelInvocable: true,
      userInvocable: true,
      content: 'Do it',
    }))
    render(<SkillsSection {...props({
      update,
      get,
      list: async () => ({
        skills: [{
          name: 'demo-skill',
          description: 'A demo',
          source: 'user-dsh',
          provider: 'filesystem',
          writable: true,
          modelInvocable: true,
          userInvocable: true,
        }],
      }),
    })}
    />)
    await waitFor(() => { expect(screen.getByRole('button', { name: en.edit })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.edit }))
    await waitFor(() => { expect(screen.getByLabelText(en.modelOn)).toBeTruthy() })
    fireEvent.click(screen.getByLabelText(en.modelOn))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        name: 'demo-skill',
        modelInvocable: false,
        userInvocable: true,
      }))
    })
  })

  it('groups bundled skills as read-only and retries a failed list', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        skills: [{
          name: 'shipped',
          description: 'Bundled',
          source: 'bundled',
          provider: 'filesystem',
          writable: false,
          modelInvocable: true,
          userInvocable: true,
        }],
      })
    render(<SkillsSection {...props({ list })} />)
    await waitFor(() => { expect(screen.getByText(en.error)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(screen.getByText(en.groupBundled)).toBeTruthy() })
    expect(screen.getByText(en.readOnly)).toBeTruthy()
  })

  it('confirms deletion of a writable skill', async () => {
    const remove = vi.fn(async () => {})
    render(<SkillsSection {...props({
      remove,
      list: async () => ({
        skills: [{
          name: 'demo-skill',
          description: 'A demo',
          source: 'user-dsh',
          provider: 'filesystem',
          writable: true,
          modelInvocable: true,
          userInvocable: true,
        }],
      }),
    })}
    />)
    await waitFor(() => { expect(screen.getByRole('button', { name: en.remove })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    fireEvent.click(screen.getByRole('button', { name: en.deleteConfirm }))
    await waitFor(() => { expect(remove).toHaveBeenCalledWith('demo-skill', undefined) })
  })
})
