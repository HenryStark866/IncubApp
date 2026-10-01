// Panel IncubApp · utilidades comunes de la interfaz.
//
// REGLA DE SEGURIDAD: muchos textos que se muestran vienen de fuentes que alguien de la red
// puede controlar (nombres de equipos, títulos de páginas de cámaras, registros, correos).
// Nunca se usa innerHTML/insertAdjacentHTML/outerHTML: todo el DOM se arma con h()/s(),
// que ponen el texto con textContent y no permiten atributos on* ni URLs que no sean http(s).

const SVGNS = 'http://www.w3.org/2000/svg';
const ATRIB_URL = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Devuelve la URL si es http(s) (o un ancla interna «#…»); si no, null. */
export function urlSegura(u) {
  if (typeof u !== 'string' || !u) return null;
  if (u.startsWith('#')) return u;
  try {
    const x = new URL(u, location.href);
    if (x.protocol === 'http:' || x.protocol === 'https:') return x.href;
  } catch { /* no es URL */ }
  return null;
}

function aplicar(el, attrs, esSvg) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') {
      if (esSvg) el.setAttribute('class', v); else el.className = v;
    } else if (k === 'text') {
      el.textContent = String(v);
    } else if (k === 'on') {
      for (const [ev, fn] of Object.entries(v)) if (fn) el.addEventListener(ev, fn);
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv);
    } else if (k === 'style') {
      for (const [sk, sv] of Object.entries(v)) if (sv !== null && sv !== undefined) el.style.setProperty(sk, String(sv));
    } else if (k === 'value' || k === 'checked' || k === 'selected') {
      // se aplican como propiedad al final (ver h)
    } else if (/^on/i.test(k)) {
      throw new Error(`Atributo prohibido: ${k} (use on: {evento: fn})`);
    } else if (ATRIB_URL.has(k)) {
      const seg = urlSegura(String(v));
      if (seg) el.setAttribute(k, seg);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

function agregar(el, hijos) {
  for (const hj of hijos) {
    if (hj === null || hj === undefined || hj === false || hj === true) continue;
    if (Array.isArray(hj)) agregar(el, hj);
    else if (hj instanceof Node) el.appendChild(hj);
    else el.appendChild(document.createTextNode(String(hj)));
  }
}

function esAtributos(x) {
  return x && typeof x === 'object' && !(x instanceof Node) && !Array.isArray(x);
}

/** h('div', {class: 'x', on: {click: fn}}, 'texto', otroNodo, [lista]) */
export function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  if (!esAtributos(attrs)) { if (attrs !== undefined) hijos.unshift(attrs); attrs = null; }
  if (attrs) aplicar(el, attrs, false);
  agregar(el, hijos);
  if (attrs) {
    if (attrs.value !== undefined && attrs.value !== null) el.value = attrs.value;
    if (attrs.checked !== undefined) el.checked = !!attrs.checked;
    if (attrs.selected !== undefined) el.selected = !!attrs.selected;
  }
  return el;
}

/** Igual que h() pero para elementos SVG. */
export function s(tag, attrs, ...hijos) {
  const el = document.createElementNS(SVGNS, tag);
  if (!esAtributos(attrs)) { if (attrs !== undefined) hijos.unshift(attrs); attrs = null; }
  if (attrs) aplicar(el, attrs, true);
  agregar(el, hijos);
  return el;
}

/** Cambia el texto solo si es distinto (evita trabajo y parpadeos). */
export function poner(el, texto) {
  const t = texto === null || texto === undefined ? '' : String(texto);
  if (el && el.textContent !== t) el.textContent = t;
}

/** Cambia un atributo solo si es distinto. null lo quita. */
export function atributo(el, k, v) {
  if (!el) return;
  if (v === null || v === undefined || v === false) { if (el.hasAttribute(k)) el.removeAttribute(k); return; }
  const t = v === true ? '' : String(v);
  if (el.getAttribute(k) !== t) el.setAttribute(k, t);
}

