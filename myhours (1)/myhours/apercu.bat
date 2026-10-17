@echo off
rem Apercu local de MyHours : double-cliquez sur ce fichier.
rem Ouvre l'appli dans le navigateur ; apres une modification, faites F5.
rem Fermez cette fenetre pour arreter l'apercu.
cd /d "%~dp0"
start "" http://localhost:8000/
py -m http.server 8000 --bind 127.0.0.1 || python -m http.server 8000 --bind 127.0.0.1
pause
