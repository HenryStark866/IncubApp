# Tecnologías y lenguajes aplicados — Preguntas y respuestas

**IncubApp v3.0** · Julio 2026  
**Autor:** Henry Camilo Taborda Galeano — Desarrollador  

Guía en formato **¿qué es? · ¿cómo funciona? · ¿para qué sirve?** sobre el stack real del proyecto.  
Pensada para gerencia, coordinación y quien no sea programador a diario.

---

## 1. Mapa rápido del stack

| Tecnología | Tipo | Rol en IncubApp |
|------------|------|-----------------|
| **JavaScript (JS)** | Lenguaje | Lógica de la aplicación en el navegador |
| **JSX** | Extensión de JS | Cómo se escriben las pantallas con React |
| **HTML** | Marcado | Estructura de la página (`index.html`) |
| **CSS** | Estilos | Colores, layout, tema claro/oscuro, fondo |
| **SQL** | Lenguaje de datos | Tablas, permisos y consultas en Postgres |
| **React 19** | Librería UI | Construye todas las pantallas y módulos |
| **Vite 8** | Herramienta de build | Arranca el dev server y empaqueta para producción |
| **Node.js / npm** | Runtime y paquetes | Instala dependencias y corre scripts |
| **Supabase** | Backend como servicio | Login, base de datos, archivos, tiempo real |
| **PostgreSQL** | Base de datos | Guarda usuarios, plantas, OT, asistencia, etc. |
| **RLS** | Seguridad en BD | Cada empresa solo ve sus datos |
| **Vercel** | Hosting | Publica la web en internet (CDN) |
| **PWA / Service Worker** | App instalable | Se puede “instalar” en el celular |
| **Leaflet** | Mapas | Mapas de logística / rutas |
| **SheetJS (xlsx)** | Excel | Exportar reportes y bandejas a Excel |
| **Git / GitHub** *(recomendado)* | Control de versiones | Historial del código y respaldo |
| **Oxlint** | Linter | Revisa errores de código en desarrollo |
| **Grok / xAI** *(opcional)* | IA | Asesor de gerencia; la app funciona sin él |

---

## 2. Lenguajes

### 2.1 JavaScript (JS)

**¿Qué es?**  
Lenguaje de programación principal de la web. Es lo que “piensa” la app en el teléfono o computador del usuario.

**¿Cómo funciona?**  
El navegador (Chrome, etc.) descarga el código JS y lo ejecuta: reacciona a botones, llama a la base de datos, calcula cumplimiento, pone la marca de agua en la selfie, etc.

**¿Para qué se usa en IncubApp?**  
Toda la lógica de módulos: asistencia, bandeja gerencial, cumplimiento 90 días/95 %, chat, permisos, GPS, etc. Los archivos están en `src/` (`.js` y `.jsx`).

---

### 2.2 JSX

**¿Qué es?**  
Una forma de escribir interfaces mezclando HTML-like con JavaScript (se usa con React).

**¿Cómo funciona?**  
Se escribe algo parecido a:

```jsx
<button onClick={marcarIngreso}>Marcar ingreso</button>
```

Herramientas como Vite lo transforman a JavaScript puro que el navegador entiende.

**¿Para qué?**  
Definir pantallas (Asistencia, Cumplimiento, Gerencia…) de forma legible y mantenible.

---

### 2.3 HTML

**¿Qué es?**  
Lenguaje de marcado que describe la estructura de una página web (títulos, contenedores, enlaces).

**¿Cómo funciona?**  
El navegador lee el HTML y dibuja el esqueleto de la página. En una SPA moderna, el HTML suele ser mínimo y React rellena el contenido.

**¿Para qué en IncubApp?**  
`index.html` es la cáscara: carga la app, el ícono PWA y el punto de montaje `#root`. También `public/reparar.html` para recuperar si el caché falla.

---

### 2.4 CSS

**¿Qué es?**  
Lenguaje de estilos: colores, tipografías, tamaños, animaciones, diseño responsive.

**¿Cómo funciona?**  
Reglas del tipo “todos los botones primarios son naranjas” o “el fondo usa `fondo.jpg`”. Variables CSS permiten tema claro y oscuro.

**¿Para qué?**  
Identidad visual IncubApp, legibilidad sobre el fondo de pollitos, cockpits de gerencia, tablas y paneles en móvil y PC (`src/index.css`).

---

### 2.5 SQL (Structured Query Language)

**¿Qué es?**  
Lenguaje estándar para hablar con bases de datos relacionales (tablas, filas, columnas).

