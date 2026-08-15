import { describe, expect, it } from 'vitest'
import { eventText, foldEvents, relativeTime, sessionTitle } from './fold.ts'

describe('foldEvents', () => {
  it('keeps user and assistant text and streams chunks', () => {
    const messages = foldEvents([
      { event: { type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: '说一句喵' }] } } },
      { event: { type: 'assistant/chunk', seq: 2, data: { chunk: { type: 'text-delta', text: '喵' } } } },
      { event: { type: 'assistant/chunk', seq: 3, data: { chunk: { type: 'text-delta', text: '～！' } } } },
      { event: { type: 'assistant/message', seq: 4, data: { message: { content: [{ type: 'text', text: '喵～！🐾' }] } } } },
      { event: { type: 'tool/call', seq: 5, data: { name: 'pwsh' } } },
    ])
    expect(messages.map((item) => [item.role, item.text])).toEqual([
      ['user', '说一句喵'],
      ['assistant', '喵～！🐾'],
      ['tool', 'pwsh'],
    ])
  })
})

describe('sessionTitle', () => {
  it('prefers the projection title', () => {
    expect(sessionTitle({
      sessionId: 'abc',
      cwd: 'C:\\\\ai\\\\测试',
      projections: { values: { title: '猫娘AI编码助手会话' } },
    })).toBe('猫娘AI编码助手会话')
  })
})

describe('eventText', () => {
  it('reads nested message content', () => {
    expect(eventText({ message: { content: [{ type: 'text', text: '好' }] } })).toBe('好')
  })
})

describe('relativeTime', () => {
  it('uses Chinese units', () => {
    expect(relativeTime(1_000, 1_000)).toBe('刚刚')
    expect(relativeTime(1_000, 1_000 + 3 * 60_000)).toBe('3分钟前')
  })

  it('uses English units when asked', () => {
    expect(relativeTime(1_000, 1_000 + 3 * 60_000, 'en')).toBe('3m ago')
  })
})
