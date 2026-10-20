param(
  [switch]$NoPause,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
try { $Host.UI.RawUI.WindowTitle = '漫剧画布 · Manju Canvas' } catch {}

function Finish([int]$code, [string]$message = '') {
  if ($message) { Write-Host ''; Write-Host $message -ForegroundColor Yellow }
  if (-not $NoPause) {
    Write-Host ''
    Read-Host '按回车关闭窗口' | Out-Null
  }
  exit $code
}

# ---------------------------------------------------------------- 找 node
$node = $env:CANVAS_NODE
if (-not $node) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $node = $cmd.Source }
}
if (-not $node) {
  $candidates = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    'D:\DevTools\nodejs\node.exe'
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { $node = $p; break }
  }
}
if (-not $node) {
  Finish 1 '找不到 node.exe。请先安装 Node.js 18+，或设 CANVAS_NODE=完整路径 后重试。'
}

New-Item -ItemType Directory -Force -Path (Join-Path $root 'data') | Out-Null

function Test-Web {
  try {
    $probe = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
    return $probe.StatusCode -eq 200
  } catch {
    return $false
  }
}

# 判断 8787 上跑的是不是我们自己的服务端（靠健康接口的字段签名）
function Test-OurApi {
  try {
    $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 2
    return ($null -ne $h.ok) -and ($null -ne $h.mock)
  } catch {
    return $false
  }
}

# 只清理"属于本项目"的残留进程（上个窗口被直接关掉时会留下 API）
function Clear-Stale {
  $cleaned = @()
  $apiOurs = Test-OurApi
  foreach ($conn in @(Get-NetTCPConnection -State Listen -LocalPort 5173, 8787 -ErrorAction SilentlyContinue)) {
    $isOurs = $false
    if ($conn.LocalPort -eq 8787 -and $apiOurs) {
      $isOurs = $true
    } else {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
      if ($proc) {
        $cmdline = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $isOurs = ($exe -like '*node.exe') -and (
          ($cmdline -match 'server[\\/]index\.mjs') -or ($cmdline -match 'vite')
        )
      }
    }
    if ($isOurs) {
      Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
      $cleaned += $conn.LocalPort
    }
  }
  if ($cleaned.Count -gt 0) {
    Write-Host ("清理了上次残留的进程（端口 " + (($cleaned | Sort-Object -Unique) -join ', ') + "）") -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 700
  }
}

# ---------------------------------------------------------------- 端口检查
if (Test-Web) {
  Start-Process 'http://127.0.0.1:5173'
  Finish 0 '画布已经在运行了，已为你打开浏览器。'
}

Clear-Stale

$busy = @(Get-NetTCPConnection -State Listen -LocalPort 5173, 8787 -ErrorAction SilentlyContinue)
if ($busy.Count -gt 0) {
  $ports = ($busy | Select-Object -ExpandProperty LocalPort | Sort-Object -Unique) -join ', '
  Finish 1 "端口 $ports 被别的程序占用了，先关掉占用它的程序再启动。"
}

# ---------------------------------------------------------------- 网络出口
# 默认直连，不自动接管系统代理。
# 需要走代理时显式指定：set CANVAS_PROXY=http://127.0.0.1:7897 再启动。
$proxy = $env:CANVAS_PROXY
if ($proxy) {
  $env:HTTPS_PROXY = $proxy
  $env:HTTP_PROXY = $proxy
  $env:NO_PROXY = 'localhost,127.0.0.1,::1'
  $env:NODE_USE_ENV_PROXY = '1'
  Write-Host ('  网络出口  →  ' + $proxy) -ForegroundColor DarkGray
} else {
  Write-Host '  网络出口  →  直连' -ForegroundColor DarkGray
}

# ---------------------------------------------------------------- 启动
$apiOut = Join-Path $root 'data\api.out.log'
$apiErr = Join-Path $root 'data\api.err.log'
$api = Start-Process -FilePath $node `
  -ArgumentList '--watch', '--watch-path=server', 'server/index.mjs' `
  -WorkingDirectory $root `
  -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $apiOut `
  -RedirectStandardError $apiErr

try {
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    if ($api.HasExited) { break }
    try {
      Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 1 | Out-Null
      $ready = $true
      break
    } catch { }
  }

  if (-not $ready) {
    $tail = if (Test-Path $apiErr) { Get-Content $apiErr -Tail 12 | Out-String } else { '' }
    throw "本地服务没起来。`n$tail"
  }

  Write-Host ''
  Write-Host '  漫剧画布  →  http://127.0.0.1:5173' -ForegroundColor Cyan
  Write-Host '  关闭这个窗口就会停止服务' -ForegroundColor DarkGray
  Write-Host ''

  $viteArgs = @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1')
  if (-not $NoBrowser) { $viteArgs += '--open' }
  & $node @viteArgs
} catch {
  Write-Host ''
  Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Finish 1
} finally {
  if ($api -and -not $api.HasExited) {
    Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
  }
}
