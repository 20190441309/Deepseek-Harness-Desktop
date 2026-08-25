export interface FileSaveResult { ok: boolean }

export interface FileSaveCoordinatorOptions {
  readonly debounceMs: number
  readonly persist: (contents: string) => Promise<FileSaveResult>
  readonly onPendingChange: (pending: boolean) => void
  readonly onConfirmed: (contents: string) => void
}

export class FileSaveCoordinator {
  private timer: ReturnType<typeof setTimeout> | null = null
  private latestContents = ''
  private latestRevision = 0
  private lastChangeAt = 0
  /** The one in-flight persist; every save path waits on it before writing. */
  private inFlight: Promise<FileSaveResult> | null = null
  private disposed = false

  constructor(private readonly options: FileSaveCoordinatorOptions) {}

  change(contents: string): void {
    this.latestContents = contents
    this.latestRevision += 1
    this.lastChangeAt = Date.now()
    this.options.onPendingChange(true)
    this.schedule(this.options.debounceMs)
  }

  /**
   * Explicit save: record `contents` as the latest revision, cancel the
   * debounce, wait out any in-flight write, and persist. Serializing through
   * the same in-flight slot as the debounced path means an explicit save can
   * never interleave with a debounced write of older contents.
   * @param contents - the draft snapshot the caller wants on disk.
   * @returns the persist result for the flushed revision.
   */
  async flush(contents: string): Promise<FileSaveResult> {
    this.latestContents = contents
    this.latestRevision += 1
    this.lastChangeAt = Date.now()
    this.options.onPendingChange(true)
    while (this.inFlight !== null) await this.inFlight
    // The completed write may have rescheduled a debounce for our revision.
    this.clearTimer()
    return this.persistLatest()
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
    if (this.latestRevision > 0) void this.persistLatest()
  }

  private schedule(delay: number): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.persistLatest()
    }, delay)
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private persistLatest(): Promise<FileSaveResult> {
    if (this.inFlight !== null || this.latestRevision === 0) {
      return Promise.resolve({ ok: false })
    }
    const run = this.runSave()
    this.inFlight = run
    return run
  }

  private async runSave(): Promise<FileSaveResult> {
    const contents = this.latestContents
    const revision = this.latestRevision
    const result = await this.options.persist(contents)
    const succeeded = result.ok === true
    if (succeeded) {
      this.options.onConfirmed(contents)
    }

    this.inFlight = null
    if (revision === this.latestRevision) {
      if (succeeded) this.options.onPendingChange(false)
      return result
    }

    const remainingDebounce = Math.max(
      0,
      this.options.debounceMs - (Date.now() - this.lastChangeAt),
    )
    if (this.disposed) {
      void this.persistLatest()
    } else {
      this.schedule(remainingDebounce)
    }
    return result
  }
}
