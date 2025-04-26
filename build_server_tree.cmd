@echo off
echo Creating folders and files inside the current server directory...

:: API structure
mkdir api 2>nul
mkdir api\controllers 2>nul
mkdir api\middlewares 2>nul
mkdir api\routes 2>nul

for %%F in (
    transcriptController.ts analysisController.ts userController.ts
) do if not exist api\controllers\%%F echo. > api\controllers\%%F

for %%F in (
    auth.ts errorHandler.ts fileUpload.ts
) do if not exist api\middlewares\%%F echo. > api\middlewares\%%F

for %%F in (
    transcriptRoutes.ts analysisRoutes.ts userRoutes.ts
) do if not exist api\routes\%%F echo. > api\routes\%%F

if not exist api\server.ts echo. > api\server.ts

:: AI module
mkdir ai 2>nul
mkdir ai\processors 2>nul
mkdir ai\models 2>nul

for %%F in (
    entityRecognition.ts actionItemExtractor.ts summarizer.ts
) do if not exist ai\processors\%%F echo. > ai\processors\%%F

if not exist ai\models\index.ts echo. > ai\models\index.ts

:: Integrations
mkdir integrations 2>nul
for %%F in (
    googleMeet.ts slack.ts discord.ts
) do if not exist integrations\%%F echo. > integrations\%%F

:: DB structure
mkdir db 2>nul
mkdir db\models 2>nul
mkdir db\migrations 2>nul
if not exist db\index.ts echo. > db\index.ts

:: Utils
mkdir utils 2>nul
if not exist utils\logger.ts echo. > utils\logger.ts
if not exist utils\validators.ts echo. > utils\validators.ts

echo.
echo ✅ Server directory structure created. Existing items preserved.
pause
