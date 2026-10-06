# -*- coding: utf-8 -*-
"""
Contenido de los manuales de operación y mantenimiento (en español) de los equipos
Big Herdsman de los galpones de producción de G-GRANJA LA FE.

Bloques: ("p", texto) · ("ul", [..]) · ("ol", [..]) · ("tabla", [encabezados], [[fila], ..])
         ("aviso", texto) · ("plan", "GRUPO")  ← inserta la tabla de tareas del plan de ese grupo (ALI, REC, …)
Los valores marcados ⚠ no se encontraron publicados por el fabricante: se verifican en la
placa del equipo o en el manual original antes de aprobar el documento.
"""

VERIFICAR = "⚠ dato de placa (levantamiento LF-100)"

AVISO_COMUN = (
    "Manual aprobado por el Área de Mantenimiento (versión 01, 2026-10-06) como documento de la empresa. "
    "Lo elaboró Incubant para operar y mantener los equipos instalados en G-GRANJA LA FE: el fabricante "
    "(Qingdao Big Herdsman Machinery Co., Ltd.) no publica sus manuales; este documento reúne su información "
    "técnica pública, la práctica aceptada en la industria avícola y el estándar de la empresa. Los datos "
    "marcados con ⚠ son datos de placa: se toman en el levantamiento LF-100, se registran en la hoja 05 "
    "INVENTARIO del PRGMAT01 y rigen desde ese momento. Si el fabricante entrega su manual original "
    "(solicitud enviada según el pendiente 1), se contrasta y, ante una diferencia, prevalece el original."
)

SEGURIDAD_COMUN = [
    "Bloqueo y etiquetado (LOTO) antes de cualquier intervención mecánica: apagar desde el tablero del galpón, poner candado y tarjeta personal, probar que no arranca. El controlador automático puede arrancar el equipo en cualquier momento.",
    "Nunca retirar guardas ni puentear finales de carrera, paradas de emergencia o protecciones térmicas.",
    "Los tableros se abren energizados solo para medir y solo por personal calificado (RETIE), con guantes dieléctricos y gafas.",
    "Trabajo sobre escalera: tres puntos de apoyo. Por encima de 2 m aplica el procedimiento de trabajo en alturas (Res. 4272 de 2021).",
    "Bioseguridad: ingresar al galpón por la ducha y con la ropa del módulo; las herramientas se desinfectan al entrar y al salir; respetar el orden de visita (levante antes que producción, galpones sanos antes que con problemas).",
    "Con aves en el galpón: moverse despacio, avisar al galponero y no intervenir durante el reparto de alimento ni la recolección.",
]

REGISTROS = [
    ["Ronda diaria IncubApp", "Operario galponero", "Revisiones diarias de este manual"],
    ["FOMAT06 Solicitud de mantenimiento", "Quien detecta la falla", "Toda falla o anomalía"],
    ["FOMAT01 Orden de trabajo", "Aux./Téc. de mantenimiento", "Tareas semanales, mensuales, trimestrales y overhaul"],
    ["FOMAT05 Liberación del equipo", "Líder de Granja", "Después de toda intervención con parada"],
    ["FOMAT03 Hoja de vida del equipo", "Aux. de mantenimiento", "Overhaul, cambios de piezas y repuestos usados"],
    ["Registro de lavado", "Aux. de mantenimiento / Bioseguridad", "Lavado y desinfección entre lotes"],
]

