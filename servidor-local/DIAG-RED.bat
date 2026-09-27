@echo off
start "IncubApp - Diagnostico" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diag-red.ps1"
