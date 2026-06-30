@echo off
setlocal

cd /d "%~dp0"

echo Starting omp-deck...
bun run dev
