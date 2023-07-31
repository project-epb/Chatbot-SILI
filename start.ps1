param(
  [string]$SIGNAL_FILE = ".\.koishi_signal"
)

# 主循环
function main() {
  Write-Host "已启动守护进程..."
  resetSignal
  
  do {
      # pnpm start
      pnpm start

      $koishiSignal = getSignal
      $exitCode = $LASTEXITCODE

      $isContinue = checkBit $koishiSignal 0
      $isGitSync = checkBit $koishiSignal 1
      $isSkipWait = checkBit $koishiSignal 2

      # 退出循环
      if ($exitCode -ne 0) {
          # 打印红色的错误信息
          Write-Host "程序异常退出，错误码：$exitCode" -ForegroundColor Red
          break
      } elseif (!$isContinue) {
          Write-Host "预料内的退出信号，再见。"
          break
      }

      if (!$isSkipWait) {
          Write-Host "计划内重启，将在 5 秒后继续..."
          Start-Sleep -Seconds 5
      }

      if ($isGitSync) {
          Write-Host "从 GitHub 同步..."
          git pull
          pnpm install
      }
  } while ($true)
}

function resetSignal() {
  0 | Out-File -FilePath $SIGNAL_FILE
}
function getSignal() {
  # 尝试获取文件内容，如果不存在，返回 "0"
  try {
      $signal = Get-Content -Path $SIGNAL_FILE
  } catch {
      $signal = "0"
  }
  if (![int]::TryParse($signal, [ref]$signal)) {
      $signal = "0"
  }
  resetSignal
  return $signal
}

function checkBit($value, $index) {
  if ($index -lt 0) {
      throw "Index must be a positive integer."
  }
  if ($value -is [string]) {
      if (![int]::TryParse($value, [ref]$value)) {
          throw "Invalid numeric value."
      }
  }
  if ($index -ge [math]::Floor([math]::Log($value, 2)) + 1) {
      return $false
  }
  $mask = 1 -shl $index
  return ($value -band $mask) -ne 0
}

main
