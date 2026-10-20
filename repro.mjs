// node repro.mjs none | interceptor
import http from 'node:http'
import { performance } from 'node:perf_hooks'
import { HttpRequestInterceptor } from '@mswjs/interceptors/http'

const mode = process.argv[2] ?? 'interceptor'
const N = 50

const server = http.createServer((req, res) => {
  req.resume()
  req.on('end', () => res.end('ok'))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/`

if (mode === 'interceptor') {
  // No listeners: every request is passed through to the real server.
  new HttpRequestInterceptor().apply()
}

const agent = new http.Agent({ keepAlive: true })
const body = JSON.stringify({ hello: 'world' })

const post = () =>
  new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: 'POST',
        agent,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume()
        res.on('end', resolve)
      },
    )
    req.on('error', reject)
    req.flushHeaders() // headers and body are sent as two writes
    req.end(body)
  })

async function bench(name, fn) {
  await fn() // warm up and open the keep-alive connection
  const times = []
  for (let i = 0; i < N; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  const total = times.reduce((a, b) => a + b, 0)
  console.log(
    `${mode.padEnd(11)} ${name.padEnd(12)} median ${times[N >> 1].toFixed(2)} ms  p90 ${times[Math.floor(N * 0.9)].toFixed(2)} ms  total ${total.toFixed(0)} ms (${N} sequential requests)`,
  )
}

await bench('http.request', post)
await bench('fetch', async () => {
  const res = await fetch(url, { method: 'POST', body })
  await res.text()
})

agent.destroy()
server.close()
process.exit(0)
