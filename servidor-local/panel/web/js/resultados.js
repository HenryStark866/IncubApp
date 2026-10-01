// Panel IncubApp · resultado legible de un trabajo terminado (consola de trabajo y herramientas).
// Se decide por la FORMA del resultado (no solo por el tipo), para tolerar diferencias del backend.
import { h, num, ms, pct, texto, lista, obj, esNum, fechaHora, ordenarPor } from './util.js';
import { icono } from './iconos.js';
import { insigniaSeveridad, severidadValida, SEVERIDADES, chip, boton } from './ui.js';
import { conteoSeveridades, VistaHallazgos } from './hallazgos.js';
import { medidor } from './graficas.js';

/** Fila «etiqueta: valor» para listas de datos. */
const par = (k, v) => [h('dt', null, k), h('dd', null, v ?? '—')];
const titulo = (txt, ok = true) => h('div', { class: `resultado-titulo ${ok ? 'resultado-ok' : 'resultado-error'}` }, icono(ok ? 'ok' : 'falla', { tam: 18 }), h('span', null, txt));

function tabla(columnas, filas, { vacio = 'Nada que mostrar.' } = {}) {
  const tb = h('tbody');
  if (!filas.length) tb.appendChild(h('tr', { class: 'tabla-vacia' }, h('td', { colspan: String(columnas.length) }, vacio)));
  for (const f of filas) tb.appendChild(h('tr', null, f.map((c, i) => h('td', { class: columnas[i].clase || null }, c))));
  return h('div', { class: 'tabla-caja' }, h('table', { class: 'tabla' },
    h('thead', null, h('tr', null, columnas.map((c) => h('th', { class: c.clase || null }, c.titulo)))), tb));
}

/** Tabla de puertos abiertos de un escaneo (red.escanear_puertos). */
export function vistaPuertos(r) {
  const abiertos = ordenarPor(lista(r.abiertos).filter(obj), (p) => SEVERIDADES[severidadValida(p.riesgo)].orden * 100000 + (Number(p.puerto) || 0));
  const hs = lista(r.hallazgos).filter(obj);
  const vh = new VistaHallazgos({ agrupar: false, mensajeVacio: 'Sin hallazgos.' });
  vh.poner(hs);
  return h('div', { class: 'formulario' },
    titulo(`${texto(r.host, 'Equipo')}: ${abiertos.length ? `${abiertos.length} puerto${abiertos.length === 1 ? '' : 's'} abierto${abiertos.length === 1 ? '' : 's'}` : 'ningún puerto abierto'}${esNum(r.segundos) ? ` (${num(r.segundos, 1)} s)` : ''}`),
    tabla([{ titulo: 'Puerto', clase: 'num min' }, { titulo: 'Servicio' }, { titulo: 'Riesgo', clase: 'min' }, { titulo: 'Nota' }],
      abiertos.map((p) => [String(p.puerto ?? '—'), h('span', null, texto(p.servicio), p.titulo_web ? h('span', { class: 'celda-sub' }, `Página: ${p.titulo_web}`) : null),
        insigniaSeveridad(p.riesgo), texto(p.nota, '')]), { vacio: 'No respondió ningún puerto del perfil revisado.' }),
    hs.length ? vh.el : null);
}

/** Resumen de una auditoría (seguridad o red). */
export function vistaAuditoria(r, { irA = null } = {}) {
  return h('div', { class: 'puntaje-caja' },
    medidor(r.puntaje, { tam: 96, grosor: 9 }),
    h('div', { class: 'puntaje-texto' },
      h('strong', null, `Auditoría lista${esNum(r.segundos) ? ` en ${num(r.segundos, 1)} s` : ''}`),
      h('div', { class: 'compacto' }, conteoSeveridades(r.resumen)),
      irA ? h('div', null, irA) : null));
}

function vistaEscaneo(r) {
  const nuevos = lista(r.nuevos).filter(obj);
  return h('div', { class: 'formulario' },
    titulo(`Se encontraron ${num(lista(r.dispositivos).length)} equipos en ${texto(r.red, 'la red')}${esNum(r.segundos) ? ` (${num(r.segundos, 1)} s)` : ''}`),
    nuevos.length
      ? h('div', null, h('p', { class: 'nota nota-aviso' }, icono('aviso', { tam: 16 }), h('span', null, `${nuevos.length} equipo${nuevos.length === 1 ? '' : 's'} nuevo${nuevos.length === 1 ? '' : 's'} (nunca vistos antes). Revíselos en Red › Dispositivos.`)),
        tabla([{ titulo: 'IP', clase: 'mono' }, { titulo: 'MAC', clase: 'mono' }, { titulo: 'Fabricante' }, { titulo: 'Nombre en la red' }],
          nuevos.map((d) => [texto(d.ip), texto(d.mac), texto(d.fabricante), texto(d.nombre_red)])))
      : h('p', { class: 'texto-2' }, 'No apareció ningún equipo nuevo.'));
}

