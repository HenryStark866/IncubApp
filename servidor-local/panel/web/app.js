// Panel IncubApp · aplicación principal: barra lateral, barra superior (semáforo, trabajos,
// actualizar, reloj), navegación entre secciones, estado en vivo, conexión perdida, sesión
// vencida, título y favicon según el estado, y sonido opcional cuando algo falla.
//
// Seguridad: nada de innerHTML con datos; todo el DOM se arma con h() (textContent).
import { $, h, poner, bus, prefs, hora, relativo, lista, fecha, plural, vaciar } from './js/util.js';
import { api } from './js/api.js';
import { icono } from './js/iconos.js';
import { aviso, avisoError, confirmar, nivelValido, NIVELES, bloqueError, cargando } from './js/ui.js';
import { almacen, ponerEstado } from './js/datos.js';
import { abrirTrabajo, configurarConsolas, ESTADOS_TRABAJO } from './js/consola.js';
import { abrirDestino } from './js/lanzador.js';

// ── Secciones (cada una en su módulo; si una no carga, las demás siguen) ─────
const SECCIONES = [
  { id: 'inicio', titulo: 'Inicio', icono: 'inicio' },
  { id: 'servicios', titulo: 'Servicios', icono: 'servicios' },
  { id: 'recursos', titulo: 'Recursos', icono: 'recursos' },
  { id: 'registros', titulo: 'Registros', icono: 'registros' },
  { id: 'soporte', titulo: 'Soporte', icono: 'soporte' },
  { id: 'seguridad', titulo: 'Seguridad', icono: 'seguridad' },
  { id: 'red', titulo: 'Red', icono: 'red' },
  { id: 'eventos', titulo: 'Eventos', icono: 'eventos' },
  { id: 'ajustes', titulo: 'Ajustes', icono: 'ajustes' },
];
const montadas = new Map();      // id → {obj, el}
let actual = null;
const scrollPorSeccion = new Map();

const contenido = $('#contenido');
const nav = $('#nav');

// Íconos de los marcadores estáticos del HTML (data-icono)
for (const el of document.querySelectorAll('.ico-hueco[data-icono]')) el.replaceWith(icono(el.dataset.icono, { tam: 18 }));

// Logo de Incubant en línea (archivo propio marca.svg: el texto toma el color del tema y la «I»
// queda naranja). Si no carga, queda el logo de una sola tinta hecho con máscara CSS.
(async function logo() {
  try {
    const r = await fetch('marca.svg', { cache: 'force-cache' });
    if (!r.ok) return;
    const doc = new DOMParser().parseFromString(await r.text(), 'image/svg+xml');
    const raiz = doc.documentElement;
    if (!raiz || raiz.nodeName !== 'svg' || doc.querySelector('script, foreignObject')) return;
    for (const caja of document.querySelectorAll('.logo-marca')) {
      const svg = document.importNode(raiz, true);
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      caja.appendChild(svg);
      caja.classList.add('con-svg');
    }
  } catch { /* queda la máscara */ }
})();

// ── Navegación ───────────────────────────────────────────────────────────
for (const s of SECCIONES) {
  s.marca = h('span', { class: 'nav-marca', hidden: true });
  s.boton = h('button', { class: 'nav-boton', type: 'button', dataset: { seccion: s.id } }, icono(s.icono, { tam: 20 }), h('span', null, s.titulo), s.marca);
  nav.appendChild(s.boton);
}
nav.addEventListener('click', (e) => {
  const b = e.target.closest('.nav-boton');
  if (b) ir(b.dataset.seccion);
});
nav.addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const bs = [...nav.querySelectorAll('.nav-boton')];
  const i = bs.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
});

async function montar(s) {
  if (montadas.has(s.id)) return montadas.get(s.id);
  const el = h('div', { class: 'seccion-caja', id: `sec-${s.id}`, hidden: true });
  contenido.appendChild(el);
  const reg = { obj: null, el };
  montadas.set(s.id, reg);
  el.appendChild(cargando('Cargando la sección…'));
  try {
    const mod = await import(`./js/secciones/${s.id}.js`);
    reg.obj = mod.crear({ ir, marcarNav });
    el.replaceChildren(reg.obj.el);
  } catch (e) {
    console.error(e);
    el.replaceChildren(h('div', { class: 'seccion' }, bloqueError(`La sección «${s.titulo}» no cargó: ${e?.message || e}`, () => { montadas.delete(s.id); el.remove(); ir(s.id); })));
  }
  return reg;
}

