# This PowerShell script is used to make a MongoDB dump for SILI.

param(
    [string]$db = "sili_v4"
)

# 有可能从任何地方调用此脚本，我们需要获取 ../backup 目录的绝对路径
$script_path = $MyInvocation.MyCommand.Path
$script_dir = Split-Path $script_path
$backup_dir = Join-Path $script_dir "..\.backups"

# 确保备份目录存在
if (-not (Test-Path $backup_dir)) {
    New-Item -ItemType Directory -Path $backup_dir
}

$cur_date = Get-Date -Format "yyyyMMddHHmmss"

docker exec -i sili-mongo bash -c "mongodump --db $db --archive --gzip" > "$backup_dir\mongo_dump-$db-$cur_date.archive.gz"