# This PowerShell script is used to make a MongoDB dump for SILI.

param(
    [string]$db = "sili_v4",
    [bool]$open = $false,
    [bool]$silent = $false
)

$cur_date = Get-Date -Format "yyyyMMddhhmmss"
$dump_dir = "$env:USERPROFILE\mongo_dump\$cur_date"

mongodump --host 127.0.0.1 --port 27017 --db $db --out $dump_dir

if ($open) {
    Write-Host "Opening dump directory..."
    explorer $dump_dir
    return
}

if (!$silent) {
    Write-Host "Dump directory: $dump_dir"
    Write-Host "Press any key to continue..."
    $x = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