function vistaPing(r) {
  const perdida = Number(r.perdida_pct ?? 0);
  return h('div', { class: 'formulario' },
    titulo(perdida >= 100 ? `${texto(r.host)} no respondió` : `${texto(r.host)} respondió ${num(r.recibidos)} de ${num(r.enviados)}`, perdida < 100),
    h('dl', { class: 'lista-datos' },
      par('Pérdida', pct(r.perdida_pct, 1)), par('Mínimo', ms(r.min_ms ?? r.min)), par('Promedio', ms(r.prom_ms ?? r.prom)), par('Máximo', ms(r.max_ms ?? r.max))));
}

function vistaTraceroute(r) {
  const saltos = lista(r.saltos).filter(obj);
  return h('div', { class: 'formulario' },
    titulo(`Ruta hacia ${texto(r.host)}: ${saltos.length} salto${saltos.length === 1 ? '' : 's'}`),
    tabla([{ titulo: 'Salto', clase: 'num min' }, { titulo: 'IP', clase: 'mono' }, { titulo: 'Nombre' }, { titulo: 'Tiempo', clase: 'der' }],
      saltos.map((s) => [String(s.salto ?? '—'), s.ip ? s.ip : h('span', { class: 'texto-3' }, 'sin respuesta (*)'), texto(s.nombre, ''), ms(s.ms)])));
}

function vistaDns(r) {
  // contrato: resultados[].direcciones · backend real: respuestas[].ips (+ alertas)
  const res = lista(r.resultados ?? r.respuestas).filter(obj);
  const dirs = (x) => lista(x.direcciones ?? x.ips).map(String);
  const conRespuesta = res.filter((x) => !x.error && dirs(x).length);
  const firmas = new Set(conRespuesta.map((x) => [...dirs(x)].sort().join(',')));
  const alertas = lista(r.alertas).filter((x) => obj(x) && x.nivel !== 'ok');
  const coinciden = typeof r.coinciden === 'boolean' ? r.coinciden : firmas.size <= 1 && !alertas.length;
  return h('div', { class: 'formulario' },
    titulo(r.nota || (coinciden ? 'Todos los servidores DNS responden lo mismo: no hay señales de DNS manipulado.' : 'Los servidores DNS NO responden lo mismo: revise las alertas.'), coinciden),
    tabla([{ titulo: 'Servidor DNS' }, { titulo: 'Respuesta', clase: 'mono' }, { titulo: 'Tiempo', clase: 'der' }],
      res.map((x) => [texto(x.servidor), x.error ? h('span', { class: 'color-nivel nivel-falla' }, String(x.error)) : dirs(x).join(', ') || '—', ms(x.ms)])),
    alertas.length ? (() => { const v = new VistaHallazgos({ agrupar: false }); v.poner(alertas); return v.el; })() : null);
}