/** Reemplaza los hijos de un nodo. */
export function vaciar(el, ...hijos) {
  el.replaceChildren();
  agregar(el, hijos);
  return el;
}

/**
 * Actualiza una lista de nodos en su lugar, por clave: crea los nuevos, actualiza los que
 * siguen y quita los que ya no están, sin re-crear el DOM (no parpadea, no pierde el scroll
 * ni cierra los <details> que el usuario abrió).
 */
export function reconciliar(padre, items, clave, crear, actualizar) {
  const existentes = new Map();
  for (const n of [...padre.children]) {
    if (n.dataset && n.dataset.clave !== undefined) existentes.set(n.dataset.clave, n);
    else n.remove();
  }
  let previo = null;
  const vistos = new Set();
  for (const item of items) {
    const k = String(clave(item));
    if (vistos.has(k)) continue;
    vistos.add(k);
    let nodo = existentes.get(k);
    if (!nodo) { nodo = crear(item); nodo.dataset.clave = k; }
    if (actualizar) actualizar(nodo, item);
    const esperado = previo ? previo.nextSibling : padre.firstChild;
    if (nodo !== esperado) padre.insertBefore(nodo, esperado);
    previo = nodo;
  }
  for (const [k, n] of existentes) if (!vistos.has(k)) n.remove();
}

// ── Números y fechas (es-CO) ────────────────────────────────────────────────
const _nf = new Map();
function nf(dec) {
  if (!_nf.has(dec)) _nf.set(dec, new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec }));
  return _nf.get(dec);
}
export function esNum(n) { return typeof n === 'number' && Number.isFinite(n); }
export function num(n, dec = 0) { return esNum(n) ? nf(dec).format(n) : '—'; }
export function pct(n, dec = 0) { return esNum(n) ? `${nf(dec).format(n)} %` : '—'; }
export function ms(n) {
  if (!esNum(n)) return '—';
  return n >= 1000 ? `${nf(1).format(n / 1000)} s` : `${nf(n < 10 ? 1 : 0).format(n)} ms`;
}

/** MB → «434,6 MB» / «5,79 GB». */
export function tamanoMB(mb) {
  if (!esNum(mb)) return '—';
  if (mb >= 1024) return `${nf(mb >= 10240 ? 1 : 2).format(mb / 1024)} GB`;
  return `${nf(mb >= 100 ? 0 : 1).format(mb)} MB`;
}
export function tamanoGB(gb) { return esNum(gb) ? `${nf(gb >= 100 ? 0 : 1).format(gb)} GB` : '—'; }

/** Acepta texto ISO, epoch en segundos o en milisegundos, o Date. */
export function fecha(x) {
  if (x === null || x === undefined || x === '') return null;
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x;
  if (typeof x === 'number') return new Date(x < 1e12 ? x * 1000 : x);
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}

const fFechaHora = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fFechaHoraCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const fHora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const fHoraSeg = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const fDia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fDiaCorto = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
const fFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

