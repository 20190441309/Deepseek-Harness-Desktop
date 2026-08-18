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
 * @returns frontmatter data and the instruction body.
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
 * Render a skill file, replacing Settings-owned frontmatter while preserving
 * fields owned by other producers.
 * @param fields - frontmatter updates, optional existing data, and body.
 * @returns the serialized SKILL.md text.
 */
export function renderSkillMarkdown(fields: {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly content: string
  readonly existingData?: Readonly<Record<string, unknown>>
}): string {
  const data: Record<string, unknown> = { ...fields.existingData }
  data.name = fields.name
  data.description = fields.description
  delete data.whenToUse
  if (fields.whenToUse !== undefined && fields.whenToUse.trim().length > 0) {
    data.whenToUse = fields.whenToUse
  }
  replaceInvocation(data, fields.modelInvocable, fields.userInvocable)
  return renderMarkdownData(data, fields.content)
}

/**
 * Replace only invocation flags while retaining every other frontmatter field.
 * @param fields - existing frontmatter, invocation flags, and body.
 * @returns the serialized SKILL.md text.
 */
export function renderSkillInvocationMarkdown(fields: {
  readonly existingData: Readonly<Record<string, unknown>>
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly content: string
}): string {
  const data: Record<string, unknown> = { ...fields.existingData }
  replaceInvocation(data, fields.modelInvocable, fields.userInvocable)
  return renderMarkdownData(data, fields.content)
}

function replaceInvocation(data: Record<string, unknown>, modelInvocable: boolean, userInvocable: boolean): void {
  delete data['disable-model-invocation']
  delete data['user-invocable']
  if (!modelInvocable) data['disable-model-invocation'] = true
  if (!userInvocable) data['user-invocable'] = false
}

function renderMarkdownData(data: Record<string, unknown>, content: string): string {
  const yaml = stringifyYaml(data).trimEnd()
  const body = content.replace(/^\uFEFF/, '').replace(/^\n+/, '')
  return `---\n${yaml}\n---\n\n${body.endsWith('\n') ? body : `${body}\n`}`
}
