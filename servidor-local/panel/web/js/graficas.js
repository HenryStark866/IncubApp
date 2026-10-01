// Panel IncubApp · gráficas hechas a mano en SVG (sin librerías: el panel funciona sin internet).
//   GraficaLineas: ejes, cuadrícula, huecos donde no hay datos, zonas sombreadas (cortes),
//                  cruz y globo al pasar el mouse, y se re-dibuja al cambiar de tamaño.
//   miniGrafica:   línea pequeña para las tarjetas de Inicio.
//   medidor:       anillo de 0 a 100 (puntaje de seguridad).
import { h, s, num, fecha, hora, diaCorto, fechaHoraCorta, vaciar, esNum } from './util.js';

const PASOS_X = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800];

function pasoBonito(rango, objetivo = 4) {
  if (!(rango > 0)) return 1;
  const crudo = rango / objetivo;
  const mag = 10 ** Math.floor(Math.log10(crudo));
  const n = crudo / mag;
  const f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return f * mag;
}

/** Promedia por grupos para no dibujar más puntos que píxeles. Respeta los huecos (null). */
function reducir(t, series, maxPuntos) {
  const n = t.length;
  if (n <= maxPuntos) return { t, series };
  const tam = Math.ceil(n / maxPuntos);
  const t2 = [];
  const s2 = {};
  for (const k of Object.keys(series)) s2[k] = [];
  for (let i = 0; i < n; i += tam) {
    const fin = Math.min(n, i + tam);
    t2.push(t[Math.floor((i + fin - 1) / 2)]);
    for (const [k, vals] of Object.entries(series)) {
      let suma = 0, cuenta = 0, maximo = -Infinity;
      for (let j = i; j < fin; j++) {
        const v = vals[j];
        if (esNum(v)) { suma += v; cuenta++; if (v > maximo) maximo = v; }
      }
      s2[k].push(cuenta ? (cuenta < (fin - i) / 2 ? null : suma / cuenta) : null);
    }
  }
  return { t: t2, series: s2 };
}

let contadorIds = 0;

export class GraficaLineas {
  /**
   * series: [{clave, nombre, color?: 1..5}]
   * formato(v) → texto del valor; unidad para el eje.
   */
  constructor({ series, alto = 220, min = 0, max = null, formato = (v) => num(v, 1), etiqueta = 'Gráfica', area = true, maxFijo = false }) {
    this.def = series;
    this.alto = alto;
    this.min = min;
    this.max = max;
    this.maxFijo = maxFijo;
    this.formato = formato;
    this.etiqueta = etiqueta;
    this.area = area;
    this.datos = null;
    this.id = `g${++contadorIds}`;
    this.svg = s('svg', { class: 'grafica-svg', role: 'img', 'aria-label': etiqueta, height: alto });
    this.globo = h('div', { class: 'grafica-globo', hidden: true, 'aria-hidden': 'true' });
    this.leyenda = h('div', { class: 'grafica-leyenda' },
      series.length > 1 ? series.map((d, i) => h('span', { class: 'leyenda-item' }, h('span', { class: `muestra serie-${d.color || i + 1}` }), d.nombre)) : null);
    this.el = h('div', { class: 'grafica' }, this.leyenda, h('div', { class: 'grafica-lienzo', style: { height: `${alto}px` } }, this.svg, this.globo));
    this._ancho = 0;
    this._ro = new ResizeObserver(() => {
      const w = Math.floor(this.el.clientWidth);
      if (w && Math.abs(w - this._ancho) > 2) { this._ancho = w; this._pedirDibujo(); }
    });
    this._ro.observe(this.el);
  }

  /** datos: {t: [epoch s], series: {clave: [v|null]}, sombras: [{inicio, fin, texto}], desde?, hasta?} */
  poner(datos) {
    this.datos = datos;
    this._pedirDibujo();
  }

