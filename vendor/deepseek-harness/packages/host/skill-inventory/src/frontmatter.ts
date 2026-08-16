/**
 * YAML frontmatter read/write for Settings-owned skill files.
 * @module @deepseek-ai/dsh-host-skill-inventory/frontmatter
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Split a SKILL.md into frontmatter data and the instruction body. */
export interface SkillMarkdown {
  readonly data: Record<string, unknown>
  readonly body: string
}

/**
 * Parse optional YAML frontmatter from a skill file.
 * @param text - file contents.
 */
export function parseSkillMarkdown(text: string): SkillMarkdown {
  const match = FENCE.exec(text)
  if (match === null) return { data: {}, body: text }
  const parsed: unknown = parseYaml(match[1] ?? '')
  const data = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? { ...(parsed as Record<string, unknown>) }
    : {}
  return { data, body: text.slice(match[0].length) }
}

/**
 * Render a skill file with required name/description and optional invocation flags.
 * @param fields - frontmatter plus body.
 */
export function renderSkillMarkdown(fields: {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly content: string
}): string {
  const data: Record<string, unknown> = {
    name: fields.name,
    description: fields.description,
  }
  if (fields.whenToUse !== undefined && fields.whenToUse.trim().length > 0) {
    data.whenToUse = fields.whenToUse
  }
  if (!fields.modelInvocable) data['disable-model-invocation'] = true
  if (!fields.userInvocable) data['user-invocable'] = false
  const yaml = stringifyYaml(data).trimEnd()
  const body = fields.content.replace(/^\uFEFF/, '').replace(/^\n+/, '')
  return `---\n${yaml}\n---\n\n${body.endsWith('\n') ? body : `${body}\n`}`
}