**¿Cómo funciona?**  
Se crean tablas (`CREATE TABLE`), se insertan datos (`INSERT`), se consultan (`SELECT`) y se protegen con políticas. En IncubApp las migraciones son archivos `.sql` que se ejecutan en el SQL Editor de Supabase.

**¿Para qué?**  
Definir y mantener el esquema: `silo_dispatches` (bandeja), `attendance_punches` (asistencia), `performance_targets` / `round_reports` / `user_usage_streaks` (cumplimiento y 90 días), `access_grants`, etc.

---

## 3. Frontend (lo que ve el usuario)

### 3.1 React 19

**¿Qué es?**  
Librería de JavaScript para construir interfaces por **componentes** (piezas reutilizables de UI).

**¿Cómo funciona?**  
Cada pantalla es un componente (`AttendancePanel`, `PerformancePanel`…). Cuando cambian los datos (estado o respuesta de Supabase), React vuelve a pintar solo lo necesario.

**¿Para qué?**  
Toda la experiencia de usuario de IncubApp: menús, dashboards, formularios, listas, mapas embebidos.

---

### 3.2 React DOM

**¿Qué es?**  
El puente entre React y el DOM real del navegador (los elementos HTML en pantalla).

**¿Cómo funciona?**  
`main.jsx` monta la app en el elemento `#root`. React DOM aplica los cambios del árbol de componentes a la página.

**¿Para qué?**  
Que lo diseñado en React se vea y se pueda tocar en el navegador.

---

### 3.3 Vite 8

**¿Qué es?**  
Herramienta moderna de desarrollo y empaquetado (build) para proyectos frontend.

**¿Cómo funciona?**  
- `npm run dev` → servidor local ultra rápido con recarga al guardar.  
- `npm run build` → genera la carpeta `dist/` optimizada (JS/CSS minificados).  

**¿Para qué?**  
Productividad en desarrollo y un paquete liviano para publicar en Vercel.

---

### 3.4 PWA (Progressive Web App) y Service Worker

**¿Qué es?**  
Conjunto de técnicas para que una web se comporte casi como app nativa: instalable, ícono en el celular, a veces caché offline.

**¿Cómo funciona?**  
Un **service worker** (`public/sw.js`) intercepta algunas peticiones de red y puede cachear el “shell” de la app. El `manifest.webmanifest` define nombre, íconos y modo de apertura.

**¿Para qué?**  
Que operarios y coordinadores instalen IncubApp en el teléfono de planta sin pasar por Play Store. Si el caché se corrompe, existe `/reparar.html`.

---

## 4. Backend y datos (lo que guarda y autentica)

### 4.1 Supabase

**¿Qué es?**  
Plataforma backend basada en PostgreSQL con Auth, Storage, Realtime y APIs listas. Es “Firebase-like” pero con SQL real.

**¿Cómo funciona?**  
El frontend usa la librería `@supabase/supabase-js` con la URL del proyecto y la clave anónima (`VITE_SUPABASE_*`). El usuario inicia sesión; las consultas van a tablas con RLS.

**¿Para qué en IncubApp?**  
- **Auth:** login/registro y sesión.  
- **Postgres:** datos multi-empresa.  
- **Storage:** fotos de rondas, selfies de asistencia, adjuntos.  
- **Realtime:** chat, notificaciones, presencia, actualización de bandeja.  

---

### 4.2 PostgreSQL

**¿Qué es?**  
Sistema de base de datos relacional robusto y de código abierto.

**¿Cómo funciona?**  
Los datos viven en tablas relacionadas por claves (org, usuario, planta…). SQL define estructura y consultas.

**¿Para qué?**  
Fuente de verdad de la operación: empresas, miembros, OT, lotes, dispatches, asistencia, rachas de uso, etc.

---

### 4.3 RLS (Row Level Security)

**¿Qué es?**  
Seguridad a nivel de fila en PostgreSQL: políticas que deciden qué filas puede ver o escribir cada usuario autenticado.

**¿Cómo funciona?**  
Aunque dos empresas estén en la misma base, las políticas filtran por `org_id` y membresía. El cliente no puede “pedir” datos de otra empresa si RLS está bien puesto.

**¿Para qué?**  
Multi-tenant seguro (varias empresas en un solo proyecto Supabase) sin mezclar información.

---

### 4.4 Supabase Auth

**¿Qué es?**  
Servicio de autenticación (correo/contraseña, sesiones JWT).

**¿Cómo funciona?**  
El usuario se registra o inicia sesión; Supabase emite un token; las siguientes peticiones van firmadas. El perfil y la aprobación viven en tablas propias (`profiles`, `organization_members`).

