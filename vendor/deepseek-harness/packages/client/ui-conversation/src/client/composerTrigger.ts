/** Package-local composer trigger detect/replace — do not import ui-files. */

/** Composer token under the caret: `@path`, `$skill`, `/command`, or `/model`. */
export type ComposerTriggerKind = 'path' | 'slash-command' | 'slash-model' | 'skill'

/** Standalone slash-command names the composer also recognizes. */
export type ComposerSlashCommand = 'model' | 'plan' | 'default'

/** Active composer trigger span at the caret. */
export interface ComposerTrigger {
  kind: ComposerTriggerKind
  query: string
  rangeStart: number
  rangeEnd: number
}

function clampCursor(text: string, cursor: number): number {
  if (!Number.isFinite(cursor)) return text.length
  return Math.max(0, Math.min(text.length, Math.floor(cursor)))
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\t' || char === '\r'
}

/**
 * Detect an active trigger (@path, $skill, /command) at the cursor position.
 *
 * Accepts an optional `isWhitespaceChar` override so callers with inline
 * placeholder characters can treat those as token boundaries.
 * @param text - full draft.
 * @param cursorInput - caret offset.
 * @param isWhitespaceChar - optional token-boundary predicate.
 * @returns the live trigger, or null.
 */
export function detectComposerTrigger(
  text: string,
  cursorInput: number,
  isWhitespaceChar?: (char: string) => boolean,
): ComposerTrigger | null {
  const cursor = clampCursor(text, cursorInput)
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const linePrefix = text.slice(lineStart, cursor)

  if (linePrefix.startsWith('/')) {
    const commandMatch = /^\/(\S*)$/.exec(linePrefix)
    if (commandMatch) {
      const commandQuery = commandMatch[1] || ''
      if (commandQuery.toLowerCase() === 'model') {
        return {
          kind: 'slash-model',
          query: '',
          rangeStart: lineStart,
          rangeEnd: cursor,
        }
      }
      return {
        kind: 'slash-command',
        query: commandQuery,
        rangeStart: lineStart,
        rangeEnd: cursor,
      }
    }

    const modelMatch = /^\/model(?:\s+(.*))?$/.exec(linePrefix)
    if (modelMatch) {
      return {
        kind: 'slash-model',
        query: (modelMatch[1] || '').trim(),
        rangeStart: lineStart,
        rangeEnd: cursor,
      }
    }
  }

  const wsCheck = isWhitespaceChar ?? isWhitespace
  let tokenIdx = cursor - 1
  while (tokenIdx >= 0 && !wsCheck(text.charAt(tokenIdx))) {
    tokenIdx -= 1
  }
  const tokenStart = tokenIdx + 1

  const token = text.slice(tokenStart, cursor)
  if (token.startsWith('$')) {
    return {
      kind: 'skill',
      query: token.slice(1),
      rangeStart: tokenStart,
      rangeEnd: cursor,
    }
  }
  if (!token.startsWith('@')) {
    return null
  }

  return {
    kind: 'path',
    query: token.slice(1),
    rangeStart: tokenStart,
    rangeEnd: cursor,
  }
}

/**
 * Replace `[rangeStart, rangeEnd)` in `text` and return the next caret.
 * @param text - full draft.
 * @param rangeStart - inclusive start.
 * @param rangeEnd - exclusive end.
 * @param replacement - inserted text.
 * @returns the next draft and caret.
 */
export function replaceTextRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(text.length, rangeStart))
  const safeEnd = Math.max(safeStart, Math.min(text.length, rangeEnd))
  const nextText = `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`
  return { text: nextText, cursor: safeStart + replacement.length }
}
