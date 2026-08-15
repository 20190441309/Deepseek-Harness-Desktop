/** `files` namespace dictionaries: workspace tree and file preview. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '文件',
  'empty.cwd': '没有工作区，无法浏览文件。',
  'empty.dir': '此目录为空。',
  'error.list': '无法读取目录。',
  'error.read': '无法读取文件。',
  'preview.binary': '无法预览二进制文件。',
  'preview.truncated': '文件过长，仅显示开头。',
} satisfies Record<string, string>

/** The files namespace key union. */
export type FilesKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Files',
  'empty.cwd': 'A workspace is required to browse files.',
  'empty.dir': 'This directory is empty.',
  'error.list': 'Could not list the directory.',
  'error.read': 'Could not read the file.',
  'preview.binary': 'This binary file cannot be previewed.',
  'preview.truncated': 'File is too large; showing the beginning.',
} satisfies Record<FilesKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'files'
