# Activos gráficos extraídos de Mántum

Extraído el **2026-08-24** desde `http://192.168.1.252:8081` (Mántum CMMS, red local).
Destino previsto: **proyecto IncubApp**.

Regenerable con:
```
python generador/descargar_imagenes_mantum.py
python generador/descargar_imagenes_instalaciones.py
```

---

## Lo que SÍ hay

| Carpeta | Archivos | Peso | Contenido |
|---|---|---|---|
| `imagenes-equipos/` | 101 | 8,2 MB | Una imagen por cada equipo registrado, nombrada `<CÓDIGO>__<nombre>.jpg` |
| `imagenes-instalaciones/` | 43 | 6,1 MB | Una imagen por instalación de proceso (salas / áreas), nombrada `<código>.jpg` |

Los CSV `inventario_imagenes.csv` e `inventario_imagenes_instalaciones.csv` traen el mapeo
completo: código → nombre → archivo original en Mántum → archivo descargado → tipo → bytes.

## Lo que hay que saber antes de usarlas

**No todas las imágenes son fotos reales.** Mántum muestra una imagen heredada cuando el
activo no tiene foto propia cargada, y a simple vista parece que sí la tiene:

- **Equipos:** de los 101, **73 tienen foto propia** y **28 muestran el logo de Incubant**
  (los archivos originales que empiezan por `InstalacionProceso_`). Entre esos 28 están las
  **incubadoras 13 a 24**, las **nacedoras 7 a 12** y los **chillers 2 y 3** — es decir, casi
  todo lo que se cargó recientemente está sin foto.
- **Instalaciones:** de las 43, **22 son foto real** y **21 son solo el logo**.

La columna *Tipo* del CSV lo dice fila por fila. **Filtrar por esa columna antes de publicar
nada en IncubApp**, o se van a subir logos donde deberían ir fotos de equipo.

**Muchas fotos están compartidas entre equipos.** Son 65 archivos únicos para 101 equipos:
por ejemplo las 12 incubadoras de INC-001 usan la misma foto genérica, y las 6 vacunadoras
comparten otra. No son fotos individuales de cada máquina.

**Calidad heterogénea.** Buena parte son fotos de WhatsApp de 2019 y capturas de catálogo de
fabricante (Grundfos, Somar, Petersime) descargadas de internet, no fotografías del activo
real instalado en planta.

---

## Manuales: NO existen en Mántum

Se revisó de forma exhaustiva y **no hay ni un solo manual, PDF ni documento técnico**:

| Dónde se buscó | Resultado |
|---|---|
| Adjuntos de los 101 equipos | 65 archivos, **todos** imágenes (jpg/jpeg/png) |
| Adjuntos de las 47 instalaciones de proceso | 19 archivos, **todos** imágenes |
| Módulo **Instructivos** | **0 registrados** |
| Módulo **Gestión Documental → Visor de archivos** | vacío |

El único `.png` que parece documento (`RTAE-Page.png`, en el chiller 005.4) es una imagen,
no un PDF de manual.

**Conclusión:** los manuales de fabricante no están digitalizados en Mántum. Si se necesitan
para IncubApp hay que conseguirlos por fuera — del proveedor (Petersime para incubadoras,
nacedoras y chillers) o escaneando los físicos que estén en planta. Esto ya venía como
pendiente en el programa PRGMAT01 (hoja 12) y en el informe de brechas.
