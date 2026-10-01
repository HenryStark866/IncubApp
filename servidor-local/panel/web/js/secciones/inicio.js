// Panel IncubApp · INICIO: estado general, datos clave, componentes por grupo (con sus
// acciones), mini gráficas de CPU/RAM, últimos eventos, puntaje de seguridad y estado de la red.
import { h, poner, lista, obj, esNum, num, ms, pct, relativo, desdeHace, fechaHoraCorta, texto, reconciliar, bus, vaciar } from '../util.js';
import { api, conParametros } from '../api.js';
import { icono, iconoComponente } from '../iconos.js';
import { insigniaNivel, ponerNivel, nivelValido, NIVELES, tarjeta, vacio, boton, botonIcono } from '../ui.js';
import { miniGrafica, medidor } from '../graficas.js';
import { conteoSeveridades } from '../hallazgos.js';
import { obtenerCatalogo, accion as accionDe, catalogoActual } from '../datos.js';
import { ejecutarAccion } from '../lanzador.js';
import { cargarEn, periodico, cabecera } from './comun.js';

const ORDEN_GRUPOS = ['Servidor', 'Acceso', 'Supabase', 'Servicios IncubApp', 'Mantenimiento'];
// acciones «abrir:<destino>» que el backend real pone en algunos componentes
const ABRIR = { 'abrir:app_local': 'Abrir app', 'abrir:publico': 'Abrir app pública', 'abrir:studio': 'Abrir Studio', 'abrir:n8n': 'Abrir n8n', 'abrir:carpeta_registros': 'Abrir registros', 'abrir:carpeta_respaldos': 'Abrir respaldos', 'abrir:carpeta_reportes': 'Abrir reportes' };
const ETIQUETA_CORTA = { reiniciar_contenedor: 'Reiniciar', detener_contenedor: 'Detener', encender_contenedor: 'Encender', arrancar_servidor: 'Arrancar el servidor', respaldo_ahora: 'Respaldar ahora', recrear_tunel: 'Reconectar túnel', studio_encender: 'Encender', studio_apagar: 'Apagar', reiniciar_app: 'Reiniciar app', revisar_todo: 'Revisar y reparar' };

