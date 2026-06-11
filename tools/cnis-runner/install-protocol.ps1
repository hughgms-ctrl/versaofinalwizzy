$ErrorActionPreference = "Stop"

$runnerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $runnerRoot "launch-protocol.ps1"
$powershell = Join-Path $PSHOME "powershell.exe"
$command = "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" `"%1`""

$root = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Classes\wizzy-cnis-runner")
$icon = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Classes\wizzy-cnis-runner\DefaultIcon")
$open = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Classes\wizzy-cnis-runner\shell\open\command")

$root.SetValue("", "URL:Wizzy Prev Runner", [Microsoft.Win32.RegistryValueKind]::String)
$root.SetValue("URL Protocol", "", [Microsoft.Win32.RegistryValueKind]::String)
$icon.SetValue("", "$powershell,0", [Microsoft.Win32.RegistryValueKind]::String)
$open.SetValue("", $command, [Microsoft.Win32.RegistryValueKind]::String)

$open.Close()
$icon.Close()
$root.Close()

Write-Host "Wizzy Prev Runner instalado neste Windows."
Write-Host "Agora o botao Login certificado da Wizzy pode abrir o runner pelo navegador."
