// Panel IncubApp · SOPORTE: reporte de soporte, accesos rápidos «Abrir», catálogo de acciones
// agrupado (con su peligro y confirmación) e historial de trabajos.
import { h, lista, obj, texto, vaciar, poner, relativo, duracion, bus, fechaHoraCorta } from '../util.js';
import { api } from '../api.js';
import { icono } from '../iconos.js';
import { insigniaPeligro, chip, boton, vacio, insigniaNivel, pestanas } from '../ui.js';
import { obtenerCatalogo } from '../datos.js';
import { ejecutarAccion, abrirDestino, DESTINOS, iconoAccion } from '../lanzador.js';
import { abrirTrabajo, ESTADOS_TRABAJO } from '../consola.js';
import { cabecera, cargarEn, periodico, Tabla } from './comun.js';
import { vistaResultado } from '../resultados.js';

const ORDEN_GRUPOS = ['Servidor', 'Servicios', 'Mantenimiento', 'Diagnóstico'];
const ICONO_GRUPO = { Servidor: 'equipo', Servicios: 'servicios', Mantenimiento: 'respaldo', 'Diagnóstico': 'buscar' };
const NIVEL_TRABAJO = { corriendo: 'aviso', ok: 'ok', error: 'falla', cancelado: 'apagado' };

