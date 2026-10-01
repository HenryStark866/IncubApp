// Panel IncubApp · CONSOLA DE TRABAJO: ventana flotante (no bloquea la pantalla) con la salida en
// vivo de un trabajo en segundo plano. Varias pueden estar abiertas; solo una queda expandida.
//   - consulta /api/trabajos/<id>?desde=<total_lineas> cada 1 s mientras está «corriendo»
//   - agrega solo las líneas nuevas; el auto-scroll se pausa si el usuario sube
//   - al terminar muestra el resultado legible y avisa por el bus ('trabajo-terminado')
//   - cerrar la consola NO detiene el trabajo (se sigue consultando hasta que termine)
import { h, poner, cronometro, bus, esNum, esperar, copiar } from './util.js';
import { api, conParametros } from './api.js';
import { icono } from './iconos.js';
import { aviso, avisoError, botonIcono, boton, confirmar } from './ui.js';
import { vistaResultado } from './resultados.js';

export const ESTADOS_TRABAJO = {
  corriendo: { texto: 'En curso', icono: 'cargando' },
  ok: { texto: 'Terminó bien', icono: 'ok' },
  error: { texto: 'Terminó con error', icono: 'falla' },
  cancelado: { texto: 'Cancelado', icono: 'apagado' },
};
const MAX_LINEAS_DOM = 6000;
const consolas = new Map();       // id → Consola
let accionesResultado = {};       // {abrirCarpeta, irA} (las pone app.js)

export function configurarConsolas(acc) { accionesResultado = acc || {}; }

function claseLinea(t) {
  if (/^\s*\$ /.test(t)) return 'l-cmd';
  if (/\b(error|errores|fatal|fall[oó]|falla|exception|traceback|denegado|rechaz)/i.test(t) && !/\b0 errores\b|sin errores/i.test(t)) return 'l-err';
  if (/\b(warn|warning|aviso|advertencia|cuidado)\b/i.test(t)) return 'l-warn';
  if (/^\s*(listo|ok\b|✓|resultado: ok)/i.test(t)) return 'l-ok';
  return null;
}

class Consola {
  constructor(t) {
    this.id = t.id;
    this.t = { ...t };
    this.total = 0;
    this.oyentes = [];
    this.cerrada = false;
    this.terminoAvisado = false;
    this.base = { seg: Number(t.segundos) || 0, en: Date.now() };
    this._armar();
    this._agregar(Array.isArray(t.lineas) ? t.lineas : [], t);
    this._pintar();
    if (t.estado === 'corriendo' || !t.estado) this._ciclo();
    else this._terminar();
  }

