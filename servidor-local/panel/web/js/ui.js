// Panel IncubApp · piezas de interfaz reutilizables: avisos (toasts), diálogos,
// insignias de nivel y severidad, pestañas, interruptores y bloques de estado.
import { h, poner, atributo } from './util.js';
import { icono } from './iconos.js';

// ── Niveles y severidades (nunca solo color: ícono + texto) ─────────────────
export const NIVELES = {
  ok: { texto: 'Funciona', icono: 'ok', orden: 3 },
  aviso: { texto: 'Aviso', icono: 'aviso', orden: 1 },
  falla: { texto: 'Falla', icono: 'falla', orden: 0 },
  apagado: { texto: 'Apagado', icono: 'apagado', orden: 4 },
  desconocido: { texto: 'Sin datos', icono: 'desconocido', orden: 2 },
};
export const nivelValido = (n) => (Object.prototype.hasOwnProperty.call(NIVELES, n) ? n : 'desconocido');

export const SEVERIDADES = {
  critico: { texto: 'Crítico', icono: 'critico', orden: 0 },
  alto: { texto: 'Alto', icono: 'alto', orden: 1 },
  medio: { texto: 'Medio', icono: 'medio', orden: 2 },
  bajo: { texto: 'Bajo', icono: 'bajo', orden: 3 },
  info: { texto: 'Info', icono: 'info', orden: 4 },
  ok: { texto: 'Bien', icono: 'ok', orden: 5 },
};
export const severidadValida = (s) => {
  if (Object.prototype.hasOwnProperty.call(SEVERIDADES, s)) return s;
  // tolerancia: algunos módulos podrían usar niveles de estado
  return ({ falla: 'alto', aviso: 'medio', desconocido: 'info', apagado: 'info' })[s] || 'info';
};
export const PELIGROS = { bajo: 'Riesgo bajo', medio: 'Riesgo medio', alto: 'Riesgo alto' };

export function insigniaNivel(nivel, texto = null) {
  const n = nivelValido(nivel);
  const el = h('span', { class: `insignia nivel-${n}`, dataset: { nivel: n } }, icono(NIVELES[n].icono, { tam: 14 }), h('span', { class: 'insignia-texto' }, texto ?? NIVELES[n].texto));
  return el;
}
/** Actualiza una insignia de nivel creada con insigniaNivel (sin re-crear si no cambió). */
export function ponerNivel(el, nivel, texto = null) {
  const n = nivelValido(nivel);
  if (el.dataset.nivel !== n) {
    el.dataset.nivel = n;
    el.className = `insignia nivel-${n}`;
    el.firstChild.replaceWith(icono(NIVELES[n].icono, { tam: 14 }));
  }
  poner(el.lastChild, texto ?? NIVELES[n].texto);
}

export function insigniaSeveridad(sev, texto = null) {
  const s = severidadValida(sev);
  return h('span', { class: `insignia sev-${s}`, dataset: { sev: s } }, icono(SEVERIDADES[s].icono, { tam: 14 }), h('span', { class: 'insignia-texto' }, texto ?? SEVERIDADES[s].texto));
}

export function insigniaPeligro(peligro) {
  const p = ['bajo', 'medio', 'alto'].includes(peligro) ? peligro : 'bajo';
  const sev = { bajo: 'info', medio: 'medio', alto: 'alto' }[p];
  return h('span', { class: `insignia sev-${sev} insignia-peligro` }, icono(p === 'alto' ? 'aviso' : p === 'medio' ? 'medio' : 'info', { tam: 14 }), h('span', { class: 'insignia-texto' }, PELIGROS[p]));
}

export function chip(texto, clase = '') { return h('span', { class: `chip ${clase}`.trim() }, texto); }

