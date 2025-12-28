# Stop Hook - Task completion feedback
# Trigger: After AI finishes answering
# Function: Analyze changes, recommend next steps

function Get-ChangeStats {
    try {
        $status = git status --porcelain 2>$null
        if (-not $status) {
            return @{ Added = 0; Modified = 0; Deleted = 0; Files = @() }
        }

        $lines = $status -split "`n" | Where-Object { $_.Trim() }
        $files = $lines | ForEach-Object {
            $statusCode = $_.Substring(0, 2).Trim()
            $filePath = $_.Substring(3).Trim()
            @{ Status = $statusCode; Path = $filePath }
        }

        return @{
            Added = ($files | Where-Object { $_.Status -eq 'A' -or $_.Status -eq '??' }).Count
            Modified = ($files | Where-Object { $_.Status -eq 'M' }).Count
            Deleted = ($files | Where-Object { $_.Status -eq 'D' }).Count
            Files = $files | Select-Object -First 10
        }
    } catch {
        return @{ Added = 0; Modified = 0; Deleted = 0; Files = @() }
    }
}

function Cleanup-TempFiles {
    $tempPatterns = @('*.tmp', '*.log', 'nul', '*~', '*.bak', '*.swp')
    $tempLocations = @($PWD.Path, (Join-Path $PWD "temp"), (Join-Path $PWD "tmp"))

    foreach ($loc in $tempLocations) {
        if (Test-Path $loc) {
            foreach ($pattern in $tempPatterns) {
                $files = Get-ChildItem -Path $loc -Filter $pattern -ErrorAction SilentlyContinue
                foreach ($file in $files) {
                    try {
                        Remove-Item $file.FullName -Force -ErrorAction SilentlyContinue
                    } catch { }
                }
            }
        }
    }
}

function Generate-ChangeSummary {
    param($Stats)

    $parts = @()
    if ($Stats.Added -gt 0) { $parts += "$($Stats.Added) added" }
    if ($Stats.Modified -gt 0) { $parts += "$($Stats.Modified) modified" }
    if ($Stats.Deleted -gt 0) { $parts += "$($Stats.Deleted) deleted" }

    if ($parts.Count -eq 0) {
        return "No code changes detected"
    }

    return $parts -join ", "
}

function Generate-Suggestions {
    param($Stats)

    $suggestions = @()

    if ($Stats.Added -gt 0 -or $Stats.Modified -gt 0) {
        $suggestions += "Use ``@code-reviewer`` to review code"
        $suggestions += "Run ``/update-status`` to update project status"
    }

    $hasDbChanges = $Stats.Files | Where-Object { $_.Path -match '\.sql|schema' }
    if ($hasDbChanges) {
        $suggestions += "Database scripts changed, ensure sync across environments"
    }

    $hasServiceChanges = $Stats.Files | Where-Object { $_.Path -match 'Service|service' }
    if ($hasServiceChanges) {
        $suggestions += "Service layer changed, remember to update docs"
    }

    $suggestions += "Use ``git add . && git commit`` to commit code"

    return $suggestions
}

$stats = Get-ChangeStats
Cleanup-TempFiles | Out-Null

$changeSummary = Generate-ChangeSummary -Stats $stats
$suggestions = Generate-Suggestions -Stats $stats

Write-Output "---"
Write-Output ""
Write-Output "Task Completed | $changeSummary"
Write-Output ""

if ($stats.Files.Count -gt 0) {
    Write-Output "**Changed Files**:"
    foreach ($file in $stats.Files) {
        $icon = switch ($file.Status) {
            'M' { '[M]' }
            'A' { '[+]' }
            'D' { '[-]' }
            '??' { '[?]' }
            default { '[*]' }
        }
        Write-Output "  $icon $($file.Path)"
    }
    Write-Output ""
}

Write-Output "**Suggested Actions**:"
foreach ($suggestion in $suggestions) {
    Write-Output "- $suggestion"
}
Write-Output ""
Write-Output "**Quick Commands**:"
Write-Output "- ``/update-status`` - Update project status"
Write-Output "- ``/progress`` - View development progress"
Write-Output "- ``/next`` - Get next step suggestions"
