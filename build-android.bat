@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Flashcards Editor — Android (Capacitor)
echo ============================================
echo.

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist "public\seed-data\manifest.json" (
  call npm run seed
)

echo Building static export...
call npm run build
if errorlevel 1 ( pause & exit /b 1 )

if not exist "android" (
  echo Adding Android platform (one-time)...
  call npx cap add android
  if errorlevel 1 ( pause & exit /b 1 )
)

echo Syncing web -> android...
call npx cap sync android
if errorlevel 1 ( pause & exit /b 1 )

echo Opening Android Studio...
call npx cap open android
echo.
echo In Android Studio: Build -> Generate Signed Bundle / APK.
pause