// ── Avisos (toasts) ────────────────────────────────────────────────────────
const ICONO_AVISO = { error: 'falla', ok: 'ok', info: 'info', aviso: 'aviso' };
export function aviso(mensaje, tipo = 'error', { duracion = null, titulo = null } = {}) {
  const raiz = document.getElementById('avisos');
  if (!raiz) return;
  const dur = duracion ?? (tipo === 'error' ? 9000 : 5000);
  const cerrarBtn = h('button', { class: 'boton-icono boton-sutil', type: 'button', 'aria-label': 'Cerrar aviso' }, icono('cerrar', { tam: 16 }));
  const el = h('div', { class: `aviso aviso-${tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    h('span', { class: 'aviso-ico' }, icono(ICONO_AVISO[tipo] || 'info', { tam: 20 })),
    h('div', { class: 'aviso-texto' }, titulo ? h('strong', null, titulo) : null, h('span', null, String(mensaje ?? ''))),
    cerrarBtn);
  const quitar = () => { el.classList.add('saliendo'); setTimeout(() => el.remove(), 200); };
  cerrarBtn.addEventListener('click', quitar);
  raiz.appendChild(el);
  while (raiz.children.length > 5) raiz.firstChild.remove();
  if (dur > 0) {
    let t = setTimeout(quitar, dur);
    el.addEventListener('mouseenter', () => clearTimeout(t));
    el.addEventListener('mouseleave', () => { t = setTimeout(quitar, 3000); });
  }
  return el;
}

/** Muestra el error de una llamada a la API como aviso (salvo 401, que tiene su pantalla). */
export function avisoError(e, prefijo = null) {
  if (e && e.estado === 401) return;
  const msj = (e && e.message) || 'Algo salió mal.';
  aviso(prefijo ? `${prefijo}: ${msj}` : msj, 'error');
}

// ── Diálogos ───────────────────────────────────────────────────────────────
/**
 * Diálogo modal accesible (<dialog>). Devuelve una promesa con el valor del botón pulsado
 * (o null si se cancela con Esc / Cancelar).
 *   cuerpo: nodos a mostrar; validar(valorBoton) → mensaje de error o null.
 */
export function dialogo({ titulo, icono: ico = null, clase = '', cuerpo = [], botones = [], validar = null, ancho = null, alAbrir = null }) {
  return new Promise((resolver) => {
    const error = h('p', { class: 'dialogo-error', role: 'alert', hidden: true });
    const pie = h('div', { class: 'dialogo-pie' });
    const idTitulo = `dlg-${Math.random().toString(36).slice(2)}`;
    const form = h('form', { method: 'dialog', class: 'dialogo-form', novalidate: true },
      h('header', { class: 'dialogo-cabeza' },
        ico ? h('span', { class: 'dialogo-ico' }, icono(ico, { tam: 22 })) : null,
        h('h2', { id: idTitulo }, titulo),
        h('button', { class: 'boton-icono boton-sutil', type: 'button', value: '', 'aria-label': 'Cerrar', dataset: { cancelar: '1' } }, icono('cerrar', { tam: 18 }))),
      h('div', { class: 'dialogo-cuerpo' }, cuerpo, error),
      pie);
    for (const b of botones) {
      pie.appendChild(h('button', {
        class: `boton ${b.clase || ''}`.trim(), type: b.valor === null ? 'button' : 'submit',
        value: b.valor ?? '', dataset: b.valor === null ? { cancelar: '1' } : null, disabled: b.deshabilitado || null,
      }, b.icono ? icono(b.icono, { tam: 16 }) : null, h('span', null, b.texto)));
    }
    const dlg = h('dialog', { class: `dialogo ${clase}`.trim(), 'aria-labelledby': idTitulo, style: ancho ? { width: ancho } : null }, form);
    // Se termina en el mismo instante (sin esperar el evento «close», que el navegador puede
    // demorar si la ventana está en segundo plano): se cierra, se quita y se resuelve una sola vez.
    let terminado = false;
    const terminar = (v) => {
      if (terminado) return;
      terminado = true;
      try { if (dlg.open) dlg.close(); } catch { /* ya cerrado */ }
      dlg.remove();
      resolver(v);
    };
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cancelar]');
      if (b) { e.preventDefault(); terminar(null); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.submitter ? e.submitter.value : (botones.find((b) => b.valor !== null)?.valor ?? '');
      const msj = validar ? validar(v, form) : null;
      if (msj) { error.textContent = msj; error.hidden = false; return; }
      terminar(v);
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); });   // tecla Esc
    dlg.addEventListener('close', () => terminar(null));
    document.body.appendChild(dlg);
    dlg.showModal();
    if (alAbrir) alAbrir(dlg, form);
    // foco en el primer campo o en el botón principal (no en la X)
    const primero = form.querySelector('.dialogo-cuerpo input, .dialogo-cuerpo select, .dialogo-cuerpo textarea') || pie.querySelector('.boton-primario, .boton-peligro');
    if (primero) primero.focus();
  });
}

/**
 * Confirmación. peligro 'alto' → botón rojo y casilla «Entiendo lo que va a pasar».
 * Devuelve true/false.
 */
export async function confirmar({ titulo, mensaje, detalle = null, peligro = 'medio', textoBoton = 'Confirmar', admin = false, extra = null }) {
  const alto = peligro === 'alto';
  const casilla = alto ? h('input', { type: 'checkbox', id: 'dlg-entiendo' }) : null;
  const cuerpo = [
    mensaje ? h('p', { class: 'dialogo-mensaje' }, mensaje) : null,
    detalle ? (Array.isArray(detalle) ? h('ul', { class: 'dialogo-lista' }, detalle.map((d) => h('li', null, d))) : h('p', { class: 'texto-2' }, detalle)) : null,
    extra,
    admin ? h('p', { class: 'nota nota-admin' }, icono('escudo', { tam: 16 }), h('span', null, 'Windows va a pedir permiso de administrador en esta pantalla: pulse «Sí» en el aviso de Windows.')) : null,
    alto ? h('label', { class: 'casilla-entiendo', for: 'dlg-entiendo' }, casilla, h('span', null, 'Entiendo lo que va a pasar')) : null,
  ];
  const r = await dialogo({
    titulo, icono: alto ? 'aviso' : 'info_c', clase: alto ? 'dialogo-peligro' : '',
    cuerpo,
    botones: [
      { texto: 'Cancelar', valor: null, clase: 'boton-sutil' },
      { texto: textoBoton, valor: 'si', clase: alto ? 'boton-peligro' : 'boton-primario' },
    ],
    validar: () => (alto && !casilla.checked ? 'Marque «Entiendo lo que va a pasar» para continuar.' : null),
  });
  return r === 'si';
}

// ── Pestañas accesibles ───────────────────────────────────────────────────
/**
 * items: [{id, titulo, icono?}] → {lista, paneles: Map, activar(id), activa(), contador(id, n)}
 */
export function pestanas({ etiqueta, items, activa = null, alCambiar = null, clase = '' }) {
  const lista = h('div', { class: `pestanas ${clase}`.trim(), role: 'tablist', 'aria-label': etiqueta });
  const paneles = new Map();
  const botones = new Map();
  const base = `tab-${Math.random().toString(36).slice(2, 8)}`;
  let actual = activa || items[0]?.id;
  for (const it of items) {
    const contador = h('span', { class: 'pestana-contador', hidden: true });
    const b = h('button', {
      class: 'pestana', type: 'button', role: 'tab', id: `${base}-${it.id}`, 'aria-controls': `${base}-p-${it.id}`,
      dataset: { id: it.id },
    }, it.icono ? icono(it.icono, { tam: 16 }) : null, h('span', null, it.titulo), contador);
    b._contador = contador;
    botones.set(it.id, b);
    lista.appendChild(b);
    paneles.set(it.id, h('div', { class: 'pestana-panel', role: 'tabpanel', id: `${base}-p-${it.id}`, 'aria-labelledby': `${base}-${it.id}`, tabindex: '0' }));
  }
  function activar(id, enfocar = false) {
    if (!botones.has(id)) id = items[0]?.id;
    actual = id;
    for (const [k, b] of botones) {
      const si = k === id;
      atributo(b, 'aria-selected', si ? 'true' : 'false');
      b.tabIndex = si ? 0 : -1;
      paneles.get(k).hidden = !si;
    }
    if (enfocar) botones.get(id).focus();
    if (alCambiar) alCambiar(id);
  }
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[role=tab]');
    if (b && b.dataset.id !== actual) activar(b.dataset.id);
  });
  lista.addEventListener('keydown', (e) => {
    const ids = items.map((i) => i.id);
    let i = ids.indexOf(actual);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ids.length - 1;
    else return;
    e.preventDefault();
    activar(ids[i], true);
  });
  // estado inicial sin disparar alCambiar
  for (const [k, b] of botones) {
    const si = k === actual;
    b.setAttribute('aria-selected', si ? 'true' : 'false');
    b.tabIndex = si ? 0 : -1;
    paneles.get(k).hidden = !si;
  }
  return {
    lista, paneles, activar, activa: () => actual,
    contador(id, n, clase_ = '') {
      const c = botones.get(id)?._contador;
      if (!c) return;
      c.hidden = !n;
      c.className = `pestana-contador ${clase_}`.trim();
      poner(c, n ? String(n) : '');
    },
  };
}

/** Control segmentado (p. ej. rangos 1 h / 6 h / 24 h / 7 d). */
export function segmentado({ etiqueta, opciones, valor, alCambiar }) {
  const el = h('div', { class: 'segmentado', role: 'group', 'aria-label': etiqueta });
  for (const o of opciones) {
    el.appendChild(h('button', { type: 'button', class: 'segmento', dataset: { valor: String(o.valor) }, 'aria-pressed': String(String(o.valor) === String(valor)) }, o.texto));
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.segmento');
    if (!b) return;
    for (const x of el.children) x.setAttribute('aria-pressed', String(x === b));
    alCambiar(b.dataset.valor);
  });
  el.poner = (v) => { for (const x of el.children) x.setAttribute('aria-pressed', String(x.dataset.valor === String(v))); };
  return el;
}

/** Interruptor accesible (role=switch). */
export function interruptor({ etiqueta, valor = false, alCambiar = null, deshabilitado = false, oculto = false }) {
  const b = h('button', { type: 'button', role: 'switch', class: 'interruptor', 'aria-checked': String(!!valor), 'aria-label': oculto ? etiqueta : null, disabled: deshabilitado || null },
    h('span', { class: 'interruptor-pista' }, h('span', { class: 'interruptor-bola' })),
    oculto ? null : h('span', { class: 'interruptor-texto' }, etiqueta));
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    if (alCambiar) alCambiar(v, b);
  });
  b.valor = () => b.getAttribute('aria-checked') === 'true';
  b.poner = (v) => b.setAttribute('aria-checked', String(!!v));
  return b;
}

// ── Bloques de estado ─────────────────────────────────────────────────────
export function vacio(texto = 'Sin datos', ico = 'info_c') {
  return h('div', { class: 'vacio' }, icono(ico, { tam: 22 }), h('span', null, texto));
}
export function cargando(texto = 'Cargando…') {
  return h('div', { class: 'cargando', role: 'status' }, h('span', { class: 'girando' }, icono('cargando', { tam: 18 })), h('span', null, texto));
}
export function bloqueError(mensaje, reintentar = null) {
  return h('div', { class: 'bloque-error', role: 'alert' },
    icono('aviso', { tam: 20 }),
    h('div', null, h('strong', null, 'No se pudo cargar esta parte'), h('span', null, mensaje || 'Error desconocido.')),
    reintentar ? h('button', { class: 'boton boton-sutil boton-chico', type: 'button', on: { click: reintentar } }, icono('actualizar', { tam: 14 }), h('span', null, 'Reintentar')) : null);
}

/** Botón estándar. */
export function boton(textoBoton, { icono: ico = null, clase = '', titulo = null, alPulsar = null, tipo = 'button', deshabilitado = false, dataset = null } = {}) {
  return h('button', { class: `boton ${clase}`.trim(), type: tipo, title: titulo, disabled: deshabilitado || null, dataset, on: alPulsar ? { click: alPulsar } : null },
    ico ? icono(ico, { tam: 16 }) : null, textoBoton ? h('span', null, textoBoton) : null);
}
export function botonIcono(ico, etiqueta, { clase = '', alPulsar = null, dataset = null, deshabilitado = false } = {}) {
  return h('button', { class: `boton-icono ${clase}`.trim(), type: 'button', 'aria-label': etiqueta, title: etiqueta, dataset, disabled: deshabilitado || null, on: alPulsar ? { click: alPulsar } : null }, icono(ico, { tam: 16 }));
}

/** Tarjeta con título. */
export function tarjeta({ titulo = null, icono: ico = null, acciones = null, clase = '', cuerpo = [] , subtitulo = null}) {
  return h('section', { class: `tarjeta ${clase}`.trim() },
    titulo ? h('header', { class: 'tarjeta-cabeza' },
      h('h3', { class: 'tarjeta-titulo' }, ico ? icono(ico, { tam: 18 }) : null, h('span', null, titulo)),
      subtitulo ? h('span', { class: 'tarjeta-sub' }, subtitulo) : null,
      acciones ? h('div', { class: 'tarjeta-acciones' }, acciones) : null) : null,
    cuerpo);
}

/** Medidor: barra horizontal con porcentaje (0-100). */
export function barra(pct_, { nivel = null, etiqueta = null } = {}) {
  const v = Number.isFinite(pct_) ? Math.max(0, Math.min(100, pct_)) : 0;
  const n = nivel || (v >= 90 ? 'falla' : v >= 75 ? 'aviso' : 'ok');
  const el = h('div', { class: `barra barra-${n}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(v)), 'aria-label': etiqueta },
    h('span', { class: 'barra-relleno', style: { width: `${v}%` } }));
  return el;
}
export function ponerBarra(el, pct_, nivel = null) {
  const v = Number.isFinite(pct_) ? Math.max(0, Math.min(100, pct_)) : 0;
  const n = nivel || (v >= 90 ? 'falla' : v >= 75 ? 'aviso' : 'ok');
  el.className = `barra barra-${n}`;
  el.setAttribute('aria-valuenow', String(Math.round(v)));
  el.firstChild.style.width = `${v}%`;
}