export function crear() {
  // ── reporte de soporte ──
  const repResultado = h('div', { class: 'destacado-resultado', 'aria-live': 'polite' });
  const btnReporte = boton('Generar reporte', { icono: 'reporte', clase: 'boton-primario boton-grande', alPulsar: () => generarReporte() });
  const destacado = h('section', { class: 'destacado', 'aria-label': 'Reporte de soporte' },
    h('span', { class: 'destacado-ico' }, icono('reporte', { tam: 28 })),
    h('div', { class: 'destacado-texto' },
      h('h2', null, 'Reporte de soporte'),
      h('p', null, 'Arma un archivo ZIP con el estado del servidor, los eventos, la última auditoría y los registros recientes (sin contraseñas ni claves) para enviarlo a quien le ayude con un problema.'),
      repResultado),
    btnReporte);

  async function generarReporte() {
    btnReporte.disabled = true;
    vaciar(repResultado, h('span', { class: 'texto-2' }, 'Armando el reporte…'));
    const t = await ejecutarAccion('reporte_soporte', { alTerminar: (x) => {
      btnReporte.disabled = false;
      vaciar(repResultado, vistaResultado(x, { abrirCarpeta: (d) => abrirDestino(d) }));
    } });
    if (!t) { btnReporte.disabled = false; vaciar(repResultado); }
  }

  // ── accesos rápidos ──
  const accesos = h('div', { class: 'accesos', role: 'group', 'aria-label': 'Abrir' },
    DESTINOS.map((d) => h('button', { class: 'acceso', type: 'button', on: { click: () => abrirDestino(d.id) } }, icono(d.icono, { tam: 18 }), d.texto)));

  // ── catálogo ──
  const catCaja = h('div', { class: 'columna', style: { gap: '22px' } });
  async function cargarCatalogo(forzar = false) {
    const cat = await obtenerCatalogo(forzar);
    const acciones = cat.filter((a) => a.id !== 'abrir');
    if (!acciones.length) { vaciar(catCaja, vacio('El catálogo de acciones está vacío.')); return; }
    const grupos = new Map();
    for (const a of acciones) { const g = a.grupo || 'Otras'; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(a); }
    const orden = [...grupos.keys()].sort((a, b) => {
      const ia = ORDEN_GRUPOS.indexOf(a), ib = ORDEN_GRUPOS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es');
    });
    vaciar(catCaja, orden.map((g) => h('section', { class: 'acciones-grupo' },
      h('h3', null, icono(ICONO_GRUPO[g] || 'soporte', { tam: 16 }), g),
      h('div', { class: 'acciones-lista' }, grupos.get(g).map((a) => h('button', {
        class: `accion-tarjeta peligro-${['bajo', 'medio', 'alto'].includes(a.peligro) ? a.peligro : 'bajo'}`, type: 'button',
        on: { click: () => ejecutarAccion(a.id) },
      },
      h('div', { class: 'accion-cabeza' }, h('span', { class: 'accion-ico' }, icono(iconoAccion(a.id), { tam: 18 })), h('span', { class: 'accion-titulo' }, texto(a.titulo, a.id))),
      a.descripcion ? h('span', { class: 'accion-desc' }, a.descripcion) : null,
      h('span', { class: 'accion-pie' }, insigniaPeligro(a.peligro), a.admin ? chip('Pide permiso de administrador', 'chip-admin') : null,
        lista(a.parametros).length ? chip(`Pide: ${lista(a.parametros).map((p) => texto(p?.etiqueta, p?.nombre)).join(', ')}`) : null)))))));
  }

  // ── historial de trabajos ──
  const tabla = new Tabla({
    etiqueta: 'Historial de trabajos',
    clave: (t) => t.id,
    orden: { clave: 'inicio', desc: true },
    vacio: 'Todavía no se ha corrido ningún trabajo desde que se abrió el panel.',
    firma: (t) => JSON.stringify([t.estado, t.segundos, t.progreso, Math.floor(Date.now() / 30000)]),
    columnas: [
      { clave: 'titulo', titulo: 'Trabajo', ordenar: (t) => t.titulo, celda: (t) => h('div', null, h('span', { class: 'celda-principal' }, texto(t.titulo, t.tipo)), h('span', { class: 'celda-sub' }, texto(t.tipo, ''))) },
      { clave: 'estado', titulo: 'Estado', ordenar: (t) => t.estado, celda: (t) => insigniaNivel(NIVEL_TRABAJO[t.estado] || 'desconocido', ESTADOS_TRABAJO[t.estado]?.texto || texto(t.estado)) },
      { clave: 'inicio', titulo: 'Inicio', ordenar: (t) => t.inicio || '', celda: (t) => h('span', { title: fechaHoraCorta(t.inicio) }, relativo(t.inicio)) },
      { clave: 'segundos', titulo: 'Duración', clase: 'der num', ordenar: (t) => t.segundos ?? -1, celda: (t) => duracion(t.segundos) },
      { clave: 'error', titulo: 'Detalle', celda: (t) => (t.error ? h('span', { class: 'color-nivel nivel-falla' }, String(t.error)) : '') },
      { clave: 'ver', titulo: '', clase: 'min', celda: (t) => boton('Ver', { icono: 'terminal', clase: 'boton-chico', alPulsar: () => abrirTrabajo(t) }) },
    ],
  });
  const histCaja = h('div', null, tabla.el);
  async function cargarHistorial() {
    const r = await api.get('/api/trabajos', { timeout: 15000 });
    tabla.poner(lista(r?.trabajos).filter((t) => obj(t) && t.id));
  }

  const tabs = pestanas({ etiqueta: 'Soporte', items: [{ id: 'acciones', titulo: 'Herramientas', icono: 'soporte' }, { id: 'historial', titulo: 'Historial de trabajos', icono: 'lista' }] });
  tabs.paneles.get('acciones').append(
    h('div', { class: 'columna', style: { gap: '22px' } },
      h('section', { class: 'acciones-grupo' }, h('h3', null, icono('externo', { tam: 16 }), 'Abrir'), accesos),
      catCaja));
  tabs.paneles.get('historial').append(histCaja);

  const el = h('div', { class: 'seccion' },
    cabecera('Soporte', 'soporte', 'Herramientas para revisar y reparar el servidor. Cada una explica lo que hace y pide confirmación si hace falta.'),
    destacado,
    h('div', null, tabs.lista, ...tabs.paneles.values()));

  const tHist = periodico(() => cargarEn(histCaja, cargarHistorial, { silencioso: true, reintentar: () => tHist.ya() }), 15000);
  bus.on('trabajos', (ts) => { if (el.isConnected && !el.closest('[hidden]')) tabla.poner(lista(ts)); });
  let catCargado = false;

  return {
    el,
    mostrar(op = {}) {
      if (op.pestana) tabs.activar(op.pestana);
      if (!catCargado) { catCargado = true; cargarEn(catCaja, () => cargarCatalogo(), { reintentar: () => { catCargado = false; cargarEn(catCaja, () => cargarCatalogo(true)); } }); }
      tHist.iniciar();
    },
    ocultar() { tHist.detener(); },
  };
}
