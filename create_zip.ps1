# create_zip.ps1
$source = "."
$destination = "TIMS-code-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"

# Patterns to exclude
$excludePatterns = @(
    '*\node_modules\*',
    '*\vendor\*',
    '*\venv\*',              # Python virtual environment
    '*\env\*',               # Alternative venv name
    '*\.venv\*',             # Hidden venv
    '*\storage\logs\*',
    '*\storage\framework\cache\*',
    '*\storage\framework\sessions\*',
    '*\storage\framework\views\*',
    '*\bootstrap\cache\*',
    '*\tests\*',
    '*\TIMS-temp\*',
    '*\.git\*',
    '*\.vscode\*',
    '*\__pycache__\*',
    '*.pyc',
    '*.pyo',
    '*.pyd',
    '*.log',
    '*.sqlite3',
    '*\.env',
    '*\.env.local',
    '*\docker-compose.yml',
    '*\Dockerfile',
    '*\Dockerfile.prod',
    '*\TIMS-code*.zip',
    '*\mobile\build\*'    # Exclude previous zip files
)

Write-Host "Scanning files..."

# Get all files except excluded
$files = Get-ChildItem -Path $source -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
    $file = $_
    $include = $true
    
    foreach ($pattern in $excludePatterns) {
        if ($file.FullName -like $pattern) {
            $include = $false
            break
        }
    }
    
    $include
}

Write-Host "Found $($files.Count) files to zip"
Write-Host "Output file: $destination"
Write-Host ""

# Create temporary folder structure and copy files
$tempFolder = "TIMS-temp"

# Force delete temp folder if it exists (using robocopy method for stubborn folders)
if (Test-Path $tempFolder) {
    Write-Host "Removing old temp folder..."
    try {
        # Create empty folder for robocopy mirror
        $emptyDir = "empty-temp-$([guid]::NewGuid())"
        New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
        
        # Use robocopy to mirror empty folder (effectively deletes everything)
        robocopy $emptyDir $tempFolder /MIR /R:0 /W:0 | Out-Null
        
        # Remove both folders
        Remove-Item $emptyDir -Force -ErrorAction SilentlyContinue
        Remove-Item $tempFolder -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Host "Warning: Could not fully clean temp folder" -ForegroundColor Yellow
    }
}

Write-Host "Creating temporary file structure..."
$copiedCount = 0
$errorCount = 0
$skippedFiles = @()

foreach ($file in $files) {
    try {
        # Verify file still exists before copying
        if (Test-Path $file.FullName -PathType Leaf) {
            $relativePath = $file.FullName.Substring((Get-Location).Path.Length + 1)
            $targetPath = Join-Path $tempFolder $relativePath
            $targetDir = Split-Path $targetPath -Parent
            
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            
            Copy-Item $file.FullName $targetPath -ErrorAction Stop
            $copiedCount++
            
            # Show progress every 100 files
            if ($copiedCount % 100 -eq 0) {
                Write-Host "Copied $copiedCount/$($files.Count) files..." -NoNewline -ForegroundColor Cyan
                Write-Host "`r" -NoNewline
            }
        }
    }
    catch {
        $errorCount++
        if ($errorCount -le 10) {
            $skippedFiles += $file.FullName
        }
    }
}

Write-Host "`nCopied $copiedCount files successfully" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "Skipped $errorCount files due to errors" -ForegroundColor Yellow
    
    if ($skippedFiles.Count -gt 0) {
        Write-Host "`nFirst few skipped files:"
        $skippedFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
}

# Create zip from temp folder
if (Test-Path $tempFolder) {
    Write-Host "`nCompressing files (this may take a while)..."
    
    try {
        Compress-Archive -Path "$tempFolder\*" -DestinationPath $destination -CompressionLevel Optimal -Force
        
        $size = (Get-Item $destination).Length / 1MB
        Write-Host "`n========================================" -ForegroundColor Green
        Write-Host "SUCCESS! Zip created: $destination" -ForegroundColor Green
        Write-Host "Size: $([math]::Round($size, 2)) MB" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        
        # Create README for the package
        $readme = @"
# TIMS Delivery Package
Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Package: $destination

## Excluded from this package:
- node_modules/ (run: npm install)
- vendor/ (run: composer install)
- venv/ and env/ (Python virtual environments)
- storage/logs/
- storage/framework/cache/
- tests/
- .env file (create from .env.example)
- Docker files

## To set up after extraction:

### PHP/Laravel setup:
1. composer install
2. npm install
3. cp .env.example .env
4. php artisan key:generate
5. php artisan migrate
6. php artisan storage:link

### Python setup (if applicable):
1. python -m venv venv
2. venv\Scripts\activate (Windows) or source venv/bin/activate (Linux/Mac)
3. pip install -r requirements.txt

Files copied: $copiedCount
Files skipped: $errorCount
Package size: $([math]::Round($size, 2)) MB
"@
        
        Set-Content -Path "TIMS-PACKAGE-README.txt" -Value $readme
        Write-Host "`nREADME created: TIMS-PACKAGE-README.txt" -ForegroundColor Cyan
    }
    catch {
        Write-Host "`nERROR creating zip: $($_.Exception.Message)" -ForegroundColor Red
    }
    finally {
        # Clean up temp folder using robust method
        Write-Host "`nCleaning up temporary files..."
        if (Test-Path $tempFolder) {
            try {
                $emptyDir = "empty-temp-$([guid]::NewGuid())"
                New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
                robocopy $emptyDir $tempFolder /MIR /R:0 /W:0 | Out-Null
                Remove-Item $emptyDir -Force -ErrorAction SilentlyContinue
                Remove-Item $tempFolder -Force -ErrorAction SilentlyContinue
                Write-Host "Cleanup completed" -ForegroundColor Gray
            }
            catch {
                Write-Host "Warning: Could not fully clean temp folder. You can delete TIMS-temp manually." -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "ERROR: No files were copied to temp folder" -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Green