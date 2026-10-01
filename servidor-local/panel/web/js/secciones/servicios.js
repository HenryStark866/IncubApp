// Panel IncubApp · SERVICIOS: tabla de contenedores de Docker con filtro, orden y acciones por fila.
import { h, lista, obj, esNum, num, pct, tamanoMB, relativo, texto, debounce, vaciar, poner } from '../util.js';
import { icono } from '../iconos.js';
import { insigniaNivel, nivelValido, barra, botonIcono, vacio, segmentado } from '../ui.js';
import { ejecutarAccion } from '../lanzador.js';
import { Tabla, cabecera } from './comun.js';

const SALUD = { healthy: ['ok', 'Sano'], unhealthy: ['falla', 'Enfermo'], starting: ['aviso', 'Arrancando'], none: [null, 'Sin revisión'] };
const DESCRIPCION = {
  'incubapp-incubapp-1': 'La app (nginx)', 'supabase-db': 'Base de datos (Postgres)', 'supabase-auth': 'Cuentas e ingreso',
  'supabase-rest': 'API de datos', 'supabase-storage': 'Fotos y archivos', 'realtime-dev.supabase-realtime': 'Tiempo real',
  'supabase-envoy': 'Puerta de la API (puerto 8000)', 'supabase-kong': 'Puerta de la API', 'supabase-meta': 'Metadatos de la base',
  'supabase-edge-functions': 'Funciones', 'supabase-studio': 'Studio (administración)', 'supabase-pooler': 'Pooler de conexiones',
  'supabase-imgproxy': 'Miniaturas de imágenes', 'supabase-correo-plantillas-1': 'Plantillas de correo', 'incubapp-tunel': 'Túnel de Cloudflare',
  'incubapp-ngrok-1': 'ngrok (antiguo)', 'incubapp-lector': 'Lector de fotos de ronda', 'incubapp-asistente': 'Asistente de voz', 'incubapp-n8n': 'n8n (automatizaciones)',
};