  _pedirDibujo() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._dibujar(); });
  }

  _dibujar() {
    const svg = this.svg;
    const W = this._ancho || Math.floor(this.el.clientWidth) || 600;
    const H = this.alto;
    svg.setAttribute('width', W);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    vaciar(svg);
    const d = this.datos;
    const t0 = Array.isArray(d?.t) ? d.t.map(Number) : [];
    const seriesCrudas = {};
    for (const def of this.def) {
      const v = d?.series?.[def.clave];
      seriesCrudas[def.clave] = Array.isArray(v) ? v.map((x) => (esNum(x) ? x : null)) : [];
    }
    const hayDatos = t0.length > 1 && this.def.some((def) => seriesCrudas[def.clave].some(esNum));
    if (!hayDatos) {
      svg.appendChild(s('text', { x: W / 2, y: H / 2, class: 'grafica-vacia', 'text-anchor': 'middle' }, 'Sin datos en este rango'));
      this._puntos = null;
      return;
    }
    const m = { izq: 48, der: 14, arr: 10, aba: 24 };
    const pw = Math.max(10, W - m.izq - m.der);
    const ph = Math.max(10, H - m.arr - m.aba);
    const { t, series } = reducir(t0, seriesCrudas, Math.max(40, Math.floor(pw / 2)));
    const tmin = esNum(d.desde) ? d.desde : t0[0];
    const tmax = esNum(d.hasta) ? d.hasta : t0[t0.length - 1];
    const span = Math.max(1, tmax - tmin);
    let vmax = -Infinity, vmin = Infinity;
    for (const vals of Object.values(series)) for (const v of vals) if (esNum(v)) { if (v > vmax) vmax = v; if (v < vmin) vmin = v; }
    let ymin = esNum(this.min) ? Math.min(this.min, vmin) : vmin;
    // maxFijo: el eje llega al menos a `max` (p. ej. 100 %); si no, se ajusta a los datos.
    let ymax = this.maxFijo && esNum(this.max) ? Math.max(this.max, vmax) : vmax * 1.08;
    if (!(ymax > ymin)) ymax = ymin + 1;
    const paso = pasoBonito(ymax - ymin, 4);
    ymax = Math.ceil(ymax / paso) * paso;
    ymin = Math.floor(ymin / paso) * paso;
    const X = (tt) => m.izq + ((tt - tmin) / span) * pw;
    const Y = (v) => m.arr + ph - ((v - ymin) / (ymax - ymin)) * ph;

    // sombras (cortes)
    const gSombras = s('g', { class: 'grafica-sombras' });
    for (const z of Array.isArray(d.sombras) ? d.sombras : []) {
      const a = Math.max(tmin, z.inicio), b = Math.min(tmax, z.fin ?? z.inicio);
      if (!(b >= a)) continue;
      const x1 = X(a), x2 = Math.max(X(b), x1 + 3);
      gSombras.appendChild(s('rect', { x: x1, y: m.arr, width: x2 - x1, height: ph, class: 'sombra-corte' }, z.texto ? s('title', null, z.texto) : null));
    }
    svg.appendChild(gSombras);

    // cuadrícula y eje Y
    const gEjes = s('g', { class: 'grafica-ejes' });
    for (let v = ymin; v <= ymax + paso / 1000; v += paso) {
      const y = Math.round(Y(v)) + 0.5;
      gEjes.appendChild(s('line', { x1: m.izq, x2: W - m.der, y1: y, y2: y, class: v === ymin ? 'eje' : 'reja' }));
      gEjes.appendChild(s('text', { x: m.izq - 8, y: y + 4, 'text-anchor': 'end', class: 'eje-texto' }, this.formato(v, true)));
    }
    // eje X (alineado a la hora local)
    const maxTicks = Math.max(2, Math.floor(pw / 90));
    const pasoX = PASOS_X.find((p) => span / p <= maxTicks) || 172800;
    const desfase = -new Date(tmin * 1000).getTimezoneOffset() * 60;
    let tick = Math.ceil((tmin + desfase) / pasoX) * pasoX - desfase;
    for (; tick <= tmax; tick += pasoX) {
      const x = Math.round(X(tick)) + 0.5;
      gEjes.appendChild(s('line', { x1: x, x2: x, y1: m.arr, y2: m.arr + ph, class: 'reja reja-v' }));
      const dt = new Date(tick * 1000);
      const medianoche = dt.getHours() === 0 && dt.getMinutes() === 0;
      const etiqueta = pasoX >= 86400 || (medianoche && span > 86400 / 2) ? diaCorto(dt) : hora(dt);
      gEjes.appendChild(s('text', { x, y: H - 6, 'text-anchor': 'middle', class: 'eje-texto' }, etiqueta));
    }
    svg.appendChild(gEjes);

    // series
    const gSeries = s('g', { class: 'grafica-series' });
    this.def.forEach((def, i) => {
      const vals = series[def.clave];
      const color = def.color || i + 1;
      let dLinea = '';
      let tramos = [];
      let tramo = [];
      for (let j = 0; j < t.length; j++) {
        const v = vals[j];
        if (esNum(v)) tramo.push([X(t[j]), Y(v)]);
        else if (tramo.length) { tramos.push(tramo); tramo = []; }
      }
      if (tramo.length) tramos.push(tramo);
      for (const tr of tramos) {
        dLinea += tr.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
        if (tr.length === 1) dLinea += `h0.1`;
        if (this.area && i === 0 && tr.length > 1) {
          const base = Y(Math.max(ymin, 0)).toFixed(1);
          const dA = `M${tr[0][0].toFixed(1)} ${base}` + tr.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + `L${tr[tr.length - 1][0].toFixed(1)} ${base}Z`;
          gSeries.appendChild(s('path', { d: dA, class: `area serie-${color}` }));
        }
      }
      gSeries.appendChild(s('path', { d: dLinea, class: `linea serie-${color}` }));
    });
    svg.appendChild(gSeries);

    // cruz y puntos al pasar el mouse
    this._cruz = s('line', { class: 'grafica-cruz', y1: m.arr, y2: m.arr + ph, x1: -10, x2: -10, visibility: 'hidden' });
    this._marcas = this.def.map((def, i) => s('circle', { r: 4, class: `marca serie-${def.color || i + 1}`, cx: -10, cy: -10, visibility: 'hidden' }));
    svg.appendChild(this._cruz);
    for (const mk of this._marcas) svg.appendChild(mk);
    const captura = s('rect', { x: m.izq, y: m.arr, width: pw, height: ph, class: 'grafica-captura' });
    svg.appendChild(captura);
    this._puntos = { t, series, X, Y, m, pw, W };
    captura.addEventListener('pointermove', (e) => this._mover(e));
    captura.addEventListener('pointerleave', () => this._ocultar());

    // resumen para lectores de pantalla
    const ultimo = this.def.map((def) => {
      const v = [...seriesCrudas[def.clave]].reverse().find(esNum);
      return `${def.nombre}: ${esNum(v) ? this.formato(v) : 'sin dato'}`;
    }).join('; ');
    svg.setAttribute('aria-label', `${this.etiqueta}. Último valor: ${ultimo}.`);
  }

  _mover(e) {
    const p = this._puntos;
    if (!p) return;
    const r = this.svg.getBoundingClientRect();
    const x = e.clientX - r.left;
    // búsqueda binaria del punto más cercano
    let lo = 0, hi = p.t.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.X(p.t[mid]) < x) lo = mid; else hi = mid; }
    const j = Math.abs(p.X(p.t[lo]) - x) <= Math.abs(p.X(p.t[hi]) - x) ? lo : hi;
    const cx = p.X(p.t[j]);
    this._cruz.setAttribute('x1', cx); this._cruz.setAttribute('x2', cx);
    this._cruz.setAttribute('visibility', 'visible');
    const filas = [h('div', { class: 'globo-hora' }, fechaHoraCorta(p.t[j]))];
    this.def.forEach((def, i) => {
      const v = p.series[def.clave][j];
      const mk = this._marcas[i];
      if (esNum(v)) {
        mk.setAttribute('cx', cx); mk.setAttribute('cy', p.Y(v)); mk.setAttribute('visibility', 'visible');
      } else mk.setAttribute('visibility', 'hidden');
      filas.push(h('div', { class: 'globo-fila' }, h('span', { class: `muestra serie-${def.color || i + 1}` }), h('span', { class: 'globo-nombre' }, def.nombre), h('strong', null, esNum(v) ? this.formato(v) : 'sin dato')));
    });
    vaciar(this.globo, filas);
    this.globo.hidden = false;
    const gw = this.globo.offsetWidth || 160;
    let gx = cx + 14;
    if (gx + gw > p.W - 4) gx = cx - gw - 14;
    this.globo.style.transform = `translate(${Math.max(0, gx)}px, ${p.m.arr + 6}px)`;
  }

  _ocultar() {
    if (this._cruz) this._cruz.setAttribute('visibility', 'hidden');
    for (const mk of this._marcas || []) mk.setAttribute('visibility', 'hidden');
    this.globo.hidden = true;
  }
}

