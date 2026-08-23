@echo off
set IMAGE_NAME=millhiore/globalcart-ui
set "TIME_STR=%time: =0%"
set VERSION=%date:~0,4%.%date:~5,2%.%date:~8,2%.%TIME_STR:~0,2%%TIME_STR:~3,2%
set SERVER_USER=root
set SERVER_HOST=192.3.164.190
set DEPLOY_PATH=/opt/production
set VITE_BACKEND_URL=https://api.beday.cc

cd /d "%~dp0.."

echo === 1. Building Docker image ===
docker build --no-cache --build-arg VITE_BACKEND_URL=%VITE_BACKEND_URL% -f frontend/Dockerfile -t %IMAGE_NAME%:%VERSION% .

echo === 2. Pushing to Docker Hub ===
docker tag %IMAGE_NAME%:%VERSION% %IMAGE_NAME%:latest
docker push %IMAGE_NAME%:%VERSION%
docker push %IMAGE_NAME%:latest

echo === 3. Deploying to server ===
ssh -o StrictHostKeyChecking=no %SERVER_USER%@%SERVER_HOST% "cd %DEPLOY_PATH% && docker compose pull ui && docker compose up -d --force-recreate ui"

echo === Deploy finished ===
cmd /k