export async function ir(id, opciones = {}) {
  const s = SECCIONES.find((x) => x.id === id) || SECCIONES[0];
  if (actual && actual !== s.id) {
    scrollPorSeccion.set(actual, contenido.scrollTop);
    const prev = montadas.get(actual);
    if (prev) { prev.el.hidden = true; try { prev.obj?.ocultar?.(); } catch (e) { console.error(e); } }
  }
  const cambio = actual !== s.id;
  actual = s.id;
  for (const x of SECCIONES) { if (x.id === s.id) x.boton.setAttribute('aria-current', 'page'); else x.boton.removeAttribute('aria-current'); }
  prefs.set('seccion', s.id);
  if (location.hash !== `#${s.id}`) history.replaceState(null, '', `#${s.id}`);
  const reg = await montar(s);
  if (actual !== s.id) return;       // el usuario ya cambió de sección mientras cargaba
  reg.el.hidden = false;
  if (cambio) contenido.scrollTop = scrollPorSeccion.get(s.id) || 0;
  try {
    reg.obj?.mostrar?.(opciones);
    if (almacen.estado) reg.obj?.alEstado?.(almacen.estado);
  } catch (e) { console.error(e); }
}

/** Marca numérica en el menú (p. ej. fallas en Inicio, alertas en Red). */
function marcarNav(id, n, nivel = 'aviso') {
  const s = SECCIONES.find((x) => x.id === id);
  if (!s) return;
  s.marca.hidden = !n;
  s.marca.className = `nav-marca nivel-${nivel}`;
  poner(s.marca, n ? String(n) : '');
  s.marca.title = n ? `${n} ${nivel === 'falla' ? 'con falla' : 'con aviso'}` : '';
}
bus.on('ir', (x) => ir(x?.seccion, x?.opciones || {}));

// Marcas de Seguridad y Red en el menú aunque esas secciones no se hayan abierto.
async function marcasMenu() {
  if (detenido) return;
  try {
    const s = await api.get('/api/seguridad', { timeout: 20000 });
    const r = s?.auditoria?.resumen || {};
    marcarNav('seguridad', (Number(r.critico) || 0) + (Number(r.alto) || 0), 'falla');
  } catch { /* se intenta en la próxima vuelta */ }
  try {
    const red = await api.get('/api/red', { timeout: 20000 });
    const al = lista(red?.alertas).filter((x) => x && !['ok', 'info'].includes(x.nivel));
    marcarNav('red', al.length, al.some((x) => ['critico', 'alto'].includes(x.nivel)) ? 'falla' : 'aviso');
  } catch { /* ídem */ }
}
setTimeout(marcasMenu, 3000);
setInterval(marcasMenu, 120000);
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== actual) ir(id); });

configurarConsolas({ abrirCarpeta: (destino) => abrirDestino(destino), irA: (seccion, op) => ir(seccion, op) });

// ── Estado en vivo ───────────────────────────────────────────────────────
const semaforo = $('#semaforo');
const luz = $('#semaforo-luz');
const ICONO_NIVEL = { ok: 'ok', aviso: 'aviso', falla: 'falla', desconocido: 'desconocido', apagado: 'apagado' };
const TITULO_NIVEL = { ok: 'Funcionando', aviso: 'Con avisos', falla: 'NO disponible', desconocido: 'Revisando…' };
const SIMBOLO = { ok: '●', aviso: '▲', falla: '✖', desconocido: '◌' };
let nivelPrevio = null;
let fallasPrevias = null;
let temporizador = 0;
let fallosSeguidos = 0;
let detenido = false;

function pintarSemaforo(nivel, titulo, detalle) {
  const n = nivelValido(nivel);
  semaforo.className = `semaforo nivel-${n}`;
  if (luz.dataset.nivel !== n) { luz.dataset.nivel = n; luz.replaceChildren(icono(ICONO_NIVEL[n] || 'desconocido', { tam: 24 })); }
  poner($('#semaforo-titulo'), titulo);
  poner($('#semaforo-detalle'), detalle);
  $('#semaforo-detalle').title = detalle || '';
}

