# SessionStart Hook - Display project status at session start
# Trigger: Every time Claude Code session starts

function Get-GitInfo {
    try {
        $branch = git branch --show-current 2>$null
        $status = git status --porcelain 2>$null
        $uncommittedCount = if ($status) { ($status -split "`n" | Where-Object { $_.Trim() }).Count } else { 0 }
        $lastCommit = git log -1 --oneline 2>$null

        return @{
            Branch = if ($branch) { $branch.Trim() } else { "unknown" }
            UncommittedCount = $uncommittedCount
            LastCommit = if ($lastCommit) { $lastCommit.Trim() } else { "unknown" }
        }
    } catch {
        return @{
            Branch = "unknown"
            UncommittedCount = 0
            LastCommit = "unknown"
        }
    }
}

function Get-TodoCount {
    try {
        $todoPath = Join-Path $PWD "docs/TODO.md"
        if (Test-Path $todoPath) {
            $content = Get-Content $todoPath -Raw -Encoding UTF8
            $pendingCount = ([regex]::Matches($content, '- \[ \]')).Count
            $completedCount = ([regex]::Matches($content, '- \[x\]')).Count
            return @{ Pending = $pendingCount; Completed = $completedCount }
        }
    } catch { }
    return @{ Pending = 0; Completed = 0 }
}

$gitInfo = Get-GitInfo
$todoCount = Get-TodoCount
$now = Get-Date -Format "yyyy/MM/dd HH:mm:ss"

$uncommittedStatus = if ($gitInfo.UncommittedCount -gt 0) {
    "WARNING: Uncommitted changes ($($gitInfo.UncommittedCount) files)"
} else {
    "OK: No uncommitted changes"
}

$lastCommitInfo = if ($gitInfo.LastCommit -ne "unknown") {
    "Latest commit: $($gitInfo.LastCommit)"
} else {
    ""
}

Write-Output "## ZhangNote Session Started"
Write-Output ""
Write-Output "**Time**: $now"
Write-Output "**Git Branch**: ``$($gitInfo.Branch)``"
Write-Output ""
Write-Output "$uncommittedStatus"
Write-Output ""
Write-Output "**TODO**: $($todoCount.Pending) pending / $($todoCount.Completed) completed"
Write-Output ""
if ($lastCommitInfo) { Write-Output "$lastCommitInfo" }
Write-Output ""
Write-Output "**Quick Commands**:"
Write-Output "| /start | Quick project overview |"
Write-Output "| /progress | View detailed progress |"
Write-Output "| /next | Get next step suggestions |"
Write-Output "| /update-status | Update project status |"
