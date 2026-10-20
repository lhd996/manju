@echo off
chcp 65001 >nul
title Manju Canvas
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1"
