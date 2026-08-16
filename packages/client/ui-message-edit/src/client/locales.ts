/** `messageEdit` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.edit': '编辑',
  'action.running': '等待当前回复结束后编辑',
  'action.unsupported': '包含非文本内容，暂不支持编辑',
  'action.cancel': '取消',
  'action.send': '发送',
  'action.pending': '正在重新发送',
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
  'action.edit': 'Edit',
  'action.running': 'Wait for the current response to finish before editing',
  'action.unsupported': 'Messages with non-text content cannot be edited yet',
  'action.cancel': 'Cancel',
  'action.send': 'Send',
  'action.pending': 'Resending',
  'error.generic': 'Could not create an editable branch. Try again.',
} satisfies Record<MessageEditKey, string>
