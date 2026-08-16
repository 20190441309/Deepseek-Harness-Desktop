import { describe, expect, it } from 'vitest'
import { parseSkillMarkdown, renderSkillMarkdown } from '../src/frontmatter.ts'

describe('skill inventory frontmatter', () => {
  it('round-trips name, description, and invocation flags', () => {
    const text = renderSkillMarkdown({
      name: 'demo-skill',
      description: 'A demo',
      whenToUse: 'When testing',
      modelInvocable: false,
      userInvocable: false,
      content: 'Do the thing.\n',
    })
    expect(text).toContain('disable-model-invocation: true')
    expect(text).toContain('user-invocable: false')
    const parsed = parseSkillMarkdown(text)
    expect(parsed.data.name).toBe('demo-skill')
    expect(parsed.body.trim()).toBe('Do the thing.')
  })

  it('treats a file without a fence as body-only', () => {
    expect(parseSkillMarkdown('plain body\n')).toEqual({ data: {}, body: 'plain body\n' })
    expect(parseSkillMarkdown('---\n- just a list\n---\nBody\n')).toEqual({
      data: {},
      body: 'Body\n',
    })
  })

  it('omits permissive invocation flags', () => {
    const text = renderSkillMarkdown({
      name: 'open',
      description: 'Open',
      modelInvocable: true,
      userInvocable: true,
      content: 'Body',
    })
    expect(text).not.toContain('disable-model-invocation')
    expect(text).not.toContain('user-invocable')
  })
})
