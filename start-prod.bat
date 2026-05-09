@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Flashcards Editor — PRODUCTION (static)
echo ============================================
echo.

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist "public\seed-data\manifest.json" (
  echo Generating seed data...
  call npm run seed
)

echo Building static export...
call npm run build
if errorlevel 1 ( pause & exit /b 1 )

echo.
echo Static site built to .\out
echo Starting local preview on http://localhost:3210
start "" "http://localhost:3210"
call npx --yes serve out -l 3210
