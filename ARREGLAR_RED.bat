@echo off
:: Pedir permisos de administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Tienes permisos de administrador...
) else (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
echo Configurando puertos para la red local...
netsh interface portproxy add v4tov4 listenport=80 listenaddress=0.0.0.0 connectport=80 connectaddress=127.0.0.1
netsh interface portproxy add v4tov4 listenport=8000 listenaddress=0.0.0.0 connectport=8000 connectaddress=127.0.0.1
netsh interface portproxy add v4tov4 listenport=4040 listenaddress=0.0.0.0 connectport=4040 connectaddress=127.0.0.1
netsh advfirewall firewall add rule name="IncubApp Puertos" dir=in action=allow protocol=TCP localport=80,8000,4040 >nul 2>&1

echo ===========================================
echo PUERTOS CONFIGURADOS CON EXITO
echo ===========================================
echo Ya puedes entrar a http://192.168.5.28 en tu navegador
echo.
pause
