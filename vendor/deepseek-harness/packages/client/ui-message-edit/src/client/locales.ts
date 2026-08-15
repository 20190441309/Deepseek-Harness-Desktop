/** `messageEdit` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.edit': '编辑并重新发送',
  'action.running': '等待当前回复结束后编辑',
  'action.unsupported': '包含非文本内容，暂不支持编辑',
  'action.pending': '正在创建编辑分支',
  'error.generic': '无法创建编辑分支，请重试',
} satisfies Record<string, string>

/** The messageEdit namespace key union. */
export type MessageEditKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The latest-user-message edit control's copy. */
    messageEdit: MessageEditKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'action.edit': 'Edit and resend',
  'action.running': 'Wait for the current response to finish before editing',
  'action.unsupported': 'Messages with non-text content cannot be edited yet',
  'action.pending': 'Creating an editable branch',
  'error.generic': 'Could not create an editable branch. Try again.',
} satisfies Record<MessageEditKey, string>
