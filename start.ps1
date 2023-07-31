param(
    [string]$command = "pnpm start",
    [string]$SIGNAL_FILE = ".\.koishi_signal",
    [string]$CMDLOG_FILE = ".\.koishi_signal_cmdlogs"
)

# 主循环
function Main() {

    Write-Host "已启动守护进程..."
    ResetSignal
    ResetLog

    do {
        Invoke-Expression -Command $command

        $KSignal = GetSignal
        $exitCode = $LASTEXITCODE

        ResetLog
        ResetSignal

        $isReboot = CheckBit $KSignal 0
        $isGitSync = CheckBit $KSignal 1
        $isSkipWait = CheckBit $KSignal 2

        # 退出循环
        if ($exitCode -ne 0) {
            Write-Host "意料外的终止信号: $exitCode" -ForegroundColor Red
            break
        }
        elseif (!$isReboot) {
            Write-Host "预料内的终止信号，再见~" -ForegroundColor Green
            break
        }

        if (!$isSkipWait) {
            WriteLogLine "计划内重启，将在 5 秒后继续..."
            Start-Sleep -Seconds 5
        }

        if ($isGitSync) {
            WriteLogLine "正在从 GitHub 拉取最新内容..."
            RunAndLog "git pull"
            WriteLogLine "正在检查 NPM 依赖..."
            RunAndLog "pnpm install"
        }
    } while ($true)
}

function ResetLog() {
    Remove-Item $CMDLOG_FILE -ErrorAction SilentlyContinue
}
function RunAndLog($command) {
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$time] > $command" | Out-File -FilePath $CMDLOG_FILE -Append
    $out = Invoke-Expression -Command $command
    AddIndentation $out 1 | Out-File -FilePath $CMDLOG_FILE -Append
}
function WriteLogLine($line) {
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$time] $line" | Out-File -FilePath $CMDLOG_FILE -Append
}

function ResetSignal() {
    0 | Out-File -FilePath $SIGNAL_FILE
}
function GetSignal() {
    # 尝试获取文件内容，如果不存在，返回 "0"
    try {
        $signal = Get-Content -Path $SIGNAL_FILE
    }
    catch {
        $signal = "0"
    }
    if (![int]::TryParse($signal, [ref]$signal)) {
        $signal = "0"
    }
    return $signal
}

function AddIndentation($inputString, $numSpaces) {
    $indentedString = foreach ($line in $inputString -split "`n") {
        $indentation = '	' * $numSpaces
        $line = $indentation + $line
        $line
    }
    $finalString = $indentedString -join "`n"
    return $finalString
}

function CheckBit($value, $index) {
    if ($index -lt 1) {
        throw "Index must be a positive integer."
    }
    $index = $index - 1
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

Main
