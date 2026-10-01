// Panel IncubApp · piezas comunes de las secciones: cabecera, carga con manejo de errores
// (503 = esa parte no cargó, sin romper las demás), tareas periódicas y tabla ordenable que
// se actualiza en su lugar.
import { h, poner, lista, ordenarPor, atributo } from '../util.js';
import { icono } from '../iconos.js';
import { bloqueError, cargando, avisoError } from '../ui.js';

export function cabecera(titulo, ico, subtitulo = null, acciones = null) {
  const sub = h('p', null, subtitulo || '');
  if (!subtitulo) sub.hidden = true;
  const el = h('header', { class: 'seccion-cabeza' },
    h('div', null, h('h1', null, icono(ico, { tam: 24 }), h('span', null, titulo)), sub),
    acciones ? h('div', { class: 'seccion-acciones' }, acciones) : null);
  el.sub = sub;
  return el;
}

/**
 * Corre `fn` (async) y muestra su error dentro de `caja` (bloque de error con «Reintentar»).
 * Si `caja` está vacía muestra «Cargando…» mientras tanto. Devuelve el resultado o null.
 */
export async function cargarEn(caja, fn, { silencioso = false, reintentar = null } = {}) {
  if (caja && !caja.childElementCount && !silencioso) caja.replaceChildren(cargando());
  try {
    const r = await fn();
    if (caja) caja.querySelector(':scope > .bloque-error')?.remove();
    return r ?? null;
  } catch (e) {
    if (e?.estado === 401) return null;
    if (e?.estado === 0 && silencioso) return null;     // sin conexión: lo avisa la franja roja
    if (caja) caja.replaceChildren(bloqueError(e?.message || 'Error desconocido.', reintentar));
    else avisoError(e);
    return null;
  }
}

/** Tarea periódica que solo corre mientras la sección está visible. */
export function periodico(fn, ms) {
  let t = 0, activo = false;
  const vuelta = async () => {
    if (!activo) return;
    try { await fn(); } catch (e) { console.error(e); }
    if (activo) t = setTimeout(vuelta, document.hidden ? ms * 3 : ms);
  };
  return {
    iniciar(inmediato = true) { if (activo) return; activo = true; if (inmediato) vuelta(); else t = setTimeout(vuelta, ms); },
    detener() { activo = false; clearTimeout(t); },
    ya() { clearTimeout(t); if (activo) vuelta(); },
  };
}

/**
 * Tabla ordenable que se actualiza por clave (no parpadea, no pierde el foco).
 * columnas: [{clave, titulo, clase, ordenar?: fila → valor, celda: fila → nodo|texto, sinOrden?}]
 */
export class Tabla {
  constructor({ columnas, clave, orden = null, vacio = 'Sin datos.', claseFila = null, etiqueta = 'Tabla', firma = null }) {
    this.columnas = columnas;
    this.clave = clave;
    this.orden = orden || { clave: columnas.find((c) => c.ordenar)?.clave, desc: false };
    this.vacio = vacio;
    this.claseFila = claseFila;
    this.firma = firma || ((f) => JSON.stringify(f));
    this.filas = [];
    this.cuerpo = h('tbody');
    this.ths = new Map();
    const cab = h('tr');
    for (const c of columnas) {
      const th = h('th', { class: c.clase || null, scope: 'col' });
      if (c.ordenar && !c.sinOrden) {
        th.appendChild(h('button', { class: 'ordenar', type: 'button', on: { click: () => this.ordenarPor(c.clave) } },
          c.titulo, icono('abajo', { tam: 12, clase: 'flecha-orden' })));
      } else th.textContent = c.titulo;
      this.ths.set(c.clave, th);
      cab.appendChild(th);
    }
    this.tabla = h('table', { class: 'tabla', 'aria-label': etiqueta }, h('thead', null, cab), this.cuerpo);
    this.el = h('div', { class: 'tabla-caja' }, this.tabla);
    this._marcarOrden();
  }

  ordenarPor(clave) {
    if (this.orden.clave === clave) this.orden.desc = !this.orden.desc;
    else this.orden = { clave, desc: false };
    this._marcarOrden();
    this.poner(this.filas);
  }

  _marcarOrden() {
    for (const [k, th] of this.ths) {
      const si = k === this.orden.clave;
      atributo(th, 'aria-sort', si ? (this.orden.desc ? 'descending' : 'ascending') : null);
      const f = th.querySelector('.flecha-orden');
      if (f) f.style.transform = si && !this.orden.desc ? 'rotate(180deg)' : '';
    }
  }

  poner(filas) {
    this.filas = lista(filas);
    const col = this.columnas.find((c) => c.clave === this.orden.clave);
    const ordenadas = col?.ordenar ? ordenarPor(this.filas, col.ordenar, this.orden.desc) : this.filas;
    if (!ordenadas.length) {
      this.cuerpo.replaceChildren(h('tr', { class: 'tabla-vacia' }, h('td', { colspan: String(this.columnas.length) }, this.vacio)));
      return;
    }
    this.cuerpo.querySelector(':scope > .tabla-vacia')?.remove();
    const existentes = new Map();
    for (const tr of [...this.cuerpo.children]) existentes.set(tr.dataset.clave, tr);
    let previo = null;
    const vistos = new Set();
    for (const f of ordenadas) {
      const k = String(this.clave(f));
      if (vistos.has(k)) continue;
      vistos.add(k);
      let tr = existentes.get(k);
      const firma = this.firma(f);
      if (!tr) { tr = h('tr', { dataset: { clave: k } }); tr._firma = null; }
      if (tr._firma !== firma && !(tr.contains(document.activeElement) && tr._firma !== null && document.activeElement?.matches('input, select, textarea'))) {
        tr._firma = firma;
        tr.replaceChildren(...this.columnas.map((c) => {
          const v = c.celda ? c.celda(f) : f[c.clave];
          return h('td', { class: c.clase || null }, v === null || v === undefined || v === '' ? '—' : v);
        }));
      }
      tr.className = this.claseFila ? (this.claseFila(f) || '') : '';
      const esperado = previo ? previo.nextSibling : this.cuerpo.firstChild;
      if (tr !== esperado) this.cuerpo.insertBefore(tr, esperado);
      previo = tr;
    }
    for (const [k, tr] of existentes) if (!vistos.has(k)) tr.remove();
  }
}

/** Par etiqueta/valor actualizable: devuelve {el, valor(v), nota(t)}. */
export function dato(etiqueta, ico = null) {
  const v = h('div', { class: 'dato-valor' }, '—');
  const n = h('div', { class: 'dato-nota' });
  const el = h('div', { class: 'dato' }, h('div', { class: 'dato-etiqueta' }, ico ? icono(ico, { tam: 15 }) : null, etiqueta), v, n);
  return { el, valor: (x) => poner(v, x ?? '—'), nota: (x) => poner(n, x ?? ''), v, n };
}
