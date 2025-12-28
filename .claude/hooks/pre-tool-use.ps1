# PreToolUse Hook - Security protection layer
# Trigger: Before AI executes Bash commands or writes files
# Function: Intercept dangerous commands, warn about sensitive operations

$DANGEROUS_PATTERNS = @(
    @{
        Pattern = 'rm\s+(-rf?|--recursive).*[\/\*]'
        Message = "Dangerous command detected: rm -rf may delete important files"
        Severity = "block"
    },
    @{
        Pattern = 'rm\s+(-rf?|--recursive)'
        Message = "Warning: rm -rf command is very dangerous, please confirm"
        Severity = "warn"
    },
    @{
        Pattern = 'drop\s+(database|table|index)'
        Message = "Dangerous operation detected: deleting database object"
        Severity = "block"
    },
    @{
        Pattern = 'truncate\s+'
        Message = "Warning: truncate operation is irreversible"
        Severity = "warn"
    },
    @{
        Pattern = 'delete\s+.*from'
        Message = "Warning: DELETE operation may delete data, please confirm"
        Severity = "warn"
    },
    @{
        Pattern = 'format\s+[a-z]:'
        Message = "Dangerous command detected: disk formatting"
        Severity = "block"
    },
    @{
        Pattern = 'Remove-Item.*-Recurse.*-Force.*[\\\/]'
        Message = "Dangerous command detected: recursive force delete"
        Severity = "block"
    },
    @{
        Pattern = 'del\s+/[sS].*\*'
        Message = "Dangerous command detected: batch file deletion"
        Severity = "warn"
    },
    @{
        Pattern = 'chmod\s+777'
        Message = "Warning: chmod 777 may cause security risks"
        Severity = "warn"
    },
    @{
        Pattern = 'npm\s+run\s+(reinstall|rebuild)\s+--force'
        Message = "Warning: force reinstall may affect project stability"
        Severity = "warn"
    }
)

$SENSITIVE_PATTERNS = @(
    @{
        Pattern = '\.env(\.local)?$'
        Message = "Target file contains sensitive config: .env"
    },
    @{
        Pattern = 'package\.json$'
        Message = "Target file is package.json, please confirm modification"
    },
    @{
        Pattern = 'electron[\\\/]main\.ts$'
        Message = "Target file is main process entry, modification may cause app issues"
    }
)

$command = ""
$targetFile = ""

if ($args.Count -gt 0) {
    $dashIndex = [array]::IndexOf($args, "--")
    if ($dashIndex -ge 0) {
        $command = ($args[0..($dashIndex-1)]) -join " "
        if ($dashIndex -lt $args.Count - 1) {
            $targetFile = $args[($dashIndex+1)..($args.Count-1)] | Where-Object {
                $_ -match '^[\/]' -or $_ -match '^[a-z]:'
            } | Select-Object -First 1
        }
    } else {
        $command = $args -join " "
    }
}

if (-not $command) {
    exit 0
}

function Check-DangerousCommand {
    param([string]$Command)

    foreach ($danger in $DANGEROUS_PATTERNS) {
        if ($Command -match $danger.Pattern) {
            return @{
                Blocked = ($danger.Severity -eq "block")
                Message = $danger.Message
                Severity = $danger.Severity
            }
        }
    }
    return $null
}

function Check-SensitiveFile {
    param([string]$FilePath)

    if (-not $FilePath) { return $null }

    foreach ($sensitive in $SENSITIVE_PATTERNS) {
        if ($FilePath -match $sensitive.Pattern) {
            return @{
                Warning = $true
                Message = $sensitive.Message
            }
        }
    }
    return $null
}

$dangerResult = Check-DangerousCommand -Command $command

if ($dangerResult) {
    $result = @{
        decision = if ($dangerResult.Blocked) { "block" } else { "warn" }
        reason = $dangerResult.Message
        command = $command.Substring(0, [Math]::Min(100, $command.Length))
        severity = $dangerResult.Severity
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    if ($dangerResult.Blocked) {
        exit 1
    }
    exit 0
}

$fileResult = Check-SensitiveFile -FilePath $targetFile

if ($fileResult) {
    $result = @{
        decision = "warn"
        reason = $fileResult.Message
        targetFile = $targetFile.Substring(0, [Math]::Min(100, $targetFile.Length))
        severity = "warning"
    }
    Write-Output ($result | ConvertTo-Json -Compress)
} else {
    $result = @{
        decision = "allow"
        reason = "Command is safe"
        command = $command.Substring(0, [Math]::Min(100, $command.Length))
    }
    Write-Output ($result | ConvertTo-Json -Compress)
}
