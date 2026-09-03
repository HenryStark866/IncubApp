@echo off
cd /d "%~dp0"
echo ============================================
echo   Desplegando IncubApp a Vercel (produccion)
echo   El proyecto privacycheck-co NO se toca.
echo ============================================
echo.

REM ── El token de Vercel NUNCA va escrito aqui. Se lee de una variable de entorno
REM    que existe solo en tu equipo (no se versiona ni se comparte).
REM    Configuralo UNA sola vez en una consola y reinicia la ventana:
REM        setx VERCEL_TOKEN "tu_token_de_vercel"
if "%VERCEL_TOKEN%"=="" (
  echo [!] Falta la variable de entorno VERCEL_TOKEN.
  echo     Configurala una vez con:  setx VERCEL_TOKEN "tu_token"
  echo     Abre una NUEVA ventana y vuelve a ejecutar este script.
  echo.
  pause
  exit /b 1
)

REM ── Se usa "vercel@latest" via npx para evitar el aviso interactivo de
REM    "Would you like to upgrade?" del CLI (causa del error spawn npm ENOENT).
REM    --yes de npx acepta la descarga; --yes de vercel omite la confirmacion.
call npx --yes vercel@latest deploy --prod --yes --token %VERCEL_TOKEN% --scope henry-stark-s-projects
set DEPLOY_EXIT=%ERRORLEVEL%
echo.
if "%DEPLOY_EXIT%"=="0" (
  echo Listo. La URL de produccion aparece arriba ^(termina en .vercel.app^).
) else (
  echo [!] El despliegue termino con codigo %DEPLOY_EXIT%. Revisa el mensaje de arriba.
)
pause