const CABECERAS = {
  'Strict-Transport-Security': 'Obliga a usar https (HSTS)',
  'X-Content-Type-Options': 'Evita que el navegador adivine tipos',
  'X-Frame-Options': 'Impide meter la página en otra (clickjacking)',
  'Content-Security-Policy': 'Política de contenido (CSP)',
  'Referrer-Policy': 'Controla qué se comparte al salir de la página',
};
// nombres cortos que usa el backend real en «faltan»
const CORTAS = { HSTS: 'Strict-Transport-Security', CSP: 'Content-Security-Policy' };
function vistaHttp(r) {
  const cab = obj(r.cabeceras) || {};
  const cert = obj(r.certificado);
  const ok = esNum(r.codigo) && r.codigo < 400;
  // Contrato: cabeceras de seguridad con null si faltan. Backend real: todas las cabeceras +
  // lista «faltan». Se arma la lista de las 5 de seguridad con lo que haya.
  const faltan = new Set(lista(r.faltan).map((x) => CORTAS[x] || String(x)));
  const presentes = new Map(Object.entries(cab).map(([k, v]) => [k.toLowerCase(), v]));
  const conLista = Array.isArray(r.faltan);
  const filas = [];
  for (const k of Object.keys(CABECERAS)) {
    const v = presentes.get(k.toLowerCase());
    if (conLista && faltan.has(k)) filas.push([k, null]);              // falta
    else if (v !== undefined && v !== null && v !== '') filas.push([k, v]); // está
    else if (!conLista && presentes.has(k.toLowerCase())) filas.push([k, null]);
  }
  const certTexto = cert ? `${texto(cert.emisor)} · vence ${texto(cert.vence)}${esNum(cert.dias) ? ` (en ${num(cert.dias)} días)` : ''}`
    : esNum(r.cert_dias) ? `vence en ${num(r.cert_dias)} días` : null;
  return h('div', { class: 'formulario' },
    titulo(r.error ? `No respondió: ${r.error}` : `Respondió ${num(r.codigo)} en ${ms(r.ms)}`, ok && !r.error),
    h('dl', { class: 'lista-datos' },
      par('Dirección', texto(r.url)), r.final && r.final !== r.url ? par('Terminó en', String(r.final)) : null,
      r.titulo ? par('Título de la página', String(r.titulo)) : null,
      r.servidor ? par('Servidor', String(r.servidor)) : null,
      certTexto ? par('Certificado', certTexto) : String(r.url || '').startsWith('http:') ? par('Cifrado', 'No (http sin certificado)') : null),
    filas.length ? h('div', null, h('div', { class: 'campo-etiqueta' }, 'Cabeceras de seguridad'),
      h('ul', { class: 'cabeceras-lista' }, filas.map(([k, v]) => h('li', null,
        h('span', { class: v !== null ? 'si' : 'no' }, icono(v !== null ? 'ok' : 'falla', { tam: 15 })),
        h('span', null, h('strong', null, k), h('span', { class: 'texto-2' }, ` — ${CABECERAS[k] || ''}${v !== null ? '' : ' (falta)'}`)))))) : null);
}

function vistaPuerto(r) {
  // contrato: abierto (bool) · backend real: estado 'abierto'|'cerrado'|… + riesgo y nota
  const abierto = typeof r.abierto === 'boolean' ? r.abierto : r.estado === 'abierto';
  return h('div', { class: 'formulario' },
    titulo(abierto ? `${texto(r.host)}:${texto(r.puerto)} está ABIERTO${r.servicio ? ` (${r.servicio})` : ''}${esNum(r.ms) ? ` · respondió en ${ms(r.ms)}` : ''}`
      : `${texto(r.host)}:${texto(r.puerto)} está ${r.estado && r.estado !== 'cerrado' ? String(r.estado) : 'cerrado o filtrado'}`, abierto),
    abierto && (r.riesgo || r.nota) ? h('div', { class: 'grupo-botones' }, r.riesgo ? insigniaSeveridad(r.riesgo) : null, r.nota ? h('span', { class: 'texto-2' }, String(r.nota)) : null) : null);
}

function vistaUpnp(r) {
  // contrato: dispositivos[{ip, nombre, servidor, tipo}] · backend real: equipos[{ip, servidor, ubicacion, tipos[], router_upnp}]
  const ds = lista(r.dispositivos ?? r.equipos).filter(obj);
  const hs = lista(r.hallazgos ?? r.alertas).filter(obj);
  const vh = new VistaHallazgos({ agrupar: false });
  vh.poner(hs);
  const tipoDe = (d) => {
    const t = d.tipo || lista(d.tipos).find((x) => /:device:/.test(String(x))) || '';
    return String(t).replace(/^urn:[^:]+:device:/, '').replace(/:\d+$/, '');
  };
  return h('div', { class: 'formulario' },
    titulo(`${ds.length} equipo${ds.length === 1 ? '' : 's'} respondieron a UPnP`),
    tabla([{ titulo: 'IP', clase: 'mono min' }, { titulo: 'Equipo' }, { titulo: 'Tipo' }],
      ds.map((d) => [texto(d.ip), h('span', null, texto(d.nombre, ''), h('span', { class: 'celda-sub' }, texto(d.servidor, ''))),
        h('span', null, texto(tipoDe(d)), d.router_upnp ? h('span', { class: 'chip chip-nuevo', style: { 'margin-left': '6px' } }, 'Router con UPnP activo') : null)]),
      { vacio: 'Ningún equipo respondió.' }),
    hs.length ? vh.el : null);
}

