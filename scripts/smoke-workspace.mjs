import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

export function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

export function createSmokeDirs(prefix) {
  const smokeRoot = mkdtempSync(path.join(os.tmpdir(), prefix))
  const userData = path.join(smokeRoot, 'user-data')
  const workspace = path.join(smokeRoot, 'workspace')
  const dshHome = path.join(smokeRoot, 'dsh-home')
  mkdirSync(userData, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  mkdirSync(dshHome, { recursive: true })
  return {
    smokeRoot,
    userData,
    workspace,
    dshHome,
    resultPath: path.join(userData, 'dshd-smoke.json'),
  }
}

export function writeSmokeConfig(userData, workspace, port) {
  writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
    workspace,
    host: '127.0.0.1',
    port,
    closeToTray: false,
    openAtLogin: false,
    openDevTools: false,
    remoteEnabled: false,
  }, null, 2))
}

export function initGitWorkspace(workspace) {
  writeFileSync(path.join(workspace, 'README.md'), 'smoke\n')
  const git = (args) => {
    const result = spawnSync('git', args, {
      cwd: workspace,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
    }
  }
  git(['init'])
  git(['add', '.'])
  git([
    '-c', 'user.name=dsh-smoke',
    '-c', 'user.email=smoke@example.test',
    'commit',
    '-m',
    'smoke',
  ])
}

export function assertSmokeResult(outcome, result) {
  const buttons = Array.isArray(result.result?.titlebarButtons) ? result.result.titlebarButtons : []
  const hasTerminalToggle = buttons.some((label) => /terminal|\u7ec8\u7aef/i.test(label))
  const hasSurfacesToggle = buttons.some((label) => /right panel|surfaces|\u53f3\u4fa7\u680f/i.test(label))
  const hits = result.result?.titlebarHits?.hits || {}
  const hitCount = Number(hits.surfaces || 0) + Number(hits.branch || 0) + Number(hits.git || 0)
  const uiOk = result.result?.hasFrame === true
    && result.result?.hasTitlebar === true
    && hasTerminalToggle
    && hasSurfacesToggle
    && result.result?.hasDragStrip !== true
    && result.result?.hasDragMark !== true
    && result.result?.hasHitMark !== true
    && result.result?.captionRegion === 'drag'
    && result.result?.hasBootShellApi === true
    && result.result?.bootShellApiIsScoped === true
    && result.result?.hasHarnessShellApi === true
    && result.result?.harnessShellApiIsScoped === true
    && hitCount > 0
    && Number(hits.surfaces) > 0
    && Number(hits.branch) > 0
    && Number(hits.git) > 0
    && result.result?.titlebarHits?.error == null
    && (process.env.DSH_THEME_SMOKE !== '1' || result.result?.themeSmoke?.ok === true)
    && Array.isArray(result.pageErrors)
    && result.pageErrors.length === 0
  if (outcome.code !== 0 || result.ok !== true || !uiOk || result.ptyStatus !== 'echoed:ok') {
    throw new Error(`Smoke failed: ${JSON.stringify({ outcome, result })}`)
  }
}
