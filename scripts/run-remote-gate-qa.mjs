#!/usr/bin/env node
/**
 * Real-machine Electron suite for TC-NEG-001 + TC-REM-001 (unparked Remote).
 * Does not open the pairing URL / phone SPA.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertDesktopHarnessHome, assertSmokeResult, createSmokeDirs, electronSpawnEnv,
  initGitWorkspace, reservePort,
} from './smoke-workspace.mjs'

const require = createRequire(import.meta.url)
const { assertRemoteGateQaResult } = require('../src/main/remote-gate-qa.js')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const timeoutMs = Number(process.env.DSH_SMOKE_TIMEOUT_MS) || 420_000

function electronExecutable() {
  if (process.env.ELECTRON_PATH && existsSync(process.env.ELECTRON_PATH)) {
    return process.env.ELECTRON_PATH
  }
  const candidates = [
    path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    path.join(root, 'node_modules', 'electron', 'dist', 'electron'),
  ]
  const found = candidates.find((item) => existsSync(item))
  if (!found) {
    throw new Error('Remote gate QA needs a local Electron binary (npm ci, then node node_modules/electron/install.js).')
  }
  return found
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function run(executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      stopProcessTree(child)
      reject(new Error(`Remote gate QA timed out after ${timeoutMs}ms.`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

function printStepTable(qa) {
  const steps = Array.isArray(qa?.steps) ? qa.steps : []
  if (steps.length === 0) {
    console.log('Remote gate QA recorded no steps.')
    return
  }
  console.log('\nRemote gate steps:')
  for (const step of steps) {
    const mark = step.ok ? 'PASS' : (step.optional ? 'SKIP' : 'FAIL')
    const detail = step.detail ? `  ${step.detail}` : ''
    console.log(`  ${mark.padEnd(4)}  ${step.name}${detail}`)
  }
}

function writeRemoteGateConfig(userData, workspace, port) {
  // Default off — TC-NEG-001. The walk turns remote on then off for TC-REM-001.
  writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
    workspace,
    host: '127.0.0.1',
    port,
    closeToTray: false,
    openAtLogin: false,
    openDevTools: false,
    remoteEnabled: false,
    remoteMode: 'lan',
    remoteRelayUrl: '',
    quitAfterStart: true,
    autoStartDesktop: true,
  }, null, 2))
}

const dirs = createSmokeDirs('dsh-remote-gate-')
const keepRequested = process.env.DSH_SMOKE_KEEP === '1'
let keepArtifacts = keepRequested

try {
  const executable = electronExecutable()
  initGitWorkspace(dirs.workspace)
  writeFileSync(path.join(dirs.workspace, 'note.md'), 'remote gate qa\n')
  const port = await reservePort()
  writeRemoteGateConfig(dirs.userData, dirs.workspace, port)

  console.log(`Remote gate QA: ${executable}`)
  console.log(`Config seeds remoteEnabled=false; walk enables LAN then disables. Pairing URL is not opened.`)
  const outcome = await run(executable, ['.', `--user-data-dir=${dirs.userData}`, '--no-first-run'], electronSpawnEnv({
    DSH_SMOKE: '1',
    DSH_QA_REMOTE: '1',
  }))

  if (!existsSync(dirs.resultPath)) {
    keepArtifacts = true
    throw new Error(`Remote gate QA wrote no result file (exit ${outcome.code}${outcome.signal ? ` / ${outcome.signal}` : ''}).`)
  }
  const result = JSON.parse(readFileSync(dirs.resultPath, 'utf8'))
  assertDesktopHarnessHome(dirs.userData, result)
  assertSmokeResult(outcome, result)
  assertRemoteGateQaResult(result.result?.remoteGateQa)
  printStepTable(result.result?.remoteGateQa)
  console.log(`Remote gate QA passed. Artifacts: ${dirs.userData}`)
} catch (error) {
  keepArtifacts = true
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  if (existsSync(dirs.resultPath)) {
    try {
      const result = JSON.parse(readFileSync(dirs.resultPath, 'utf8'))
      printStepTable(result.result?.remoteGateQa)
    } catch {
      // ignore parse errors while reporting the primary failure
    }
  }
  process.exitCode = 1
} finally {
  if (!keepArtifacts) {
    rmSync(dirs.smokeRoot, { recursive: true, force: true })
  } else {
    console.error(`Kept smoke dirs: ${dirs.smokeRoot}`)
  }
}
