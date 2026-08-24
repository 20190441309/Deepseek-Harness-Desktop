declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, ReactNode } from 'react'

  export function Button(props: {
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element

  export interface MenuItem {
    id: string
    label: ReactNode
    disabled?: boolean
  }

  export function Menu(props: {
    open: boolean
    anchor: ReactNode
    items: readonly MenuItem[]
    onSelect: (id: string) => void
    onClose: () => void
    align?: 'start' | 'end'
    portal?: boolean
  }): JSX.Element
}
