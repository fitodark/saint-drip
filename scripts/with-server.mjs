// Starts a server, waits until <url> answers 2xx with a body containing <expected>, optionally runs a
// check command, then kills the whole process tree. Exit code: 0 on success, 1 on timeout/check failure,
// 2 on bad usage.
// Usage: node scripts/with-server.mjs "<start command>" <url> <expected> [timeoutSeconds] [-- <check command…>]
import { execSync, spawn } from "node:child_process"

const [cmd, url, expected, timeoutArg, sep, ...check] = process.argv.slice(2)
if (!cmd || !url || !expected) {
  console.error('uso: node scripts/with-server.mjs "<cmd>" <url> <texto> [timeoutSeg] [-- <comando>]')
  process.exit(2)
}

const timeoutMs = Number(timeoutArg ?? 180) * 1000
const child = spawn(cmd, { shell: true, stdio: ["ignore", "inherit", "inherit"], detached: process.platform !== "win32" })

const stop = () => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" })
    else process.kill(-child.pid, "SIGTERM")
  } catch {
    // already gone
  }
}

let code = 1
try {
  const started = Date.now()
  let ready = false
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      const body = await res.text()
      if (res.ok && body.includes(expected)) {
        ready = true
        break
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  if (!ready) {
    console.error(`with-server: ${url} no respondió "${expected}" en ${timeoutMs / 1000}s`)
  } else if (sep === "--" && check.length > 0) {
    try {
      // Re-quote arguments that contain spaces or quotes so nested invocations survive the shell (sh and cmd).
      const quoted = check.map((a) => (/[\s"'&|<>]/.test(a) ? JSON.stringify(a) : a)).join(" ")
      execSync(quoted, { stdio: "inherit" })
      code = 0
    } catch (err) {
      code = typeof err.status === "number" && err.status !== 0 ? err.status : 1
    }
  } else {
    code = 0
  }
} finally {
  stop()
}
process.exit(code)
