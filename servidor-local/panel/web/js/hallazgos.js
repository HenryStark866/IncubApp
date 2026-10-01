// Panel IncubApp · vista de hallazgos de seguridad (la usan Seguridad, la auditoría de la red,
// el escaneo de puertos y las alertas). Se actualiza en su lugar: los hallazgos que el usuario
// abrió siguen abiertos cuando llegan datos nuevos.
import { h, poner, reconciliar, lista, texto } from './util.js';
import { icono } from './iconos.js';
import { insigniaSeveridad, severidadValida, SEVERIDADES, vacio, chip } from './ui.js';

function agregarHijos(el, ...xs) { for (const x of xs) if (x) el.appendChild(x); }

export const CATEGORIAS = {
  windows: { texto: 'Windows', icono: 'equipo' },
  red: { texto: 'Red', icono: 'red' },
  docker: { texto: 'Docker', icono: 'docker' },
  supabase: { texto: 'Supabase', icono: 'base' },
  app: { texto: 'App IncubApp', icono: 'app' },
  respaldo: { texto: 'Respaldo', icono: 'respaldo' },
  web: { texto: 'Web pública', icono: 'publico' },
};
const ordenSev = (s) => SEVERIDADES[severidadValida(s)].orden;

function nombreCategoria(c) { return CATEGORIAS[c]?.texto || (c ? String(c).charAt(0).toUpperCase() + String(c).slice(1) : 'Otros'); }

/** Cuenta por severidad: {critico: n, …}. */
export function contarSeveridades(hallazgos) {
  const r = { critico: 0, alto: 0, medio: 0, bajo: 0, info: 0, ok: 0 };
  for (const x of lista(hallazgos)) r[severidadValida(x?.nivel)]++;
  return r;
}

/** Fila de conteos por severidad (para cabeceras de Seguridad y auditoría de red). */
export function conteoSeveridades(resumen) {
  const el = h('div', { class: 'conteo-sev' });
  for (const k of ['critico', 'alto', 'medio', 'bajo', 'info', 'ok']) {
    const n = Number(resumen?.[k] ?? 0) || 0;
    el.appendChild(h('div', { class: `conteo-item sev-${k} ${n ? '' : 'cero'}`.trim() },
      h('span', { class: 'conteo-num' }, String(n)), h('span', { class: 'conteo-txt' }, icono(SEVERIDADES[k].icono, { tam: 13 }), SEVERIDADES[k].texto)));
  }
  return el;
}

export class VistaHallazgos {
  /** alArreglar(hallazgo, arreglo) → se llama al pulsar «Arreglar». */
  constructor({ alArreglar = null, agrupar = true, mensajeVacio = 'No hay hallazgos.' } = {}) {
    this.alArreglar = alArreglar;
    this.agrupar = agrupar;
    this.mensajeVacio = mensajeVacio;
    this.ocultarOk = true;
    this.hallazgos = [];
    this.arreglos = [];
    this.cuerpo = h('div', { class: 'hallazgos' });
    this.el = this.cuerpo;
  }

  poner(hallazgos, arreglos = null) {
    this.hallazgos = lista(hallazgos).filter((x) => x && typeof x === 'object');
    if (arreglos) this.arreglos = lista(arreglos);
    this.dibujar();
  }

  dibujar() {
    const visibles = this.hallazgos.filter((x) => !(this.ocultarOk && severidadValida(x.nivel) === 'ok'));
    if (!visibles.length) {
      const ocultos = this.hallazgos.length - visibles.length;
      this.cuerpo.replaceChildren(vacio(this.hallazgos.length && ocultos
        ? `Todo bien: ${ocultos} revisiones sin problemas (están ocultas).`
        : this.mensajeVacio, this.hallazgos.length ? 'ok' : 'info_c'));
      return;
    }
    if (this.cuerpo.querySelector(':scope > .vacio')) this.cuerpo.replaceChildren();
    const grupos = new Map();
    for (const x of visibles) {
      const c = this.agrupar ? (x.categoria || 'otros') : 'todos';
      if (!grupos.has(c)) grupos.set(c, []);
      grupos.get(c).push(x);
    }
    const ordenados = [...grupos.entries()]
      .map(([c, xs]) => [c, xs.sort((a, b) => ordenSev(a.nivel) - ordenSev(b.nivel) || String(a.titulo).localeCompare(String(b.titulo), 'es'))])
      .sort((a, b) => ordenSev(a[1][0].nivel) - ordenSev(b[1][0].nivel) || nombreCategoria(a[0]).localeCompare(nombreCategoria(b[0]), 'es'));

    reconciliar(this.cuerpo, ordenados, ([c]) => c, ([c]) => {
      const lst = h('div', { class: 'hallazgos-lista' });
      const cab = this.agrupar ? h('h4', { class: 'grupo-titulo' }, icono(CATEGORIAS[c]?.icono || 'escudo', { tam: 16 }), h('span', null, nombreCategoria(c)), h('span', { class: 'grupo-cuenta' })) : null;
      const g = h('section', { class: 'hallazgos-grupo' }, cab, lst);
      g._lista = lst;
      g._cuenta = cab?.querySelector('.grupo-cuenta');
      return g;
    }, (g, [, xs]) => {
      if (g._cuenta) poner(g._cuenta, `${xs.length}`);
      reconciliar(g._lista, xs, (x, ) => x.id ?? x.titulo, (x) => this._crear(x), (el, x) => this._actualizar(el, x));
    });
  }

