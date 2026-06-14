@echo off
title Whisper Chat Server
color 0a
echo ========================================
echo    WHISPER - Анонимная соцсеть
echo ========================================
echo.
echo [1/3] Проверка зависимостей...
if not exist node_modules (
    echo Установка npm пакетов...
    call npm install
)
echo.
echo [2/3] Запуск сервера...
echo.
echo Сервер запускается...
echo Локальный доступ: http://localhost:3000
echo Админ-панель: http://localhost:3000/admin.html
echo.
echo Для остановки нажми Ctrl+C
echo.
node server.js
pause