  _armar() {
    this.r = {};
    const r = this.r;
    r.estadoIco = h('span', { class: 'consola-estado-ico' });
    r.titulo = h('strong');
    r.estado = h('span');
    r.reloj = h('span', { class: 'num' });
    r.barra = h('span');
    r.progreso = h('div', { class: 'consola-progreso indeterminado' }, r.barra);
    r.salida = h('pre', { class: 'consola-salida', tabindex: '0', 'aria-label': 'Salida del trabajo', 'aria-live': 'off' });
    r.reanudar = boton('Ir al final', { icono: 'abajo', clase: 'boton-chico boton-primario consola-reanudar', alPulsar: () => this._alFinal() });
    r.reanudar.hidden = true;
    r.resultado = h('div', { class: 'consola-resultado', 'aria-live': 'polite' });
    r.cancelar = boton('Cancelar', { icono: 'stop', clase: 'boton-chico', alPulsar: () => this.cancelar() });
    r.copiar = boton('Copiar salida', { icono: 'copiar', clase: 'boton-chico boton-sutil', alPulsar: () => this._copiar() });
    r.btnMin = botonIcono('minimizar', 'Minimizar', { clase: 'boton-sutil boton-chico', alPulsar: () => this.alternar() });
    const cabeza = h('div', { class: 'consola-cabeza' },
      r.estadoIco,
      h('div', { class: 'consola-titulo' }, r.titulo, h('span', null, r.estado, h('span', { 'aria-hidden': 'true' }, '·'), r.reloj)),
      r.btnMin,
      botonIcono('cerrar', 'Cerrar esta consola (el trabajo sigue)', { clase: 'boton-sutil boton-chico', alPulsar: () => this.cerrar() }));
    cabeza.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.alternar(); });
    this.el = h('section', { class: 'consola', role: 'region', 'aria-label': 'Consola de trabajo' },
      cabeza, r.progreso,
      h('div', { class: 'consola-cuerpo' },
        h('div', { class: 'consola-pausa' }, r.salida, r.reanudar),
        r.resultado,
        h('div', { class: 'consola-pie' }, r.cancelar, h('span', { class: 'espacio' }), r.copiar)));
    this.pegado = true;
    r.salida.addEventListener('scroll', () => {
      const s = r.salida;
      this.pegado = s.scrollTop + s.clientHeight >= s.scrollHeight - 12;
      r.reanudar.hidden = this.pegado;
    });
  }

  _agregar(lineas, t) {
    if (!lineas.length && esNum(t?.total_lineas)) { this.total = Math.max(this.total, t.total_lineas); return; }
    const frag = document.createDocumentFragment();
    for (const l of lineas) {
      const txt = String(l ?? '');
      const c = claseLinea(txt);
      frag.appendChild(c ? h('span', { class: c }, `${txt}\n`) : document.createTextNode(`${txt}\n`));
    }
    const s = this.r.salida;
    s.appendChild(frag);
    while (s.childNodes.length > MAX_LINEAS_DOM) s.firstChild.remove();
    this.total = esNum(t?.total_lineas) ? t.total_lineas : this.total + lineas.length;
    if (this.pegado) s.scrollTop = s.scrollHeight;
  }

  _alFinal() { const s = this.r.salida; s.scrollTop = s.scrollHeight; this.pegado = true; this.r.reanudar.hidden = true; }

  _pintar() {
    const t = this.t;
    const est = ESTADOS_TRABAJO[t.estado] || { texto: t.estado || 'Desconocido', icono: 'desconocido' };
    this.el.className = `consola estado-${t.estado || 'corriendo'}${this.minimizada ? ' minimizada' : ''}`;
    if (this.r.estadoIco.dataset.ico !== est.icono) {
      this.r.estadoIco.dataset.ico = est.icono;
      this.r.estadoIco.replaceChildren(t.estado === 'corriendo' ? h('span', { class: 'girando' }, icono('cargando', { tam: 18 })) : icono(est.icono, { tam: 18 }));
    }
    poner(this.r.titulo, t.titulo || 'Trabajo');
    this.r.titulo.title = t.titulo || '';
    poner(this.r.estado, est.texto);
    this._reloj();
    const corriendo = t.estado === 'corriendo';
    this.r.cancelar.hidden = !corriendo;
    const p = esNum(t.progreso) ? Math.max(0, Math.min(1, t.progreso)) : null;
    this.r.progreso.hidden = !corriendo && t.estado !== undefined;
    this.r.progreso.classList.toggle('indeterminado', p === null && corriendo);
    this.r.barra.style.width = p === null ? '' : `${Math.round(p * 100)}%`;
    if (p !== null) this.r.progreso.setAttribute('aria-label', `Progreso ${Math.round(p * 100)} %`);
  }

  _reloj() {
    const t = this.t;
    const seg = t.estado === 'corriendo' ? this.base.seg + (Date.now() - this.base.en) / 1000 : Number(t.segundos) || this.base.seg;
    poner(this.r.reloj, cronometro(seg));
  }

  async _ciclo() {
    let fallos = 0;
    while (!this.finalizado) {
      await esperar(1000);
      try {
        const t = await api.get(conParametros(`/api/trabajos/${encodeURIComponent(this.id)}`, { desde: this.total }), { timeout: 15000 });
        fallos = 0;
        if (!t || typeof t !== 'object') continue;
        this._agregar(Array.isArray(t.lineas) ? t.lineas : [], t);
        const { lineas, ...resto } = t;
        void lineas;
        this.t = { ...this.t, ...resto };
        this.base = { seg: Number(t.segundos) || this.base.seg, en: Date.now() };
        this._pintar();
        if (t.estado && t.estado !== 'corriendo') { this._terminar(); return; }
      } catch (e) {
        if (e.estado === 401) return;
        if (e.estado === 404) {
          this.t.estado = 'error';
          this.t.error = 'El panel ya no tiene este trabajo (quizá se reinició el panel).';
          this._pintar();
          this._terminar();
          return;
        }
        fallos++;
        await esperar(Math.min(10000, 1000 * fallos));
      }
    }
  }

  _terminar() {
    this.finalizado = true;
    this._pintar();
    const nodo = vistaResultado(this.t, accionesResultado);
    this.r.resultado.replaceChildren(...(nodo ? [nodo] : []));
    if (this.terminoAvisado) return;
    this.terminoAvisado = true;
    for (const fn of this.oyentes) { try { fn(this.t); } catch (e) { console.error(e); } }
    bus.emit('trabajo-terminado', this.t);
    if (this.cerrada && this.avisoSilencioso) consolas.delete(this.id);
    else if (this.cerrada) {
      // la consola estaba cerrada: un aviso corto para que la persona sepa que terminó
      const tipo = this.t.estado === 'ok' ? 'ok' : this.t.estado === 'cancelado' ? 'info' : 'error';
      const el = aviso(`${this.t.titulo || 'Trabajo'}: ${(ESTADOS_TRABAJO[this.t.estado]?.texto || this.t.estado || '').toLowerCase()}.`, tipo, { duracion: 8000 });
      if (el) {
        el.style.cursor = 'pointer';
        el.title = 'Ver la consola de este trabajo';
        el.addEventListener('click', (ev) => { if (!ev.target.closest('button')) this.mostrar(); });
      }
      consolas.delete(this.id);
    }
  }

  async cancelar() {
    const ok = await confirmar({ titulo: 'Cancelar el trabajo', mensaje: `¿Cancelar «${this.t.titulo || 'este trabajo'}»?`, detalle: 'Lo que ya se hizo no se deshace; se detiene lo que falta.', peligro: 'medio', textoBoton: 'Sí, cancelar' });
    if (!ok) return;
    try {
      const r = await api.post(`/api/trabajos/${encodeURIComponent(this.id)}/cancelar`, {});
      aviso(r?.ok === false ? 'El trabajo ya había terminado.' : 'Se pidió cancelar el trabajo.', 'info');
    } catch (e) { avisoError(e, 'No se pudo cancelar'); }
  }

  async _copiar() {
    const ok = await copiar(this.r.salida.textContent || '');
    aviso(ok ? 'Salida copiada al portapapeles.' : 'No se pudo copiar.', ok ? 'ok' : 'error', { duracion: 3000 });
  }

  alternar() { if (this.minimizada) this.mostrar(); else this.minimizar(); }
  minimizar() {
    this.minimizada = true;
    this._pintar();
    this.r.btnMin.replaceChildren(icono('maximizar', { tam: 16 }));
    this.r.btnMin.setAttribute('aria-label', 'Expandir'); this.r.btnMin.title = 'Expandir';
  }
  mostrar() {
    for (const c of consolas.values()) if (c !== this && !c.minimizada) c.minimizar();
    this.minimizada = false;
    this.cerrada = false;
    this.avisoSilencioso = false;
    if (!consolas.has(this.id)) consolas.set(this.id, this);
    if (!this.el.isConnected) document.getElementById('consolas')?.appendChild(this.el);
    this._pintar();
    this.r.btnMin.replaceChildren(icono('minimizar', { tam: 16 }));
    this.r.btnMin.setAttribute('aria-label', 'Minimizar'); this.r.btnMin.title = 'Minimizar';
    if (this.pegado) requestAnimationFrame(() => this._alFinal());
  }
  cerrar() {
    this.cerrada = true;
    this.el.remove();
    if (this.finalizado) consolas.delete(this.id);
  }
}

