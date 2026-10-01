// Panel IncubApp · REGISTROS: visor de registros (contenedores, vigilante, respaldo, panel…).
// Selector de fuente agrupado, cantidad de líneas, filtro, actualización automática cada 5 s,
// seguir el final, colores por gravedad, números de línea y copiar.
import { h, lista, obj, texto, vaciar, poner, debounce, prefs, hora, copiar } from '../util.js';
import { api, conParametros } from '../api.js';
import { icono } from '../iconos.js';
import { interruptor, boton, vacio, cargando, bloqueError, aviso } from '../ui.js';
import { cabecera, periodico } from './comun.js';

const RE_ERROR = /\b(error|err|fatal|panic|exception|traceback|critical|crit|failed|failure|fall[oó]|denied)\b|\[error\]|level=error|"level":"error"/i;
const RE_WARN = /\b(warn|warning|aviso|deprecated|unhealthy|timeout)\b|no responde|sin conexi[oó]n|se reinicia|se recrea|level=warn|"level":"warn"/i;

export function crear() {
  let fuentes = [];
  let fuente = prefs.get('registros.fuente', null);
  let lineasN = prefs.get('registros.lineas', 300);
  let filtro = '';
  let ultimas = null;
  let seguir = true;

  const selFuente = h('select', { class: 'entrada', id: 'reg-fuente', 'aria-label': 'Fuente del registro' });
  const selLineas = h('select', { class: 'entrada', id: 'reg-lineas', 'aria-label': 'Cantidad de líneas' },
    [100, 300, 1000, 3000].map((n) => h('option', { value: String(n), selected: n === lineasN }, `${n} líneas`)));
  const inFiltro = h('input', { class: 'entrada', type: 'search', placeholder: 'Filtrar (texto que deben tener las líneas)…', 'aria-label': 'Filtrar líneas', maxlength: '120' });
  const swAuto = interruptor({ etiqueta: 'Actualizar cada 5 s', valor: prefs.get('registros.auto', true), alCambiar: (v) => { prefs.set('registros.auto', v); if (v) tAuto.iniciar(false); else tAuto.detener(); } });
  const swSeguir = interruptor({ etiqueta: 'Seguir el final', valor: true, alCambiar: (v) => { seguir = v; if (v) alFinal(); } });
  const btnCopiar = boton('Copiar', { icono: 'copiar', clase: 'boton-chico', alPulsar: async () => {
    const t = (ultimas || []).join('\n');
    const ok = t && (await copiar(t));
    aviso(ok ? `Se copiaron ${ultimas.length} líneas.` : 'No hay nada que copiar.', ok ? 'ok' : 'info', { duracion: 3000 });
  } });
  const btnRecargar = boton('Actualizar', { icono: 'actualizar', clase: 'boton-chico', alPulsar: () => cargar() });
  const estadoTxt = h('div', { class: 'registros-estado', 'aria-live': 'polite' });
  const visor = h('div', { class: 'visor', tabindex: '0', role: 'log', 'aria-label': 'Líneas del registro' });

  const el = h('div', { class: 'seccion' },
    cabecera('Registros', 'registros', 'Lo que escriben los servicios y los scripts del servidor (las claves y contraseñas salen tachadas).'),
    h('div', { class: 'barra-herramientas' },
      h('div', { class: 'campo', style: { flex: '1 1 300px' } }, h('label', { for: 'reg-fuente' }, 'Fuente'), selFuente),
      h('div', { class: 'campo', style: { flex: '0 0 130px' } }, h('label', { for: 'reg-lineas' }, 'Cantidad'), selLineas),
      h('div', { class: 'campo', style: { flex: '1 1 240px' } }, h('label', null, 'Filtro'), h('div', { class: 'entrada-buscar' }, icono('filtro', { tam: 16 }), inFiltro))),
    h('div', { class: 'barra-herramientas' }, swAuto, swSeguir, h('span', { class: 'espacio' }), estadoTxt, btnRecargar, btnCopiar),
    visor);

  selFuente.addEventListener('change', () => { fuente = selFuente.value; prefs.set('registros.fuente', fuente); ultimas = null; vaciar(visor, cargando()); cargar(); });
  selLineas.addEventListener('change', () => { lineasN = Number(selLineas.value) || 300; prefs.set('registros.lineas', lineasN); cargar(); });
  inFiltro.addEventListener('input', debounce(() => { filtro = inFiltro.value.trim(); ultimas = null; cargar(); }, 400));
  visor.addEventListener('scroll', () => {
    const pegado = visor.scrollTop + visor.clientHeight >= visor.scrollHeight - 16;
    if (!pegado && seguir) { seguir = false; swSeguir.poner(false); }
    else if (pegado && !seguir) { seguir = true; swSeguir.poner(true); }
  });

  function alFinal() { visor.scrollTop = visor.scrollHeight; }

  async function cargarFuentes() {
    const r = await api.get('/api/registros/fuentes', { timeout: 20000 });
    fuentes = lista(r?.fuentes).filter((f) => obj(f) && typeof f.id === 'string');
    const grupos = new Map();
    for (const f of fuentes) { const g = f.grupo || 'Otros'; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(f); }
    if (!fuentes.some((f) => f.id === fuente)) fuente = (fuentes.find((f) => f.id === 'vigilante') || fuentes[0])?.id || null;
    vaciar(selFuente, [...grupos].map(([g, fs]) => h('optgroup', { label: g }, fs.map((f) => h('option', { value: f.id, selected: f.id === fuente }, texto(f.nombre, f.id))))));
  }

  let pidiendo = false;
  async function cargar() {
    if (!fuente || pidiendo) return;
    pidiendo = true;
    try {
      const r = await api.get(conParametros('/api/registros', { fuente, lineas: lineasN, filtro: filtro || null }), { timeout: 30000 });
      const ls = lista(r?.lineas).map((x) => String(x ?? ''));
      pintar(ls);
      poner(estadoTxt, `${texto(r?.nombre, fuente)} · ${ls.length} líneas${filtro ? ' con el filtro' : ''} · leído ${hora(r?.generado || new Date(), true)}`);
    } catch (e) {
      if (e.estado === 401) return;
      if (e.estado === 0 && ultimas) { poner(estadoTxt, 'Sin conexión: se muestran las últimas líneas leídas.'); return; }
      ultimas = null;
      vaciar(visor, bloqueError(e.message, () => cargar()));
      poner(estadoTxt, '');
    } finally { pidiendo = false; }
  }

  function pintar(ls) {
    if (ultimas && ultimas.length === ls.length && ultimas[0] === ls[0] && ultimas[ls.length - 1] === ls[ls.length - 1]) return;   // sin cambios
    ultimas = ls;
    const arriba = visor.scrollTop;
    if (!ls.length) { vaciar(visor, vacio(filtro ? 'Ninguna línea tiene ese texto.' : 'El registro está vacío.')); return; }
    const frag = document.createDocumentFragment();
    const f = filtro.toLowerCase();
    ls.forEach((l, i) => {
      const g = RE_ERROR.test(l) ? 'g-error' : RE_WARN.test(l) ? 'g-warn' : '';
      const txt = h('span', { class: 'visor-texto' });
      if (f && l.toLowerCase().includes(f)) {
        // resaltar coincidencias (con nodos de texto; nunca HTML)
        let pos = 0;
        const bajo = l.toLowerCase();
        for (let k = bajo.indexOf(f); k >= 0; k = bajo.indexOf(f, pos)) {
          if (k > pos) txt.appendChild(document.createTextNode(l.slice(pos, k)));
          txt.appendChild(h('mark', null, l.slice(k, k + f.length)));
          pos = k + f.length;
        }
        if (pos < l.length) txt.appendChild(document.createTextNode(l.slice(pos)));
      } else txt.textContent = l || ' ';
      frag.appendChild(h('div', { class: `visor-linea ${g}`.trim() }, h('span', { class: 'visor-num', 'aria-hidden': 'true' }, String(i + 1)), txt));
    });
    visor.replaceChildren(frag);
    if (seguir) alFinal(); else visor.scrollTop = arriba;
  }

  const tAuto = periodico(() => cargar(), 5000);
  let listo = false;

  return {
    el,
    async mostrar(op = {}) {
      if (!listo) {
        vaciar(visor, cargando('Cargando las fuentes…'));
        try { await cargarFuentes(); listo = true; } catch (e) { if (e.estado !== 401) vaciar(visor, bloqueError(e.message, () => this.mostrar(op))); return; }
      }
      if (op.fuente && op.fuente !== fuente) {
        if (!fuentes.some((x) => x.id === op.fuente)) {
          try { await cargarFuentes(); } catch { /* sigue con las que hay */ }
        }
        if (fuentes.some((x) => x.id === op.fuente)) { fuente = op.fuente; selFuente.value = fuente; prefs.set('registros.fuente', fuente); ultimas = null; vaciar(visor, cargando()); seguir = true; swSeguir.poner(true); }
        else aviso(`No hay registro para «${op.fuente.replace(/^contenedor:/, '')}».`, 'info');
      }
      await cargar();
      if (swAuto.valor()) tAuto.iniciar(false);
    },
    ocultar() { tAuto.detener(); },
  };
}
