// Panel IncubApp · AJUSTES: ajustes del panel (GET/POST /api/ajustes) explicados en lenguaje
// simple, preferencias de esta ventana (tema, sonido) y «Acerca de».
import { h, obj, texto, vaciar, poner, prefs, bus } from '../util.js';
import { api } from '../api.js';
import { icono } from '../iconos.js';
import { tarjeta, boton, interruptor, segmentado, aviso, avisoError } from '../ui.js';
import { almacen } from '../datos.js';
import { abrirDestino } from '../lanzador.js';
import { cabecera, cargarEn } from './comun.js';

const CAMPOS = [
  { grupo: 'Vigilancia del servidor', clave: 'intervalo_rapido_s', tipo: 'numero', min: 5, max: 300, unidad: 'segundos', titulo: 'Revisión rápida', ayuda: 'Cada cuánto se revisa si los servicios responden (contenedores, app, API). Más seguido = se entera antes.' },
  { grupo: 'Vigilancia del servidor', clave: 'intervalo_completo_s', tipo: 'numero', min: 30, max: 3600, unidad: 'segundos', titulo: 'Revisión completa', ayuda: 'Cada cuánto se miden la memoria de los contenedores, la base de datos, el túnel, el respaldo y la dirección pública.' },
  { grupo: 'Vigilancia del servidor', clave: 'url_publica', tipo: 'texto', titulo: 'Dirección pública de la app', ayuda: 'La dirección que se usa desde fuera de la planta. El panel la revisa como si fuera un usuario de internet.' },
  { grupo: 'Avisos y ventana', clave: 'notificaciones', tipo: 'si_no', titulo: 'Avisos de Windows', ayuda: 'Muestra un aviso en la esquina de la pantalla cuando algo se cae o vuelve, cuando aparece un equipo desconocido en la red o si falla el respaldo.' },
  { grupo: 'Avisos y ventana', clave: 'abrir_al_iniciar', tipo: 'si_no', titulo: 'Abrir el panel al iniciar sesión', ayuda: 'Abre esta ventana sola cada vez que alguien inicia sesión en Windows en este equipo.' },
  { grupo: 'Red de la empresa', clave: 'monitor_internet', tipo: 'si_no', titulo: 'Vigilar internet', ayuda: 'Mide todo el tiempo la conexión hacia el router y hacia internet para detectar cortes y lentitud.' },
  { grupo: 'Red de la empresa', clave: 'intervalo_internet_s', tipo: 'numero', min: 10, max: 600, unidad: 'segundos', titulo: 'Medición de internet', ayuda: 'Cada cuánto se mide la conexión.' },
  { grupo: 'Red de la empresa', clave: 'red_escanear', tipo: 'texto', titulo: 'Red que se escanea', ayuda: '«auto» usa la red de este equipo. También puede escribir una red como 192.168.5.0/24 (máximo /22).', validar: (v) => (v === 'auto' || /^(\d{1,3}\.){3}\d{1,3}\/(2[2-9]|3[0-2])$/.test(v) ? null : 'Escriba «auto» o una red como 192.168.5.0/24 (de /22 a /32).') },
  { grupo: 'Red de la empresa', clave: 'escaneo_red_min', tipo: 'numero', min: 0, max: 1440, unidad: 'minutos', titulo: 'Buscar equipos nuevos en la red', ayuda: 'Cada cuánto se busca qué equipos están conectados (0 = nunca, solo a mano).' },
  { grupo: 'Seguridad', clave: 'auditoria_min', tipo: 'numero', min: 0, max: 10080, unidad: 'minutos', titulo: 'Repetir la auditoría de seguridad', ayuda: 'Cada cuánto se repite la auditoría del servidor (0 = nunca; 360 = cada 6 horas). Solo lee, no cambia nada.' },
];

// Campos que GET /api/ajustes agrega como información (no se editan): van a «Acerca del panel».
const SOLO_LECTURA = new Set(['puerto', 'version', 'datos', 'privado', 'pid', 'errores_modulos', 'extra']);

