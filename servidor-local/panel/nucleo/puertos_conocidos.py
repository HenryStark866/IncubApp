"""Panel IncubApp · puertos TCP conocidos: qué son y qué tan peligroso es tenerlos abiertos.

Lo usan la auditoría del servidor (puertos que escucha este equipo) y las herramientas de
red (puertos abiertos en los equipos de la planta). La planta tiene máquinas industriales:
los protocolos de PLC/SCADA abiertos a toda la red importan.
"""

# puerto: (servicio, riesgo, nota)   riesgo: critico | alto | medio | bajo | info
PUERTOS: dict[int, tuple[str, str, str]] = {
    21: ('FTP', 'alto', 'Transfiere archivos y contraseñas sin cifrar.'),
    22: ('SSH', 'bajo', 'Acceso remoto cifrado. Bien si la contraseña es fuerte y solo lo usa soporte.'),
    23: ('Telnet', 'critico', 'Acceso remoto SIN cifrar: cualquiera en la red puede ver la contraseña. Típico de cámaras y routers viejos.'),
    25: ('SMTP', 'medio', 'Servidor de correo.'),
    53: ('DNS', 'info', 'Resolución de nombres.'),
    80: ('HTTP', 'info', 'Página web sin cifrar (si pide contraseña, viaja a la vista).'),
    81: ('HTTP alterno', 'medio', 'Página web sin cifrar; común en cámaras y DVR.'),
    102: ('Siemens S7', 'alto', 'Protocolo de PLC Siemens: sin autenticación, permite leer y cambiar el programa del PLC.'),
    110: ('POP3', 'medio', 'Correo sin cifrar.'),
    111: ('RPC (Unix)', 'medio', 'Servicio de llamadas remotas de Unix/NFS.'),
    135: ('RPC de Windows', 'medio', 'Servicio interno de Windows; no debería verse fuera de la red local.'),
    139: ('NetBIOS / carpetas compartidas', 'medio', 'Carpetas compartidas antiguas de Windows.'),
    143: ('IMAP', 'medio', 'Correo sin cifrar.'),
    161: ('SNMP', 'medio', 'Administración de red; con la comunidad «public» revela la configuración.'),
    389: ('LDAP', 'medio', 'Directorio de usuarios sin cifrar.'),
    443: ('HTTPS', 'info', 'Página web cifrada.'),
    445: ('SMB (carpetas compartidas)', 'medio', 'Carpetas compartidas de Windows; puerta de entrada clásica del ransomware si hay SMBv1 o claves débiles.'),
    502: ('Modbus', 'alto', 'Protocolo industrial sin autenticación: cualquiera en la red puede leer y ESCRIBIR valores del equipo.'),
    515: ('Impresión LPD', 'bajo', 'Impresora.'),
    554: ('RTSP (video)', 'medio', 'Video de cámara; muchas permiten verlo sin contraseña.'),
    631: ('IPP (impresión)', 'bajo', 'Impresora.'),
    1433: ('SQL Server', 'alto', 'Base de datos expuesta a la red.'),
    1521: ('Oracle', 'alto', 'Base de datos expuesta a la red.'),
    1883: ('MQTT', 'medio', 'Mensajería de sensores IoT, normalmente sin cifrar ni contraseña.'),
    1900: ('UPnP', 'medio', 'Descubrimiento automático; puede abrir puertos del router solo.'),
    2000: ('Métricas', 'bajo', 'Métricas internas.'),
    2375: ('Docker sin TLS', 'critico', 'Control TOTAL de Docker sin contraseña: equivale a ser administrador del equipo.'),
    2376: ('Docker con TLS', 'medio', 'API de Docker cifrada.'),
    3000: ('Web de desarrollo', 'bajo', 'Servicio web interno.'),
    3306: ('MySQL / MariaDB', 'alto', 'Base de datos expuesta a la red.'),
    3389: ('Escritorio remoto (RDP)', 'alto', 'Escritorio remoto de Windows: blanco número uno de ataques de contraseña.'),
    4040: ('Inspector de ngrok', 'alto', 'Muestra TODAS las peticiones que pasan por ngrok, con sus claves y sesiones, a cualquiera que lo abra.'),
    4840: ('OPC UA', 'medio', 'Protocolo industrial (OPC UA); revisar que pida usuario y cifrado.'),
    5000: ('Web / UPnP', 'bajo', 'Servicio web interno.'),
    5432: ('PostgreSQL', 'alto', 'Base de datos expuesta a la red.'),
    5678: ('n8n', 'medio', 'Automatizaciones n8n: con su clave se pueden ver credenciales.'),
    5900: ('VNC', 'alto', 'Escritorio remoto VNC, a menudo sin cifrar o sin clave.'),
    6379: ('Redis', 'alto', 'Base de datos en memoria, normalmente sin contraseña.'),
    8000: ('API de Supabase (puerta)', 'medio', 'La API completa de Supabase directo, sin pasar por la app.'),
    8008: ('HTTP alterno', 'bajo', 'Servicio web.'),
    8080: ('HTTP alterno', 'medio', 'Panel web sin cifrar (routers, cámaras, impresoras).'),
    8291: ('MikroTik Winbox', 'alto', 'Administración de router MikroTik.'),
    8443: ('HTTPS alterno', 'bajo', 'Panel web cifrado.'),
    8728: ('MikroTik API', 'alto', 'API de administración del router MikroTik.'),
    8888: ('HTTP alterno', 'bajo', 'Servicio web.'),
    9000: ('Web / administración', 'medio', 'Panel de administración (p. ej. Portainer).'),
    9100: ('Impresión directa', 'bajo', 'Impresora (permite mandar trabajos sin control).'),
    9200: ('Elasticsearch', 'alto', 'Base de datos de búsqueda, sin contraseña por defecto.'),
    11211: ('Memcached', 'alto', 'Caché sin contraseña.'),
    20000: ('DNP3', 'alto', 'Protocolo SCADA sin autenticación.'),
    27017: ('MongoDB', 'alto', 'Base de datos, a menudo sin contraseña.'),
    34567: ('DVR chino (XMEye)', 'alto', 'Grabador de cámaras con fallas conocidas.'),
    37777: ('DVR Dahua', 'alto', 'Grabador de cámaras Dahua.'),
    44818: ('EtherNet/IP', 'alto', 'Protocolo de PLC Allen-Bradley/Rockwell sin autenticación.'),
    47808: ('BACnet', 'medio', 'Control de edificios (clima, ventilación).'),
    49152: ('UPnP / RPC', 'bajo', 'Puerto dinámico de Windows o UPnP.'),
    55443: ('HTTPS alterno', 'bajo', 'Servicio web cifrado.'),
}

