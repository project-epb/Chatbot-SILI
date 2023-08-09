# This PowerShell script is used to make a MongoDB dump for SILI.

param(
    [string]$db = "sili_v4"
)


$double_click_run = [string]::IsNullOrEmpty($MyInvocation.Line)

$cur_date = Get-Date -Format "yyyyMMddHHmmss"
$dump_dir = "$env:USERPROFILE\mongo_dump\$db-$cur_date"

mongodump --host 127.0.0.1 --port 27017 --db $db --out $dump_dir

Write-Host "Database $db is backed up to: $dump_dir"

if ($double_click_run) {
    Write-Host "Press `"y`" to open the directory, anything else to exit..."
    $keyInfo = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    if ($keyInfo.KeyDown -and $keyInfo.VirtualKeyCode -eq 89) {
        explorer $dump_dir
    }
}
