param(
  [string]$ZipPath = "",
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$runnerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $runnerRoot "..\..")
$defaultZip = Join-Path $runnerRoot "dist\wizzy-cnis-runner-win.zip"
$defaultOutput = Join-Path $repoRoot "public\downloads\wizzy-prev-runner-win.exe"
$zip = if ($ZipPath) { $ZipPath } else { $defaultZip }
$output = if ($OutputPath) { $OutputPath } else { $defaultOutput }
$zipPath = [System.IO.Path]::GetFullPath($zip)
$outputPath = [System.IO.Path]::GetFullPath($output)
$publicDownloads = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "public\downloads"))

if (-not (Test-Path $zipPath)) {
  throw "Pacote ZIP nao encontrado: $zipPath. Rode npm run build:portable:win antes."
}

if (-not $outputPath.StartsWith($publicDownloads, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputPath precisa ficar dentro de $publicDownloads"
}

New-Item -ItemType Directory -Path $publicDownloads -Force | Out-Null

$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("wizzy-prev-installer-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $workRoot | Out-Null

try {
  $stubPath = Join-Path $workRoot "WizzyPrevRunnerInstallerStub.exe"
  $stubSource = @'
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Text;

public static class WizzyPrevRunnerInstaller
{
    private const string Marker = "WIZZY_PREV_RUNNER_ZIP:";

    public static int Main()
    {
        try
        {
            Console.Title = "Wizzy Prev Runner";
            Console.WriteLine("Instalando Wizzy Prev Runner...");

            string exePath = Process.GetCurrentProcess().MainModule.FileName;
            ZipPayload payload = FindPayload(exePath);
            string tempRoot = Path.Combine(Path.GetTempPath(), "wizzy-prev-runner-" + Guid.NewGuid().ToString("N"));
            string zipPath = Path.Combine(tempRoot, "runner.zip");
            string extractRoot = Path.Combine(tempRoot, "extract");
            string installRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Wizzy Prev Runner"
            );

            Directory.CreateDirectory(tempRoot);
            Directory.CreateDirectory(extractRoot);

            try
            {
                ExtractPayload(exePath, zipPath, payload);
                ZipFile.ExtractToDirectory(zipPath, extractRoot);

                string packagedRoot = Path.Combine(extractRoot, "wizzy-cnis-runner-win");
                string sourceRoot = Directory.Exists(packagedRoot) ? packagedRoot : extractRoot;

                if (Directory.Exists(installRoot))
                {
                    Directory.Delete(installRoot, true);
                }

                Directory.CreateDirectory(installRoot);
                CopyDirectory(sourceRoot, installRoot);

                string protocolInstaller = Path.Combine(installRoot, "install-protocol.ps1");
                if (!File.Exists(protocolInstaller))
                {
                    throw new FileNotFoundException("install-protocol.ps1 nao encontrado no pacote.", protocolInstaller);
                }

                RunPowerShell(protocolInstaller, installRoot);
                Console.WriteLine("Wizzy Prev Runner instalado em: " + installRoot);
                Console.WriteLine("Voce ja pode voltar para a Wizzy e abrir o runner.");
                return 0;
            }
            finally
            {
                TryDelete(tempRoot);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Falha ao instalar o Wizzy Prev Runner.");
            Console.Error.WriteLine(ex.Message);
            Console.Error.WriteLine("Pressione Enter para fechar.");
            Console.ReadLine();
            return 1;
        }
    }

    private static ZipPayload FindPayload(string exePath)
    {
        using (FileStream stream = File.OpenRead(exePath))
        {
            int tailLength = (int)Math.Min(2048, stream.Length);
            stream.Seek(-tailLength, SeekOrigin.End);
            byte[] tail = new byte[tailLength];
            stream.Read(tail, 0, tail.Length);

            string text = Encoding.ASCII.GetString(tail);
            int index = text.LastIndexOf(Marker, StringComparison.Ordinal);
            if (index < 0)
            {
                throw new InvalidDataException("Pacote interno do runner nao encontrado.");
            }

            string line = text.Substring(index).Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0];
            string[] parts = line.Substring(Marker.Length).Split(':');
            if (parts.Length != 2)
            {
                throw new InvalidDataException("Marcador interno do runner invalido.");
            }

            return new ZipPayload(long.Parse(parts[0]), long.Parse(parts[1]));
        }
    }

    private static void ExtractPayload(string exePath, string zipPath, ZipPayload payload)
    {
        byte[] buffer = new byte[1024 * 1024];
        long remaining = payload.Length;

        using (FileStream input = File.OpenRead(exePath))
        using (FileStream output = File.Create(zipPath))
        {
            input.Seek(payload.Offset, SeekOrigin.Begin);
            while (remaining > 0)
            {
                int read = input.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                if (read <= 0) throw new EndOfStreamException("Pacote interno do runner incompleto.");
                output.Write(buffer, 0, read);
                remaining -= read;
            }
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        foreach (string directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(directory.Replace(source, destination));
        }

        foreach (string file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
        {
            string target = file.Replace(source, destination);
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            File.Copy(file, target, true);
        }
    }

    private static void RunPowerShell(string scriptPath, string workingDirectory)
    {
        string powershell = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.System),
            @"WindowsPowerShell\v1.0\powershell.exe"
        );

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = powershell,
            Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"",
            WorkingDirectory = workingDirectory,
            UseShellExecute = false
        };

        using (Process process = Process.Start(startInfo))
        {
            process.WaitForExit();
            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException("Registro do protocolo falhou com codigo " + process.ExitCode + ".");
            }
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, true);
        }
        catch {}
    }

    private struct ZipPayload
    {
        public readonly long Offset;
        public readonly long Length;

        public ZipPayload(long offset, long length)
        {
            Offset = offset;
            Length = length;
        }
    }
}
'@

  Add-Type `
    -TypeDefinition $stubSource `
    -Language CSharp `
    -OutputAssembly $stubPath `
    -OutputType ConsoleApplication `
    -ReferencedAssemblies "System.IO.Compression.FileSystem.dll"

  if (Test-Path $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
  }

  Copy-Item -LiteralPath $stubPath -Destination $outputPath

  $outputStream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
  $zipStream = [System.IO.File]::OpenRead($zipPath)
  try {
    $offset = $outputStream.Position
    $zipLength = $zipStream.Length
    $zipStream.CopyTo($outputStream)
    $markerBytes = [System.Text.Encoding]::ASCII.GetBytes("`nWIZZY_PREV_RUNNER_ZIP:$offset`:$zipLength`n")
    $outputStream.Write($markerBytes, 0, $markerBytes.Length)
  } finally {
    $zipStream.Dispose()
    $outputStream.Dispose()
  }

  Write-Host "Instalador Windows criado em:"
  Write-Host $outputPath
} finally {
  Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
}
