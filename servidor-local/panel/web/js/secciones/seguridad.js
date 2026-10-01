// Panel IncubApp · SEGURIDAD: puntaje, auditoría, hallazgos con arreglos, puertos abiertos,
// conexiones activas y accesos a la app.
import { h, lista, obj, esNum, num, texto, vaciar, poner, relativo, fechaHora, fechaHoraCorta, bus, debounce } from '../util.js';
import { api, conParametros } from '../api.js';
import { icono } from '../iconos.js';
import { boton, interruptor, pestanas, segmentado, insigniaSeveridad, severidadValida, SEVERIDADES, vacio, confirmar, avisoError, aviso, chip, tarjeta } from '../ui.js';
import { medidor, nivelPuntaje } from '../graficas.js';
import { VistaHallazgos, conteoSeveridades, listaAlertas } from '../hallazgos.js';
import { lanzarTrabajo } from '../lanzador.js';
import { abrirTrabajo, seguirTrabajo } from '../consola.js';
import { cabecera, cargarEn, periodico, Tabla } from './comun.js';

const TEXTO_PUNTAJE = { ok: 'Bien protegido', aviso: 'Se puede mejorar', falla: 'En riesgo: revise los hallazgos', desconocido: 'Sin auditoría todavía' };

export function crear({ marcarNav }) {
  let arreglos = [];
  let trabajoEnCurso = null;

  // ── cabecera con puntaje ──
  const medCaja = h('div');
  const titulo = h('h2', null, 'Sin auditoría todavía');
  const sub = h('p', { class: 'texto-2' }, 'La auditoría revisa Windows, el firewall, los puertos, Docker, Supabase, la web pública y los respaldos. Solo lee: no cambia nada.');
  const conteo = h('div');
  const fechaTxt = h('span', { class: 'texto-3 texto-chico' });
  const btnAuditar = boton('Auditar ahora', { icono: 'escudo', clase: 'boton-primario', alPulsar: () => auditar() });
  const btnProgreso = boton('Ver progreso', { icono: 'terminal', clase: 'boton-chico', alPulsar: () => trabajoEnCurso && abrirTrabajo(trabajoEnCurso) });
  btnProgreso.hidden = true;
  const resumenCaja = h('section', { class: 'tarjeta' },
    h('div', { class: 'puntaje-caja' }, medCaja,
      h('div', { class: 'puntaje-texto' }, titulo, sub, conteo, fechaTxt),
      h('div', { class: 'grupo-botones', style: { 'align-self': 'flex-start' } }, btnProgreso, btnAuditar)));

  // ── hallazgos ──
  const vista = new VistaHallazgos({ alArreglar: (x, def) => arreglar(x, def), mensajeVacio: 'Todavía no hay hallazgos: pulse «Auditar ahora».' });
  const swOk = interruptor({ etiqueta: 'Ocultar las revisiones que están bien', valor: true, alCambiar: (v) => { vista.ocultarOk = v; vista.dibujar(); } });
  const hallCaja = h('div', null, vista.el);

  // ── puertos ──
  let soloExpuestos = false;
  let puertos = [];
  const tPuertos = new Tabla({
    etiqueta: 'Puertos abiertos', clave: (p) => `${p.lado}-${p.direccion}-${p.puerto}-${p.proceso}`,
    orden: { clave: 'riesgo', desc: false }, vacio: 'No hay puertos para mostrar.',
    columnas: [
      { clave: 'puerto', titulo: 'Puerto', clase: 'num min', ordenar: (p) => Number(p.puerto) || 0, celda: (p) => h('strong', null, String(p.puerto ?? '—')) },
      { clave: 'lado', titulo: 'Dónde', ordenar: (p) => p.lado, celda: (p) => chip(p.lado === 'ubuntu' ? 'Ubuntu' : p.lado === 'windows' ? 'Windows' : texto(p.lado)) },
      { clave: 'direccion', titulo: 'Dirección', clase: 'mono', ordenar: (p) => p.direccion, celda: (p) => texto(p.direccion) },
      { clave: 'proceso', titulo: 'Programa / contenedor', ordenar: (p) => p.contenedor || p.proceso, celda: (p) => h('div', null, h('span', { class: 'celda-principal' }, texto(p.contenedor || p.proceso)), p.contenedor && p.proceso ? h('span', { class: 'celda-sub' }, String(p.proceso)) : null) },
      { clave: 'expuesto', titulo: 'Visible en la red', ordenar: (p) => (p.expuesto ? 0 : 1), celda: (p) => (p.expuesto ? h('span', { class: 'color-nivel nivel-aviso' }, icono('red', { tam: 14 }), ' Sí, desde otros equipos') : h('span', { class: 'texto-2' }, icono('candado', { tam: 14 }), ' No, solo este equipo')) },
      { clave: 'riesgo', titulo: 'Riesgo', ordenar: (p) => SEVERIDADES[severidadValida(p.riesgo)].orden * 100000 + (Number(p.puerto) || 0), celda: (p) => insigniaSeveridad(p.riesgo) },
      { clave: 'nota', titulo: 'Nota', celda: (p) => texto(p.nota, '') },
    ],
  });
  const swExp = interruptor({ etiqueta: 'Solo los visibles desde la red', valor: false, alCambiar: (v) => { soloExpuestos = v; pintarPuertos(); } });
  const puertosResumen = h('span', { class: 'texto-2' });
  const puertosCaja = h('div', null, tPuertos.el);
  function pintarPuertos() {
    tPuertos.poner(soloExpuestos ? puertos.filter((p) => p.expuesto) : puertos);
    const exp = puertos.filter((p) => p.expuesto).length;
    poner(puertosResumen, `${puertos.length} puertos escuchando · ${exp} visibles desde la red`);
  }
  async function cargarPuertos() {
    const r = await api.get('/api/seguridad/puertos', { timeout: 60000 });
    puertos = lista(r?.puertos).filter(obj);
    if (!puertosCaja.contains(tPuertos.el)) vaciar(puertosCaja, tPuertos.el);
    pintarPuertos();
  }

  // ── conexiones ──
  let conexiones = [];
  let soloNota = false;
  let filtroCx = '';
  const tCx = new Tabla({
    etiqueta: 'Conexiones activas', clave: (c) => `${c.local}-${c.remoto}-${c.pid}`,
    orden: { clave: 'nota', desc: false }, vacio: 'No hay conexiones para mostrar.',
    claseFila: (c) => (c.nota ? 'con-nota' : ''),
    columnas: [
      { clave: 'proceso', titulo: 'Programa', ordenar: (c) => c.proceso, celda: (c) => h('div', null, h('span', { class: 'celda-principal' }, texto(c.proceso)), esNum(c.pid) ? h('span', { class: 'celda-sub' }, `PID ${c.pid}`) : null) },
      { clave: 'local', titulo: 'Este equipo', clase: 'mono', ordenar: (c) => c.local, celda: (c) => texto(c.local) },
      { clave: 'remoto', titulo: 'Equipo remoto', clase: 'mono', ordenar: (c) => c.remoto, celda: (c) => texto(c.remoto) },
      { clave: 'estado', titulo: 'Estado', ordenar: (c) => c.estado, celda: (c) => texto(c.estado) },
      { clave: 'nota', titulo: 'Nota', ordenar: (c) => (c.nota ? `0${c.nota}` : '1'), celda: (c) => (c.nota ? h('span', { class: 'color-nivel nivel-aviso' }, icono('aviso', { tam: 14 }), ` ${c.nota}`) : '') },
    ],
  });
  const swNota = interruptor({ etiqueta: 'Solo las que tienen nota', valor: false, alCambiar: (v) => { soloNota = v; pintarCx(); } });
  const inCx = h('input', { class: 'entrada', type: 'search', placeholder: 'Buscar programa o dirección…', 'aria-label': 'Buscar conexión' });
  inCx.addEventListener('input', debounce(() => { filtroCx = inCx.value.trim().toLowerCase(); pintarCx(); }, 150));
  const cxResumen = h('span', { class: 'texto-2' });
  const cxCaja = h('div', null, tCx.el);
  function pintarCx() {
    let cs = conexiones;
    if (soloNota) cs = cs.filter((c) => c.nota);
    if (filtroCx) cs = cs.filter((c) => [c.proceso, c.local, c.remoto, c.nota].some((x) => String(x ?? '').toLowerCase().includes(filtroCx)));
    tCx.poner(cs);
    poner(cxResumen, `${conexiones.length} conexiones · ${conexiones.filter((c) => c.nota).length} con nota`);
  }
  async function cargarCx() {
    const r = await api.get('/api/seguridad/conexiones', { timeout: 60000 });
    conexiones = lista(r?.conexiones).filter(obj);
    if (!cxCaja.contains(tCx.el)) vaciar(cxCaja, tCx.el);
    pintarCx();
  }

  // ── accesos a la app ──
  let horasAcc = 24;
  const accCaja = h('div');
  const segAcc = segmentado({ etiqueta: 'Período', valor: '24', opciones: [{ valor: '24', texto: 'Últimas 24 h' }, { valor: '168', texto: 'Últimos 7 días' }], alCambiar: (v) => { horasAcc = Number(v); cargarEn(accCaja, cargarAccesos); } });
  async function cargarAccesos() {
    const r = await api.get(conParametros('/api/seguridad/accesos', { horas: horasAcc }), { timeout: 60000 });
    const porUsuario = lista(r?.por_usuario).filter(obj);
    const porIp = lista(r?.por_ip).filter(obj);
    const nuevos = lista(r?.usuarios_nuevos).filter(obj);
    const mos = (etq, v, ico, nivel = null) => h('div', { class: `mosaico${nivel ? ` nivel-${nivel}` : ''}` }, h('div', { class: 'dato-etiqueta' }, icono(ico, { tam: 15 }), etq), h('div', { class: 'dato-valor' }, v), nivel ? h('span', { class: 'mosaico-marca' }) : null);
    const tabla = (cols, filas, vacioTxt) => h('div', { class: 'tabla-caja' }, h('table', { class: 'tabla' },
      h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.c || null }, c.t)))),
      h('tbody', null, filas.length ? filas : h('tr', { class: 'tabla-vacia' }, h('td', { colspan: String(cols.length) }, vacioTxt)))));
    vaciar(accCaja, h('div', { class: 'columna' },
      h('div', { class: 'mosaicos', style: { 'grid-template-columns': 'repeat(4, minmax(0, 1fr))' } },
        mos('Ingresos correctos', num(r?.ingresos_ok), 'ok'),
        mos('Intentos fallidos', num(r?.fallidos), 'falla', Number(r?.fallidos) > 20 ? 'aviso' : null),
        mos('Usuarios que entraron', num(porUsuario.filter((u) => Number(u.ok) > 0).length), 'usuarios'),
        mos('Usuarios nuevos', num(nuevos.length), 'usuario', nuevos.length ? 'aviso' : null)),
      listaAlertas(r?.alertas),
      h('div', { class: 'rejilla rejilla-2' },
        tarjeta({ titulo: 'Por usuario', icono: 'usuarios', cuerpo: [tabla([{ t: 'Correo' }, { t: 'Ingresos', c: 'der' }, { t: 'Fallidos', c: 'der' }, { t: 'Último' }],
          porUsuario.sort((a, b) => (Number(b.fallidos) || 0) - (Number(a.fallidos) || 0) || (Number(b.ok) || 0) - (Number(a.ok) || 0)).map((u) => h('tr', null,
            h('td', { class: 'romper' }, texto(u.correo)), h('td', { class: 'der num' }, num(u.ok)),
            h('td', { class: `der num ${Number(u.fallidos) >= 5 ? 'color-nivel nivel-aviso' : ''}` }, num(u.fallidos)), h('td', null, u.ultimo ? relativo(u.ultimo) : '—'))), 'Nadie entró en este período.')] }),
        h('div', { class: 'columna' },
          tarjeta({ titulo: 'Por dirección IP', icono: 'red', subtitulo: 'de dónde entran', cuerpo: [tabla([{ t: 'IP' }, { t: 'Ingresos', c: 'der' }, { t: 'Fallidos', c: 'der' }],
            porIp.sort((a, b) => (Number(b.fallidos) || 0) - (Number(a.fallidos) || 0) || (Number(b.ok) || 0) - (Number(a.ok) || 0)).map((x) => h('tr', null,
              h('td', { class: 'mono' }, texto(x.ip)), h('td', { class: 'der num' }, esNum(x.ok) ? num(x.ok) : '—'),
              h('td', { class: `der num ${Number(x.fallidos) >= 5 ? 'color-nivel nivel-aviso' : ''}` }, num(x.fallidos)))), 'Sin ingresos en este período.')] }),
          tarjeta({ titulo: 'Usuarios nuevos', icono: 'usuario', cuerpo: [tabla([{ t: 'Correo' }, { t: 'Creado' }],
            nuevos.map((u) => h('tr', null, h('td', { class: 'romper' }, texto(u.correo)), h('td', null, fechaHoraCorta(u.creado)))), 'No se crearon usuarios en este período.')] }))),
      r?.nota ? h('p', { class: 'nota' }, icono('info_c', { tam: 16 }), h('span', null, String(r.nota))) : null,
      r?.generado ? h('span', { class: 'texto-3 texto-chico' }, `Leído ${relativo(r.generado)} del registro de Supabase (auth).`) : null));
  }

  // ── pestañas ──
  const cargadas = new Set();
  const cargadores = { puertos: () => cargarEn(puertosCaja, cargarPuertos), conexiones: () => cargarEn(cxCaja, cargarCx), accesos: () => cargarEn(accCaja, cargarAccesos) };
  const tabs = pestanas({
    etiqueta: 'Seguridad',
    items: [{ id: 'hallazgos', titulo: 'Hallazgos', icono: 'escudo' }, { id: 'puertos', titulo: 'Puertos abiertos', icono: 'puertos' }, { id: 'conexiones', titulo: 'Conexiones', icono: 'enlace' }, { id: 'accesos', titulo: 'Accesos a la app', icono: 'usuarios' }],
    alCambiar: (id) => { if (!cargadas.has(id) && cargadores[id]) { cargadas.add(id); cargadores[id](); } },
  });
  tabs.paneles.get('hallazgos').append(h('div', { class: 'columna' }, h('div', { class: 'barra-herramientas' }, swOk), hallCaja));
  tabs.paneles.get('puertos').append(h('div', { class: 'columna' },
    h('div', { class: 'barra-herramientas' }, swExp, h('span', { class: 'espacio' }), puertosResumen, boton('Actualizar', { icono: 'actualizar', clase: 'boton-chico', alPulsar: () => cargarEn(puertosCaja, cargarPuertos) })),
    puertosCaja,
    h('p', { class: 'nota' }, icono('info_c', { tam: 16 }), h('span', null, '«Visible en la red» significa que otros equipos de la empresa pueden conectarse a ese puerto. Lo ideal es que solo se vean los que hacen falta (80 para la app).'))));
  tabs.paneles.get('conexiones').append(h('div', { class: 'columna' },
    h('div', { class: 'barra-herramientas' }, h('div', { class: 'entrada-buscar' }, icono('buscar', { tam: 16 }), inCx), swNota, h('span', { class: 'espacio' }), cxResumen, boton('Actualizar', { icono: 'actualizar', clase: 'boton-chico', alPulsar: () => cargarEn(cxCaja, cargarCx) })),
    cxCaja));
  tabs.paneles.get('accesos').append(h('div', { class: 'columna' },
    h('div', { class: 'barra-herramientas' }, segAcc, h('span', { class: 'espacio' }), boton('Actualizar', { icono: 'actualizar', clase: 'boton-chico', alPulsar: () => cargarEn(accCaja, cargarAccesos) })),
    accCaja));

  const errorCaja = h('div');
  const el = h('div', { class: 'seccion' },
    cabecera('Seguridad', 'seguridad', 'Revisión de ciberseguridad del servidor: qué está bien, qué falta y cómo arreglarlo.'),
    errorCaja, resumenCaja, h('div', null, tabs.lista, ...tabs.paneles.values()));

  // ── datos ──
  function pintarAuditoria(a) {
    const n = nivelPuntaje(a?.puntaje);
    vaciar(medCaja, medidor(a?.puntaje, { tam: 148, etiqueta: 'Puntaje de seguridad' }));
    poner(titulo, a ? `${esNum(a.puntaje) ? `${Math.round(a.puntaje)} de 100 · ` : ''}${TEXTO_PUNTAJE[n]}` : TEXTO_PUNTAJE.desconocido);
    vaciar(conteo, a ? conteoSeveridades(a.resumen) : null);
    poner(fechaTxt, a?.generado ? `Última auditoría ${relativo(a.generado)} (${fechaHora(a.generado)})${esNum(a.segundos) ? ` · tardó ${num(a.segundos, 1)} s` : ''}` : '');
    const graves = (Number(a?.resumen?.critico) || 0) + (Number(a?.resumen?.alto) || 0);
    marcarNav('seguridad', graves, 'falla');
    tabs.contador('hallazgos', lista(a?.hallazgos).filter((x) => !['ok', 'info'].includes(severidadValida(x?.nivel))).length || 0, graves ? 'sev-alto' : '');
    vista.poner(a?.hallazgos || [], arreglos);
  }

  async function cargar() {
    const r = await api.get('/api/seguridad', { timeout: 30000 });
    arreglos = lista(r?.arreglos).filter(obj);
    pintarAuditoria(obj(r?.auditoria));
    const t = obj(r?.trabajo);
    ponerTrabajo(t && t.estado === 'corriendo' ? t : null);
  }
  function ponerTrabajo(t) {
    trabajoEnCurso = t;
    btnProgreso.hidden = !t;
    btnAuditar.disabled = !!t;
    poner(btnAuditar.querySelector('span'), t ? 'Auditando…' : 'Auditar ahora');
    if (t) seguirTrabajo(t, () => { ponerTrabajo(null); tCarga.ya(); });
  }

  async function auditar() {
    const t = await lanzarTrabajo('/api/seguridad/auditar', {}, { errorPrefijo: 'No se pudo iniciar la auditoría', alTerminar: () => { ponerTrabajo(null); tCarga.ya(); } });
    if (t) ponerTrabajo(t);
  }

  async function arreglar(x, def) {
    const id = def?.id || x?.arreglo;
    if (!id) return;
    const ok = await confirmar({
      titulo: `Arreglar: ${texto(def?.titulo, x?.titulo)}`,
      mensaje: def?.descripcion || `Se aplicará el arreglo automático para «${texto(x?.titulo, id)}».`,
      detalle: [x?.recomendacion ? `Recomendación: ${x.recomendacion}` : null, 'Cuando termine, vuelva a auditar para confirmar que quedó bien.'].filter(Boolean),
      peligro: def?.peligro || 'medio', admin: !!def?.admin, textoBoton: 'Aplicar el arreglo',
    });
    if (!ok) return;
    await lanzarTrabajo('/api/seguridad/arreglar', { id }, {
      errorPrefijo: 'No se pudo aplicar el arreglo',
      alTerminar: (t) => {
        tCarga.ya();
        if (t?.estado === 'ok') aviso('Arreglo aplicado. Pulse «Auditar ahora» para confirmar.', 'ok');
      },
    });
  }

  const tCarga = periodico(async () => {
    try { await cargar(); vaciar(errorCaja); } catch (e) {
      if (e?.estado === 401 || e?.estado === 0) return;
      vaciar(errorCaja, h('div', { class: 'bloque-error', role: 'alert' }, icono('aviso', { tam: 20 }), h('div', null, h('strong', null, 'No se pudo cargar la auditoría'), h('span', null, e.message))));
    }
  }, 60000);
  bus.on('trabajo-terminado', (t) => { if (t?.tipo === 'auditoria' || t?.tipo === 'arreglo') tCarga.ya(); });

  return {
    el,
    mostrar(op = {}) {
      if (op.pestana) tabs.activar(op.pestana);
      tCarga.iniciar();
      if (op.auditar) auditar();
    },
    ocultar() { tCarga.detener(); },
  };
}
