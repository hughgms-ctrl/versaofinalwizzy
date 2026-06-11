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

function Copy-Tree($Source, $Destination) {
  robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "Falha ao copiar $Source para $Destination com robocopy. Codigo $LASTEXITCODE"
  }
  $global:LASTEXITCODE = 0
}

function Clear-Directory($Path) {
  if (-not (Test-Path $Path)) { return }
  $empty = Join-Path ([System.IO.Path]::GetTempPath()) ("wizzy-empty-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $empty | Out-Null
  try {
    robocopy $empty $Path /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) {
      throw "Falha ao limpar $Path com robocopy. Codigo $LASTEXITCODE"
    }
    $global:LASTEXITCODE = 0
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  } finally {
    Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
  }
}

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
  Clear-Directory $outputPath
}

New-Item -ItemType Directory -Path $outputPath | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputPath "runtime") | Out-Null

Copy-Tree (Join-Path $runnerRoot "src") (Join-Path $outputPath "src")
Copy-Tree (Join-Path $runnerRoot "node_modules") (Join-Path $outputPath "node_modules")
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
Copy-Tree $extensionSource (Join-Path $extensionParent "cnis-checker")

$zipPath = "$outputPath.zip"
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$outputName = Split-Path -Leaf $outputPath
& tar.exe -a -cf $zipPath -C $distRoot $outputName
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao criar ZIP em $zipPath com tar.exe. Codigo $LASTEXITCODE"
}
$global:LASTEXITCODE = 0

Write-Host "Pacote portatil criado em:"
Write-Host $outputPath
Write-Host "ZIP criado em:"
Write-Host $zipPath
Write-Host "No cliente, execute install-protocol.cmd uma vez. Nao precisa Node/npm instalado."
