import type { Buckets, DayRecord, ModelItem, Overview, UsageTotals } from './contract.ts';
export declare const HEAT_DAYS = 182;
export declare const RECENT_DAYS = 30;
export declare function emptyBuckets(): Buckets;
export declare function emptyTotals(): UsageTotals;
/** Add a raw (possibly partial/null) TokenUsage-like value into a bucket set. */
export declare function addBuckets(target: Buckets, usage: Partial<Buckets> | null | undefined): void;
/** Merge one bucket set into another (values already normalized). */
export declare function mergeInto(target: Buckets, src: Buckets): void;
export declare function totalsFrom(b: Buckets): UsageTotals;
/** Sorted model ranking, most usage first (v0.1.0 semantic). */
export declare function sortedModels(map: Record<string, Buckets>): ModelItem[];
export declare function totalsFromModels(models: ModelItem[]): UsageTotals;
/** UTC day key for a timestamp: YYYY-MM-DD (explicit timezone declaration). */
export declare function dayKeyUTC(ts: number): string;
/** Parse a UTC YYYY-MM-DD key into a Date at UTC midnight (never local). */
export declare function parseDayKeyUTC(key: string): Date;
/** Format a Date's UTC calendar day as a day key. */
export declare function keyOfDateUTC(d: Date): string;
export declare function todayKeyUTC(now: number): string;
/**
 * Build the 182-day heatmap window ending today (UTC). Days with no usage get
 * zero-filled records, preserving the v0.1.0 grid shape (fixed-length array).
 */
export declare function buildDayWindow(byDay: Record<string, Record<string, Buckets>>, now: number): DayRecord[];
/** Cache hit rate over the four disjoint buckets: read / (uncached + read + write). */
export declare function hitRate(b: Buckets): number | null;
/** Billed input (uncached + cache read + cache write) — the v0.1.0 "输入" number. */
export declare function billedInput(b: Buckets): number;
/** Empty UI only when no billed-usage sessions and the scan did not fail. */
export declare function isUsageEmpty(overview: Pick<Overview, 'allTime' | 'coverage'>): boolean;
