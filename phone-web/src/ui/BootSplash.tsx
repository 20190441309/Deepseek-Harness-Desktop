import type { Copy } from '../locale.ts'

type Props = {
  t: Copy
  status: string
  spinning: boolean
  error?: string
  onRetry?: () => void
}

export function BootSplash({ t, status, spinning, error, onRetry }: Props) {
  return (
    <div className="splash">
      <div className="splash-inner">
        <div className="splash-mark" aria-hidden="true" />
        <p className="kicker">{t.kicker}</p>
        <h1>{error ? t.pairTitle : t.product}</h1>
        {spinning ? <div className="splash-spin" aria-hidden="true" /> : null}
        <p className="lead">{error || status}</p>
        {onRetry ? (
          <button type="button" className="send splash-retry" onClick={onRetry}>{t.retry}</button>
        ) : null}
      </div>
    </div>
  )
}