function pintarEstado(e) {
  const r = e?.resumen || {};
  const n = nivelValido(r.nivel);
  pintarSemaforo(n, r.titulo || (n === 'desconocido' ? 'Revisando el servidor…' : `IncubApp ${TITULO_NIVEL[n].toLowerCase()}`), r.detalle || '');
  // título de la ventana y favicon
  const cuantos = n === 'aviso' && Number(r.avisos) ? plural(Number(r.avisos), 'aviso', 'avisos') : TITULO_NIVEL[n] || 'Sin datos';
  document.title = `${SIMBOLO[n] || '●'} IncubApp — ${n === 'falla' ? 'NO disponible' : cuantos}`;
  ponerFavicon(n);
  // marca en el menú (Inicio): componentes con falla/aviso
  const comps = lista(e?.componentes);
  const fallas = comps.filter((c) => c?.nivel === 'falla').length;
  const avisos = comps.filter((c) => c?.nivel === 'aviso').length;
  marcarNav('inicio', fallas || avisos, fallas ? 'falla' : 'aviso');
  // sonido al pasar a falla (no en la primera lectura)
  const idsFalla = new Set(comps.filter((c) => c?.nivel === 'falla').map((c) => c.id));
  if (nivelPrevio !== null) {
    const nuevaFalla = (n === 'falla' && nivelPrevio !== 'falla') || [...idsFalla].some((id) => !fallasPrevias?.has(id));
    if (nuevaFalla) sonar();
  }
  nivelPrevio = n;
  fallasPrevias = idsFalla;
}

async function cicloEstado() {
  clearTimeout(temporizador);
  if (detenido) return;
  try {
    const [e] = await Promise.all([api.get('/api/estado', { timeout: 15000 }), cargarTrabajos()]);
    fallosSeguidos = 0;
    if (e && typeof e === 'object') {
      ponerEstado(e);
      pintarEstado(e);
      const s = montadas.get(actual);
      try { s?.obj?.alEstado?.(e); } catch (x) { console.error(x); }
    }
  } catch (e) {
    if (e.estado === 401) return;
    fallosSeguidos++;
    if (e.estado === 503) pintarSemaforo('desconocido', 'El monitor del panel no cargó', e.message);
    else if (e.estado !== 0) pintarSemaforo('desconocido', 'No se pudo leer el estado', e.message);
  }
  if (!detenido) temporizador = setTimeout(cicloEstado, siguienteEspera());
}
function siguienteEspera() {
  if (fallosSeguidos) return Math.min(15000, 2000 * fallosSeguidos);
  return document.hidden ? 15000 : 5000;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) cicloEstado(); });
bus.on('pedir-estado', () => cicloEstado());

// ── Conexión perdida / sin sesión ───────────────────────────────────────
let caidaDesde = 0;
bus.on('conexion', (ok) => {
  const f = $('#franja-conexion');
  if (ok) {
    if (!f.hidden) aviso('Se recuperó la conexión con el panel.', 'ok', { duracion: 4000 });
    f.hidden = true;
    caidaDesde = 0;
  } else {
    f.hidden = false;
    caidaDesde = Date.now();
    pintarSemaforo('desconocido', 'Sin conexión con el panel', 'No se sabe el estado actual del servidor.');
    document.title = '✖ Panel IncubApp — sin conexión';
    ponerFavicon('desconocido');
  }
});
bus.on('sin-sesion', (msj) => {
  detenido = true;
  clearTimeout(temporizador);
  if (msj) poner($('#sin-sesion-detalle'), msj);
  $('#sin-sesion').hidden = false;
  document.title = 'Panel IncubApp — abra el acceso directo';
});

