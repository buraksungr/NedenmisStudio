param([Parameter(Mandatory=$true)][string]$ZipPath, [Parameter(Mandatory=$true)][string]$VoiceTestRoot)
$ErrorActionPreference = 'Stop'
$ZipPath = (Resolve-Path $ZipPath).Path
if (Test-Path 'release/installer-test-result.json') { throw 'Taşınabilir ZIP testi installer testinden önce çalışmalıdır; eski installer raporunu kaldırın.' }
$sourceDatabase = Join-Path $VoiceTestRoot 'storage\chatterbox-e2e.sqlite'
if (-not (Test-Path $sourceDatabase)) { throw "Taşınabilir test için kaynak SQLite bulunamadı: $sourceDatabase" }
$testRoot = Join-Path $env:RUNNER_TEMP "nedenmis-portable-$([guid]::NewGuid().ToString('N'))"
$extracted = Join-Path $testRoot 'extracted'
$userData = Join-Path $testRoot 'user-data'
New-Item -ItemType Directory -Force -Path $extracted, $userData | Out-Null
Expand-Archive -LiteralPath $ZipPath -DestinationPath $extracted -Force
$exe = Join-Path $extracted 'NedenmisStudio\NedenmisStudio.exe'
$bridge = Join-Path $extracted 'NedenmisStudio\resources\voice-engine\bridge.py'
if (-not (Test-Path $exe) -or -not (Test-Path $bridge)) { throw 'ZIP içinden çıkarılan uygulama veya V3 köprüsü bulunamadı.' }
# Source DB is copied, never modified. The extracted app uses its own user-data/export directories.
$copiedDatabase = Join-Path $userData 'nedenmis-studio.sqlite'
Copy-Item $sourceDatabase $copiedDatabase -Force
$marker = Join-Path $testRoot 'portable-smoke.json'
$env:NEDENMIS_SMOKE_TEST = $marker
$env:NEDENMIS_SMOKE_USER_DATA = $userData
$env:NEDENMIS_SMOKE_PROJECT = 'Gökyüzü neden mavi görünür?'
Remove-Item Env:NEDENMIS_SMOKE_DATABASE -ErrorAction SilentlyContinue
Remove-Item Env:NEDENMIS_SMOKE_REFERENCE -ErrorAction SilentlyContinue
Write-Host "ZIP'ten çıkarılan uygulama installer olmadan açılıyor: $exe"
$process = Start-Process -FilePath $exe -PassThru
$deadline = [DateTime]::UtcNow.AddMinutes(25)
while (-not (Test-Path $marker) -and [DateTime]::UtcNow -lt $deadline -and -not $process.HasExited) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Path $marker)) { if (-not $process.HasExited) { $process.Kill() }; throw 'Taşınabilir uygulama smoke sonucu üretmedi.' }
$report = Get-Content $marker -Raw | ConvertFrom-Json
if (-not $report.ok -or -not $report.packaged -or -not $report.rendererLoaded -or -not $report.voiceBridgeExists -or -not $report.ffmpegVersion) { throw "Taşınabilir uygulama açılışı başarısız: $($report | ConvertTo-Json -Depth 6 -Compress)" }
if ($report.database -ne $copiedDatabase -or -not (Test-Path $report.database)) { throw 'Taşınabilir uygulama bağımsız kopya SQLite veritabanını kullanmadı.' }
$animation = $report.installedAnimationPreview
if (-not $animation -or $animation.preset -ne 'light-scattering' -or -not $animation.changed -or -not $animation.played -or $animation.afterTime -le $animation.beforeTime) { throw "Taşınabilir uygulamada Rayleigh önizlemesi ilerlemedi: $($animation | ConvertTo-Json -Compress)" }
$export = $report.installedExport
if (-not $export -or $export.status -ne 'completed' -or -not (Test-Path $export.outputPath) -or $export.video.width -ne 1080 -or $export.video.height -ne 1920 -or $export.video.codec -ne 'h264') { throw 'Taşınabilir uygulamada gökyüzü MP4 export doğrulanamadı.' }
$ffprobe = node -e "console.log(require('@ffprobe-installer/ffprobe').path)"
$probe = (& $ffprobe -v error -count_frames -show_entries 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,sample_rate,channels' -of json $export.outputPath) | ConvertFrom-Json
$video = $probe.streams | Where-Object { $_.codec_type -eq 'video' } | Select-Object -First 1
$audio = $probe.streams | Where-Object { $_.codec_type -eq 'audio' } | Select-Object -First 1
$sourceResult = Get-Content 'release/sky-production-result.json' -Raw | ConvertFrom-Json
if ($video.r_frame_rate -ne '30/1' -or $video.avg_frame_rate -ne '30/1' -or [int]$video.nb_read_frames -ne [int]$sourceResult.video.decodedFrames -or $audio.codec_name -ne 'aac') { throw "Taşınabilir MP4 bağımsız ffprobe kapısı başarısız: $($probe | ConvertTo-Json -Depth 5 -Compress)" }
$process.WaitForExit(10000) | Out-Null
if (-not $process.HasExited) { $process.CloseMainWindow() | Out-Null; Start-Sleep -Seconds 2; if (-not $process.HasExited) { $process.Kill() } }
New-Item -ItemType Directory -Force -Path 'release/Portable-Uygulama-Testi' | Out-Null
$portableVideo = Join-Path $PWD 'release/Portable-Uygulama-Testi/portable-sky.mp4'
Copy-Item $export.outputPath $portableVideo -Force
$zipItem = Get-Item $ZipPath
$result = @{ ok=$true; zip=$ZipPath; zipBytes=$zipItem.Length; zipSha256=(Get-FileHash $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); extractedExecutable=$exe; launchedFromExtractedZip=$true; installerUsed=$false; independentDatabaseCopy=$report.database; rendererLoaded=$report.rendererLoaded; voiceBridge=$report.voiceBridgeExists; ffmpeg=$report.ffmpegVersion; animationPreview=$animation; export=$export; independentProbe=$probe; portableVideo=$portableVideo; testedAt=[DateTime]::UtcNow.ToString('o') }
$result | ConvertTo-Json -Depth 8 | Set-Content 'release/portable-test-result.json' -Encoding UTF8
Remove-Item $marker -Force -ErrorAction SilentlyContinue
Remove-Item Env:NEDENMIS_SMOKE_TEST, Env:NEDENMIS_SMOKE_USER_DATA, Env:NEDENMIS_SMOKE_PROJECT -ErrorAction SilentlyContinue
Write-Host "Bağımsız taşınabilir ZIP testi başarılı: $($result | ConvertTo-Json -Depth 4 -Compress)"
