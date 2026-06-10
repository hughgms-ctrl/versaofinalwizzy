param(
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$runnerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $runnerRoot "..\..")
$defaultOutput = Join-Path $runnerRoot "dist\wizzy-cnis-runner-win"
$output = if ($OutputDir) { $OutputDir } else { $defaultOutput }
$outputPath = [System.IO.Path]::GetFullPath($output)
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $runnerRoot "dist"))

if (-not $outputPath.StartsWith($distRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDir precisa ficar dentro de $distRoot"
}

$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source

Push-Location $runnerRoot
try {
  if (-not (Test-Path "node_modules")) {
    npm install
  }

  $env:PLAYWRIGHT_BROWSERS_PATH = "0"
  npx playwright install chromium
} finally {
  Pop-Location
}

if (Test-Path $outputPath) {
  Remove-Item -LiteralPath $outputPath -Recurse -Force
}

New-Item -ItemType Directory -Path $outputPath | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputPath "runtime") | Out-Null

Copy-Item -LiteralPath (Join-Path $runnerRoot "src") -Destination $outputPath -Recurse
Copy-Item -LiteralPath (Join-Path $runnerRoot "node_modules") -Destination $outputPath -Recurse
Copy-Item -LiteralPath (Join-Path $runnerRoot "package.json") -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $runnerRoot "package-lock.json") -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $runnerRoot "README.md") -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $runnerRoot "install-protocol.cmd") -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $runnerRoot "install-protocol.ps1") -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $runnerRoot "launch-protocol.ps1") -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $runnerRoot "install-protocol-macos.command") -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $runnerRoot "launch-protocol-macos.sh") -Destination $outputPath
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $outputPath "runtime\node.exe")

$extensionSource = Join-Path $repoRoot "Wizzy Cnis Leitura\cnis-checker"
$extensionParent = Join-Path $outputPath "Wizzy Cnis Leitura"
New-Item -ItemType Directory -Path $extensionParent -Force | Out-Null
Copy-Item -LiteralPath $extensionSource -Destination $extensionParent -Recurse -Force

Write-Host "Pacote portatil criado em:"
Write-Host $outputPath
Write-Host "No cliente, execute install-protocol.cmd uma vez. Nao precisa Node/npm instalado."
