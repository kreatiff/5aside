param(
  [int]$IntervalSeconds = 5,
  [string]$LogFile = ".codex/git-health-watch.log",
  [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$logPath = if ([System.IO.Path]::IsPathRooted($LogFile)) {
  $LogFile
} else {
  Join-Path $repoRoot $LogFile
}
$logDir = Split-Path $logPath -Parent
if ($logDir -and -not (Test-Path $logDir)) {
  New-Item -Path $logDir -ItemType Directory -Force | Out-Null
}

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  $line | Tee-Object -FilePath $script:logPath -Append
}

function Get-StatusEntries {
  $lines = & git status --porcelain=v1 --untracked-files=all 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "git status failed with exit code $LASTEXITCODE"
  }

  $entries = @()
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    $code = $line.Substring(0, 2)
    $path = $line.Substring(3).Trim()
    if ($path -like "* -> *") {
      $path = ($path -split " -> ", 2)[1].Trim()
    }
    $entries += [PSCustomObject]@{
      Code = $code
      Path = $path -replace "\\", "/"
      Raw  = $line
    }
  }
  return $entries
}

function Test-IgnoredPath {
  param([string]$Path)
  $p = $Path.ToLowerInvariant()
  if ($p -like "node_modules/*") { return $true }
  if ($p -like "*.tsbuildinfo") { return $true }
  if ($p -like "apps/api/dist/*") { return $true }
  if ($p -like "apps/web/dist/*") { return $true }
  if ($p -like "packages/contracts/dist/*") { return $true }
  if ($p -like "packages/recon/dist/*") { return $true }
  if ($p -eq ".codex/git-health-watch.log") { return $true }
  return $false
}

function Get-RelevantEntries {
  param([object[]]$Entries)
  return @($Entries | Where-Object { -not (Test-IgnoredPath $_.Path) })
}

function Add-Check {
  param(
    [System.Collections.Generic.List[object]]$Checks,
    [System.Collections.Generic.HashSet[string]]$Seen,
    [string]$Name,
    [string[]]$NpmArgs
  )
  if ($Seen.Add($Name)) {
    $Checks.Add([PSCustomObject]@{
      Name    = $Name
      NpmArgs = $NpmArgs
    })
  }
}

function Get-ChecksForPaths {
  param(
    [string[]]$Paths,
    [switch]$SkipTests
  )

  $checks = New-Object System.Collections.Generic.List[object]
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

  $hasApi = $false
  $hasWeb = $false
  $hasContracts = $false
  $hasRecon = $false
  $hasRootConfig = $false

  foreach ($path in $Paths) {
    if ($path -like "apps/api/*") { $hasApi = $true; continue }
    if ($path -like "apps/web/*") { $hasWeb = $true; continue }
    if ($path -like "packages/contracts/*") { $hasContracts = $true; continue }
    if ($path -like "packages/recon/*") { $hasRecon = $true; continue }

    if ($path -match "^(package(-lock)?\.json|tsconfig.*\.json|vitest.*|eslint.*|\.eslintrc.*)$") {
      $hasRootConfig = $true
    }
  }

  if ($hasContracts) {
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/contracts:typecheck" -NpmArgs @("run", "typecheck", "-w", "@fiveaside/contracts")
    if (-not $SkipTests) {
      Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/contracts:test" -NpmArgs @("run", "test", "-w", "@fiveaside/contracts")
    }
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/api:typecheck" -NpmArgs @("run", "typecheck", "-w", "@fiveaside/api")
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/web:typecheck" -NpmArgs @("run", "typecheck", "-w", "@fiveaside/web")
  }

  if ($hasRecon) {
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/recon:typecheck" -NpmArgs @("run", "typecheck", "-w", "@fiveaside/recon")
    if (-not $SkipTests) {
      Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/recon:test" -NpmArgs @("run", "test", "-w", "@fiveaside/recon")
    }
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/api:typecheck" -NpmArgs @("run", "typecheck", "-w", "@fiveaside/api")
  }

  if ($hasApi) {
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/api:typecheck" -NpmArgs @("run", "typecheck", "-w", "@fiveaside/api")
    if (-not $SkipTests) {
      Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/api:test" -NpmArgs @("run", "test", "-w", "@fiveaside/api")
    }
  }

  if ($hasWeb) {
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/web:typecheck" -NpmArgs @("run", "typecheck", "-w", "@fiveaside/web")
    Add-Check -Checks $checks -Seen $seen -Name "@fiveaside/web:lint" -NpmArgs @("run", "lint", "-w", "@fiveaside/web")
  }

  if ($hasRootConfig) {
    Add-Check -Checks $checks -Seen $seen -Name "root:typecheck" -NpmArgs @("run", "typecheck")
    if (-not $SkipTests) {
      Add-Check -Checks $checks -Seen $seen -Name "root:test" -NpmArgs @("run", "test")
    }
  }

  return @($checks.ToArray())
}

