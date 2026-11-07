param([Parameter(Mandatory=$true)][string]$SetupPath)
$ErrorActionPreference = 'Stop'
$SetupPath = (Resolve-Path $SetupPath).Path
Write-Host "Sessiz NSIS kurulumu: $SetupPath"
$install = Start-Process -FilePath $SetupPath -ArgumentList '/S' -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer exit code: $($install.ExitCode)" }
$exe = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Programs') -Recurse -Filter 'NedenmisStudio.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { throw 'Kurulan NedenmisStudio.exe bulunamadı.' }
$marker = Join-Path $env:TEMP "nedenmis-installed-smoke-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).json"
$env:NEDENMIS_SMOKE_TEST = $marker
Write-Host "Kurulu uygulama terminal/Vite olmadan açılıyor: $($exe.FullName)"
$process = Start-Process -FilePath $exe.FullName -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(90)
while (-not (Test-Path $marker) -and [DateTime]::UtcNow -lt $deadline -and -not $process.HasExited) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Path $marker)) { if (-not $process.HasExited) { $process.Kill() }; throw 'Kurulu uygulama smoke sonucu üretmedi.' }
$report = Get-Content $marker -Raw | ConvertFrom-Json
if (-not $report.ok -or -not $report.packaged -or -not $report.rendererLoaded -or -not $report.voiceBridgeExists -or -not $report.ffmpegVersion) { throw "Kurulu uygulama doğrulaması başarısız: $($report | ConvertTo-Json -Compress)" }
if (-not (Test-Path $report.database)) { throw "SQLite veritabanı oluşturulamadı: $($report.database)" }
$process.WaitForExit(10000) | Out-Null
if (-not $process.HasExited) { $process.CloseMainWindow() | Out-Null; Start-Sleep -Seconds 2; if (-not $process.HasExited) { $process.Kill() } }
$result = @{ ok=$true; installedExecutable=$exe.FullName; installer=$SetupPath; launchWithoutTerminal=$true; sqliteCreated=$true; ffmpeg=$report.ffmpegVersion; voiceBridge=$report.voiceBridgeExists; userData=$report.userData; testedAt=[DateTime]::UtcNow.ToString('o') }
$result | ConvertTo-Json -Depth 4 | Set-Content -Path 'release/installer-test-result.json' -Encoding UTF8
Remove-Item $marker -Force -ErrorAction SilentlyContinue
Write-Host "Kurulu uygulama testi başarılı: $($result | ConvertTo-Json -Compress)"
