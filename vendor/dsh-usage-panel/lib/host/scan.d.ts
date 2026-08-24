import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query';
import type { Overview } from '../shared/contract.ts';
export interface ScanFallbackDeps {
    sq: SessionQueryEngine;
    providerNames: Record<string, string>;
    logFailure: (message: string) => void;
}
export declare function scanFallback(deps: ScanFallbackDeps, now: number): Promise<Overview>;
