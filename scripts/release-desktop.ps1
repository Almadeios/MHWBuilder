$ErrorActionPreference = 'Stop'

Write-Host 'Running tests...' -ForegroundColor Cyan
npm test -- --run
if ($LASTEXITCODE -ne 0) { throw 'Tests failed. No release was created.' }

Write-Host 'Bumping patch version...' -ForegroundColor Cyan
npm version patch --no-git-tag-version
if ($LASTEXITCODE -ne 0) { throw 'Version bump failed.' }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$output = "C:\MHWBuilder-release\v$version"
if (Test-Path $output) {
    Remove-Item -Recurse -Force $output
}
New-Item -ItemType Directory -Force $output | Out-Null

Write-Host "Building installer v$version..." -ForegroundColor Cyan
npx vite build --mode desktop
if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' }
npx electron-builder --win nsis --config.directories.output=$output
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }

Write-Host 'Creating local commit and tag...' -ForegroundColor Cyan
git add .
git commit -m "Release v$version"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }
git tag "v$version"
if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed.' }

Write-Host ''
Write-Host "Local release v$version is ready." -ForegroundColor Green
Write-Host "Installer: $output\MHW-Builder-Setup-$version.exe"
Write-Host ''
Write-Host 'Nothing was pushed.' -ForegroundColor Yellow
Write-Host 'When you are ready, push manually:' -ForegroundColor Yellow
Write-Host "  git push desktop main"
Write-Host "  git push desktop v$version"