export function crear() {
  let original = null;
  let info = {};
  const controles = new Map();       // clave → {leer(), poner(v), fila}
  const formCaja = h('div');
  const btnGuardar = boton('Guardar cambios', { icono: 'guardar', clase: 'boton-primario', deshabilitado: true, alPulsar: () => guardar() });
  const btnDescartar = boton('Descartar', { clase: 'boton-sutil', deshabilitado: true, alPulsar: () => pintar(original) });
  const error = h('p', { class: 'dialogo-error', role: 'alert', hidden: true });

  function fila(def, valor) {
    const id = `aj-${def.clave}`;
    let ctl, leer, poner_;
    if (def.tipo === 'si_no') {
      ctl = interruptor({ etiqueta: def.titulo, valor: !!valor, oculto: true, alCambiar: () => revisar() });
      leer = () => ctl.valor(); poner_ = (v) => ctl.poner(!!v);
    } else if (def.tipo === 'numero') {
      ctl = h('input', { class: 'entrada', id, type: 'number', min: def.min ?? null, max: def.max ?? null, step: '1', value: String(valor ?? ''), style: { width: '120px' } });
      ctl.addEventListener('input', () => revisar());
      leer = () => (ctl.value === '' ? null : Number(ctl.value)); poner_ = (v) => { ctl.value = String(v ?? ''); };
    } else {
      ctl = h('input', { class: 'entrada', id, type: 'text', value: String(valor ?? ''), maxlength: '300', spellcheck: 'false' });
      ctl.addEventListener('input', () => revisar());
      leer = () => ctl.value.trim(); poner_ = (v) => { ctl.value = String(v ?? ''); };
    }
    const f = h('div', { class: 'ajuste' },
      h('div', { class: 'ajuste-texto' }, h('strong', { id: `${id}-t` }, def.titulo), h('span', null, def.ayuda || '')),
      h('div', { class: 'ajuste-control' }, def.tipo === 'si_no' ? null : h('label', { class: 'oculto-visual', for: id }, def.titulo), ctl, def.unidad ? h('span', { class: 'unidad' }, def.unidad) : null));
    controles.set(def.clave, { leer, poner: poner_, fila: f, def });
    return f;
  }

  function pintar(aj) {
    if ('puerto' in aj || 'errores_modulos' in aj || 'datos' in aj) { info = { ...info, ...aj }; pintarAcerca(); }
    aj = Object.fromEntries(Object.entries(aj).filter(([k]) => !SOLO_LECTURA.has(k)));
    original = { ...aj };
    controles.clear();
    const conocidos = new Set(CAMPOS.map((c) => c.clave));
    const extras = Object.entries(aj).filter(([k, v]) => !conocidos.has(k) && k !== 'extra' && ['boolean', 'number', 'string'].includes(typeof v))
      .map(([k, v]) => ({ grupo: 'Otros ajustes', clave: k, tipo: typeof v === 'boolean' ? 'si_no' : typeof v === 'number' ? 'numero' : 'texto', titulo: k.replace(/_/g, ' '), ayuda: '' }));
    const grupos = new Map();
    for (const def of [...CAMPOS.filter((c) => c.clave in aj), ...extras]) {
      if (!grupos.has(def.grupo)) grupos.set(def.grupo, []);
      grupos.get(def.grupo).push(def);
    }
    vaciar(formCaja, [...grupos].map(([g, defs]) => h('section', { style: { 'margin-bottom': '8px' } },
      h('h3', { class: 'grupo-titulo', style: { margin: '10px 0 0' } }, g),
      defs.map((d) => fila(d, aj[d.clave])))));
    revisar();
  }

  function cambios() {
    const c = {};
    for (const [k, x] of controles) { const v = x.leer(); if (v !== original?.[k]) c[k] = v; }
    return c;
  }
  function revisar() {
    const c = cambios();
    const n = Object.keys(c).length;
    btnGuardar.disabled = !n; btnDescartar.disabled = !n;
    for (const [k, x] of controles) x.fila.classList.toggle('cambiado', k in c);
    error.hidden = true;
  }

  async function guardar() {
    const c = cambios();
    for (const [k, v] of Object.entries(c)) {
      const def = controles.get(k)?.def;
      if (def?.tipo === 'numero' && (v === null || !Number.isFinite(v) || (def.min !== undefined && v < def.min) || (def.max !== undefined && v > def.max))) {
        error.textContent = `«${def.titulo}» debe ser un número${def.min !== undefined ? ` entre ${def.min} y ${def.max}` : ''}.`; error.hidden = false; return;
      }
      const msj = def?.validar?.(v);
      if (msj) { error.textContent = msj; error.hidden = false; return; }
    }
    btnGuardar.disabled = true;
    try {
      const r = await api.post('/api/ajustes', c);
      pintar(obj(r?.ajustes) || obj(r) || { ...original, ...c });
      aviso('Ajustes guardados.', 'ok', { duracion: 3000 });
    } catch (e) { avisoError(e, 'No se pudieron guardar los ajustes'); revisar(); }
  }

  // ── preferencias de esta ventana ──
  const segTema = segmentado({ etiqueta: 'Tema', valor: prefs.get('tema', 'oscuro'), opciones: [{ valor: 'oscuro', texto: 'Oscuro' }, { valor: 'claro', texto: 'Claro' }, { valor: 'sistema', texto: 'Igual que Windows' }], alCambiar: (v) => bus.emit('cambiar-tema', v) });
  const swSonido = interruptor({ etiqueta: 'Sonido cuando algo falla', valor: prefs.get('sonido', false), oculto: true, alCambiar: (v) => { prefs.set('sonido', v); if (v) bus.emit('probar-sonido'); } });
  const prefsCaja = h('div', null,
    h('div', { class: 'ajuste apilado' }, h('div', { class: 'ajuste-texto' }, h('strong', null, 'Tema'), h('span', null, 'Colores de esta ventana. El oscuro cansa menos la vista si la pantalla queda encendida todo el día.')), h('div', { class: 'ajuste-control' }, segTema)),
    h('div', { class: 'ajuste apilado' }, h('div', { class: 'ajuste-texto' }, h('strong', null, 'Sonido cuando algo falla'), h('span', null, 'Suena un pitido corto cuando un componente pasa a «falla». Viene apagado.')),
      h('div', { class: 'ajuste-control' }, boton('Probar', { icono: 'sonido', clase: 'boton-chico boton-sutil', alPulsar: () => bus.emit('probar-sonido') }), swSonido)));

  // ── acerca de ──
  const acercaCaja = h('div');
  function pintarAcerca() {
    const p = { ...(almacen.ping || {}), ...info };
    const em = p.errores_modulos;
    const errores = em && typeof em === 'object' ? (Array.isArray(em) ? em.map((v, i) => [i, v]) : Object.entries(em)).filter(([, v]) => v) : [];
    vaciar(acercaCaja, h('dl', { class: 'lista-datos' },
      h('dt', null, 'Versión'), h('dd', null, `Panel IncubApp ${texto(p.version, '')}`),
      h('dt', null, 'Dirección'), h('dd', { class: 'mono' }, `${location.origin} (solo este equipo)`),
      p.puerto ? [h('dt', null, 'Puerto'), h('dd', null, String(p.puerto))] : null,
      h('dt', null, 'Proceso'), h('dd', null, p.pid ? `PID ${p.pid}` : '—'),
      h('dt', null, 'Datos del panel'), h('dd', { class: 'mono' }, texto(p.datos, 'C:\\IncubApp\\servidor-local\\logs\\panel')),
      h('dt', null, 'Sesión'), h('dd', { class: 'mono' }, texto(p.privado, '%LOCALAPPDATA%\\IncubApp-Panel'))),
    errores.length ? h('div', { class: 'nota nota-aviso', style: { 'margin-top': '12px' } }, icono('aviso', { tam: 16 }),
      h('div', null, h('strong', null, 'Partes del panel que no cargaron:'),
        h('ul', { class: 'dialogo-lista' }, errores.map(([k, v]) => h('li', null, `${typeof k === 'string' ? `${k}: ` : ''}${typeof v === 'string' ? v : JSON.stringify(v)}`))))) : null,
    h('p', { class: 'nota', style: { 'margin-top': '12px' } }, icono('candado', { tam: 16 }), h('span', null,
      'Por seguridad el panel solo responde en este equipo (127.0.0.1), con una llave que cambia cada vez que arranca, y solo ejecuta herramientas de una lista cerrada. Nunca muestra contraseñas ni claves.')),
    h('div', { class: 'grupo-botones', style: { 'margin-top': '12px' } },
      boton('Carpeta de registros', { icono: 'carpeta', clase: 'boton-chico', alPulsar: () => abrirDestino('carpeta_registros') }),
      boton('Carpeta de reportes', { icono: 'reporte', clase: 'boton-chico', alPulsar: () => abrirDestino('carpeta_reportes') })));
  }

  const el = h('div', { class: 'seccion' },
    cabecera('Ajustes', 'ajustes', 'Cómo trabaja el panel. Los cambios se aplican al guardar.'),
    h('div', { class: 'rejilla', style: { 'grid-template-columns': 'minmax(0, 1.6fr) minmax(320px, 1fr)', 'align-items': 'start' } },
      tarjeta({ titulo: 'Ajustes del panel', icono: 'ajustes', acciones: [btnDescartar, btnGuardar], cuerpo: [error, formCaja] }),
      h('div', { class: 'columna' },
        tarjeta({ titulo: 'Esta ventana', icono: 'panel', subtitulo: 'se guarda solo en este equipo', cuerpo: [prefsCaja] }),
        tarjeta({ titulo: 'Acerca del panel', icono: 'info_c', cuerpo: [acercaCaja] }))));

  let cargado = false;
  return {
    el,
    mostrar() {
      pintarAcerca();
      segTema.poner(prefs.get('tema', 'oscuro'));
      if (!cargado || !Object.keys(cambios()).length) {
        cargado = true;
        cargarEn(formCaja, async () => { const r = await api.get('/api/ajustes', { timeout: 15000 }); pintar(obj(r?.ajustes) || obj(r) || {}); }, { reintentar: () => this.mostrar() });
      }
    },
    ocultar() {},
  };
}
