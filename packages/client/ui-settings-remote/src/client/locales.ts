/** Copy dictionaries for the Remote popup. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  trigger: '远程',
  heading: '远程',
  enable: '开启连接',
  enabledOn: '已开启',
  enabledOff: '已关闭',
  mode: '连接方式',
  modeLan: '局域网',
  modeRelay: '服务器中继',
  qr: '配对二维码',
  offHint: '开启后显示配对二维码',
  noQr: '还没有可扫描的二维码',
  devices: '已连接设备',
  devicesManage: '设备管理',
  devicesEmpty: '还没有已连接的设备。扫码后会出现在这里。',
  devicesOnline: '在线',
  devicesSeen: '最近访问 {time}',
  devicesSeenUnknown: '尚未访问',
  devicesBound: '绑定于 {time}',
  devicesId: '编号 {id}',
  unbind: '解绑',
  loading: '正在读取…',
  error: '暂时无法读取远程状态。',
  retry: '重试',
  statusError: '远程出错：{message}',
} satisfies Record<string, string>

/** Remote settings locale key union. */
export type RemoteLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  trigger: 'Remote',
  heading: 'Remote',
  enable: 'Turn on',
  enabledOn: 'On',
  enabledOff: 'Off',
  mode: 'Connection',
  modeLan: 'LAN',
  modeRelay: 'Relay',
  qr: 'Pairing QR code',
  offHint: 'Turn on to show the pairing QR code',
  noQr: 'No pairing QR code yet',
  devices: 'Connected devices',
  devicesManage: 'Manage devices',
  devicesEmpty: 'No devices are bound yet. Scan the QR code to add one.',
  devicesOnline: 'Online',
  devicesSeen: 'Last seen {time}',
  devicesSeenUnknown: 'Not seen yet',
  devicesBound: 'Bound {time}',
  devicesId: 'ID {id}',
  unbind: 'Unbind',
  loading: 'Reading…',
  error: 'Remote status is temporarily unavailable.',
  retry: 'Retry',
  statusError: 'Remote error: {message}',
} satisfies Record<RemoteLocaleKey, string>
