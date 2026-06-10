$ErrorActionPreference = "Stop"

$runnerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $runnerRoot "launch-protocol.ps1"
$powershell = Join-Path $PSHOME "powershell.exe"
$protocolRoot = "HKCU:\Software\Classes\wizzy-cnis-runner"
$commandPath = Join-Path $protocolRoot "shell\open\command"
$iconPath = Join-Path $protocolRoot "DefaultIcon"
$command = "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" `"%1`""

New-Item -Path $protocolRoot -Force | Out-Null
New-Item -Path $commandPath -Force | Out-Null
New-Item -Path $iconPath -Force | Out-Null

(Get-Item $protocolRoot).SetValue("", "URL:Wizzy CNIS Runner")
New-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
(Get-Item $iconPath).SetValue("", "$powershell,0")
(Get-Item $commandPath).SetValue("", $command)

Write-Host "Wizzy CNIS Runner instalado neste Windows."
Write-Host "Agora o botao Login certificado da Wizzy pode abrir o runner pelo navegador."