function Invoke-NpmCheck {
  param(
    [string]$Name,
    [string[]]$NpmArgs
  )

  Write-Log "Running $Name -> npm $($NpmArgs -join ' ')"
  $output = & npm @NpmArgs 2>&1
  $exitCode = $LASTEXITCODE

  if ($exitCode -eq 0) {
    Write-Log "PASS $Name"
    return $true
  }

  Write-Log "FAIL $Name (exit $exitCode)"
  if ($output) {
    $output | Tee-Object -FilePath $script:logPath -Append | Out-Null
  }
  return $false
}

function Find-ConflictMarkers {
  param([string[]]$Paths)
  $markers = @()
  foreach ($path in $Paths) {
    $fullPath = Join-Path $repoRoot $path
    if (-not (Test-Path $fullPath -PathType Leaf)) {
      continue
    }
    $matches = Select-String -Path $fullPath -Pattern "^(<<<<<<<|=======|>>>>>>>)" -CaseSensitive -ErrorAction SilentlyContinue
    foreach ($m in $matches) {
      $markers += "${path}:$($m.LineNumber): $($m.Line.Trim())"
    }
  }
  return @($markers)
}

Write-Log "Starting git health watcher in $repoRoot (interval: ${IntervalSeconds}s, skip tests: $SkipTests)"
Write-Log "Logging to $logPath"

$lastSignature = ""

while ($true) {
  try {
    $entries = Get-StatusEntries
    $relevant = Get-RelevantEntries -Entries $entries
    $signature = ($relevant | ForEach-Object { "$($_.Code)|$($_.Path)" }) -join "`n"

    if ($signature -ne $lastSignature) {
      $lastSignature = $signature

      if ($relevant.Count -eq 0) {
        Write-Log "Working tree clean (ignoring generated files)."
      } else {
        $paths = @($relevant | ForEach-Object { $_.Path } | Sort-Object -Unique)
        Write-Log ("Detected changes in {0} file(s): {1}" -f $paths.Count, ($paths -join ", "))

        $unmerged = @($relevant | Where-Object { $_.Code -match "U" -or $_.Code -in @("AA", "DD") })
        if ($unmerged.Count -gt 0) {
          Write-Log "FAIL merge conflict status detected in index/worktree:"
          foreach ($entry in $unmerged) {
            Write-Log "  $($entry.Raw)"
          }
        }

        $markers = Find-ConflictMarkers -Paths $paths
        if ($markers.Count -gt 0) {
          Write-Log "FAIL conflict markers found:"
          foreach ($marker in $markers) {
            Write-Log "  $marker"
          }
        } else {
          Write-Log "PASS no conflict markers found in changed files."
        }

        $checks = Get-ChecksForPaths -Paths $paths -SkipTests:$SkipTests
        if ($checks.Count -eq 0) {
          Write-Log "No workspace checks mapped for current changes."
        } else {
          foreach ($check in $checks) {
            [void](Invoke-NpmCheck -Name $check.Name -NpmArgs $check.NpmArgs)
          }
        }
      }
    }
  } catch {
    Write-Log "Watcher error: $_"
  }

  Start-Sleep -Seconds $IntervalSeconds
}
