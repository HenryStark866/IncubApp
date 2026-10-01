// Panel IncubApp · RECURSOS: gráficas (CPU, RAM, respuesta de la app, memoria de contenedores),
// disponibilidad por componente, discos, base de datos y Ubuntu.
import { h, lista, obj, esNum, num, pct, ms, tamanoMB, tamanoGB, relativo, texto, vaciar, prefs, fechaHora } from '../util.js';
import { api, conParametros } from '../api.js';
import { icono } from '../iconos.js';
import { tarjeta, segmentado, barra, vacio, insigniaNivel, nivelValido } from '../ui.js';
import { GraficaLineas } from '../graficas.js';
import { cargarEn, periodico, cabecera } from './comun.js';

const RANGOS = [{ valor: '1', texto: '1 h' }, { valor: '6', texto: '6 h' }, { valor: '24', texto: '24 h' }, { valor: '168', texto: '7 días' }];

export function crear() {
  let horas = String(prefs.get('recursos.horas', '6'));
  if (!RANGOS.some((r) => r.valor === horas)) horas = '6';
  let ultimoEstado = null;

  const gCpu = new GraficaLineas({ etiqueta: 'CPU de Windows', series: [{ clave: 'cpu', nombre: 'CPU', color: 1 }], min: 0, max: 100, maxFijo: true, formato: (v) => `${num(v, v < 10 ? 1 : 0)} %` });
  const gRam = new GraficaLineas({ etiqueta: 'Memoria RAM', series: [{ clave: 'ram_pct', nombre: 'Windows', color: 2 }, { clave: 'wsl_ram_pct', nombre: 'Ubuntu', color: 3 }], min: 0, max: 100, maxFijo: true, area: false, formato: (v) => `${num(v, 0)} %` });
  const gApp = new GraficaLineas({ etiqueta: 'Tiempo de respuesta de la app', series: [{ clave: 'app_ms', nombre: 'Respuesta', color: 4 }], min: 0, formato: (v, eje) => (eje ? `${num(v)} ms` : ms(v)) });
  const gMem = new GraficaLineas({ etiqueta: 'Memoria usada por los contenedores', series: [{ clave: 'contenedores_mem_mb', nombre: 'Contenedores', color: 5 }], min: 0, formato: (v) => tamanoMB(v) });
  const cajaGraf = h('div');
  const dispCaja = h('div');
  const discosCaja = h('div');
  const baseCaja = h('div');
  const wslCaja = h('div');
  const equipoCaja = h('div');

  const rango = segmentado({ etiqueta: 'Rango de tiempo', opciones: RANGOS, valor: horas, alCambiar: (v) => { horas = v; prefs.set('recursos.horas', v); tMet.ya(); } });
  const graficas = h('div', { class: 'rejilla rejilla-2' },
    tarjeta({ titulo: 'CPU de Windows', icono: 'cpu', cuerpo: [gCpu.el] }),
    tarjeta({ titulo: 'Memoria RAM (Windows y Ubuntu)', icono: 'memoria', cuerpo: [gRam.el] }),
    tarjeta({ titulo: 'Tiempo de respuesta de la app', icono: 'app', subtitulo: 'desde este equipo', cuerpo: [gApp.el] }),
    tarjeta({ titulo: 'Memoria de los contenedores', icono: 'docker', cuerpo: [gMem.el] }));
  cajaGraf.appendChild(graficas);

  const el = h('div', { class: 'seccion' },
    cabecera('Recursos', 'recursos', 'Uso del equipo, de Ubuntu y de la base de datos, con su historial.', rango),
    cajaGraf,
    h('div', { class: 'rejilla rejilla-3' },
      tarjeta({ titulo: 'Disponibilidad', icono: 'ok', subtitulo: 'tiempo funcionando en el rango', cuerpo: [dispCaja] }),
      tarjeta({ titulo: 'Este equipo (Windows)', icono: 'equipo', cuerpo: [equipoCaja, discosCaja] }),
      tarjeta({ titulo: 'Ubuntu (WSL) y Docker', icono: 'wsl', cuerpo: [wslCaja] })),
    tarjeta({ titulo: 'Base de datos', icono: 'base', cuerpo: [baseCaja] }));

  async function cargarMetricas() {
    const m = await api.get(conParametros('/api/metricas', { horas }), { timeout: 30000 });
    const ahora = Date.now() / 1000;
    const datos = { t: lista(m?.t), series: obj(m?.series) || {}, desde: ahora - Number(horas) * 3600, hasta: ahora };
    for (const g of [gCpu, gRam, gApp, gMem]) g.poner(datos);
    pintarDisponibilidad(obj(m?.disponibilidad) || {});
  }

  function pintarDisponibilidad(d) {
    const comps = new Map(lista(ultimoEstado?.componentes).filter(obj).map((c) => [c.id, c]));
    const filas = Object.entries(d).filter(([, v]) => esNum(v)).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    if (!filas.length) { vaciar(dispCaja, vacio('Todavía no hay historial suficiente.')); return; }
    vaciar(dispCaja, h('div', { class: 'disponibilidad' }, filas.map(([id, v]) => {
      const nivel = v >= 99.5 ? 'ok' : v >= 97 ? 'aviso' : 'falla';
      return [h('span', { class: 'cortar', title: comps.get(id)?.nombre || id }, comps.get(id)?.nombre || id), barra(v, { nivel, etiqueta: `Disponibilidad de ${comps.get(id)?.nombre || id}` }), h('span', { class: `num color-nivel nivel-${nivel}` }, pct(v, v >= 99.95 || v < 10 ? 0 : 1))];
    })));
  }

  function uso(etiqueta, usado, total, unidad = 'MB', nivelForzado = null) {
    const p = esNum(usado) && esNum(total) && total > 0 ? (usado / total) * 100 : null;
    const f = unidad === 'GB' ? tamanoGB : tamanoMB;
    return h('div', { class: 'uso' },
      h('div', { class: 'uso-cabeza' }, h('span', null, etiqueta), h('strong', null, p === null ? '—' : `${f(usado)} de ${f(total)} (${pct(p)})`)),
      barra(p ?? 0, { nivel: p === null ? 'desconocido' : nivelForzado, etiqueta }));
  }

  function alEstado(e) {
    ultimoEstado = e;
    // equipo
    const eq = obj(e?.equipo);
    vaciar(equipoCaja, eq ? h('div', { class: 'formulario' },
      h('dl', { class: 'lista-datos' },
        h('dt', null, 'Equipo'), h('dd', null, `${texto(eq.nombre)} · ${texto(eq.ip)}`),
        h('dt', null, 'Sistema'), h('dd', null, texto(eq.windows)),
        h('dt', null, 'Usuario'), h('dd', null, texto(eq.usuario)),
        h('dt', null, 'Encendido'), h('dd', null, eq.encendido_desde ? `${relativo(eq.encendido_desde)} (${fechaHora(eq.encendido_desde)})` : '—'),
        h('dt', null, 'CPU ahora'), h('dd', null, pct(eq.cpu, 1)),
        obj(e?.tarea_windows) ? [h('dt', null, 'Tarea de arranque'), h('dd', null, tareaTexto(e.tarea_windows))] : null),
      uso('RAM', eq.ram_usada_mb, eq.ram_total_mb)) : vacio('Sin datos del equipo.'));
    const discos = lista(eq?.discos).filter(obj);
    vaciar(discosCaja, discos.length ? h('div', { class: 'formulario' }, discos.map((d) => {
      const usado = esNum(d.total_gb) && esNum(d.libre_gb) ? d.total_gb - d.libre_gb : null;
      return uso(`Disco ${texto(d.unidad)} · libre ${tamanoGB(d.libre_gb)}`, usado, d.total_gb, 'GB');
    })) : null);
    // ubuntu
    const w = obj(e?.wsl);
    vaciar(wslCaja, w ? h('div', { class: 'formulario' },
      h('dl', { class: 'lista-datos' },
        h('dt', null, 'Estado'), h('dd', null, insigniaNivel(w.estado === 'Running' ? 'ok' : w.estado === 'Stopped' ? 'falla' : 'desconocido', w.estado === 'Running' ? 'Encendido' : w.estado === 'Stopped' ? 'Detenido' : texto(w.estado, 'Sin datos'))),
        h('dt', null, 'systemd'), h('dd', null, w.systemd === true ? 'activo' : w.systemd === false ? 'NO activo' : '—'),
        h('dt', null, 'Docker'), h('dd', null, w.docker ? `versión ${w.docker}` : '—'),
        h('dt', null, 'Carga'), h('dd', null, lista(w.carga).length ? lista(w.carga).map((x) => num(x, 2)).join(' · ') + ' (1, 5 y 15 min)' : '—'),
        h('dt', null, 'Swap usada'), h('dd', null, esNum(w.swap_total_mb) ? `${tamanoMB(w.swap_usada_mb)} de ${tamanoMB(w.swap_total_mb)}` : tamanoMB(w.swap_usada_mb))),
      uso('RAM de Ubuntu', w.ram_usada_mb, w.ram_total_mb),
      uso('Disco de Ubuntu', esNum(w.disco_total_gb) && esNum(w.disco_libre_gb) ? w.disco_total_gb - w.disco_libre_gb : null, w.disco_total_gb, 'GB')) : vacio('Sin datos de Ubuntu.'));
    // base de datos
    const b = obj(e?.base);
    const tablas = lista(b?.tablas_grandes).filter(obj);
    vaciar(baseCaja, b ? h('div', { class: 'rejilla rejilla-2' },
      h('div', { class: 'mosaicos', style: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' } },
        dato('Tamaño', texto(b.tamano), 'disco'), dato('Conexiones abiertas', num(b.conexiones), 'enlace'),
        dato('Usuarios registrados', num(b.usuarios), 'usuarios'), dato('Activos (15 min)', num(b.activos_15min), 'usuario')),
      h('div', null, h('div', { class: 'campo-etiqueta', style: { 'margin-bottom': '6px' } }, 'Tablas más grandes'),
        tablas.length ? h('div', { class: 'tabla-caja' }, h('table', { class: 'tabla' },
          h('thead', null, h('tr', null, h('th', null, 'Tabla'), h('th', { class: 'der' }, 'Tamaño'))),
          h('tbody', null, tablas.map((t) => h('tr', null, h('td', { class: 'mono' }, texto(t.tabla)), h('td', { class: 'der num' }, texto(t.tamano))))))) : vacio('Sin datos de tablas.'))) : vacio('Sin datos de la base de datos (se miden en la revisión completa, cada minuto).'));
    void nivelValido;
  }

  /** Campo extra del backend real: tarea programada «IncubApp Servidor». */
  function tareaTexto(t) {
    if (t.existe === false) return 'NO existe la tarea «IncubApp Servidor»';
    const est = { Running: 'corriendo', Ready: 'lista', Disabled: 'DESACTIVADA' }[t.estado] || texto(t.estado, 'sin datos');
    return `«IncubApp Servidor»: ${est}${t.modo ? ` (${t.modo})` : ''}${t.ultima ? ` · última vez ${relativo(t.ultima)}` : ''}`;
  }

  function dato(etq, valor, ico) {
    return h('div', { class: 'mosaico' }, h('div', { class: 'dato-etiqueta' }, icono(ico, { tam: 15 }), etq), h('div', { class: 'dato-valor' }, valor));
  }

  // errores de métricas: se muestran sobre las gráficas sin romper lo demás
  const cargarConError = async () => {
    try {
      await cargarMetricas();
      cajaGraf.querySelector(':scope > .bloque-error')?.remove();
    } catch (e) {
      if (e?.estado === 401 || e?.estado === 0) return;
      if (!cajaGraf.querySelector(':scope > .bloque-error')) cajaGraf.prepend(h('div', { class: 'bloque-error', role: 'alert' }, icono('aviso', { tam: 20 }), h('div', null, h('strong', null, 'No se pudo cargar el historial'), h('span', null, e.message))));
    }
  };
  const tMet = periodico(cargarConError, 60000);

  return {
    el, alEstado,
    mostrar() { tMet.iniciar(); },
    ocultar() { tMet.detener(); },
  };
}
