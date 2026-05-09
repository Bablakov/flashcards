@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Flashcards Editor — DEV
echo ============================================
echo.

if not exist "node_modules" (
  echo [1/3] node_modules not found — installing...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencies OK.
)

if not exist "public\seed-data\manifest.json" (
  echo [2/3] Generating seed data from documentation\Flashcards.csv...
  call npm run seed
) else (
  echo [2/3] Seed data already exists.
)

echo [3/3] Starting dev server on http://localhost:3210
echo (CTRL+C to stop)
start "" "http://localhost:3210"
call npm run dev