**¿Para qué?**  
Controlar quién entra, con qué rol y a qué empresa pertenece.

---

### 4.5 Supabase Storage

**¿Qué es?**  
Almacenamiento de archivos (imágenes, PDF) con permisos.

**¿Cómo funciona?**  
Se sube la selfie o la foto de ronda a un bucket (p. ej. `machine-checks`); se guarda la ruta en la base; al ver, se genera una URL firmada temporal.

**¿Para qué?**  
Evidencia de trabajo: rondas, asistencia con marca de agua, adjuntos de OC/facturas.

---

### 4.6 Supabase Realtime

**¿Qué es?**  
Canal en vivo sobre cambios en la base (websocket).

**¿Cómo funciona?**  
La app se suscribe a tablas (`notifications`, `silo_dispatches`, chat…). Cuando alguien inserta, los demás reciben el evento sin recargar la página.

**¿Para qué?**  
Chat, campana de notificaciones, bandeja gerencial actualizada, presencia en línea.

---

## 5. Hosting, red y herramientas

### 5.1 Vercel

**¿Qué es?**  
Plataforma de hosting para frontends estáticos y serverless, con CDN global.

**¿Cómo funciona?**  
Se sube el `dist/` (o se conecta el repo); Vercel sirve la web por HTTPS en una URL `.vercel.app` o dominio propio.

**¿Para qué?**  
Que IncubApp esté disponible 24/7 para la planta y futuros clientes SaaS (`deploy_incubapp.bat`).

---

### 5.2 Node.js y npm

**¿Qué es?**  
- **Node.js:** entorno para ejecutar JavaScript fuera del navegador.  
- **npm:** gestor de paquetes (dependencias del proyecto).

**¿Cómo funciona?**  
`npm install` baja React, Supabase, Vite, etc. Scripts en `package.json` corren build, lint, generación de docs.

**¿Para qué?**  
Desarrollo, build, migraciones auxiliares y generación de Word/PPTX de documentación.

---

### 5.3 Git / GitHub (recomendado en producción)

**¿Qué es?**  
Control de versiones: guarda el historial de cambios del código.

**¿Cómo funciona?**  
Cada cambio se “commitea”; se puede volver atrás, revisar y desplegar desde una rama.

**¿Para qué?**  
Respaldo del código fuente, trabajo en equipo y despliegues seguros (rollback).

---

### 5.4 Oxlint

**¿Qué es?**  
Analizador estático de código (linter) rápido.

**¿Cómo funciona?**  
`npm run lint` revisa patrones problemáticos (variables sin usar, etc.).

**¿Para qué?**  
Mantener calidad del código en desarrollo.

---

## 6. Librerías de dominio en IncubApp

### 6.1 Leaflet

**¿Qué es?**  
Librería de mapas interactivos en el navegador (open source).

**¿Cómo funciona?**  
Dibuja un mapa, marcadores y rutas sobre capas (tiles).

**¿Para qué?**  
Logística y vistas tipo navegación (rutas, flota).

---

### 6.2 SheetJS (xlsx)

**¿Qué es?**  
Librería para leer/escribir archivos Excel.

**¿Cómo funciona?**  
Se carga bajo demanda al exportar; arma hojas y descarga un `.xlsx`.

**¿Para qué?**  
Exportar bandeja gerencial, documentos aprobados, ranking de cumplimiento del equipo.

---

### 6.3 Canvas API del navegador (marca de agua)

**¿Qué es?**  
API nativa del navegador para dibujar en una “tela” (canvas), no es un paquete npm aparte.

**¿Cómo funciona?**  
Se carga la selfie, se dibuja texto (nombre, fecha, hora, GPS) y se exporta como JPEG (`src/lib/watermark.js`).

**¿Para qué?**  
Selfies de ingreso/salida con evidencia visible e inalterable a simple vista.

---

### 6.4 localStorage / IndexedDB

**¿Qué es?**  
Almacenamiento en el dispositivo del usuario.

**¿Cómo funciona?**  
- **localStorage:** clave-valor simple (rachas, fallbacks de bandeja/cumplimiento, checklists IoT).  
- **IndexedDB:** cola offline de operaciones de turno.

**¿Para qué?**  
Que la app no se caiga si falta una tabla en Supabase o hay red intermitente en planta; reintenta al volver online.

---

### 6.5 Grok / xAI o OpenAI (opcional)

**¿Qué es?**  
APIs de modelos de lenguaje (IA generativa).

**¿Cómo funciona?**  
Si hay `VITE_XAI_API_KEY` (u otra clave configurada), el asesor de gerencia puede enriquecer respuestas. Si no hay clave, responde con conocimiento local (`advisorEngine` + `incubationKnowledge`).

