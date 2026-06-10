param(
  [string]$Url = ""
)

$ErrorActionPreference = "SilentlyContinue"

$runnerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($env:WIZZY_CNIS_RUNNER_PORT) { [int]$env:WIZZY_CNIS_RUNNER_PORT } else { 8787 }
$baseUrl = "http://127.0.0.1:$port"

function Test-Runner {
  try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 1
    return [bool]$response.ok
  } catch {
    return $false
  }
}

function Wait-Runner {
  param([int]$Seconds = 25)

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Runner) { return $true }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Start-Runner {
  $outLog = Join-Path $runnerRoot "cnis-runner.out.log"
  $errLog = Join-Path $runnerRoot "cnis-runner.err.log"
  $command = "cd /d `"$runnerRoot`" && npm start >> `"$outLog`" 2>> `"$errLog`""
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WindowStyle Hidden | Out-Null
}

if (-not (Test-Runner)) {
  Start-Runner
  Wait-Runner | Out-Null
}

if ($Url -match "certificate-login") {
  try {
    Invoke-RestMethod -Uri "$baseUrl/auth/certificate-login" -Method Post -TimeoutSec 4 | Out-Null
  } catch {}
}
