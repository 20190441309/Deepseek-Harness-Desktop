/**
 * Host Remote for listing and mutating filesystem-backed skills.
 * @module @deepseek-ai/dsh-host-skill-inventory
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { isSkillName, type SkillDefinition, type SkillSummary } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-skill'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import { parseSkillMarkdown, renderSkillMarkdown } from './frontmatter.ts'
import type {
  SkillInventoryCreateRequest,
  SkillInventoryDetail,
  SkillInventoryEntry,
  SkillInventoryGetRequest,
  SkillInventoryInvocationRequest,
  SkillInventoryRemoveRequest,
  SkillInventoryScope,
  SkillInventorySnapshot,
  SkillInventoryUpdateRequest,
} from './types.ts'

export type * from './types.ts'
export { parseSkillMarkdown, renderSkillMarkdown } from './frontmatter.ts'

const WRITABLE_ALWAYS = new Set(['user-dsh', 'user-agents'])
const WRITABLE_WITH_CWD = new Set(['project-dsh', 'project-agents'])

/** Remote-only skill catalog and file mutations for Settings. */
export class SkillInventoryGateway extends TypertRemoteService {
  static inject = ['skills']

  /**
   * @param ctx - host context carrying the skill registry.
   */
  constructor(ctx: Context) {
    super(ctx, 'skillInventory')
  }

  /**
   * List every discovered skill, including non-user-invocable ones.
   * @param request - optional project cwd.
   */
  @Remote('list')
  async list(request: SkillInventoryScope): Promise<SkillInventorySnapshot> {
    const cwd = emptyToUndefined(request.cwd)
    const skills = await this.ctx.skills.list({ cwd })
    const entries: SkillInventoryEntry[] = []
    for (const summary of skills) {
      const detail = await this.ctx.skills.get(summary.name, { cwd })
      entries.push(toEntry(summary, detail, cwd))
    }
    return { skills: entries, ...cwd === undefined ? {} : { cwd } }
  }

  /**
   * Load one skill body for the editor.
   * @param request - name and optional cwd.
   */
  @Remote('get')
  async get(request: SkillInventoryGetRequest): Promise<SkillInventoryDetail> {
    const cwd = emptyToUndefined(request.cwd)
    const definition = await this.requireSkill(request.name, cwd)
    return {
      name: definition.name,
      description: definition.description,
      ...definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse },
      source: definition.source,
      ...definition.path === undefined ? {} : { path: definition.path },
      writable: isWritable(definition.source, cwd, definition.path),
      modelInvocable: definition.invocation.modelInvocable,
      userInvocable: definition.invocation.userInvocable,
      content: definition.content,
    }
  }

  /**
   * Create a new directory-bundle skill.
   * @param request - name, copy, body, and root.
   */
  @Remote('create')
  async create(request: SkillInventoryCreateRequest): Promise<void> {
    if (!isSkillName(request.name)) {
      throw new Error(`skillInventory: name "${request.name}" is not kebab-case`)
    }
    const cwd = emptyToUndefined(request.cwd)
    const existing = await this.ctx.skills.get(request.name, { cwd })
    if (existing !== undefined) {
      throw new Error(`skillInventory: skill "${request.name}" already exists`)
    }
    const path = createPath(request.root, request.name, cwd)
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, renderSkillMarkdown({
      name: request.name,
      description: request.description,
      ...optionalWhenToUse(request.whenToUse),
      modelInvocable: true,
      userInvocable: true,
      content: request.content,
    }), { encoding: 'utf8', mode: 0o600 })
  }

  /**
   * Replace the body and invocation flags of a writable skill.
   * @param request - name, copy, body, and flags.
   */
  @Remote('update')
  async update(request: SkillInventoryUpdateRequest): Promise<void> {
    const cwd = emptyToUndefined(request.cwd)
    const definition = await this.requireWritable(request.name, cwd)
    await writeFile(definition.path, renderSkillMarkdown({
      name: definition.name,
      description: request.description,
      ...optionalWhenToUse(request.whenToUse),
      modelInvocable: request.modelInvocable,
      userInvocable: request.userInvocable,
      content: request.content,
    }), 'utf8')
  }

  /**
   * Delete a writable skill file or bundle directory.
   * @param request - name and optional cwd.
   */
  @Remote('delete')
  async delete(request: SkillInventoryRemoveRequest): Promise<void> {
    const cwd = emptyToUndefined(request.cwd)
    const definition = await this.requireWritable(request.name, cwd)
    await rm(bundleRoot(definition.path), { recursive: true, force: true })
  }

  /**
   * Write only the invocation frontmatter of a writable skill.
   * @param request - name and flags.
   */
  @Remote('setInvocation')
  async setInvocation(request: SkillInventoryInvocationRequest): Promise<void> {
    const cwd = emptyToUndefined(request.cwd)
    const definition = await this.requireWritable(request.name, cwd)
    const current = await readFile(definition.path, 'utf8')
    const parsed = parseSkillMarkdown(current)
    await writeFile(definition.path, renderSkillMarkdown({
      name: definition.name,
      description: definition.description,
      ...optionalWhenToUse(definition.whenToUse),
      modelInvocable: request.modelInvocable,
      userInvocable: request.userInvocable,
      content: parsed.body,
    }), 'utf8')
  }

  private async requireSkill(name: string, cwd: string | undefined): Promise<SkillDefinition> {
    if (!isSkillName(name)) throw new Error(`skillInventory: name "${name}" is not kebab-case`)
    const definition = await this.ctx.skills.get(name, { cwd })
    if (definition === undefined) throw new Error(`skillInventory: skill "${name}" was not found`)
    return definition
  }

  private async requireWritable(name: string, cwd: string | undefined): Promise<SkillDefinition & { path: string }> {
    const definition = await this.requireSkill(name, cwd)
    if (definition.path === undefined || !isWritable(definition.source, cwd, definition.path)) {
      throw new Error(`skillInventory: skill "${name}" is read-only`)
    }
    return definition as SkillDefinition & { path: string }
  }
}

export default SkillInventoryGateway

function toEntry(summary: SkillSummary, detail: SkillDefinition | undefined, cwd: string | undefined): SkillInventoryEntry {
  const path = detail?.path
  return {
    name: summary.name,
    description: summary.description,
    ...summary.whenToUse === undefined ? {} : { whenToUse: summary.whenToUse },
    source: summary.source,
    provider: summary.provider,
    ...path === undefined ? {} : { path },
    writable: isWritable(summary.source, cwd, path),
    modelInvocable: summary.invocation.modelInvocable,
    userInvocable: summary.invocation.userInvocable,
  }
}

function isWritable(source: string, cwd: string | undefined, path: string | undefined): boolean {
  if (path === undefined) return false
  if (WRITABLE_ALWAYS.has(source)) return true
  return cwd !== undefined && WRITABLE_WITH_CWD.has(source)
}

function createPath(root: SkillInventoryCreateRequest['root'], name: string, cwd: string | undefined): string {
  if (root === 'user-dsh') return join(resolveDshHome(), 'skills', name, 'SKILL.md')
  if (cwd === undefined || cwd.trim().length === 0) {
    throw new Error('skillInventory: creating a project skill requires cwd')
  }
  return join(cwd, '.dsh', 'skills', name, 'SKILL.md')
}

function bundleRoot(path: string): string {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  return normalized.endsWith('/skill.md') ? dirname(path) : path
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value
}

function optionalWhenToUse(value: string | undefined): { whenToUse: string } | object {
  return value === undefined || value.trim().length === 0 ? {} : { whenToUse: value }
}
