param([Parameter(Mandatory=$true)][string]$SetupPath, [string]$VoiceTestRoot = '')
$ErrorActionPreference = 'Stop'
$SetupPath = (Resolve-Path $SetupPath).Path
Write-Host "Sessiz NSIS kurulumu: $SetupPath"
$install = Start-Process -FilePath $SetupPath -ArgumentList '/S' -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer exit code: $($install.ExitCode)" }
$exe = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Programs') -Recurse -Filter 'NedenmisStudio.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { throw 'Kurulan NedenmisStudio.exe bulunamadı.' }
$marker = Join-Path $env:TEMP "nedenmis-installed-smoke-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).json"
$env:NEDENMIS_SMOKE_TEST = $marker
if ($VoiceTestRoot) {
  $database = Join-Path $VoiceTestRoot 'storage\chatterbox-e2e.sqlite'
  $reference = Join-Path $VoiceTestRoot 'storage\assets\native-turkish-reference.wav'
  if (-not (Test-Path $database) -or -not (Test-Path $reference)) { throw 'Kurulu uygulama ses testi için kaynak E2E veritabanı ve Türkçe referans WAV gereklidir.' }
  $env:NEDENMIS_SMOKE_USER_DATA = $VoiceTestRoot
  $env:NEDENMIS_SMOKE_DATABASE = $database
  $env:NEDENMIS_SMOKE_REFERENCE = $reference
  $env:NEDENMIS_SMOKE_PROJECT = 'Buz neden suda yüzer?'
}
Write-Host "Kurulu uygulama terminal/Vite olmadan açılıyor: $($exe.FullName)"
$process = Start-Process -FilePath $exe.FullName -PassThru
$deadline = if ($VoiceTestRoot) { [DateTime]::UtcNow.AddMinutes(30) } else { [DateTime]::UtcNow.AddSeconds(90) }
while (-not (Test-Path $marker) -and [DateTime]::UtcNow -lt $deadline -and -not $process.HasExited) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Path $marker)) { if (-not $process.HasExited) { $process.Kill() }; throw 'Kurulu uygulama smoke sonucu üretmedi.' }
$report = Get-Content $marker -Raw | ConvertFrom-Json
if (-not $report.ok -or -not $report.packaged -or -not $report.rendererLoaded -or -not $report.voiceBridgeExists -or -not $report.ffmpegVersion) { throw "Kurulu uygulama doğrulaması başarısız: $($report | ConvertTo-Json -Compress)" }
if (-not (Test-Path $report.database)) { throw "SQLite veritabanı oluşturulamadı: $($report.database)" }
$voiceResult = $null
if ($VoiceTestRoot) {
  $voice = $report.installedVoice
  if (-not $voice -or $voice.providerId -ne 'chatterbox-multilingual-v3' -or $voice.checkpoint -ne 't3_mtl23ls_v3.safetensors' -or $voice.device -ne 'cpu' -or $voice.textPreprocessing -ne 'NFKD,fullcase' -or $voice.unknownTokens -ne 0 -or -not $voice.referenceSha256 -or $voice.generationSeconds -le 0 -or $voice.duration -le 0.5 -or -not (Test-Path $voice.audioPath)) { throw "Kurulu uygulamada gerçek V3 klonlama doğrulanamadı: $($report | ConvertTo-Json -Depth 6 -Compress)" }
  if ($report.projectCount -lt 1) { throw 'Kurulu uygulama kaynak E2E projelerini SQLite üzerinden geri açamadı.' }
  $animation = $report.installedAnimationPreview
  if (-not $animation -or -not $animation.changed -or -not $animation.played -or $animation.afterTime -le $animation.beforeTime) { throw 'Kurulu uygulamada gerçek animasyon önizlemesi ilerlemedi.' }
  $export = $report.installedExport
  if (-not $export -or $export.status -ne 'completed' -or -not (Test-Path $export.outputPath) -or $export.video.width -ne 1080 -or $export.video.height -ne 1920 -or $export.video.codec -ne 'h264') { throw 'Kurulu uygulamada MP4 export doğrulanamadı.' }
  $voiceResult = $voice
}
$process.WaitForExit(10000) | Out-Null
if (-not $process.HasExited) { $process.CloseMainWindow() | Out-Null; Start-Sleep -Seconds 2; if (-not $process.HasExited) { $process.Kill() } }
$persistentProjects = if ($VoiceTestRoot) { $report.projectCount } else { $null }
$result = @{ ok=$true; installedExecutable=$exe.FullName; installer=$SetupPath; launchWithoutTerminal=$true; sqliteCreated=$true; persistentProjectsReopened=$persistentProjects; ffmpeg=$report.ffmpegVersion; voiceBridge=$report.voiceBridgeExists; installedVoice=$voiceResult; installedAnimationPreview=$report.installedAnimationPreview; installedExport=$report.installedExport; userData=$report.userData; testedAt=[DateTime]::UtcNow.ToString('o') }
$result | ConvertTo-Json -Depth 4 | Set-Content -Path 'release/installer-test-result.json' -Encoding UTF8
Remove-Item $marker -Force -ErrorAction SilentlyContinue
Write-Host "Kurulu uygulama testi başarılı: $($result | ConvertTo-Json -Compress)"
