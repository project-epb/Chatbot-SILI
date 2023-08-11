param(
    [string]$command = "pnpm start",
    [string]$SIGNAL_FILE = $(Join-Path -Path $PSScriptRoot -ChildPath ".koishi_signal"),
    [string]$CMDLOG_FILE = $(Join-Path -Path $PSScriptRoot -ChildPath ".koishi_signal_cmdlogs")
)

$env:PROJECT_ROOT_DIR = $PSScriptRoot

# 主循环
function Main() {
    Write-Host "已启动守护进程..."
    Write-Host "启动指令: $command"
    Write-Host "信号文件: $SIGNAL_FILE"
    Write-Host "日志文件: $CMDLOG_FILE"

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
        $isDumpDB = CheckBit $KSignal 3

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

        if ($isDumpDB) {
            WriteLogLine "正在备份数据库..."
            RunAndLog ".\scripts\db_dump.ps1 -silent 1"
        }

        if ($isGitSync) {
            WriteLogLine "正在从远程 Git 仓库拉取更新..."
            RunAndLog "git fetch"

            $curGitHash = git rev-parse --short "HEAD"
            $originGitHash = git rev-parse --short "origin/HEAD"
            WriteLogLine "本地仓库当前 Git Hash: $curGitHash"
            WriteLogLine "远程仓库当前 Git Hash: $originGitHash"

            if ($curGitHash -ne $originGitHash) {
                RunAndLog "git pull"

                WriteLogLine "正在更新 NPM 依赖..."
                RunAndLog "pnpm install"
            }
            else {
                WriteLogLine "本地仓库已是最新版本，无需更新。"
            }

            RunAndLog "git log --graph $curGitHash..$originGitHash"
        }

    } while ($true)
}

function ResetLog() {
    Remove-Item $CMDLOG_FILE -ErrorAction SilentlyContinue
}
function RunAndLog($command) {
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    WriteLogLine "> $command"
    $result = Invoke-Expression -Command $command
    $result = AddIndentation $result 2
    Write-Host $result
    $result | Out-File -FilePath $CMDLOG_FILE -Append
}
function WriteLogLine($line) {
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$time] $line"
    Write-Host $line
    $line | Out-File -FilePath $CMDLOG_FILE -Append
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
        $indentation = ' ' * $numSpaces
        $line = $indentation + $line
        $line
    }
    $finalString = $indentedString -join "`n"
    return $finalString
}

function CheckBit($value, $index) {
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

Main