/**
 * Devuelve un nodo con el resultado legible, o null si no hay nada que mostrar.
 * acciones: {abrirCarpeta(destino), irA(seccion)} para los botones del resultado.
 */
export function vistaResultado(t, acciones = {}) {
  if (!t) return null;
  if (t.estado === 'error') return h('div', { class: 'formulario' }, titulo(t.error ? String(t.error) : 'El trabajo terminó con un error. Revise la salida.', false));
  if (t.estado === 'cancelado') return h('div', { class: 'resultado-titulo texto-2' }, icono('apagado', { tam: 18 }), h('span', null, 'Se canceló el trabajo.'));
  if (t.estado !== 'ok') return null;
  const r = t.resultado;
  if (!obj(r)) return titulo(typeof r === 'string' && r ? r : 'Terminó bien.');
  try {
    if (Array.isArray(r.abiertos)) return vistaPuertos(r);
    if (esNum(r.puntaje) || (Array.isArray(r.hallazgos) && obj(r.resumen))) {
      const red = t.tipo === 'auditoria_red';
      return vistaAuditoria(r, { irA: acciones.irA ? h('button', { class: 'enlace', type: 'button', on: { click: () => acciones.irA(red ? 'red' : 'seguridad', red ? { pestana: 'auditoria' } : { pestana: 'hallazgos' }) } }, `Ver los hallazgos en ${red ? 'Red' : 'Seguridad'}`, icono('derecha', { tam: 14 })) : null });
    }
    if (Array.isArray(r.dispositivos) && 'red' in r) return vistaEscaneo(r);
    if (Array.isArray(r.saltos)) return vistaTraceroute(r);
    if (Array.isArray(r.tiempos) || ('recibidos' in r && 'enviados' in r)) return vistaPing(r);
    if ((Array.isArray(r.resultados) || Array.isArray(r.respuestas)) && 'nombre' in r) return vistaDns(r);
    if ('cabeceras' in r || ('url' in r && 'codigo' in r)) return vistaHttp(r);
    if ('puerto' in r && 'host' in r && ('abierto' in r || 'estado' in r)) return vistaPuerto(r);
    if ('enviado' in r && 'mac' in r) return titulo(r.enviado ? `Se mandó el paquete de encendido a ${texto(r.mac)}. Si el equipo lo admite, enciende en unos segundos.` : 'No se pudo mandar el paquete.', !!r.enviado);
    if (Array.isArray(r.dispositivos) || Array.isArray(r.equipos)) return vistaUpnp(r);
    if (typeof r.archivo === 'string' && r.archivo) {
      const destino = /reporte/i.test(r.archivo) || t.tipo === 'reporte_soporte' || t.tipo === 'reporte' ? 'carpeta_reportes' : /respaldo|base-de-datos|\.tar$/i.test(r.archivo) ? 'carpeta_respaldos' : 'carpeta_reportes';
      return h('div', { class: 'formulario' },
        titulo(r.mensaje || 'Archivo listo.'),
        h('dl', { class: 'lista-datos' }, par('Archivo', h('code', { class: 'romper' }, r.archivo)), r.tamano ? par('Tamaño', String(r.tamano)) : null),
        acciones.abrirCarpeta ? h('div', null, boton('Abrir carpeta', { icono: 'carpeta', clase: 'boton-primario boton-chico', alPulsar: () => acciones.abrirCarpeta(destino) })) : null);
    }
    if (esNum(r.fabricantes)) return titulo(`Base de fabricantes actualizada: ${num(r.fabricantes)} fabricantes.`);
    if ('ok' in r && typeof r.ok === 'boolean') return titulo(r.mensaje || (r.ok ? 'Listo.' : 'No se pudo completar.'), r.ok);
    if (typeof r.mensaje === 'string') return titulo(r.mensaje);
    // genérico: valores simples
    const filas = Object.entries(r).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 14);
    if (!filas.length) return titulo('Terminó bien.');
    return h('div', { class: 'formulario' }, titulo('Terminó bien.'),
      h('dl', { class: 'lista-datos' }, filas.map(([k, v]) => par(k.replace(/_/g, ' '), typeof v === 'boolean' ? (v ? 'sí' : 'no') : typeof v === 'number' ? num(v, 2) : texto(v)))));
  } catch (e) {
    console.error(e);
    return titulo('Terminó bien (no se pudo mostrar el resumen).');
  }
}

export { fechaHora };
