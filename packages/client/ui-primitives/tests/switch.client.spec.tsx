// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Switch } from '../src/Switch.tsx'

afterEach(cleanup)

describe('Switch', () => {
  it('renders a native checkbox switch and forwards input attributes and className', () => {
    render(
      <Switch
        aria-label="Enable sync"
        className="settings-switch"
        defaultChecked
        id="sync"
        name="sync"
        required
        value="enabled"
      />,
    )

    const control = screen.getByRole<HTMLInputElement>('switch', { name: 'Enable sync' })
    expect(control.type).toBe('checkbox')
    expect(control.checked).toBe(true)
    expect(control.id).toBe('sync')
    expect(control.name).toBe('sync')
    expect(control.required).toBe(true)
    expect(control.value).toBe('enabled')
    expect(control.classList.contains('settings-switch')).toBe(true)
  })

  it('reports checked state changes through the native change event', () => {
    const onChange = vi.fn()
    render(<Switch aria-label="Enable sync" onChange={onChange} />)

    const control = screen.getByRole<HTMLInputElement>('switch', { name: 'Enable sync' })
    fireEvent.click(control)

    expect(control.checked).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('stays unchanged and emits no change while disabled', () => {
    const onChange = vi.fn()
    render(<Switch aria-label="Enable sync" disabled onChange={onChange} />)

    const control = screen.getByRole<HTMLInputElement>('switch', { name: 'Enable sync' })
    control.click()

    expect(control.disabled).toBe(true)
    expect(control.checked).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('is keyboard focusable and toggles from the keyboard activation click', () => {
    const onChange = vi.fn()
    render(<Switch aria-label="Enable sync" onChange={onChange} />)

    const control = screen.getByRole<HTMLInputElement>('switch', { name: 'Enable sync' })
    control.focus()
    expect(document.activeElement).toBe(control)

    fireEvent.keyDown(control, { key: ' ', code: 'Space' })
    fireEvent.keyUp(control, { key: ' ', code: 'Space' })
    fireEvent.click(control, { detail: 0 })

    expect(control.checked).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
