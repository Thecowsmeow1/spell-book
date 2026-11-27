<#
.SYNOPSIS
Builds the PowerShell tab's commands from this computer: ps-data-5.js when run
in Windows PowerShell 5.1, ps-data-7.js in PowerShell 7.

.DESCRIPTION
Run it once with each version the tab should list. Reads every cmdlet and function in the installed modules, with its parameters
and installed help, and writes them next to this script. Reading a command can
load its module. Nothing is run beyond that and nothing is changed or sent.
Descriptions come from the installed help; Update-Help (as administrator) fetches
missing or newer help.

.EXAMPLE
powershell -NoProfile -File modules\powershell\ps-export.ps1

.EXAMPLE
pwsh -NoProfile -File modules\powershell\ps-export.ps1
#>
[CmdletBinding()]
param(
    [string]$OutFile
)

# Not a parameter default: 5.1 can leave $PSScriptRoot empty there.
$major = $PSVersionTable.PSVersion.Major
if ($major -ne 5 -and $major -lt 7) { throw 'Run this in Windows PowerShell 5.1 or PowerShell 7.' }
$major = [Math]::Min($major, 7)
if (-not $OutFile) { $OutFile = Join-Path $PSScriptRoot "ps-data-$major.js" }
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
# Some parameters (such as Get-ChildItem -File) only exist on a file system path.
Set-Location $env:SystemRoot

function Get-PlainText($Items) {
    (@($Items | ForEach-Object { $_.Text }) -join "`n`n").Trim()
}

function Get-AllowedValue($Parameter) {
    $set = $Parameter.Attributes | Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] }
    if ($set) { return @($set.ValidValues) }
    $type = $Parameter.ParameterType
    if ($type.IsArray) { $type = $type.GetElementType() }
    $inner = [Nullable]::GetUnderlyingType($type)
    if ($inner) { $type = $inner }
    if ($type.IsEnum) { return @([Enum]::GetNames($type)) }
    if ($type -eq [bool]) { return @('$true', '$false') }
    @()
}

$common = @([System.Management.Automation.PSCmdlet]::CommonParameters) +
    @([System.Management.Automation.PSCmdlet]::OptionalCommonParameters)

$found = @(Get-Command -CommandType Cmdlet, Function | Where-Object Source |
        Sort-Object Name -Unique)
$done = 0
$failed = 0
$commands = foreach ($item in $found) {
    $done++
    if ($done % 100 -eq 0) { Write-Host "$done of $($found.Count)" }
    try {
        $qualified = "$($item.ModuleName)\$($item.Name)"
        $command = Get-Command -Name $qualified -ErrorAction Stop | Select-Object -First 1
        if (-not $command.Parameters) { throw 'no parameters' }
        $help = Get-Help -Name $qualified -Full -ErrorAction SilentlyContinue | Select-Object -First 1

        $notes = @{}
        foreach ($p in @($help.parameters.parameter)) {
            if ($p.name) {
                $notes[$p.name] = @{ d = Get-PlainText $p.description; df = "$($p.defaultValue)".Trim() }
            }
        }

        $parameters = [ordered]@{}
        foreach ($p in $command.Parameters.Values) {
            if ($common -contains $p.Name) { continue }
            $entry = [ordered]@{ t = $p.ParameterType.Name }
            if ($p.SwitchParameter) { $entry.sw = $true }
            if ($p.Aliases.Count) { $entry.a = @($p.Aliases) }
            if (-not $p.SwitchParameter) {
                $values = @(Get-AllowedValue $p)
                if ($values.Count) { $entry.v = $values }
            }
            if ($notes[$p.Name].d) { $entry.d = $notes[$p.Name].d }
            if ($notes[$p.Name].df -and $notes[$p.Name].df -notin 'None', 'False') { $entry.df = $notes[$p.Name].df }
            if ($p.Attributes | Where-Object { $_.ValueFromPipeline -or $_.ValueFromPipelineByPropertyName }) { $entry.pipe = $true }
            $parameters[$p.Name] = $entry
        }

        $sets = @(foreach ($set in $command.ParameterSets) {
                [ordered]@{
                    n   = $set.Name
                    def = $set.IsDefault
                    p   = @(foreach ($p in $set.Parameters) {
                            if ($common -contains $p.Name) { continue }
                            $position = if ($p.Position -ge 0) { $p.Position } else { -1 }
                            , @($p.Name, [int]$p.IsMandatory, $position)
                        })
                }
            })

        # Without help, the synopsis is just the syntax line.
        $synopsis = "$($help.Synopsis)".Trim()
        if ($synopsis.StartsWith($item.Name, [StringComparison]::OrdinalIgnoreCase)) { $synopsis = '' }

        $examples = @(foreach ($example in @($help.examples.example)) {
                if (-not $example) { continue }
                , @(
                    "$($example.title)".Trim(' ', '-'),
                    "$($example.code)".Trim(),
                    (@((Get-PlainText $example.introduction), (Get-PlainText $example.remarks)) -ne '' -join "`n`n").Trim()
                )
            })

        $link = "$($command.HelpUri)"
        [ordered]@{
            n      = $item.Name
            m      = "$($item.ModuleName)"
            s      = $synopsis
            d      = Get-PlainText $help.description
            u      = $link
            a      = @()
            sets   = $sets
            params = $parameters
            ex     = $examples
        }
    }
    catch {
        $failed++
    }
}

if (-not $commands) { throw 'No commands were read; the data file was left as it was.' }

# Aliases last: reading the commands loaded their modules, which add their own.
# Get-Command adds the ones that modules export without being loaded.
$aliases = @{}
foreach ($alias in @(Get-Alias) + @(Get-Command -CommandType Alias)) {
    $target = "$($alias.Definition)" -replace '^.*\\', ''
    if ($target) { $aliases[$target] += @($alias.Name) }
}
foreach ($entry in $commands) {
    $entry.a = @($aliases[$entry.n] | Where-Object { $_ } | Sort-Object -Unique)
}

$data = [ordered]@{
    built    = (Get-Date -Format 'yyyy-MM-dd')
    version  = "$($PSVersionTable.PSVersion)"
    common   = @($common)
    commands = @($commands)
}
$json = $data | ConvertTo-Json -Depth 8 -Compress
Set-Content -LiteralPath $OutFile -Encoding utf8 -Value @(
    "// PowerShell commands of this computer, built by modules/powershell/ps-export.ps1. Not for commits.",
    "window.SPELLBOOK_PS$major = $json;"
)
Write-Host "$(@($commands).Count) commands written ($failed skipped), $([int]((Get-Item -LiteralPath $OutFile).Length / 1KB)) KB"