// ── Trabajos en curso (indicador de la barra superior) ──────────────────
const btnTrabajos = $('#btn-trabajos');
const listaTrabajos = $('#trabajos-lista');
async function cargarTrabajos() {
  try {
    const r = await api.get('/api/trabajos', { timeout: 10000 });
    almacen.trabajos = lista(r?.trabajos).filter((t) => t && typeof t.id === 'string');
    pintarTrabajos();
    bus.emit('trabajos', almacen.trabajos);
  } catch (e) { if (e.estado !== 0 && e.estado !== 401) console.warn('trabajos:', e.message); }
}
function pintarTrabajos() {
  const ts = almacen.trabajos;
  const corriendo = ts.filter((t) => t.estado === 'corriendo');
  $('#trabajos-indicador').classList.toggle('activo', corriendo.length > 0);
  poner($('#trabajos-texto'), corriendo.length ? `${corriendo.length} en curso` : 'Trabajos');
  $('#trabajos-cuenta').hidden = !corriendo.length;
  poner($('#trabajos-cuenta'), String(corriendo.length));
  btnTrabajos.title = corriendo.length ? corriendo.map((t) => t.titulo).join(' · ') : 'Ver los últimos trabajos';
  if (!listaTrabajos.hidden) pintarListaTrabajos();
}
function pintarListaTrabajos() {
  const ts = [...almacen.trabajos].sort((a, b) => (a.estado === 'corriendo' ? 0 : 1) - (b.estado === 'corriendo' ? 0 : 1)).slice(0, 10);
  vaciar(listaTrabajos,
    h('div', { class: 'desplegable-titulo' }, 'Trabajos recientes'),
    ts.length ? ts.map((t) => {
      const est = ESTADOS_TRABAJO[t.estado] || { texto: t.estado, icono: 'desconocido' };
      return h('button', { class: 'desplegable-item', type: 'button', dataset: { id: t.id } },
        t.estado === 'corriendo' ? h('span', { class: 'girando' }, icono('cargando', { tam: 18 })) : h('span', { class: `color-nivel nivel-${t.estado === 'ok' ? 'ok' : t.estado === 'error' ? 'falla' : 'apagado'}` }, icono(est.icono, { tam: 18 })),
        h('span', null, h('strong', null, t.titulo || t.tipo || 'Trabajo'), h('small', null, `${est.texto} · ${relativo(t.inicio)}`)),
        icono('derecha', { tam: 16 }));
    }) : h('div', { class: 'desplegable-vacio' }, 'No hay trabajos recientes.'),
    h('div', { style: { padding: '6px 4px 2px' } }, h('button', { class: 'enlace', type: 'button', dataset: { ir: 'soporte' } }, 'Ver el historial completo en Soporte', icono('derecha', { tam: 14 }))));
}
function cerrarListaTrabajos() { listaTrabajos.hidden = true; btnTrabajos.setAttribute('aria-expanded', 'false'); }
btnTrabajos.addEventListener('click', () => {
  if (listaTrabajos.hidden) { pintarListaTrabajos(); listaTrabajos.hidden = false; btnTrabajos.setAttribute('aria-expanded', 'true'); cargarTrabajos(); }
  else cerrarListaTrabajos();
});
listaTrabajos.addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) { const t = almacen.trabajos.find((x) => x.id === b.dataset.id); abrirTrabajo(t || { id: b.dataset.id }); cerrarListaTrabajos(); return; }
  const irA = e.target.closest('[data-ir]');
  if (irA) { cerrarListaTrabajos(); ir(irA.dataset.ir, { pestana: 'historial' }); }
});
document.addEventListener('click', (e) => { if (!listaTrabajos.hidden && !e.target.closest('#trabajos-indicador')) cerrarListaTrabajos(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !listaTrabajos.hidden) { cerrarListaTrabajos(); btnTrabajos.focus(); } });
bus.on('trabajo-lanzado', () => cargarTrabajos());
bus.on('trabajo-terminado', () => cargarTrabajos());

// ── Actualizar ahora ────────────────────────────────────────────────────
const btnActualizar = $('#btn-actualizar');
btnActualizar.addEventListener('click', async () => {
  btnActualizar.disabled = true;
  const ico = btnActualizar.querySelector('.ico');
  ico?.classList.add('girando');
  try {
    await api.post('/api/estado/actualizar', {});
    aviso('Revisando todo el servidor; los datos se actualizan en unos segundos.', 'info', { duracion: 4000 });
    setTimeout(cicloEstado, 2500);
    setTimeout(cicloEstado, 7000);
    bus.emit('actualizar-todo');
  } catch (e) { avisoError(e, 'No se pudo pedir la actualización'); }
  setTimeout(() => { btnActualizar.disabled = false; ico?.classList.remove('girando'); }, 6000);
});

// ── Cerrar panel ─────────────────────────────────────────────────────────
$('#btn-cerrar-panel').addEventListener('click', async () => {
  const ok = await confirmar({
    titulo: 'Cerrar el panel', peligro: 'medio', textoBoton: 'Cerrar panel',
    mensaje: '¿Cerrar el panel de control?',
    detalle: ['El servidor de IncubApp, la app y la base de datos siguen funcionando normalmente.', 'Se detiene solo esta pantalla y sus revisiones automáticas (avisos, auditorías, escaneos).', 'Para volver a abrirlo use el acceso directo «Panel IncubApp».'],
  });
  if (!ok) return;
  try { await api.post('/api/salir', {}); } catch (e) { if (e.estado !== 0) { avisoError(e, 'No se pudo cerrar el panel'); return; } }
  detenido = true;
  clearTimeout(temporizador);
  $('#panel-cerrado').hidden = false;
  document.title = 'Panel IncubApp — cerrado';
  setTimeout(() => { try { window.close(); } catch { /* el navegador puede no permitirlo */ } }, 1500);
});

