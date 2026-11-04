@echo off
title HostelCare - Full Project Launcher
echo ===================================================
echo     HostelCare - Hostel Maintenance Portal
echo ===================================================
echo.

set PHP_BIN=C:\Users\ASUS\Downloads\php-8.5.12-1-Win32-vs17-x64\php.exe
set PHP_INI=C:\Users\ASUS\Downloads\php-8.5.12-1-Win32-vs17-x64\php.ini
set TOMCAT_DIR=C:\Users\ASUS\Downloads\apache-tomcat-10.1.61-windows-x64\apache-tomcat-10.1.61
set DB_PASS=postgres123
set JWT_SECRET=change-this-demo-secret-before-deployment

echo [1/3] Starting PHP Backend API on http://localhost:8000 ...
start "HostelCare - PHP Backend (Port 8000)" "%PHP_BIN%" -c "%PHP_INI%" -S 127.0.0.1:8000 -t "%~dp0php-api\public"

echo [2/3] Starting Java Tomcat Service on http://localhost:8080 ...
start "HostelCare - Tomcat Service (Port 8080)" cmd /k "cd /d "%TOMCAT_DIR%\bin" && set DB_PASS=%DB_PASS% && set JWT_SECRET=%JWT_SECRET% && catalina.bat run"

echo [3/3] Starting Frontend Web Server on http://localhost:5500 ...
start "HostelCare - Frontend (Port 5500)" "%PHP_BIN%" -S 127.0.0.1:5500 -t "%~dp0frontend"

timeout /t 3 >nul

echo.
echo Opening browser to http://localhost:5500 ...
start http://localhost:5500

echo.
echo ===================================================
echo   HostelCare is now running!
echo   - Frontend:     http://localhost:5500
echo   - PHP API:      http://localhost:8000
echo   - Java Service: http://localhost:8080/hostel-java
echo ===================================================
pause
