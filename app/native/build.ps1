# Compiles Helper.cs -> bin\helper.exe with the .NET Framework compiler that ships with Windows.
$ErrorActionPreference = 'Stop'
$fw  = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$csc = Join-Path $fw 'csc.exe'
$gac = Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL'

function Find-Ref([string]$name) {
    $hit = Get-ChildItem -Path (Join-Path $gac $name) -Filter "$name.dll" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*\v4.0_*' } | Select-Object -First 1
    if (-not $hit) { $p = Join-Path $fw "$name.dll"; if (Test-Path $p) { return $p }; throw "reference not found: $name" }
    return $hit.FullName
}

$refs = @('System', 'System.Core', 'System.Drawing', 'System.Windows.Forms', 'UIAutomationClient', 'UIAutomationTypes',
          'WindowsBase', 'System.Speech', 'System.Web.Extensions') | ForEach-Object { '/reference:' + (Find-Ref $_) }

$bin = Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$out = Join-Path $bin 'helper.exe'

& $csc /nologo /noconfig /target:winexe /platform:anycpu /optimize+ /warn:4 "/out:$out" @refs (Join-Path $PSScriptRoot 'Helper.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
Write-Output "built $out"