// ── Reloj y «último dato» ───────────────────────────────────────────────
const fFecha = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
function tic() {
  const ahora = new Date();
  poner($('#reloj-hora'), hora(ahora));
  poner($('#reloj-fecha'), fFecha.format(ahora));
  const e = almacen.estado;
  const pv = $('#punto-vivo');
  if (e && almacen.estadoEn) {
    const edad = (Date.now() - almacen.estadoEn) / 1000;
    const g = fecha(e.generado);
    poner($('#ultimo-dato'), g ? hora(g, true) : hora(new Date(almacen.estadoEn), true));
    pv.className = `punto-vivo ${edad < 20 ? 'vivo' : 'muerto'}`;
    pv.parentElement.title = `Último dato recibido ${relativo(almacen.estadoEn)}${e.ciclo_completo ? ` · revisión completa ${relativo(e.ciclo_completo)}` : ''}`;
  } else pv.className = 'punto-vivo';
  if (caidaDesde) poner($('#franja-detalle'), `Reintentando… (sin conexión desde hace ${Math.round((Date.now() - caidaDesde) / 1000)} s)`);
}
setInterval(tic, 1000);
tic();

// ── Favicon de color (canvas → data:) ───────────────────────────────────
const COLOR_FAV = { ok: '#2fbf7f', aviso: '#f0a83a', falla: '#e5484d', desconocido: '#7d8fa8', apagado: '#7d8fa8' };
let favPrevio = '';
function ponerFavicon(nivel) {
  if (favPrevio === nivel) return;
  favPrevio = nivel;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#0b1428';
    x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill();
    x.fillStyle = COLOR_FAV[nivel] || COLOR_FAV.desconocido;
    x.beginPath(); x.arc(32, 32, 24, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#0b1428'; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    if (nivel === 'ok') { x.moveTo(21, 33); x.lineTo(29, 41); x.lineTo(44, 24); }
    else if (nivel === 'falla') { x.moveTo(23, 23); x.lineTo(41, 41); x.moveTo(41, 23); x.lineTo(23, 41); }
    else if (nivel === 'aviso') { x.moveTo(32, 19); x.lineTo(32, 35); x.moveTo(32, 44); x.lineTo(32, 44.5); }
    else { x.moveTo(24, 32); x.lineTo(24.5, 32); x.moveTo(32, 32); x.lineTo(32.5, 32); x.moveTo(40, 32); x.lineTo(40.5, 32); }
    x.stroke();
    $('#favicon').href = c.toDataURL('image/png');
  } catch { /* sin canvas: queda el ícono normal */ }
}

// ── Sonido (WebAudio, apagado por defecto) ──────────────────────────────
let audio = null;
function contextoAudio() {
  try { if (!audio) audio = new AudioContext(); if (audio.state === 'suspended') audio.resume(); } catch { audio = null; }
  return audio;
}
// los navegadores solo dejan sonar después de una interacción: se prepara al primer clic
document.addEventListener('pointerdown', () => { if (prefs.get('sonido', false)) contextoAudio(); }, { once: true });
export function sonar(forzar = false) {
  if (!forzar && !prefs.get('sonido', false)) return;
  const a = contextoAudio();
  if (!a) return;
  const t0 = a.currentTime + 0.02;
  [[880, 0], [660, 0.18], [880, 0.36]].forEach(([f, d]) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.16);
    o.connect(g).connect(a.destination);
    o.start(t0 + d); o.stop(t0 + d + 0.18);
  });
}
bus.on('probar-sonido', () => sonar(true));

// ── Tema ────────────────────────────────────────────────────────────────
export function aplicarTema(tema) {
  let t = tema;
  if (t === 'sistema') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
  document.documentElement.setAttribute('data-tema', t === 'claro' ? 'claro' : 'oscuro');
  bus.emit('tema', t);
}
bus.on('cambiar-tema', (t) => { prefs.set('tema', t); aplicarTema(t); });
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (prefs.get('tema', 'oscuro') === 'sistema') aplicarTema('sistema'); });

// ── Arranque ─────────────────────────────────────────────────────────────
(async function arrancar() {
  try {
    const p = await api.get('/api/ping', { timeout: 8000 });
    almacen.ping = p;
    poner($('#version'), `Panel IncubApp ${p?.version ? `v${p.version}` : ''}`.trim());
  } catch { /* el ciclo de estado avisa si no hay conexión */ }
  const inicial = location.hash.slice(1) || prefs.get('seccion', 'inicio');
  ir(SECCIONES.some((s) => s.id === inicial) ? inicial : 'inicio');
  cicloEstado();
})();

// Errores de JavaScript inesperados: aviso discreto (sin romper la pantalla)
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r && typeof r === 'object' && 'estado' in r) { e.preventDefault(); if (r.estado !== 401 && r.estado !== 0) avisoError(r); }
});
void NIVELES;