export function crear({ ir }) {
  let filtroTexto = '';
  let filtroEstado = 'todos';
  let ultimo = [];
  const resumen = h('span', { class: 'texto-2' });

  const tabla = new Tabla({
    etiqueta: 'Contenedores de Docker',
    clave: (c) => c.nombre,
    vacio: 'No hay contenedores que coincidan.',
    orden: { clave: 'nombre', desc: false },
    claseFila: (c) => (c.sobra ? 'atenuada' : ''),
    firma: (c) => JSON.stringify([c, Math.floor(Date.now() / 60000)]),
    columnas: [
      { clave: 'nombre', titulo: 'Servicio', ordenar: (c) => `${c.sobra ? 1 : 0}${c.nombre}`, celda: (c) => h('div', null,
        h('span', { class: 'celda-principal' }, texto(c.nombre)),
        h('span', { class: 'celda-sub' }, [DESCRIPCION[c.nombre], c.proyecto && c.servicio ? `${c.proyecto} / ${c.servicio}` : c.servicio].filter(Boolean).join(' · ')),
        c.sobra ? h('span', { class: 'nota-sobra' }, 'Apagado a propósito en producción') : null) },
      { clave: 'estado', titulo: 'Estado', ordenar: (c) => ({ falla: 0, aviso: 1, desconocido: 2, ok: 3, apagado: 4 })[nivelValido(c.nivel)], celda: (c) => h('div', null,
        insigniaNivel(c.nivel, c.estado === 'running' ? 'Encendido' : c.estado === 'exited' ? 'Apagado' : texto(c.estado, 'Sin datos')),
        h('span', { class: 'celda-sub', title: texto(c.estado_texto, '') }, texto(c.estado_texto, ''))) },
      { clave: 'salud', titulo: 'Salud', ordenar: (c) => c.salud, celda: (c) => {
        const [n, t] = SALUD[c.salud] || [null, texto(c.salud, '—')];
        return n ? insigniaNivel(n, t) : h('span', { class: 'texto-3' }, t);
      } },
      { clave: 'desde', titulo: 'Desde', ordenar: (c) => c.desde || '', celda: (c) => (c.desde ? h('span', { title: texto(c.desde) }, relativo(c.desde)) : '—') },
      { clave: 'reinicios', titulo: 'Reinicios', clase: 'der num', ordenar: (c) => (esNum(c.reinicios) ? c.reinicios : -1), celda: (c) => (esNum(c.reinicios) ? h('span', { class: c.reinicios > 3 ? 'color-nivel nivel-aviso' : '' }, num(c.reinicios)) : '—') },
      { clave: 'cpu', titulo: 'CPU', clase: 'der num', ordenar: (c) => (esNum(c.cpu) ? c.cpu : -1), celda: (c) => pct(c.cpu, 1) },
      { clave: 'mem', titulo: 'Memoria', clase: 'mem-celda', ordenar: (c) => (esNum(c.mem_mb) ? c.mem_mb : -1), celda: (c) => {
        if (!esNum(c.mem_mb)) return '—';
        const p = esNum(c.mem_limite_mb) && c.mem_limite_mb > 0 ? (c.mem_mb / c.mem_limite_mb) * 100 : null;
        return h('div', { title: p === null ? '' : `${pct(p, 1)} del límite (${tamanoMB(c.mem_limite_mb)})` },
          h('span', { class: 'num' }, tamanoMB(c.mem_mb)), h('span', { class: 'texto-3' }, esNum(c.mem_limite_mb) ? ` / ${tamanoMB(c.mem_limite_mb)}` : ''),
          p === null ? null : barra(p, { etiqueta: `Memoria de ${c.nombre}` }));
      } },
      { clave: 'puertos', titulo: 'Puertos', clase: 'mono', ordenar: (c) => c.puertos || '', celda: (c) => (c.puertos ? h('span', { class: 'romper', style: { 'max-width': '165px', display: 'inline-block', 'white-space': 'pre-line' } }, String(c.puertos).split(/,\s*/).slice(0, 4).join('\n')) : '') },
      { clave: 'imagen', titulo: 'Imagen', clase: 'mono col-secundaria', ordenar: (c) => c.imagen || '', celda: (c) => h('span', { class: 'cortar', style: { 'max-width': '170px', display: 'inline-block' }, title: texto(c.imagen, '') }, texto(c.imagen, '')) },
      { clave: 'acciones', titulo: 'Acciones', clase: 'min', celda: (c) => {
        const encendido = c.estado === 'running' || c.estado === 'restarting';
        const fijos = { contenedor: c.nombre };
        return h('div', { class: 'grupo-botones', style: { 'flex-wrap': 'nowrap' } },
          encendido ? botonIcono('reiniciar', `Reiniciar ${c.nombre}`, { alPulsar: () => ejecutarAccion('reiniciar_contenedor', { fijos }) }) : null,
          encendido ? botonIcono('stop', `Detener ${c.nombre}`, { clase: 'peligro', alPulsar: () => ejecutarAccion('detener_contenedor', { fijos }) })
            : botonIcono('play', `Encender ${c.nombre}`, { alPulsar: () => ejecutarAccion('encender_contenedor', { fijos }) }),
          botonIcono('registros', `Ver registros de ${c.nombre}`, { alPulsar: () => ir('registros', { fuente: `contenedor:${c.nombre}` }) }));
      } },
    ],
  });

  const buscar = h('input', { class: 'entrada', type: 'search', placeholder: 'Buscar servicio, imagen o puerto…', 'aria-label': 'Buscar servicio' });
  buscar.addEventListener('input', debounce(() => { filtroTexto = buscar.value.trim().toLowerCase(); pintar(); }, 150));
  const seg = segmentado({
    etiqueta: 'Filtrar por estado', valor: 'todos',
    opciones: [{ valor: 'todos', texto: 'Todos' }, { valor: 'problemas', texto: 'Con problemas' }, { valor: 'encendidos', texto: 'Encendidos' }, { valor: 'apagados', texto: 'Apagados' }],
    alCambiar: (v) => { filtroEstado = v; pintar(); },
  });
  const nota = h('p', { class: 'nota' }, icono('info_c', { tam: 16 }), h('span', null,
    'CPU y memoria se miden en la revisión completa (cada minuto). Los servicios atenuados sobran en producción y se dejan apagados a propósito (Studio, pooler e imgproxy).'));
  const caja = h('div');
  const el = h('div', { class: 'seccion' },
    cabecera('Servicios', 'servicios', 'Los contenedores de Docker que hacen funcionar IncubApp dentro de Ubuntu.'),
    h('div', { class: 'barra-herramientas' }, h('div', { class: 'entrada-buscar' }, icono('buscar', { tam: 16 }), buscar), seg, h('span', { class: 'espacio' }), resumen),
    caja, nota);

  function pintar() {
    let cs = ultimo;
    if (filtroTexto) cs = cs.filter((c) => [c.nombre, c.imagen, c.puertos, c.servicio, DESCRIPCION[c.nombre]].some((x) => String(x || '').toLowerCase().includes(filtroTexto)));
    if (filtroEstado === 'problemas') cs = cs.filter((c) => ['falla', 'aviso'].includes(c.nivel) || c.salud === 'unhealthy');
    else if (filtroEstado === 'encendidos') cs = cs.filter((c) => c.estado === 'running');
    else if (filtroEstado === 'apagados') cs = cs.filter((c) => c.estado !== 'running');
    tabla.poner(cs);
  }

  function alEstado(e) {
    const cs = lista(e?.contenedores).filter((c) => obj(c) && c.nombre);
    if (!Array.isArray(e?.contenedores)) {
      if (!caja.querySelector('.vacio')) vaciar(caja, vacio(e?.wsl?.estado === 'Stopped' ? 'Ubuntu está detenido: no hay contenedores para mostrar. Use «Arrancar el servidor» en Soporte.' : 'Sin datos de los contenedores todavía.'));
      poner(resumen, '');
      return;
    }
    if (tabla.el.parentNode !== caja) vaciar(caja, tabla.el);
    ultimo = cs;
    const enc = cs.filter((c) => c.estado === 'running').length;
    const mal = cs.filter((c) => ['falla', 'aviso'].includes(c.nivel)).length;
    poner(resumen, `${enc} de ${cs.length} encendidos${mal ? ` · ${mal} con problema` : ''}`);
    pintar();
  }

  return { el, alEstado, mostrar() {}, ocultar() {} };
}
