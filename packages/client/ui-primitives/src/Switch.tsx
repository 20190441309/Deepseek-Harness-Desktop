import type { InputHTMLAttributes } from 'react'
import clsx from 'clsx'
import css from './Switch.module.css'

/** Native checkbox attributes with the switch's type and ARIA role fixed by the primitive. */
export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>

/**
 * Render a token-styled switch backed by a native checkbox.
 * @param props - native checkbox attributes; `type` and `role` are supplied by the primitive.
 * @returns the native checkbox and its presentation track.
 */
export function Switch({ className, ...rest }: SwitchProps) {
  return (
    <span className={css.root}>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        className={clsx(css.input, className)}
      />
      <span className={css.track} aria-hidden="true">
        <span className={css.thumb} />
      </span>
    </span>
  )
}