**¿Para qué?**  
Asistente de gerencia / avicultura. **No es obligatorio** para entrar ni operar la planta.

---

## 7. Conceptos de arquitectura (preguntas frecuentes)

### ¿Qué es una SPA (Single Page Application)?

**Qué es:** una web que carga una sola página y cambia de “pantalla” sin recargar todo.  
**Cómo funciona:** React cambia el contenido según la pestaña (Hoy, Asistencia, Cumplimiento…).  
**Para qué:** sensación de app fluida en celular y PC.

### ¿Qué es multi-tenant / multi-empresa?

**Qué es:** varias empresas (organizaciones) en la misma plataforma.  
**Cómo funciona:** cada fila de datos lleva `org_id`; RLS y membresía aíslan.  
**Para qué:** el modelo SaaS de expansión a clientes y empresas hermanas.

### ¿Qué es un módulo hermético?

**Qué es:** un área de la app visible solo para ciertos roles.  
**Cómo funciona:** `privacyScopes.js` + grants temporales aprobados.  
**Para qué:** gerencia no ve OT de planta; planta no ve facturas ajenas, salvo permiso.

### ¿Qué es un hook (useSomething)?

**Qué es:** función React que encapsula estado y lógica de datos.  
**Cómo funciona:** p. ej. `useAttendance` carga marcas y expone `punch()`.  
**Para qué:** reutilizar la misma lógica en paneles sin duplicar código.

### ¿Qué es Realtime?

**Qué es:** actualización en vivo sin F5.  
**Cómo funciona:** suscripción a cambios en tablas Supabase.  
**Para qué:** chat, notificaciones, bandeja, presencia.

### ¿Qué es una migración SQL?

**Qué es:** script versionado que crea o altera tablas y políticas.  
**Cómo funciona:** se ejecuta en el SQL Editor de Supabase.  
**Para qué:** activar en la nube bandeja, asistencia, cumplimiento 90 días, etc.

### ¿Qué es RLS otra vez, en una frase?

**Respuesta corta:** reglas en la base de datos que impiden que un usuario de la empresa A lea datos de la empresa B.

### ¿Qué es el build (`dist/`)?

**Qué es:** versión optimizada de la app para producción.  
**Cómo funciona:** Vite empaqueta y minifica.  
**Para qué:** lo que Vercel sirve a los usuarios finales.

---

## 8. Flujo de una acción típica (ejemplo: marcar ingreso)

1. El operario abre IncubApp (HTML + JS servidos por Vercel).  
2. React muestra **Asistencia**.  
3. Toma selfie → **Canvas/JS** aplica marca de agua.  
4. **GPS** del navegador obtiene coordenadas.  
5. **Supabase JS** sube la foto a **Storage** e inserta fila en **Postgres** (`attendance_punches`).  
6. **RLS** verifica que el usuario pertenece a esa `org_id`.  
7. El panel de **Cumplimiento** actualiza adherencia al turno y racha de uso (90 días).  

---

## 9. Tabla “pregunta de pasillo” (respuestas en 10 segundos)

| Pregunta | Respuesta corta |
|----------|-----------------|
| ¿En qué está hecha la app? | React + JavaScript, con Supabase y SQL |
| ¿Dónde están los datos? | PostgreSQL en Supabase (nube) |
| ¿Quién ve qué? | Roles + módulos herméticos + RLS |
| ¿Sirve sin internet? | Parcial: cola offline y fallback local; la nube es la verdad |
| ¿Hay que instalar Play Store? | No; es web/PWA instalable |
| ¿Grok es obligatorio? | No |
| ¿Excel? | Sí, export con SheetJS |
| ¿Mapas? | Leaflet |
| ¿Dónde se publica? | Vercel |
| ¿Cómo crecen otras empresas? | Multi-tenant: nueva org, mismos lenguajes y stack |

---

## 10. Dónde verlo en el código

| Tema | Ruta orientativa |
|------|------------------|
| Arranque | `src/main.jsx`, `index.html` |
| Pantallas | `src/components/` |
| Datos | `src/hooks/`, `src/lib/supabase.js` |
| Estilos | `src/index.css` |
| Cumplimiento | `src/lib/complianceEngine.js` |
| Marca de agua | `src/lib/watermark.js` |
| Esquema BD | `supabase_migration_*.sql` |
| Deploy | `deploy_incubapp.bat`, `vercel.json` |
| Dependencias | `package.json` |

---

**Documentado por: Henry Stark Desarrollador**  
IncubApp · Tecnologías y lenguajes · FAQ v3.0