// Reloj de las consolas en curso (un solo temporizador para todas).
setInterval(() => { for (const c of consolas.values()) if (c.t.estado === 'corriendo' && c.el.isConnected) c._reloj(); }, 1000);

/**
 * Abre (o trae al frente) la consola de un trabajo. `trabajo` puede ser el TRABAJO completo
 * (respuesta de un POST) o solo {id, titulo} (de la lista); en ese caso se carga desde 0.
 */
export async function abrirTrabajo(trabajo, { alTerminar = null, minimizada = false } = {}) {
  if (!trabajo || typeof trabajo.id !== 'string') return null;
  let c = consolas.get(trabajo.id);
  if (c) {
    if (alTerminar) { if (c.finalizado) alTerminar(c.t); else c.oyentes.push(alTerminar); }
    c.mostrar();
    return c;
  }
  let t = trabajo;
  if (!Array.isArray(t.lineas) || (t.desde ?? 0) !== 0) {
    try { t = await api.get(conParametros(`/api/trabajos/${encodeURIComponent(trabajo.id)}`, { desde: 0 })); } catch (e) { avisoError(e, 'No se pudo abrir el trabajo'); return null; }
    if (consolas.has(trabajo.id)) return abrirTrabajo(trabajo, { alTerminar, minimizada });
  }
  c = new Consola(t);
  if (alTerminar) { if (c.finalizado) alTerminar(c.t); else c.oyentes.push(alTerminar); }
  consolas.set(c.id, c);
  if (minimizada) { c.minimizar(); document.getElementById('consolas')?.appendChild(c.el); } else c.mostrar();
  return c;
}

/** Sigue un trabajo sin mostrar su consola (p. ej. auditorías automáticas); la crea cerrada. */
export function seguirTrabajo(trabajo, alTerminar = null) {
  if (!trabajo?.id) return;
  let c = consolas.get(trabajo.id);
  if (!c) {
    c = new Consola({ ...trabajo, lineas: [], total_lineas: 0 });
    c.cerrada = true;
    c.avisoSilencioso = true;
    consolas.set(c.id, c);
  }
  if (alTerminar) { if (c.finalizado) alTerminar(c.t); else c.oyentes.push(alTerminar); }
}

export const trabajoAbierto = (id) => consolas.has(id) && consolas.get(id).el.isConnected;