MANUALES = [
    # ════════════════════════════════════ MAN-LF-01 ════════════════════════════════════
    dict(code="MAN-LF-01", titulo="BANDA RECOLECTORA DE HUEVO", subtitulo="Manual de operación y mantenimiento — sistema de recolección de huevo Big Herdsman",
         alcance="Bandas recolectoras de huevo, cajas de transmisión, motorreductores y mesas de recolección de los 12 galpones de producción: módulo 2 (G201–G204), módulo 3 (G301–G304) y módulo 4 (G401–G404).",
         secciones=[
             ("3. Descripción del sistema", [
                 ("p", "El sistema recibe el huevo que rueda desde el piso inclinado de cada nido y lo transporta, a lo largo del galpón, sobre una banda de polipropileno tejido hasta la mesa de recolección en la cabecera. El fabricante lo describe como un conjunto de módulos: amortiguadores de huevo (buffer), bandas de recolección, cajas de transmisión (sprocket box), elevadores de recolección y mesas de recolección manual."),
                 ("p", "Funcionamiento: el motorreductor de cabecera mueve, por medio de una cadena y piñones dentro de la caja de transmisión, el rodillo de tracción; la banda corre sobre el canal fijado bajo la fila de nidos y regresa por debajo. En la cola, un rodillo de retorno con tornillos tensores mantiene la tensión y permite alinearla. La banda se arranca a la hora de recolección desde el tablero o el controlador; el operario recoge el huevo en la mesa y detiene la banda al terminar."),
             ]),
             ("4. Componentes y datos técnicos", [
                 ("tabla", ["Componente", "Función", "Dato técnico"], [
                     ["Banda recolectora", "Transporta el huevo desde los nidos", f"Polipropileno tejido; ancho {VERIFICAR}"],
                     ["Canal de la banda", "Soporta y guía la banda bajo los nidos", "Lámina galvanizada"],
                     ["Rodillo de tracción", "Mueve la banda por fricción", "Recubrimiento antideslizante"],
                     ["Rodillo de retorno y tensores", "Tensión y alineación de la banda", "Tornillos tensores a cada lado"],
                     ["Caja de transmisión (sprocket box)", "Transmite el giro del motor al rodillo", "Cadena y piñones"],
                     ["Motorreductor", "Accionamiento", f"Potencia, tensión e In {VERIFICAR}"],
                     ["Amortiguador de huevo (buffer)", "Frena el huevo a la entrada de la mesa", "Cortina o rodillo blando"],
                     ["Mesa de recolección", "Puesto de recolección manual", "Cabecera del galpón"],
                     ["Raspadores / limpiadores", "Retiran suciedad de la banda en el retorno", "Repuesto de desgaste"],
                     ["Parada de emergencia", "Detiene la banda de inmediato", "Pulsador tipo hongo en la mesa"],
                 ]),
                 ("p", "Registre en el inventario (hoja 05 del PRGMAT01) la marca, el modelo y el número de serie del motorreductor de cada galpón."),
             ]),
             ("5. Seguridad", [("ul", SEGURIDAD_COMUN + [
                 "Punto de atrapamiento principal: rodillo de tracción y caja de transmisión. Nunca limpiar la banda ni retirar huevo cerca de los rodillos con la banda en marcha.",
                 "Probar la parada de emergencia una vez al mes (tarea LF-REC-03).",
             ])]),
             ("6. Operación", [
                 ("ol", [
                     "Antes de arrancar: banda limpia en la mesa, sin huevo roto ni objetos; parada de emergencia desenclavada.",
                     "Arrancar la banda desde el tablero o el controlador a la hora de recolección del programa.",
                     "Recorrer el galpón: la banda avanza pareja y centrada, sin frenadas ni saltos.",
                     "En la mesa: recoger el huevo sin dejar que se acumule; si se acumula, recoger más seguido o reducir la velocidad (si el equipo tiene variador).",
                     "Si aparece huevo roto: detener, retirar y limpiar con paño humedecido en desinfectante antes de continuar.",
                     "Al terminar: detener la banda y dejarla limpia. Registrar la ronda en IncubApp.",
                 ]),
                 ("p", "Frecuencia de recolección: la que fije el programa de Producción. Recolectar con más frecuencia reduce el huevo sucio y roto y el tiempo del huevo en el galpón."),
             ]),
             ("7. Ajustes", [
                 ("p", "7.1 Alineación de la banda. Con la banda en marcha, observar desde la cabecera y desde la cola hacia qué lado se desvía. Detener y bloquear. Apretar ¼ de vuelta el tornillo tensor del lado HACIA EL QUE SE VA la banda (o aflojar el contrario). Arrancar, dejar dar al menos una vuelta completa y volver a observar. Repetir en pasos pequeños; los cambios grandes deforman la banda."),
                 ("p", "7.2 Tensión. La banda debe arrastrar el huevo sin patinar en el rodillo de tracción con la carga normal. Exceso de tensión estira la banda, carga los rodamientos y deforma el canal. Si el tensor llegó al final de su recorrido, cortar banda y rehacer el empalme."),
                 ("p", "7.3 Empalme. Usar el kit de empalme recomendado por el fabricante (grapas o unión cosida). El empalme debe quedar recto (a escuadra con el borde de la banda) para que la banda no se desvíe."),
             ]),
             ("8. Mantenimiento", [
                 ("p", "Las tareas, frecuencias, responsables y criterios de aceptación son los del Plan AM de la granja (PRGMAT01, hoja 06.2):"),
                 ("plan", "REC"),
                 ("p", "8.1 Diario (operario): ver §6. 8.2 Semanal: limpieza de rodillos y raspadores, alineación, tensión, buffer y mesa. 8.3 Mensual: amperaje del motor, caja de transmisión, guardas y parada de emergencia. 8.4 Trimestral: lubricación y empalmes. Los pasos detallados de cada tarea están en el documento «Indicaciones de cada actividad»."),
                 ("tabla", ["Punto de lubricación", "Lubricante", "Frecuencia"], [
                     ["Cadena de la caja de transmisión", f"Lubricante para cadena grado alimenticio (NSF H1) {VERIFICAR}", "Trimestral"],
                     ["Rodamientos de rodillos (con grasera)", f"Grasa grado alimenticio NSF H1 {VERIFICAR}", "Trimestral"],
                     ["Reductor", f"Aceite según placa del reductor {VERIFICAR}", "Revisar nivel trimestral; cambio según horas del fabricante"],
                 ]),
             ]),
             ("9. Overhaul en el vacío sanitario", [("ul", [
                 "Revisar la banda en toda su longitud; cambiarla si tiene deshilache, cortes o encogimiento.",
                 "Cambiar rodamientos con juego, piñones con dientes en punta y cadena alargada.",
                 "Revisar el canal: uniones, soportes y bordes que puedan cortar la banda.",
                 "Registrar en la hoja de vida (FOMAT03) las piezas cambiadas.",
             ])]),
             ("10. Limpieza y desinfección", [("ol", [
                 "Diario: retirar huevo roto y limpiar la mancha con paño y desinfectante aprobado.",
                 "Entre lotes: soltar tensión, lavar la banda (lavador de banda o cepillo + detergente), enjuagar, desinfectar con el producto del protocolo de Bioseguridad y dejar secar antes de tensar.",
                 "Proteger motorreductor y tablero del agua durante el lavado.",
                 "Diligenciar el registro de lavado.",
             ])]),
             ("11. Diagnóstico de fallas", [("tabla", ["Síntoma", "Causa probable", "Acción"], [
                 ["La banda se desvía a un lado", "Tensión desigual; empalme torcido; rodillo sucio", "Limpiar rodillos; alinear (§7.1); rehacer empalme"],
                 ["La banda patina / se frena con carga", "Tensión baja; rodillo de tracción sucio o gastado", "Limpiar; tensar (§7.2); revisar recubrimiento"],
                 ["Mucho huevo roto en la mesa", "Buffer dañado; huevo acumulado; escalón en la transición", "Revisar buffer y transición; recoger más seguido"],
                 ["Huevo roto dentro del galpón", "Escalón nido-banda; banda floja que forma ondas", "Ajustar transición; tensar"],
                 ["Motor se dispara (térmico)", "Banda trabada; rodamiento dañado; tensión excesiva", "Bloquear, buscar el punto trabado, medir corriente"],
                 ["Ruido en la caja de transmisión", "Cadena seca o alargada; piñón gastado", "Lubricar; cambiar cadena/piñón"],
                 ["La banda no arranca", "Parada de emergencia enclavada; protección disparada; falla del controlador", "Revisar en ese orden; reportar"],
             ])]),
             ("12. Repuestos críticos recomendados", [("tabla", ["Repuesto", "Stock mínimo sugerido"], [
                 ["Rollo de banda recolectora (mismo ancho)", "1 tramo de reparación por módulo"], ["Kit de empalme de banda", "2 por módulo"],
                 ["Rodamientos de rodillo", "4"], ["Cadena y piñones de la caja de transmisión", "1 juego"],
                 ["Motorreductor completo", "1 para los 12 galpones"], ["Raspadores", "1 juego por módulo"],
             ])]),
         ]),

    # ════════════════════════════════════ MAN-LF-02 ════════════════════════════════════
    dict(code="MAN-LF-02", titulo="SISTEMA DE APERTURA Y CIERRE DE NIDOS", subtitulo="Manual de operación y mantenimiento — nidos automáticos Big Herdsman",
         alcance="Nidos automáticos con mecanismo de apertura, cierre y expulsión de los 12 galpones de producción: módulos 2, 3 y 4 (G201–G404).",
         secciones=[
             ("3. Descripción del sistema", [
                 ("p", "Los nidos automáticos ofrecen a la reproductora un lugar oscuro y cómodo para poner. El piso del nido está inclinado: el huevo rueda sobre la esterilla hasta la banda recolectora (MAN-LF-01)."),
                 ("p", "El mecanismo de apertura y cierre, accionado por un motorreductor en la cabecera del galpón, mueve a lo largo de toda la fila de nidos un eje o un cable/cadena con poleas. Al CERRAR (al final de la tarde) inclina el piso o acciona la expulsión para que las aves salgan, y cierra el acceso para que no duerman dentro (aves dentro de noche ensucian el nido y el huevo, y aumentan la cloquera). Al ABRIR (temprano, antes del pico de postura) devuelve el piso a su posición de postura. Dos finales de carrera detienen el motor en las posiciones de abierto y cerrado, y un controlador/temporizador ejecuta los horarios."),
             ]),
             ("4. Componentes y datos técnicos", [
                 ("tabla", ["Componente", "Función", "Dato técnico"], [
                     ["Módulo de nido", "Puesto de postura (comunitario o individual)", f"Número de bocas por módulo {VERIFICAR}"],
                     ["Esterilla (nest pad)", "Piso blando y limpio del nido", "Plástico tipo grama; repuesto de desgaste"],
                     ["Piso inclinado / expulsor", "Hace rodar el huevo y expulsa las aves", "Pendiente de fábrica — no modificar"],
                     ["Cortina de entrada", "Oscuridad dentro del nido", "Repuesto de desgaste"],
                     ["Eje / cable / cadena de accionamiento", "Mueve todos los módulos a la vez", f"Tipo {VERIFICAR}"],
                     ["Poleas y tensores", "Guían y tensan el cable", "—"],
                     ["Motorreductor", "Accionamiento", f"Potencia, tensión e In {VERIFICAR}"],
                     ["Finales de carrera (abierto / cerrado)", "Detienen el motor en cada posición", "Con leva ajustable"],
                     ["Controlador / temporizador", "Ejecuta horarios de apertura y cierre", "Con batería de respaldo del reloj"],
                 ]),
             ]),
             ("5. Seguridad", [("ul", SEGURIDAD_COMUN + [
                 "El mecanismo mueve toda la fila con mucha fuerza: puntos de atrapamiento en bisagras, poleas y el eje. Nunca meter las manos durante un ciclo.",
                 "No forzar a mano un nido trabado con el motor energizado.",
             ])]),
             ("6. Operación", [
                 ("ol", [
                     "Modo normal: AUTOMÁTICO. El controlador abre y cierra a las horas del programa de Producción.",
                     "Horario típico (lo define Producción): apertura antes del encendido de luces o al inicio del fotoperiodo; cierre al final de la tarde, cuando terminó la postura, para expulsar las aves.",
                     "Ronda de apertura: todos los nidos abiertos, esterillas en su sitio, sin huevo retenido.",
                     "Ronda de cierre: piso inclinado / expulsión completa en todo el galpón; ninguna ave dentro.",
                     "Modo MANUAL: solo para mantenimiento o para corregir un ciclo; al terminar, regresar a AUTOMÁTICO.",
                     "Después de un corte de energía: verificar la hora del controlador.",
                 ]),
             ]),
             ("7. Controlador y programación", [
                 ("ul", [
                     "Las horas de apertura y cierre las autoriza Producción y se publican en el galpón junto al programa de luz.",
                     "Al cambiar el programa de luz (MAN-LF-05) revisar también el horario de nidos: deben ser coherentes.",
                     "Fotografiar la pantalla del programa después de cada cambio y adjuntarla a la OT.",
                     f"Batería del reloj: cambiarla cuando el controlador pierda la hora tras un corte {VERIFICAR}.",
                 ]),
             ]),
             ("8. Mantenimiento", [
                 ("plan", "NID"),
                 ("p", "8.1 Diario: rondas de apertura y cierre. 8.2 Semanal: ciclo manual de prueba, cables, poleas, tensores, limpieza de esterillas. 8.3 Mensual: amperaje, finales de carrera, programación y reloj. 8.4 Trimestral: lubricación, tensión de cables, pendiente de pisos y cortinas. Pasos detallados: documento «Indicaciones de cada actividad»."),
                 ("p", "Ajuste de finales de carrera: con el sistema en manual, llevar a la posición de abierto completo; aflojar la leva del final de carrera, ubicarla de modo que accione justo en esa posición y apretarla. Repetir para cerrado. Probar dos ciclos completos. Si el motor se detiene antes o pasa de largo, el mecanismo queda a medias en algunos módulos."),
                 ("tabla", ["Punto de lubricación", "Lubricante", "Frecuencia"], [
                     ["Bisagras del piso / puerta", f"Grasa o aceite grado alimenticio NSF H1 {VERIFICAR}", "Trimestral"],
                     ["Rodamientos del eje", f"Grasa NSF H1 {VERIFICAR}", "Trimestral"],
                     ["Cadena del motorreductor", f"Lubricante de cadena {VERIFICAR}", "Trimestral"],
                     ["Reductor", f"Aceite según placa {VERIFICAR}", "Revisar nivel trimestral"],
                 ]),
             ]),
             ("9. Overhaul en el vacío sanitario", [("ul", [
                 "Cambiar cables con hilos rotos, poleas trabadas, pasadores y rodamientos con juego.",
                 "Revisar bisagras, pisos y estructura; enderezar o cambiar piezas deformadas.",
                 "Cambiar esterillas gastadas (el huevo se ensucia o se fisura en esterillas rotas).",
                 "Probar varios ciclos completos antes del ingreso del lote.",
             ])]),
             ("10. Limpieza y desinfección", [("ol", [
                 "Semanal: sacudir/cepillar esterillas, retirar plumas, heces y huevo roto.",
                 "Entre lotes: retirar todas las esterillas y lavarlas por inmersión (detergente + desinfectante del protocolo), secarlas al sol.",
                 "Limpieza en seco de nidos, lavado a baja presión, enjuague y desinfección. Proteger motor y controlador.",
                 "Diligenciar el registro de lavado.",
             ])]),
             ("11. Diagnóstico de fallas", [("tabla", ["Síntoma", "Causa probable", "Acción"], [
                 ["Un tramo no abre / no cierra", "Cable flojo o roto; pasador de acople salido; polea trabada", "Bloquear; revisar cable, acoples, poleas"],
                 ["Todo el galpón no se mueve", "Protección disparada; falla del controlador; final de carrera pegado", "Revisar protección, programación y finales de carrera"],
                 ["El motor no se detiene al final", "Final de carrera desajustado o dañado", "Ajustar leva o cambiar final de carrera"],
                 ["Aves dentro del nido en la noche", "Cierre incompleto; hora de cierre muy temprana o tarde", "Revisar finales de carrera y horario"],
                 ["Huevo retenido en el nido", "Esterilla sucia/levantada; pendiente alterada", "Limpiar/cambiar esterilla; revisar pendiente"],
                 ["Mucho huevo de piso", "Nidos abren tarde; nidos sucios o con luz; esterillas en mal estado", "Revisar horario, cortinas y esterillas"],
                 ["Controlador pierde la hora", "Batería de respaldo agotada", "Cambiar batería; reprogramar"],
             ])]),
             ("12. Repuestos críticos recomendados", [("tabla", ["Repuesto", "Stock mínimo sugerido"], [
                 ["Esterillas", "5 % del total instalado"], ["Cable de accionamiento y grapas", "1 rollo"], ["Poleas", "6"],
                 ["Finales de carrera", "2"], ["Motorreductor", "1 para los 12 galpones"], ["Cortinas de entrada", "5 % del total"],
             ])]),
         ]),

    # ════════════════════════════════════ MAN-LF-03 ════════════════════════════════════
    dict(code="MAN-LF-03", titulo="SISTEMA DE ALIMENTACIÓN: SILOS, TOLVAS, CANAL Y CADENA", subtitulo="Manual de operación y mantenimiento — sistema de alimentación Big Herdsman",
         alcance="Silos de alimento, transportadores silo-tolva, tolvas y comederos de canal y cadena de los 12 galpones de producción (módulos 2, 3 y 4). Los comederos de levante (módulos 1 y 5) siguen los capítulos de silos, seguridad y limpieza; su equipo y marca están por confirmar.",
         secciones=[
             ("3. Descripción del sistema", [
                 ("p", "El alimento llega a granel al SILO de cada galpón. Desde la bota del silo, un TRANSPORTADOR (sinfín flexible o rígido dentro de tubo) lo lleva hasta la TOLVA de cada línea de comedero. Un sensor de nivel en la tolva arranca y detiene el transportador para mantenerla llena."),
                 ("p", "El COMEDERO DE CANAL Y CADENA es un circuito cerrado de canales metálicos a lo largo del galpón. Una cadena de eslabones planos corre dentro del canal arrastrada por la UNIDAD MOTRIZ (motorreductor y rueda dentada); al pasar por la tolva se carga de alimento y lo reparte en todo el circuito. Las RUEDAS DE ESQUINA guían la cadena en los giros y un TENSOR mantiene la tensión. Para reproductoras, lo importante es que todas las aves reciban la ración al mismo tiempo: por eso la cadena debe distribuir el alimento en todo el circuito en pocos minutos y de manera pareja. Las rejillas sobre el canal limitan el acceso (por ejemplo, para excluir a los machos) y evitan el desperdicio. El canal se sube y se baja con un sistema de cables y malacate (winche)."),
                 ("p", "Según la información técnica pública del fabricante, sus silos tienen todas las piezas galvanizadas, escalera con guarda, mirilla de observación con sello y cono inferior con tornillería de cabeza redonda para que no se retenga alimento; la línea de cadena es regulable en altura (con soportes o suspendida), tiene placa de alimentación ajustable según línea genética y edad, y esquineros galvanizados en caliente."),
             ]),
             ("4. Componentes y datos técnicos", [
                 ("tabla", ["Componente", "Función", "Dato técnico"], [
                     ["Silo", "Almacenamiento a granel", f"Capacidad (t) {VERIFICAR}; lámina galvanizada"],
                     ["Bota y compuerta de corte", "Salida inferior del silo", "—"],
                     ["Transportador silo-tolva", "Lleva el alimento a la tolva", f"Motor {VERIFICAR}; sensor de fin de línea"],
                     ["Tolva de la línea", "Carga la cadena", "Con compuerta reguladora de la capa de alimento"],
                     ["Sensor de nivel de la tolva", "Arranca/detiene el transportador", "Sensibilidad y retardo ajustables"],
                     ["Unidad motriz", "Mueve la cadena", f"Motorreductor {VERIFICAR}; pasador de seguridad (pin fusible) en la rueda motriz"],
                     ["Cadena", "Arrastra y reparte el alimento", f"Eslabón plano; límite de elongación {VERIFICAR}"],
                     ["Canal y rejillas", "Contienen el alimento; controlan el acceso", "Lámina galvanizada"],
                     ["Ruedas de esquina", "Guían la cadena en los giros", "Rodamiento sellado o con grasera"],
                     ["Tensor", "Mantiene tensión; compensa el alargamiento", "Recorrido limitado"],
                     ["Sistema de elevación", "Ajusta la altura del canal", "Cables, poleas y malacate con freno"],
                 ]),
                 ("p", "Referencia del fabricante para su unidad motriz de comedero (línea de platos): motor trifásico 1,5 kW, IP55, caja en acero inoxidable 430, ruedas en nylon con fibra de vidrio y pasador de seguridad contra sobrecarga. La tensión de fábrica publicada es 380 V / 50 Hz; en Colombia la red es de 60 Hz, por lo que la tensión, la frecuencia y la corriente reales de cada motor se toman de su placa ⚠."),
             ]),
             ("5. Seguridad", [("ul", SEGURIDAD_COMUN + [
                 "Atrapamiento: unidad motriz, ruedas de esquina y tolva. La cadena tiene mucha fuerza; nunca meter la mano en el canal ni en la tolva con el sistema energizado.",
                 "Pasador de seguridad (pin fusible): se rompe a propósito cuando la cadena se traba, para proteger el sistema. Reemplazarlo SOLO por el original; nunca por un perno de acero.",
                 "SILOS: la subida al silo es trabajo en alturas (Res. 4272 de 2021): permiso, arnés, línea de vida y persona de apoyo. El ingreso al silo es ESPACIO CONFINADO (Res. 0491 de 2020): está prohibido sin permiso, medición de atmósfera, vigía y plan de rescate. Riesgo de sepultamiento por alimento.",
             ])]),
             ("6. Operación", [
                 ("ol", [
                     "Producción define el horario de reparto y la ración. El reparto se arranca desde el controlador o el tablero.",
                     "Antes del reparto: silo con alimento, tolvas llenas, canal sin obstáculos, malacate con freno puesto y altura correcta.",
                     "Durante el reparto: recorrer el circuito; la cadena corre continua y el alimento llega a todo el canal en el tiempo del programa.",
                     "Después del reparto: la cadena puede seguir corriendo el tiempo definido por Producción; luego se detiene.",
                     "Altura del canal: ajustarla con el malacate según la edad y el programa (el borde del canal a la altura del lomo del ave, o según la guía de la línea genética).",
                     "Compuerta de la tolva: regula el espesor de la capa de alimento sobre la cadena; ajustarla solo con autorización de Producción.",
                 ]),
             ]),
             ("7. Silos", [
                 ("ul", [
                     "Mantener la tapa superior cerrada: el agua lluvia y la condensación apelmazan el alimento y producen hongos.",
                     "Llenar siguiendo rotación: no dejar alimento viejo pegado al cono durante varios lotes.",
                     "Golpe de prueba con mazo de caucho en el cono: sonido apagado sin alimento = costra.",
                     "Revisar anclajes y escalera; tratar la corrosión con galvanizado en frío.",
                     "Transportador silo-tolva: el sensor de fin de línea o el temporizador de seguridad debe apagar el motor si gira en vacío (el espiral se desgasta y daña el tubo).",
                 ]),
             ]),
             ("8. Mantenimiento", [
                 ("plan", "ALI"),
                 ("p", "8.1 Diario: ronda del primer reparto. 8.2 Semanal: unidad motriz, tensor, esquinas, uniones, sensor de nivel y limpieza de tolvas. 8.3 Mensual: amperajes, guardamotor, pin de seguridad y elongación de cadena. 8.4 Trimestral: lubricación, reductor, tensión/acortado de cadena, altura y elevación. 8.5 Silos: mensual externa y trimestral estructural con transportador. Pasos detallados: documento «Indicaciones de cada actividad»."),
                 ("p", "Tensión y acortado de la cadena: la cadena se alarga con el uso. Cuando el tensor llega al final de su recorrido, se suelta la tensión, se corta el número de eslabones indicado en el manual original y se une con el eslabón de unión del fabricante. Una cadena floja salta en las esquinas y se monta; una cadena muy tensa desgasta esquinas y unidad motriz."),
                 ("tabla", ["Punto de lubricación", "Lubricante", "Frecuencia"], [
                     ["Reductor de la unidad motriz", f"Aceite según placa {VERIFICAR}", "Revisar nivel trimestral; cambio según horas"],
                     ["Rodamientos (unidad motriz, tensor, esquinas con grasera)", f"Grasa NSF H1 {VERIFICAR}", "Trimestral"],
                     ["Malacate de elevación", "Grasa multipropósito", "Trimestral"],
                     ["Cadena del comedero", "NO se lubrica (contacto con alimento)", "—"],
                 ]),
             ]),
             ("9. Overhaul en el vacío sanitario", [("ul", [
                 "Medir elongación de toda la cadena; cambiar tramos fuera de tolerancia.",
                 "Cambiar ruedas de esquina con juego o desgaste; rodamientos con ruido.",
                 "Revisar fondo de canal y rejillas; cambiar tramos perforados o deformados.",
                 "Cambiar aceite del reductor si cumplió horas o está contaminado.",
             ])]),
             ("10. Limpieza y desinfección", [("ol", [
                 "Vaciar tolvas y canales; barrer y aspirar el alimento residual y sacarlo del galpón.",
                 "Lavar con agua a presión moderada y detergente; enjuagar; desinfectar con el producto del protocolo; secar. Proteger motores y tableros.",
                 "Silos: limpieza total al quedar vacíos, desde fuera (sin ingresar); desinfección o fumigación según protocolo; secar antes de volver a llenar.",
                 "Diligenciar el registro de lavado.",
             ])]),
             ("11. Diagnóstico de fallas", [("tabla", ["Síntoma", "Causa probable", "Acción"], [
                 ["Se rompe el pin de seguridad", "Cadena trabada (objeto, esquina dañada, cadena montada)", "Bloquear, encontrar y quitar la causa, poner pin original"],
                 ["La cadena salta en las esquinas", "Cadena floja; esquina desalineada o gastada; unión de canal levantada", "Tensar/acortar; alinear; cambiar esquina"],
                 ["Alimento no llega al final del circuito", "Tolva vacía; compuerta muy cerrada; cadena patina", "Revisar llenado, compuerta, tensión"],
                 ["Reparto disparejo", "Canal desnivelado; capa irregular", "Nivelar; ajustar compuerta"],
                 ["Tolva se rebosa", "Sensor de nivel sucio o desajustado", "Limpiar/ajustar sensor"],
                 ["Transportador gira en vacío", "Silo vacío o costra (puente) en el cono", "Golpe de prueba; pedir alimento; limpiar"],
                 ["Motor se dispara", "Sobrecarga; rodamiento dañado; falta de fase", "Medir corriente en las 3 fases; revisar mecánica"],
             ])]),
             ("12. Repuestos críticos recomendados", [("tabla", ["Repuesto", "Stock mínimo sugerido"], [
                 ["Pasadores de seguridad (pin fusible) originales", "10"], ["Cadena (tramos) y eslabones de unión", "1 rollo + 10 uniones"],
                 ["Ruedas de esquina", "2"], ["Motorreductor de unidad motriz", "1 para los 12 galpones"],
                 ["Sensor de nivel de tolva", "2"], ["Espiral del transportador", "1 tramo"], ["Empaque de tapa de silo", "2"],
             ])]),
         ]),

    # ════════════════════════════════════ MAN-LF-04 ════════════════════════════════════
    dict(code="MAN-LF-04", titulo="SISTEMA DE AGUA Y SISTEMA ANTIPERCHEO", subtitulo="Manual de operación y mantenimiento — bebederos de niple y antipercheo electrificado Big Herdsman",
         alcance="Bebederos de niple, reguladores, filtros y dosificadores de los galpones de producción (módulos 2, 3 y 4) y de levante (módulos 1 y 5); sistema antipercheo electrificado de los galpones de producción.",
         secciones=[
             ("3. Descripción del sistema de agua", [
                 ("p", "El agua sale del tanque de almacenamiento, pasa por el FILTRO y el DOSIFICADOR de medicamentos/vitaminas en la cabecera del galpón y entra a un REGULADOR DE PRESIÓN de cabecera. De ahí se reparte a las LÍNEAS DE NIPLES, tubos a lo largo del galpón con niples a distancia regular. Cada línea tiene una COLUMNA (visor) que muestra la presión en centímetros de agua y una PURGA al final para el lavado. Las líneas cuelgan de cables y se suben o bajan con malacate para ajustar la altura según la edad."),
                 ("p", "El ave bebe empujando la espiga del niple; el niple solo entrega agua cuando se acciona. Con presión muy alta gotea y moja la cama; con presión muy baja las aves no consumen lo suficiente."),
             ]),
             ("4. Componentes y datos técnicos del sistema de agua", [
                 ("tabla", ["Componente", "Función", "Dato técnico"], [
                     ["Filtro de cabecera", "Retiene partículas", f"Malla/cartucho {VERIFICAR} µm"],
                     ["Dosificador", "Inyecta medicamentos/vitaminas en proporción", f"Rango de dosificación {VERIFICAR}"],
                     ["Regulador de cabecera", "Fija la presión de la línea", "Con posición de lavado (flush)"],
                     ["Columna / visor", "Indica la presión", "Escala en cm"],
                     ["Niples", "Entregan el agua", f"Caudal según presión {VERIFICAR}"],
                     ["Tacitas / vasos (si tiene)", "Recogen el goteo", "—"],
                     ["Purga de final de línea", "Lavado y salida de aire", "—"],
                     ["Malacate, cables y poleas", "Altura de la línea", "—"],
                 ]),
             ]),
             ("5. Seguridad", [("ul", SEGURIDAD_COMUN + [
                 "Medicamentos y desinfectantes: EPP según la hoja de seguridad. Nunca mezclar productos clorados con ácidos.",
                 "Tanques elevados: trabajo en alturas. Tanques donde haya que ingresar: espacio confinado (Res. 0491 de 2020).",
             ])]),
             ("6. Operación del sistema de agua", [
                 ("ol", [
                     "Presión: ajustar el regulador para que la columna quede a la altura de la tabla por edad (la publica Producción).",
                     "Altura: el ave debe estirar ligeramente el cuello para alcanzar el niple (ángulo de 45° en pollitas, casi vertical en adultas, según la guía de la línea genética).",
                     "Consumo: leer el medidor a la misma hora todos los días y registrarlo; variaciones mayores al 10 % se reportan al veterinario (es la primera señal de enfermedad o de falla del sistema).",
                     "Medicación: preparar la solución madre según la orden del veterinario, verificar el ajuste del dosificador y registrar.",
                 ]),
             ]),
             ("7. Tanques y motobombas", [("p", "Los tanques de almacenamiento y las motobombas que alimentan las líneas de niples tienen su propio manual: MAN-LF-06 (tableros eléctricos, motobombas, tanques de agua y chumaceras).")]),
             ("8. Mantenimiento del sistema de agua", [
                 ("plan", "AGU"),
                 ("p", "8.1 Diario: presión, goteo, cama, altura y consumo. 8.2 Semanal: filtros, aforo del dosificador, purgas, caudal al azar. 8.3 Mensual: reguladores, caudal de 10 niples por línea, nivelación y malacates."),
                 ("p", "Prueba de caudal de niple: presionar la espiga con una probeta debajo durante 1 minuto y medir los ml. Comparar con la tabla del fabricante del niple para la presión de trabajo ⚠. Un niple con caudal muy bajo está obstruido (cambiar); uno que gotea sin accionarse tiene el sello dañado (cambiar)."),
                 ("p", "Aforo del dosificador: medir en el mismo tiempo el agua que pasa por el dosificador y la solución que aspira; % real = solución / agua x 100. Comparar con el valor ajustado; si difiere más de ± 5 %, revisar el pistón/sellos del dosificador."),
             ]),
             ("9. Overhaul del sistema de agua (vacío sanitario)", [("ul", [
                 "Cambiar niples con goteo o caudal fuera de rango.",
                 "Revisar o cambiar diafragmas de los reguladores.",
                 "Kit de sellos del dosificador según horas o volumen del fabricante ⚠.",
                 "Revisar mangueras, uniones, cables y malacates.",
             ])]),
             ("10. Lavado y desinfección de líneas entre lotes", [("ol", [
                 "Reguladores en posición de lavado y purgas abiertas.",
                 "Lavar con agua a alto caudal hasta que salga clara.",
                 "Llenar con la solución desinfectante del protocolo de Bioseguridad (producto y concentración de su ficha técnica) y dejarla el tiempo de contacto indicado.",
                 "Enjuagar con agua limpia hasta que no quede residual (tira reactiva).",
                 "Regresar los reguladores a modo normal, ajustar presión del lote entrante y diligenciar el registro de lavado.",
                 "Durante el lote, si se aplican tratamientos con vitaminas o azúcares, lavar las líneas al terminar el tratamiento (favorecen el biofilm).",
             ])]),
             ("11. Sistema antipercheo — descripción", [
                 ("p", "Las reproductoras tienden a posarse sobre las líneas de comedero y de bebedero: ensucian el alimento y el agua con heces, doblan y desnivelan las líneas y aumentan el huevo de piso. El sistema antipercheo instala un alambre electrificado a lo largo de las líneas, sobre aisladores, conectado a un ENERGIZADOR (electrificador) del mismo tipo de las cercas eléctricas: emite un impulso de alto voltaje y muy baja energía aproximadamente cada segundo. Cuando el ave se posa y toca el alambre y la línea (que está a tierra), recibe una descarga breve que la hace bajar sin causarle daño; en pocos días aprende a no posarse."),
                 ("tabla", ["Componente", "Función", "Dato técnico"], [
                     ["Energizador", "Genera el impulso", f"Energía (J) y tensión de salida {VERIFICAR}"],
                     ["Alambre electrificado", "Conduce el impulso a lo largo de las líneas", "Acero galvanizado o inoxidable"],
                     ["Aisladores", "Separan el alambre de la línea metálica", "Plástico; repuesto de desgaste"],
                     ["Puesta a tierra", "Cierra el circuito del impulso", "Varilla de cobre dedicada"],
                     ["Interruptores de sección (si los tiene)", "Cortan la tensión por tramo", "Para mantenimiento"],
                     ["Tensores y empalmes", "Mantienen el alambre tenso", "—"],
                 ]),
             ]),
             ("12. Sistema antipercheo — operación y seguridad", [("ul", [
                 "El energizador permanece encendido mientras haya aves en el galpón.",
                 "No tocar el alambre: la descarga es dolorosa. Para trabajar sobre las líneas, apagar el energizador o abrir el interruptor de sección y comprobar con el probador.",
                 "DESCONECTAR el energizador antes del lavado del galpón y durante todo el lavado.",
                 "Nunca conectar el alambre directo a la red eléctrica ni usar un energizador no diseñado para cercas: riesgo mortal.",
                 "Mantener libre el alambre: cama, plumas acumuladas, cables o el mismo niple tocándolo descargan el sistema y las aves vuelven a posarse.",
             ])]),
             ("13. Sistema antipercheo — mantenimiento", [
                 ("plan", "APC"),
                 ("p", "13.1 Diario: indicador del energizador y aves posadas. 13.2 Semanal: medición de tensión al inicio y al final de cada línea con probador de cerca; aisladores y alambre. 13.3 Mensual: energizador, puesta a tierra e interruptores. 13.4 Vacío sanitario: desconexión, lavado, cambio de aisladores/alambre y prueba. 13.5 Anual: resistencia de puesta a tierra."),
                 ("p", "Búsqueda de fugas: si la tensión al final de la línea es mucho menor que en la salida del energizador, ir midiendo hacia atrás por tramos; donde la tensión sube de golpe está la fuga (aislador roto, alambre tocando metal o cama). Referencia típica de tensión mínima en cercas ≥ 3 kV ⚠ — confirmar el valor con el manual del energizador."),
             ]),
             ("14. Diagnóstico de fallas", [("tabla", ["Síntoma", "Causa probable", "Acción"], [
                 ["Cama húmeda bajo la línea", "Presión alta; niple con sello dañado; línea desnivelada", "Bajar presión; cambiar niple; nivelar"],
                 ["Columna no responde al regulador", "Diafragma sucio o roto; aire en la línea", "Limpiar/cambiar regulador; purgar"],
                 ["Baja presión al final de la línea", "Filtro tapado; línea con pendiente; fuga", "Limpiar filtro; nivelar; buscar fuga"],
                 ["Caída de consumo de agua", "Filtro tapado; niples obstruidos; aves enfermas", "Revisar sistema y avisar al veterinario"],
                 ["Dosificador no aspira", "Sellos gastados; filtro de succión tapado; aire", "Limpiar; cambiar kit de sellos"],
                 ["Aves posadas sobre las líneas", "Energizador apagado; fuga a tierra; alambre roto", "Medir tensión; buscar fuga por tramos"],
                 ["Tensión baja en todo el sistema", "Puesta a tierra deficiente; energizador dañado", "Revisar varilla y conexión; medir salida"],
             ])]),
             ("15. Repuestos críticos recomendados", [("tabla", ["Repuesto", "Stock mínimo sugerido"], [
                 ["Niples", "2 % del total instalado"], ["Regulador de presión", "2"], ["Cartuchos/mallas de filtro", "1 por galpón"],
                 ["Kit de sellos del dosificador", "2"], ["Aisladores antipercheo", "5 % del total"], ["Alambre electrificado", "1 rollo"],
                 ["Energizador", "1 para los 12 galpones de producción"],
             ])]),
         ]),

    # ════════════════════════════════════ MAN-LF-05 ════════════════════════════════════
    dict(code="MAN-LF-05", titulo="SISTEMA DE ILUMINACIÓN INTELIGENTE", subtitulo="Manual de operación y mantenimiento — iluminación LED regulable con controlador Big Herdsman",
         alcance="Controlador de iluminación, regulador de intensidad (dimmer), luminarias LED, sensores y tableros de iluminación de los galpones de producción (módulos 2, 3 y 4). Aplica también a los galpones de levante (módulos 1 y 5) en lo que coincida con su equipo (por confirmar).",
         secciones=[
             ("3. Descripción del sistema", [
                 ("p", "En reproductoras la luz controla la madurez sexual y la postura: la cantidad de horas de luz (fotoperiodo) y la intensidad se cambian por edad siguiendo el programa de luz de la línea genética, aprobado por Producción y Veterinaria. El sistema de iluminación inteligente ejecuta ese programa de forma automática."),
                 ("p", "Un CONTROLADOR con reloj enciende y apaga las luces a las horas programadas y, a través de un REGULADOR (dimmer, típicamente señal 0-10 V o PWM ⚠), fija la intensidad de las LUMINARIAS LED. Puede simular amanecer y atardecer subiendo y bajando la intensidad de forma gradual, lo que reduce el estrés de las aves. Algunos controladores tienen SENSOR DE LUZ para compensar la luz natural que entra al galpón, y registran alarmas y eventos."),
             ]),
             ("4. Componentes y datos técnicos", [
                 ("tabla", ["Componente", "Función", "Dato técnico"], [
                     ["Controlador", "Ejecuta el programa de luz", f"Modelo y n.º de programas {VERIFICAR}; batería de respaldo del reloj"],
                     ["Dimmer / regulador", "Varía la intensidad", f"Tipo de señal (0-10 V / PWM) {VERIFICAR}"],
                     ["Luminarias LED", "Fuente de luz", f"Potencia (W), temperatura de color (K) y grado IP {VERIFICAR}"],
                     ["Drivers", "Alimentan los LED", "Compatibles con el dimmer"],
                     ["Sensor de luz (si tiene)", "Mide la luz del galpón", "—"],
                     ["Tablero de iluminación", "Protecciones y contactores", "RETIE"],
                 ]),
             ]),
             ("5. Seguridad", [("ul", SEGURIDAD_COMUN + [
                 "Antes de manipular luminarias, cajas de empalme o drivers: desenergizar el circuito y aplicar LOTO.",
                 "Hidrolavar luminarias solo si su grado IP lo permite (IP65 o superior) y con el circuito desenergizado.",
                 "Un apagón de luz no programado en horas de luz o un encendido en la noche alteran la postura: cualquier prueba que cambie la luz se coordina con Producción.",
             ])]),
             ("6. Operación", [("ol", [
                 "Modo normal: AUTOMÁTICO, con el programa del lote vigente.",
                 "El programa de luz (horas de luz, hora de encendido y apagado, intensidad y duración del amanecer/atardecer) lo define Producción con Veterinaria, por edad del lote. Se publica en el galpón.",
                 "El operario NO modifica el programa: verifica que se cumpla y reporta diferencias.",
                 "Cambios de programa (por edad o por nuevo lote): los carga el responsable autorizado, se fotografía la pantalla y se firma la verificación.",
                 "Después de un corte de energía: verificar hora y programa del controlador.",
             ])]),
             ("7. Programación del controlador", [("ul", [
                 "Datos que se programan por etapa: fecha/edad de inicio, hora de encendido, hora de apagado, intensidad (% o lux objetivo) y duración del amanecer/atardecer.",
                 "Coherencia con los nidos (MAN-LF-02): la apertura de nidos debe ocurrir antes del pico de postura, en relación con el encendido de luces.",
                 "Respaldo: exportar el programa (si el controlador lo permite) o fotografiar todas las pantallas cada trimestre y después de cada cambio.",
                 "Reloj: diferencia máxima aceptada 5 minutos; corregir semanalmente.",
                 f"Instrucciones de menú (teclas y pantallas): según el manual del controlador instalado {VERIFICAR}.",
             ])]),
             ("8. Mantenimiento", [
                 ("plan", "ILU"),
                 ("p", "8.1 Diario: horario, amanecer/atardecer y luminarias. 8.2 Semanal: reloj, programa vs. programa aprobado, alarmas, foto. 8.3 Mensual: luxómetro en cuadrícula, respuesta del dimmer, sensor, drivers y contactores. 8.4 Trimestral: limpieza de luminarias, conexiones y respaldo del programa."),
                 ("p", "Medición con luxómetro: con el programa al 100 % de la intensidad del día, medir a la altura de la cabeza del ave en 9 puntos por piso (3 a lo ancho x 3 a lo largo), incluyendo zona de nidos y comederos. Promedio = suma / 9; uniformidad = mínimo / promedio. Los valores objetivo los fija el programa de luz de Producción según la guía de la línea genética. El polvo sobre las luminarias puede reducir la luz de forma importante: si el promedio baja, limpiar antes de concluir que el LED está fallando."),
             ]),
             ("9. Overhaul en el vacío sanitario", [("ul", [
                 "Reemplazar luminarias y drivers defectuosos por el mismo modelo o uno equivalente compatible con el dimmer.",
                 "Revisar cajas de empalme, prensaestopas, cables y fijaciones.",
                 "Probar dimmer de 0 a 100 % y amanecer/atardecer.",
                 "Cargar el programa del lote entrante y hacerlo verificar por Producción.",
             ])]),
             ("10. Limpieza y desinfección", [("ol", [
                 "Trimestral (con aves): paño húmedo, circuito desenergizado.",
                 "Entre lotes: lavado y desinfección según grado IP, con el circuito desenergizado.",
                 "Diligenciar el registro de lavado.",
             ])]),
             ("11. Diagnóstico de fallas", [("tabla", ["Síntoma", "Causa probable", "Acción"], [
                 ["Las luces encienden a otra hora", "Reloj desfasado tras corte; batería del reloj agotada", "Corregir hora; cambiar batería"],
                 ["Luminaria apagada", "Driver dañado; conexión suelta", "Revisar conexión; cambiar driver/luminaria"],
                 ["Luminarias parpadean al regular", "Driver no compatible con el dimmer; señal 0-10 V con interferencia", "Usar driver compatible; revisar cableado de señal"],
                 ["La intensidad no cambia", "Falla del dimmer o de la señal de control", "Medir la señal (V) a la salida del dimmer"],
                 ["Lux por debajo del programa", "Polvo; luminarias apagadas; envejecimiento del LED", "Limpiar; reemplazar; ajustar intensidad con autorización"],
                 ["Protección del circuito se dispara", "Corto o humedad en caja de empalme", "Bloquear; secar/aislar; revisar"],
             ])]),
             ("12. Repuestos críticos recomendados", [("tabla", ["Repuesto", "Stock mínimo sugerido"], [
                 ["Luminarias LED del mismo modelo", "3 % del total instalado"], ["Drivers", "3 % del total"],
                 ["Batería del reloj del controlador", "2"], ["Contactores y protecciones", "1 juego"], ["Controlador", "1 para la granja"],
             ])]),
         ]),

    # ════════════════════════════════════ MAN-LF-06 ════════════════════════════════════
    dict(code="MAN-LF-06", titulo="TABLEROS ELÉCTRICOS, MOTOBOMBAS, TANQUES DE AGUA Y CHUMACERAS", subtitulo="Manual de operación y mantenimiento — equipos de servicio de la granja",
         alcance="Tableros eléctricos de los 24 galpones, tablero general, transferencia y tableros de bombeo; motobombas de suministro de agua; tanques de almacenamiento de agua (S4, S8, S9, S10, S13, S14, S17, S18, S20, S24 y S25); chumaceras de la banda de huevo, los nidos, la unidad motriz de alimentación y los transportadores de los 12 galpones de producción.",
         secciones=[
             ("3. Descripción general", [
                 ("p", "Estos equipos no son de Big Herdsman, pero de ellos depende que funcionen los sistemas de los galpones: sin tablero no arrancan la cadena, la banda, los nidos ni la luz; sin motobomba y tanque no hay agua para las aves; una chumacera dañada detiene la banda de huevo o la línea de alimento. Por eso tienen plan propio (grupos TAB, MOT, TAN y CHU del Plan AM)."),
             ]),
             ("4. Seguridad", [("ul", SEGURIDAD_COMUN + [
                 "Riesgo eléctrico: solo el personal calificado (RETIE) abre tableros energizados, y únicamente para mirar y medir con instrumento. Para apretar, limpiar o cambiar componentes: desenergizar, bloquear (LOTO) y verificar ausencia de tensión con multímetro.",
                 "Nunca lavar tableros con agua ni hidrolavadora. Durante el lavado del galpón cubrirlos y mantenerlos cerrados.",
                 "Tanques: los elevados son trabajo en alturas (Res. 4272 de 2021); ingresar a un tanque es espacio confinado (Res. 0491 de 2020).",
                 "Motobombas: no trabajar sin garantizar agua de respaldo para las aves; descargar la presión de la red antes de desarmar.",
             ])]),
             ("5. Tanques de agua", [
                 ("p", "Los tanques almacenan el agua que luego se bombea o baja por gravedad a las líneas de niples. Su limpieza y su cierre son de bioseguridad: un tanque abierto deja entrar luz (algas), insectos, aves y roedores, y contamina el agua de todo el galpón."),
                 ("tabla", ["Componente", "Qué se revisa"], [
                     ["Tapa y empaque", "Cerrada, asegurada, sin rendijas"], ["Flotador / válvula de llenado", "Corta el llenado; no rebosa"],
                     ["Rebose y respiradero", "Con malla"], ["Válvulas de salida y de lavado", "Abren y cierran, sin fugas"],
                     ["Base, torre, escalera", "Sin fisuras, corrosión ni pernos faltantes"], ["Paredes", "Sin fisuras, abombamiento ni cristalización (plásticos)"],
                 ]),
                 ("plan", "TAN"),
                 ("ol", [
                     "Lavado trimestral: garantizar agua desde otro tanque; vaciar; retirar sedimentos; cepillar paredes y fondo; desinfectar con el producto del protocolo respetando el tiempo de contacto; enjuagar; llenar; medir cloro residual.",
                     "Cloro residual: medir con kit DPD a la salida del tanque y al final de una línea; mantenerlo en el rango del protocolo sanitario.",
                     "Análisis de laboratorio anual (fisicoquímico y microbiológico).",
                 ]),
             ]),
             ("6. Motobombas — descripción y operación", [
                 ("p", "La motobomba (motor eléctrico + bomba centrífuga) sube el agua desde la fuente o el tanque bajo y la entrega a presión a la red. Arranca y para sola por un PRESOSTATO (que mide la presión de la red) o por un FLOTADOR (que mide el nivel del tanque que llena). Un TANQUE HIDRONEUMÁTICO con aire precargado amortigua los arranques; una VÁLVULA DE PIE o CHEQUE mantiene la bomba cebada."),
                 ("tabla", ["Componente", "Función", "Dato técnico"], [
                     ["Motor", "Mueve la bomba", f"Potencia, tensión, In {VERIFICAR}"], ["Bomba centrífuga", "Entrega caudal y presión", f"Caudal y altura {VERIFICAR}"],
                     ["Sello mecánico", "Evita la fuga por el eje", "Repuesto de desgaste"], ["Presostato", "Arranque y parada por presión", "Presión de arranque/parada ajustable"],
                     ["Tanque hidroneumático", "Amortigua arranques", "Precarga ≈ 2 psi bajo la presión de arranque"], ["Válvula de pie / cheque y canastilla", "Mantiene cebada la bomba; filtra la succión", "—"],
                     ["Manómetro", "Indica la presión", "Rango de trabajo marcado"],
                 ]),
                 ("ol", [
                     "Modo normal: AUTOMÁTICO. La ronda diaria verifica presión, arranque/parada, ruido y fugas.",
                     "Si hay dos bombas, alternarlas (manual o automáticamente) para que ambas trabajen y la de respaldo esté probada.",
                     "Nunca dejar la bomba trabajando en seco (sin agua): se daña el sello en minutos.",
                     "Si la bomba arranca y para cada pocos segundos: revisar la precarga del hidroneumático o una fuga en la red.",
                 ]),
             ]),
             ("7. Tableros eléctricos — descripción y operación", [
                 ("p", "Cada galpón tiene un tablero con las protecciones (breakers, diferenciales), los arrancadores (contactores y guardamotores) y los controles de sus equipos: unidad motriz de alimentación y transportador silo-tolva, banda de huevo, nidos, energizador antipercheo e iluminación. La granja tiene además un tablero general, la transferencia (ATS) de la planta eléctrica y los tableros de bombeo."),
                 ("ul", [
                     "Selectores en AUTOMÁTICO salvo durante mantenimiento.",
                     "Puerta siempre cerrada: el polvo, la humedad, los insectos y los roedores son la primera causa de falla en tableros de galpón.",
                     "Diagrama unifilar en la puerta y señalización de riesgo eléctrico.",
                     "Guardamotores ajustados a la corriente nominal (In) de placa del motor que protegen; nunca subirlos para «que no se dispare».",
                     "Diferenciales: probar el botón TEST cada trimestre.",
                 ]),
             ]),
             ("8. Mantenimiento de motobombas y tableros", [
                 ("plan", "MOT"),
                 ("p", "8.1 Diario (operario): ronda de la motobomba. 8.2 Mensual: tensión y corriente, presostato, precarga del hidroneumático, sello, válvula de pie, temperatura y base. 8.3 Trimestral: succión, acople, bornes, lubricación si tiene grasera, prueba de la bomba de respaldo."),
                 ("plan", "TAB"),
                 ("p", "8.4 Tableros: mensual inspección con termómetro infrarrojo; trimestral limpieza y apriete desenergizado y prueba de diferenciales; semestral termografía con carga; anual puesta a tierra y megado de motores."),
                 ("tabla", ["Medición", "Criterio de la empresa"], [
                     ["Corriente del motor", "≤ In de placa; desbalance entre fases ≤ 10 %"], ["Tensión", "± 10 % de la nominal"],
                     ["Temperatura de componentes de tablero", "≤ 60 °C y no más de 15 °C sobre sus iguales"], ["Termografía", "ΔT ≤ 10 °C entre fases o elementos iguales"],
                     ["Aislamiento de motores (megado a 500 V)", "≥ 1 MΩ y sin caída fuerte frente al año anterior"], ["Puesta a tierra", "Valores máximos de RETIE"],
                 ]),
             ]),
             ("9. Mantenimiento mayor de motobombas", [("ol", [
                 "Garantizar agua de respaldo; bloquear y desconectar.",
                 "Megar el motor a 500 V.",
                 "Desarmar: revisar impulsor, voluta y anillos de desgaste.",
                 "Cambiar sello mecánico y rodamientos por condición o según horas del fabricante ⚠.",
                 "Verificar manómetro contra patrón y ajuste del presostato.",
                 "Armar, cebar, arrancar, medir corriente y presión; registrar en la hoja de vida (FOMAT03).",
             ])]),
             ("10. Chumaceras", [
                 ("p", "La chumacera es un rodamiento montado en un soporte (de pie, UCP; de brida, UCF/UCFL; tensor, UCT) que sostiene un eje que gira: rodillos de la banda de huevo, eje de los nidos, rueda motriz y tensor de la cadena de alimento, transportadores. Fija el rodamiento al eje con prisioneros o con collarín excéntrico. Las que tienen grasera se lubrican; las selladas de por vida solo se inspeccionan."),
                 ("plan", "CHU"),
                 ("tabla", ["Señal", "Qué indica", "Acción"], [
                     ["Temperatura > 70 °C o subió > 15 °C", "Falta o exceso de grasa, desalineación, rodamiento dañado", "Revisar lubricación y alineación; programar cambio"],
                     ["Golpeteo o chirrido", "Pista o bolas dañadas", "Programar cambio"],
                     ["Juego del eje", "Prisioneros flojos o rodamiento gastado", "Apretar prisioneros; si persiste, cambiar"],
                     ["Grasa negra o polvo en el sello", "Sello dañado; contaminación", "Limpiar, lubricar, vigilar; cambiar si sigue"],
                 ]),
                 ("ol", [
                     "Lubricación: grasa grado alimenticio NSF H1 (banda, nidos y alimentación pueden tener contacto con huevo o alimento). 1 a 2 bombazos por chumacera cada trimestre; limpiar la grasa vieja y el exceso.",
                     "No sobreengrasar: la grasa en exceso revienta el sello y calienta el rodamiento.",
                     "Cambio: misma referencia (anotada en el levantamiento LF-100); eje limpio y sin rebabas; no golpear el rodamiento; apretar primero los pernos y luego los prisioneros.",
                 ]),
             ]),
             ("11. Diagnóstico de fallas", [("tabla", ["Síntoma", "Causa probable", "Acción"], [
                 ["La bomba no arranca", "Protección disparada; presostato dañado; falta de fase", "Revisar tablero; medir tensión; revisar presostato"],
                 ["La bomba arranca y no da presión", "Descebada; válvula de pie con fuga; succión tapada; impulsor gastado", "Cebar; limpiar canastilla; cambiar válvula; revisar impulsor"],
                 ["Arranques muy seguidos", "Hidroneumático sin aire o con membrana rota; fuga en la red", "Revisar precarga; buscar fuga"],
                 ["Ruido de grava en la bomba", "Cavitación (succión restringida o nivel bajo)", "Limpiar succión; revisar nivel"],
                 ["Goteo por el eje", "Sello mecánico gastado", "Cambiar sello"],
                 ["Breaker o guardamotor se dispara", "Sobrecarga del motor; corto; guardamotor mal ajustado", "Medir corriente; revisar mecánica; ajustar a In"],
                 ["Diferencial se dispara", "Fuga a tierra por humedad o cable dañado", "Desconectar circuitos uno a uno para hallar el que falla"],
                 ["Tanque rebosa", "Flotador o válvula de llenado dañados", "Cambiar flotador o válvula"],
             ])]),
             ("12. Repuestos críticos recomendados", [("tabla", ["Repuesto", "Stock mínimo sugerido"], [
                 ["Kit de sello mecánico por modelo de motobomba", "1 por modelo"], ["Presostato", "1"], ["Manómetro", "2"], ["Válvula de pie/cheque", "1 por diámetro"],
                 ["Flotador / válvula de llenado de tanque", "2"], ["Breakers, contactores y guardamotores por rango usado", "1 de cada"], ["Diferencial", "1"],
                 ["Chumaceras por referencia instalada", "2 por referencia (según LF-100)"], ["Grasa NSF H1", "2 cartuchos"],
             ])]),
         ]),
]
