#!/usr/bin/env bash
# macOS / Linux 启动脚本：API(8787) + Vite(5173)
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 node，请先安装 Node.js 18+（https://nodejs.org）" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "还没装依赖，先运行：npm install" >&2
  exit 1
fi

echo "API   http://127.0.0.1:8787"
echo "Web   http://127.0.0.1:5173"
echo

node server/index.mjs &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

# 等服务端起来
for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then break; fi
  sleep 0.25
done

node node_modules/vite/bin/vite.js --host 127.0.0.1
