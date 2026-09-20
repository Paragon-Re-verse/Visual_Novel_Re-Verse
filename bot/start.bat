@echo off
set /p TOKEN=<token.txt
cd ..\discord-bridge
node index.js %TOKEN%