/** Línea pequeña (sin ejes). valores: [n|null]. */
export function miniGrafica(valores, { alto = 44, color = 1, max = null, etiqueta = '' } = {}) {
  const W = 200;
  const vals = (Array.isArray(valores) ? valores : []).map((v) => (esNum(v) ? v : null));
  const svg = s('svg', { class: 'mini-grafica', viewBox: `0 0 ${W} ${alto}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': etiqueta, height: alto });
  const nums = vals.filter(esNum);
  if (nums.length < 2) {
    svg.appendChild(s('line', { x1: 0, x2: W, y1: alto - 1, y2: alto - 1, class: `mini-base` }));
    return svg;
  }
  const top = Math.max(max ?? 0, Math.max(...nums) * 1.1, 1);
  const n = vals.length;
  const X = (i) => (i / (n - 1)) * W;
  const Y = (v) => alto - 2 - (v / top) * (alto - 4);
  let dl = '', da = '';
  let abierto = false, inicio = 0, ultimoX = 0;
  vals.forEach((v, i) => {
    if (esNum(v)) {
      const x = X(i).toFixed(1), y = Y(v).toFixed(1);
      if (!abierto) { dl += `M${x} ${y}`; da += `M${x} ${alto}L${x} ${y}`; abierto = true; inicio = x; } else { dl += `L${x} ${y}`; da += `L${x} ${y}`; }
      ultimoX = x;
    } else if (abierto) { da += `L${ultimoX} ${alto}Z`; abierto = false; }
  });
  if (abierto) da += `L${ultimoX} ${alto}Z`;
  void inicio;
  svg.appendChild(s('path', { d: da, class: `area serie-${color}` }));
  svg.appendChild(s('path', { d: dl, class: `linea serie-${color}`, 'vector-effect': 'non-scaling-stroke' }));
  return svg;
}

/** Anillo de 0 a 100. */
export function medidor(valor, { tam = 148, grosor = 12, etiqueta = 'Puntaje', sufijo = 'de 100' } = {}) {
  const r = (tam - grosor) / 2 - 2;
  const c = tam / 2;
  const C = 2 * Math.PI * r;
  const arco = C * 0.75;
  const v = esNum(valor) ? Math.max(0, Math.min(100, valor)) : null;
  const nivel = v === null ? 'desconocido' : v >= 85 ? 'ok' : v >= 65 ? 'aviso' : 'falla';
  const svg = s('svg', { class: `medidor medidor-${nivel}`, viewBox: `0 0 ${tam} ${tam}`, width: tam, height: tam, role: 'img', 'aria-label': `${etiqueta}: ${v === null ? 'sin datos' : `${Math.round(v)} de 100`}` },
    s('circle', { cx: c, cy: c, r, class: 'medidor-fondo', 'stroke-width': grosor, 'stroke-dasharray': `${arco} ${C}`, transform: `rotate(135 ${c} ${c})` }),
    s('circle', { cx: c, cy: c, r, class: 'medidor-valor', 'stroke-width': grosor, 'stroke-dasharray': `${v === null ? 0 : (arco * v) / 100} ${C}`, transform: `rotate(135 ${c} ${c})` }),
    s('text', { x: c, y: c + tam * 0.06, 'text-anchor': 'middle', class: 'medidor-numero', 'font-size': tam * 0.27 }, v === null ? '—' : String(Math.round(v))),
    s('text', { x: c, y: c + tam * 0.22, 'text-anchor': 'middle', class: 'medidor-sufijo', 'font-size': Math.max(10, tam * 0.085) }, sufijo));
  return svg;
}
export const nivelPuntaje = (v) => (!esNum(v) ? 'desconocido' : v >= 85 ? 'ok' : v >= 65 ? 'aviso' : 'falla');

/** Convierte una lista de ISO en epoch s (para sombras de cortes). */
export function aEpoch(x) { const d = fecha(x); return d ? d.getTime() / 1000 : null; }
