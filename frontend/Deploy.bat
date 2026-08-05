@echo off
set IMAGE_NAME=millhiore/globalcart-ui
set VERSION=%date:~0,4%.%date:~5,2%.%date:~8,2%.%time:~0,2%%time:~3,2%
set SERVER_USER=root
set SERVER_HOST=tongyi.beday.cc
set DEPLOY_PATH=/opt/production
set VITE_BACKEND_URL=https://api.beday.cc

cd /d "%~dp0.."

echo === 1. Building Docker image ===
docker build --build-arg VITE_BACKEND_URL=%VITE_BACKEND_URL% -f frontend/Dockerfile -t %IMAGE_NAME%:%VERSION% .

echo === 2. Pushing to Docker Hub ===
docker push %IMAGE_NAME%:%VERSION%
docker tag %IMAGE_NAME%:%VERSION% %IMAGE_NAME%:latest
docker push %IMAGE_NAME%:latest

echo === 3. Deploying to server ===
ssh -o StrictHostKeyChecking=no %SERVER_USER%@%SERVER_HOST% "cd %DEPLOY_PATH% && docker compose pull ui && docker compose up -d --force-recreate ui"

echo === Deploy finished ===
cmd /k