export function crear({ ir, marcarNav }) {
  // ── estado general ──
  const luz = h('span', { class: 'semaforo-luz' });
  const tituloGeneral = h('h2', null, 'Revisando el servidor…');
  const detalleGeneral = h('p', null, 'Esperando el primer dato.');
  const cuentas = h('div', { class: 'estado-cuentas' });
  const revisado = h('span', { class: 'texto-3 texto-chico' });
  const general = h('section', { class: 'tarjeta estado-general nivel-desconocido', 'aria-label': 'Estado general' },
    luz, h('div', { class: 'estado-general-texto' }, tituloGeneral, detalleGeneral, cuentas, revisado));

  // ── mosaicos de datos clave ──
  function mosaico(etiqueta, ico) {
    const v = h('div', { class: 'dato-valor' }, '—');
    const n = h('div', { class: 'dato-nota' });
    const el = h('div', { class: 'mosaico' }, h('div', { class: 'dato-etiqueta' }, icono(ico, { tam: 15 }), etiqueta), v, n, h('span', { class: 'mosaico-marca' }));
    return { el, v, n, nivel(x) { el.className = `mosaico${x ? ` nivel-${nivelValido(x)}` : ''}`; } };
  }
  const mPublico = mosaico('App pública', 'publico');
  const mUsuarios = mosaico('Usuarios activos (15 min)', 'usuarios');
  const mRespaldo = mosaico('Último respaldo', 'respaldo');
  const mTunel = mosaico('Túnel de Cloudflare', 'tunel');
  const mVersion = mosaico('Versión de la app', 'version');
  const mInternet = mosaico('Internet', 'wifi');
  const mosaicos = h('div', { class: 'mosaicos' }, mPublico.el, mUsuarios.el, mRespaldo.el, mTunel.el, mVersion.el, mInternet.el);

  // ── componentes ──
  const gruposCaja = h('div', { class: 'columna', 'aria-label': 'Componentes del servidor' });

  // ── columna derecha ──
  const miniCaja = h('div', { class: 'columna', style: { gap: '14px' } });
  const miniCpu = mini('CPU de Windows', 1);
  const miniRam = mini('RAM de Windows', 2);
  const miniWsl = mini('RAM de Ubuntu', 3);
  miniCaja.append(miniCpu.el, miniRam.el, miniWsl.el);
  const segCaja = h('div');
  const redCaja = h('div');
  const evCaja = h('div');
  const derecha = h('div', { class: 'columna' },
    tarjeta({ titulo: 'Recursos ahora', icono: 'recursos', acciones: h('button', { class: 'enlace', type: 'button', on: { click: () => ir('recursos') } }, 'Ver más', icono('derecha', { tam: 14 })), cuerpo: [miniCaja] }),
    tarjeta({ titulo: 'Seguridad', icono: 'seguridad', acciones: h('button', { class: 'enlace', type: 'button', on: { click: () => ir('seguridad') } }, 'Abrir', icono('derecha', { tam: 14 })), cuerpo: [segCaja] }),
    tarjeta({ titulo: 'Red de la empresa', icono: 'red', acciones: h('button', { class: 'enlace', type: 'button', on: { click: () => ir('red') } }, 'Abrir', icono('derecha', { tam: 14 })), cuerpo: [redCaja] }),
    tarjeta({ titulo: 'Últimos eventos', icono: 'eventos', acciones: h('button', { class: 'enlace', type: 'button', on: { click: () => ir('eventos') } }, 'Ver todos', icono('derecha', { tam: 14 })), cuerpo: [evCaja] }));

  const el = h('div', { class: 'seccion' },
    cabecera('Inicio', 'inicio', 'Estado del servidor de IncubApp en este equipo, en vivo.'),
    h('div', { class: 'rejilla rejilla-inicio' },
      h('div', { class: 'columna' }, general, mosaicos, gruposCaja),
      derecha));

  function mini(etiqueta, color) {
    const valor = h('strong', null, '—');
    const graf = h('div');
    const el_ = h('div', { class: 'mini' }, h('div', { class: 'mini-cabeza' }, h('span', null, etiqueta), valor), graf);
    return { el: el_, valor, graf, color };
  }

  // ── pintar con el ESTADO ──
  function alEstado(e) {
    const r = obj(e?.resumen) || {};
    const n = nivelValido(r.nivel);
    general.className = `tarjeta estado-general nivel-${n}`;
    if (luz.dataset.n !== n) { luz.dataset.n = n; vaciar(luz, icono(NIVELES[n].icono, { tam: 32 })); }
    poner(tituloGeneral, r.titulo || 'Sin datos del servidor');
    poner(detalleGeneral, r.detalle || '');
    const comps = lista(e?.componentes).filter(obj);
    const cuenta = { ok: 0, aviso: 0, falla: 0, apagado: 0, desconocido: 0 };
    for (const c of comps) cuenta[nivelValido(c.nivel)]++;
    const firma = JSON.stringify(cuenta);
    if (cuentas.dataset.f !== firma) {
      cuentas.dataset.f = firma;
      vaciar(cuentas, 
        insigniaNivel('ok', `${cuenta.ok} funcionan`),
        cuenta.falla ? insigniaNivel('falla', `${cuenta.falla} con falla`) : null,
        cuenta.aviso ? insigniaNivel('aviso', `${cuenta.aviso} con aviso`) : null,
        cuenta.apagado ? insigniaNivel('apagado', `${cuenta.apagado} apagados a propósito`) : null,
        cuenta.desconocido ? insigniaNivel('desconocido', `${cuenta.desconocido} sin datos`) : null);
    }
    poner(revisado, e?.ciclo_completo ? `Revisión completa ${relativo(e.ciclo_completo)} · dato rápido ${relativo(e.generado)}` : (e?.generado ? `Dato ${relativo(e.generado)}` : ''));

    // mosaicos
    const comp = (id) => comps.find((c) => c.id === id);
    const p = obj(e?.publico);
    mPublico.nivel(comp('publico')?.nivel);
    poner(mPublico.v, p ? (p.error && !esNum(p.codigo) ? 'No responde' : `${p.codigo ?? '—'} · ${ms(p.ms)}`) : 'Sin datos');
    poner(mPublico.n, p ? [p.url ? String(p.url).replace(/^https?:\/\//, '') : null, esNum(p.cert_dias) ? `certificado: ${num(p.cert_dias)} días` : null, p.error || null].filter(Boolean).join(' · ') : '');
    const b = obj(e?.base);
    mUsuarios.nivel(null);
    poner(mUsuarios.v, b ? num(b.activos_15min) : 'Sin datos');
    poner(mUsuarios.n, b ? [`de ${num(b.usuarios)} usuarios registrados`, esNum(b.activos_1h) ? `${num(b.activos_1h)} en la última hora` : null].filter(Boolean).join(' · ') : '');
    const rs = obj(e?.respaldo);
    mRespaldo.nivel(comp('respaldo')?.nivel);
    poner(mRespaldo.v, rs?.ultimo ? relativo(rs.ultimo) : 'Sin datos');
    poner(mRespaldo.n, rs ? [rs.resultado ? `Resultado: ${rs.resultado}` : null, rs.proximo ? `próximo ${fechaHoraCorta(rs.proximo)}` : null].filter(Boolean).join(' · ') : '');
    const tu = obj(e?.tunel);
    mTunel.nivel(comp('tunel')?.nivel);
    poner(mTunel.v, tu ? (tu.listo === false ? 'Sin conexión' : `${num(tu.conexiones)} conexiones`) : 'Sin datos');
    poner(mTunel.n, tu ? `${num(tu.peticiones)} peticiones · ${num(tu.errores)} errores` : '');
    const g = obj(e?.git);
    mVersion.nivel(comp('version')?.nivel);
    poner(mVersion.v, g?.commit ? String(g.commit).slice(0, 10) : 'Sin datos');
    poner(mVersion.n, g ? [g.mensaje ? String(g.mensaje).slice(0, 80) : null, g.fecha ? relativo(g.fecha) : null, g.cambios_locales ? `${g.cambios_locales} cambios locales` : null].filter(Boolean).join(' · ') : '');
    mVersion.v.title = g ? `${texto(g.rama, '')} ${texto(g.commit, '')}` : '';

    // mini gráficas: valores actuales
    const eq = obj(e?.equipo);
    const w = obj(e?.wsl);
    poner(miniCpu.valor, pct(eq?.cpu));
    poner(miniRam.valor, eq ? `${pct(eq.ram_pct)}` : '—');
    miniRam.valor.title = eq ? `${num(eq.ram_usada_mb)} de ${num(eq.ram_total_mb)} MB` : '';
    const wslPct = w && esNum(w.ram_usada_mb) && w.ram_total_mb ? (w.ram_usada_mb / w.ram_total_mb) * 100 : null;
    poner(miniWsl.valor, w?.estado === 'Stopped' ? 'Detenido' : pct(wslPct));

    pintarComponentes(comps);
  }

  // ── componentes por grupo ──
  function pintarComponentes(comps) {
    if (!comps.length) {
      if (!gruposCaja.querySelector('.vacio')) vaciar(gruposCaja, vacio('El monitor todavía no tiene datos de los componentes.'));
      return;
    }
    gruposCaja.querySelector(':scope > .vacio')?.remove();
    const grupos = new Map();
    for (const c of comps) {
      const g = c.grupo || 'Otros';
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(c);
    }
    const orden = [...grupos.keys()].sort((a, b) => {
      const ia = ORDEN_GRUPOS.indexOf(a), ib = ORDEN_GRUPOS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es');
    });
    reconciliar(gruposCaja, orden.map((g) => [g, grupos.get(g)]), ([g]) => g, ([g]) => {
      const resumen = h('span', { class: 'grupo-comp-resumen' });
      const lst = h('div', { class: 'componentes' });
      const sec = h('section', { class: 'grupo-comp', 'aria-label': g },
        h('div', { class: 'grupo-comp-cabeza' }, h('h3', null, g), resumen, h('span', { class: 'grupo-comp-linea' })), lst);
      sec._r = { resumen, lst };
      return sec;
    }, (sec, [, cs]) => {
      const malos = cs.filter((c) => ['falla', 'aviso'].includes(c.nivel)).length;
      const buenos = cs.filter((c) => c.nivel === 'ok' || c.nivel === 'apagado').length;
      poner(sec._r.resumen, malos ? `${buenos} de ${cs.length} bien · ${malos} con problema` : `${cs.length} de ${cs.length} bien`);
      reconciliar(sec._r.lst, cs, (c) => c.id ?? c.nombre, crearComp, actualizarComp);
    });
  }

  function crearComp(c) {
    const r = {};
    r.ico = h('span', { class: 'comp-ico' }, icono(iconoComponente(c.id), { tam: 18 }));
    r.nombre = h('span', { class: 'comp-nombre' });
    r.nivel = insigniaNivel('desconocido');
    r.estado = h('div', { class: 'comp-estado' });
    r.desde = h('div', { class: 'comp-desde' });
    r.acciones = h('div', { class: 'grupo-botones' });
    r.detTxt = h('div', { class: 'comp-detalle' });
    r.det = h('details', null, h('summary', null, icono('derecha', { tam: 13 }), 'Detalle técnico'), r.detTxt);
    const el_ = h('article', { class: 'comp' },
      h('div', { class: 'comp-cabeza' }, r.ico, r.nombre, h('span', { class: 'comp-nivel' }, r.nivel)),
      r.estado, r.desde, r.det, r.acciones);
    el_._r = r;
    return el_;
  }

  function actualizarComp(el_, c) {
    const r = el_._r;
    const n = nivelValido(c.nivel);
    const clase = `comp nivel-${n}`;
    if (el_.className !== clase) el_.className = clase;
    poner(r.nombre, texto(c.nombre, c.id));
    r.nombre.title = texto(c.nombre, c.id);
    ponerNivel(r.nivel, n);
    poner(r.estado, c.estado || '');
    poner(r.desde, c.desde ? `${NIVELES[n].texto} ${desdeHace(c.desde)}` : '');
    r.det.hidden = !c.detalle;
    poner(r.detTxt, c.detalle || '');
    const ids = lista(c.acciones).filter((x) => typeof x === 'string');
    const firma = `${ids.join(',')}|${c.contenedor || ''}|${catalogoActual() ? 1 : 0}`;
    if (r.acciones.dataset.f !== firma) {
      r.acciones.dataset.f = firma;
      vaciar(r.acciones, 
        ...ids.map((id) => boton(ETIQUETA_CORTA[id] || ABRIR[id] || accionDe(id)?.titulo || id.replace(/^abrir:/, 'Abrir ').replace(/_/g, ' '), {
          icono: ({ reiniciar_contenedor: 'reiniciar', detener_contenedor: 'stop', encender_contenedor: 'play' })[id] || (id.startsWith('abrir:') ? 'externo' : null),
          clase: 'boton-chico', dataset: { accion: id },
          alPulsar: () => ejecutarAccion(id, { fijos: c.contenedor ? { contenedor: c.contenedor } : {} }),
        })),
        c.contenedor ? botonIcono('registros', `Ver registros de ${c.contenedor}`, { clase: 'boton-sutil boton-chico', alPulsar: () => ir('registros', { fuente: `contenedor:${c.contenedor}` }) }) : null);
    }
  }

  // ── datos que se piden aparte ──
  async function cargarMetricas() {
    const m = await api.get(conParametros('/api/metricas', { horas: 1 }), { timeout: 20000 });
    const s = obj(m?.series) || {};
    for (const [mi, clave] of [[miniCpu, 'cpu'], [miniRam, 'ram_pct'], [miniWsl, 'wsl_ram_pct']]) {
      vaciar(mi.graf, miniGrafica(lista(s[clave]).slice(-60), { color: mi.color, max: 100, etiqueta: `${mi.el.querySelector('span').textContent}, última hora` }));
    }
  }
  async function cargarSeguridad() {
    const r = await api.get('/api/seguridad', { timeout: 20000 });
    const a = obj(r?.auditoria);
    if (!a) {
      vaciar(segCaja, vacio('Todavía no hay auditoría de seguridad.', 'escudo'),
        h('div', null, boton('Auditar ahora', { icono: 'escudo', clase: 'boton-chico', alPulsar: () => ir('seguridad', { auditar: true }) })));
      return;
    }
    const res = obj(a.resumen) || {};
    const graves = (Number(res.critico) || 0) + (Number(res.alto) || 0);
    marcarNav?.('seguridad', graves, 'falla');
    vaciar(segCaja, h('div', { class: 'puntaje-caja' },
      medidor(a.puntaje, { tam: 96, grosor: 9 }),
      h('div', { class: 'puntaje-texto' },
        h('strong', null, graves ? `${graves} hallazgo${graves === 1 ? '' : 's'} importante${graves === 1 ? '' : 's'}` : 'Sin hallazgos graves'),
        h('div', { class: 'compacto' }, conteoSeveridades({ critico: res.critico, alto: res.alto, medio: res.medio })),
        h('span', { class: 'texto-3 texto-chico' }, `Última auditoría ${relativo(a.generado)}`))));
  }
  async function cargarRed() {
    const r = await api.get('/api/red', { timeout: 20000 });
    const i = obj(r?.internet);
    const d = obj(r?.dispositivos);
    const alertas = lista(r?.alertas).filter((x) => x && x.nivel !== 'ok' && x.nivel !== 'info');
    marcarNav?.('red', alertas.length, alertas.some((x) => ['critico', 'alto'].includes(x.nivel)) ? 'falla' : 'aviso');
    mInternet.nivel(i?.nivel);
    poner(mInternet.v, i ? texto(i.texto, i.nivel === 'ok' ? 'Estable' : '—') : 'Sin datos');
    poner(mInternet.n, i ? `puerta ${ms(i.puerta_ms)} · internet ${ms(i.internet_ms)} · pérdida ${pct(i.perdida_pct)}` : '');
    vaciar(redCaja, h('dl', { class: 'lista-datos' },
      h('dt', null, 'Internet'), h('dd', null, i ? insigniaNivel(i.nivel, texto(i.texto, NIVELES[nivelValido(i.nivel)].texto)) : 'Sin datos'),
      h('dt', null, 'Equipos'), h('dd', null, d ? `${num(d.total)} en la red · ${num(d.conocidos)} conocidos` : 'Sin datos'),
      h('dt', null, 'Nuevos'), h('dd', null, d ? (d.nuevos ? h('span', { class: 'chip chip-nuevo' }, `${num(d.nuevos)} sin identificar`) : 'ninguno') : '—'),
      h('dt', null, 'Alertas'), h('dd', null, alertas.length ? h('span', { class: 'color-nivel nivel-falla' }, `${alertas.length}: ${texto(alertas[0].titulo)}`) : 'ninguna'),
      d?.ultimo_escaneo ? [h('dt', null, 'Escaneo'), h('dd', null, relativo(d.ultimo_escaneo))] : null));
  }
  async function cargarEventos() {
    const r = await api.get(conParametros('/api/eventos', { limite: 7 }), { timeout: 15000 });
    const evs = lista(r?.eventos).filter(obj).slice(0, 7);
    if (!evs.length) { vaciar(evCaja, vacio('Sin eventos recientes.', 'eventos')); return; }
    vaciar(evCaja, h('ul', { class: 'eventos-mini' }, evs.map((ev) => h('li', { class: `evento-mini nivel-${nivelValido(ev.nivel)}` },
      h('span', { class: 'punto', title: NIVELES[nivelValido(ev.nivel)].texto }),
      h('strong', null, `${texto(ev.nombre, ev.componente)} · ${NIVELES[nivelValido(ev.nivel)].texto.toLowerCase()}`),
      h('span', null, `${texto(ev.mensaje, '')} — ${relativo(ev.t)}`)))));
  }

  const tMetricas = periodico(async () => { try { await cargarMetricas(); } catch { /* mini gráficas: quedan sin datos */ } }, 60000);
  const tSeg = periodico(() => cargarEn(segCaja, cargarSeguridad, { silencioso: true, reintentar: () => tSeg.ya() }), 120000);
  const tRed = periodico(() => cargarEn(redCaja, cargarRed, { silencioso: true, reintentar: () => tRed.ya() }), 30000);
  const tEv = periodico(() => cargarEn(evCaja, cargarEventos, { silencioso: true, reintentar: () => tEv.ya() }), 20000);
  const tareas = [tMetricas, tSeg, tRed, tEv];

  bus.on('trabajo-terminado', (t) => {
    if (t?.tipo === 'auditoria') tSeg.ya();
    if (t?.tipo === 'escaneo_red' || t?.tipo === 'auditoria_red') tRed.ya();
  });
  bus.on('actualizar-todo', () => { for (const t of tareas) t.ya(); });
  // cuando llega el catálogo, re-pintar para poner los nombres de las acciones en los botones
  let ultimoEstado = null;
  bus.on('catalogo', () => { if (ultimoEstado) pintarComponentes(lista(ultimoEstado.componentes).filter(obj)); });
  obtenerCatalogo().catch(() => {});

  return {
    el,
    alEstado(e) { ultimoEstado = e; alEstado(e); },
    mostrar() { for (const t of tareas) t.iniciar(); },
    ocultar() { for (const t of tareas) t.detener(); },
  };
}
