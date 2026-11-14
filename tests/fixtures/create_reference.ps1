param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $speaker.GetInstalledVoices() | Select-Object -First 1
if (-not $voice) { throw 'CI referans üretimi için sistem sesi bulunamadı.' }
$speaker.SelectVoice($voice.VoiceInfo.Name)
$speaker.Rate = 0
$text = 'This is an authorized synthetic reference voice created only for an automated software test. The quick brown fox jumps over the lazy dog. Science helps us understand light, sound, gravity, and the world around us. We will use this recording as a real speaker reference for cross language Turkish voice generation.'
$speaker.SetOutputToWaveFile($OutputPath)
$speaker.Speak($text)
$speaker.Dispose()
if (-not (Test-Path $OutputPath)) { throw 'Referans WAV üretilemedi.' }
Write-Host "Sentetik CI konuşmacı referansı: $OutputPath"