  _crear() {
    const el = h('details', { class: 'hallazgo' });
    const r = {};
    r.sev = h('span', { class: 'hallazgo-sev' });
    r.titulo = h('span', { class: 'hallazgo-titulo' });
    r.marcaArreglo = h('span', { class: 'chip chip-arreglo', hidden: true }, icono('arreglar', { tam: 13 }), 'Tiene arreglo');
    r.detalle = h('p', { class: 'hallazgo-detalle' });
    r.recomendacion = h('p', { class: 'hallazgo-recomendacion' });
    r.evidencia = h('code', { class: 'hallazgo-evidencia' });
    r.bloqueEvid = h('div', { class: 'hallazgo-bloque' }, h('span', { class: 'hallazgo-rotulo' }, 'Evidencia'), r.evidencia);
    r.bloqueDet = h('div', { class: 'hallazgo-bloque' }, h('span', { class: 'hallazgo-rotulo' }, 'Qué pasa'), r.detalle);
    r.bloqueRec = h('div', { class: 'hallazgo-bloque' }, h('span', { class: 'hallazgo-rotulo' }, 'Qué hacer'), r.recomendacion);
    r.arreglo = h('div', { class: 'hallazgo-arreglo' });
    el.append(
      h('summary', null, icono('derecha', { tam: 16, clase: 'hallazgo-flecha' }), r.sev, r.titulo, r.marcaArreglo),
      h('div', { class: 'hallazgo-cuerpo' }, r.bloqueDet, r.bloqueRec, r.bloqueEvid, r.arreglo));
    el._r = r;
    return el;
  }

  _actualizar(el, x) {
    const r = el._r;
    const sev = severidadValida(x.nivel);
    if (el.dataset.sev !== sev) {
      el.dataset.sev = sev;
      el.className = `hallazgo sev-borde-${sev}`;
      r.sev.replaceChildren(insigniaSeveridad(sev));
    }
    poner(r.titulo, texto(x.titulo, 'Hallazgo'));
    poner(r.detalle, x.detalle || '');
    r.bloqueDet.hidden = !x.detalle;
    poner(r.recomendacion, x.recomendacion || '');
    r.bloqueRec.hidden = !x.recomendacion;
    poner(r.evidencia, x.evidencia || '');
    r.bloqueEvid.hidden = !x.evidencia;
    const idArreglo = typeof x.arreglo === 'string' && x.arreglo ? x.arreglo : null;
    r.marcaArreglo.hidden = !idArreglo || !this.alArreglar;
    const claveArreglo = idArreglo && this.alArreglar ? idArreglo : '';
    if (r.arreglo.dataset.id !== claveArreglo) {
      r.arreglo.dataset.id = claveArreglo;
      r.arreglo.replaceChildren();
      if (claveArreglo) {
        const def = this.arreglos.find((a) => a?.id === idArreglo) || null;
        agregarHijos(r.arreglo,
          h('button', { class: 'boton boton-primario boton-chico', type: 'button', on: { click: () => this.alArreglar(x, def || { id: idArreglo }) } },
            icono('arreglar', { tam: 16 }), h('span', null, 'Arreglar')),
          def ? h('span', { class: 'texto-2 hallazgo-arreglo-txt' }, def.titulo || '', def.admin ? ' · pide permiso de administrador' : '') : null);
      }
    }
  }
}

/** Lista simple (sin agrupar) para alertas en vivo. */
export function listaAlertas(alertas) {
  const xs = lista(alertas).filter((x) => x && severidadValida(x.nivel) !== 'ok');
  if (!xs.length) return null;
  return h('ul', { class: 'alertas' }, xs.map((x) => h('li', { class: `alerta sev-borde-${severidadValida(x.nivel)}` },
    insigniaSeveridad(x.nivel),
    h('div', null, h('strong', null, texto(x.titulo, 'Alerta')), x.detalle ? h('span', { class: 'texto-2' }, x.detalle) : null,
      x.recomendacion ? h('span', { class: 'texto-2' }, `Qué hacer: ${x.recomendacion}`) : null,
      x.evidencia ? h('code', { class: 'hallazgo-evidencia' }, x.evidencia) : null))));
}

export { chip };