PERFILES = {
    'rapido': [21, 22, 23, 80, 135, 139, 443, 445, 502, 554, 1433, 2375, 3306, 3389, 5432, 5900, 8000, 8080, 9100, 44818],
    'industrial': [102, 502, 1883, 2000, 4840, 20000, 44818, 47808, 80, 443, 8080, 23, 21, 554, 161, 9600, 1911, 789, 18245, 5007, 5006],
}
PERFILES['comun'] = sorted(set(PUERTOS) | set(PERFILES['rapido']) | {8081, 8082, 8090, 9090, 10000, 5357, 1080, 3128, 7547,
                                                                      5985, 5986, 2049, 873, 990, 993, 995, 587, 465})
PERFILES['completo'] = sorted(set(range(1, 1025)) | set(PERFILES['comun']) | set(PERFILES['industrial']))

WEB = {80, 81, 443, 5000, 8000, 8008, 8080, 8081, 8082, 8090, 8443, 8888, 9000, 9090, 10000, 55443}
TLS = {443, 8443, 55443}


def describir(puerto: int) -> tuple[str, str, str]:
    """(servicio, riesgo, nota) de un puerto; desconocido = ('Desconocido', 'info', '')."""
    return PUERTOS.get(puerto, ('Desconocido', 'info', ''))
