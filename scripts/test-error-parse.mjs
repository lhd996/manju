import http from 'node:http'

// 模拟平台返回 { code, message, data } 这种平铺错误
const server = http.createServer((req, res) => {
  res.writeHead(400, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      code: 'video_queue_full',
      message: 'video queue is full, please retry later (request id: 2026102009292449846672ZGaMrm52)',
      data: null,
    }),
  )
})
await new Promise((r) => server.listen(8899, '127.0.0.1', r))

process.env.AGNES_API_KEY = 'test'
process.env.AGNES_BASE_URL = 'http://127.0.0.1:8899/v1'
const { createVideo } = await import('../server/agnes.mjs')

try {
  await createVideo({ prompt: 'x', mode: 'text', seconds: 5, ratio: '16:9' })
  console.log('unexpected success')
} catch (e) {
  console.log('status :', e.status)
  console.log('message:', e.message)
}
server.close()