export function fechaHora(x) { const d = fecha(x); return d ? fFechaHora.format(d) : '—'; }
export function fechaHoraCorta(x) {
  const d = fecha(x);
  if (!d) return '—';
  return mismoDia(d, new Date()) ? `hoy ${fHora.format(d)}` : fFechaHoraCorta.format(d);
}
export function soloFecha(x) { const d = fecha(x); return d ? fFecha.format(d) : '—'; }
export function hora(x, conSegundos = false) { const d = fecha(x); return d ? (conSegundos ? fHoraSeg : fHora).format(d) : '—'; }
export function diaCorto(x) { const d = fecha(x); return d ? fDiaCorto.format(d) : '—'; }
export function mismoDia(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
export function claveDia(x) { const d = fecha(x); return d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : 'sin-fecha'; }
export function diaLargo(x) {
  const d = fecha(x);
  if (!d) return 'Sin fecha';
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  const texto = fDia.format(d);
  if (mismoDia(d, hoy)) return `Hoy · ${texto}`;
  if (mismoDia(d, ayer)) return `Ayer · ${texto}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'always', style: 'short' });
/** «hace 2 min», «en 3 h». */
export function relativo(x) {
  const d = fecha(x);
  if (!d) return '—';
  const seg = (d.getTime() - Date.now()) / 1000;
  const a = Math.abs(seg);
  if (a < 30) return seg <= 0 ? 'hace un momento' : 'en un momento';
  if (a < 3600) return rtf.format(Math.round(seg / 60) || (seg < 0 ? -1 : 1), 'minute');
  if (a < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(seg / 86400), 'day');
  return fechaHora(d);
}
/** «desde hace 3 h». */
export function desdeHace(x) {
  const d = fecha(x);
  if (!d) return '';
  const r = relativo(d);
  return r.startsWith('hace') ? `desde ${r}` : `desde ${fechaHoraCorta(d)}`;
}

/** Segundos → «45 s», «3 min 20 s», «2 h 5 min», «3 d 4 h». */
export function duracion(seg) {
  if (!esNum(seg)) return '—';
  seg = Math.max(0, Math.round(seg));
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60), s_ = seg % 60;
  if (m < 60) return s_ ? `${m} min ${s_} s` : `${m} min`;
  const hh = Math.floor(m / 60), mm = m % 60;
  if (hh < 48) return mm ? `${hh} h ${mm} min` : `${hh} h`;
  const d = Math.floor(hh / 24), rh = hh % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}
/** Cronómetro «01:05» o «1:02:05». */
export function cronometro(seg) {
  if (!esNum(seg)) return '—';
  seg = Math.max(0, Math.floor(seg));
  const hh = Math.floor(seg / 3600), mm = Math.floor((seg % 3600) / 60), ss = seg % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

export function plural(n, uno, varios) { return `${num(n)} ${n === 1 ? uno : varios}`; }
export function texto(x, defecto = '—') {
  if (x === null || x === undefined || x === '') return defecto;
  return String(x);
}

// ── Preferencias locales (solo preferencias; siempre con try/catch) ─────────
export const prefs = {
  get(k, defecto) {
    try {
      const v = localStorage.getItem(`panel.${k}`);
      return v === null ? defecto : JSON.parse(v);
    } catch { return defecto; }
  },
  set(k, v) {
    try { localStorage.setItem(`panel.${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  },
};

// ── Pequeños ayudantes ──────────────────────────────────────────────────────
export function debounce(fn, ms_ = 300) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms_); };
}
export const esperar = (ms_) => new Promise((r) => setTimeout(r, ms_));

/** Bus de eventos muy simple entre módulos. */
const oyentes = new Map();
export const bus = {
  on(ev, fn) { if (!oyentes.has(ev)) oyentes.set(ev, new Set()); oyentes.get(ev).add(fn); return () => oyentes.get(ev)?.delete(fn); },
  emit(ev, dato) { for (const fn of oyentes.get(ev) || []) { try { fn(dato); } catch (e) { console.error(e); } } },
};

export function ordenarPor(lista, fn, desc = false) {
  const col = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  return [...lista].sort((a, b) => {
    const x = fn(a), y = fn(b);
    let r;
    if (x === null || x === undefined) r = (y === null || y === undefined) ? 0 : 1;
    else if (y === null || y === undefined) r = -1;
    else if (typeof x === 'number' && typeof y === 'number') r = x - y;
    else r = col.compare(String(x), String(y));
    return desc ? -r : r;
  });
}

export const lista = (x) => (Array.isArray(x) ? x : []);
export const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);

/** IPv4 estricta (para armar enlaces a equipos de la red sin confiar en otros textos). */
export function esIPv4(x) {
  if (typeof x !== 'string') return false;
  const m = x.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((p) => Number(p) <= 255);
}
export function esMAC(x) { return typeof x === 'string' && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(x); }

/** Copia texto al portapapeles (con plan B para cuando la API no está disponible). */
export async function copiar(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    const ta = h('textarea', { class: 'oculto-visual', 'aria-hidden': 'true' });
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
