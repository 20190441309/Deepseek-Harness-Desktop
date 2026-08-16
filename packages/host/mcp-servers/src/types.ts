/**
 * Wire types for the MCP server Settings Remote.
 * @module @deepseek-ai/dsh-host-mcp-servers/types
 */

import type { ChildFiberPhase, McpServerRecord } from '@deepseek-ai/dsh-mcp-servers-file/types'

export type { McpServerRecord } from '@deepseek-ai/dsh-mcp-servers-file/types'

/** Whether the row comes from the managed file or a composition plugin. */
export type McpServerOrigin = 'managed' | 'composition'

/** One MCP server as Settings lists it. */
export interface McpServerEntry {
  readonly id: string
  readonly origin: McpServerOrigin
  readonly writable: boolean
  readonly enabled: boolean
  readonly fiberPhase: ChildFiberPhase
  readonly spec: McpServerRecord
}

/** Point-in-time Settings snapshot. */
export interface McpServerSnapshot {
  readonly servers: readonly McpServerEntry[]
}

/** Upsert request body. */
export interface McpServerUpsertRequest {
  readonly spec: McpServerRecord
}

/** Id-addressed mutation. */
export interface McpServerIdRequest {
  readonly id: string
}

/** Enablement mutation. */
export interface McpServerEnableRequest {
  readonly id: string
  readonly enabled: boolean
}
