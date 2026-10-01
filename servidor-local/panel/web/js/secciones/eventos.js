// Panel IncubApp · EVENTOS: línea de tiempo de los cambios de estado, agrupada por día, con
// filtro por componente, nivel y texto.
import { h, lista, obj, texto, vaciar, poner, hora, diaLargo, claveDia, debounce, bus } from '../util.js';
import { api, conParametros } from '../api.js';
import { icono } from '../iconos.js';
import { insigniaNivel, nivelValido, NIVELES, vacio, boton } from '../ui.js';
import { cabecera, cargarEn, periodico } from './comun.js';

export function crear() {
  let eventos = [];
  let fComp = '';
  let fNivel = '';
  let fTexto = '';
  const selComp = h('select', { class: 'entrada', id: 'ev-comp', 'aria-label': 'Componente' });
  const selNivel = h('select', { class: 'entrada', id: 'ev-nivel', 'aria-label': 'Nivel' },
    h('option', { value: '' }, 'Todos los niveles'),
    h('option', { value: 'problemas' }, 'Solo fallas y avisos'),
    ['falla', 'aviso', 'ok', 'apagado', 'desconocido'].map((n) => h('option', { value: n }, NIVELES[n].texto)));
  const inTexto = h('input', { class: 'entrada', type: 'search', placeholder: 'Buscar en los mensajes…', 'aria-label': 'Buscar en los eventos' });
  const resumen = h('span', { class: 'texto-2' });
  const caja = h('div', { class: 'linea-tiempo' });
  selComp.addEventListener('change', () => { fComp = selComp.value; pintar(); });
  selNivel.addEventListener('change', () => { fNivel = selNivel.value; pintar(); });
  inTexto.addEventListener('input', debounce(() => { fTexto = inTexto.value.trim().toLowerCase(); pintar(); }, 150));

  const el = h('div', { class: 'seccion' },
    cabecera('Eventos', 'eventos', 'Cada vez que un componente cambió de estado (se cayó, volvió, dio aviso). Lo más nuevo arriba.',
      boton('Actualizar', { icono: 'actualizar', clase: 'boton-chico', alPulsar: () => tCarga.ya() })),
    h('div', { class: 'barra-herramientas' },
      h('div', { class: 'campo', style: { flex: '0 1 260px' } }, h('label', { for: 'ev-comp' }, 'Componente'), selComp),
      h('div', { class: 'campo', style: { flex: '0 1 220px' } }, h('label', { for: 'ev-nivel' }, 'Nivel'), selNivel),
      h('div', { class: 'campo', style: { flex: '1 1 240px' } }, h('label', null, 'Buscar'), h('div', { class: 'entrada-buscar' }, icono('buscar', { tam: 16 }), inTexto)),
      h('span', { class: 'espacio' }), resumen),
    caja);

  function opcionesComp() {
    const mapa = new Map();
    for (const e of eventos) if (e.componente) mapa.set(e.componente, e.nombre || e.componente);
    const firma = [...mapa.keys()].sort().join(',');
    if (selComp.dataset.f === firma) return;
    selComp.dataset.f = firma;
    vaciar(selComp, h('option', { value: '' }, 'Todos los componentes'),
      [...mapa].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'es')).map(([id, n]) => h('option', { value: id, selected: id === fComp }, String(n))));
  }

  function pintar() {
    let es = eventos;
    if (fComp) es = es.filter((e) => e.componente === fComp);
    if (fNivel === 'problemas') es = es.filter((e) => e.nivel === 'falla' || e.nivel === 'aviso');
    else if (fNivel) es = es.filter((e) => nivelValido(e.nivel) === fNivel);
    if (fTexto) es = es.filter((e) => [e.mensaje, e.nombre, e.componente].some((x) => String(x ?? '').toLowerCase().includes(fTexto)));
    poner(resumen, `${es.length} de ${eventos.length} eventos`);
    if (!es.length) { vaciar(caja, vacio(eventos.length ? 'Ningún evento coincide con el filtro.' : 'Todavía no hay eventos registrados.', 'eventos')); return; }
    const dias = new Map();
    for (const e of es) { const k = claveDia(e.t); if (!dias.has(k)) dias.set(k, []); dias.get(k).push(e); }
    vaciar(caja, [...dias.values()].map((xs) => {
      const fallas = xs.filter((e) => e.nivel === 'falla').length;
      return h('section', { class: 'dia' },
        h('h2', { class: 'dia-titulo' }, diaLargo(xs[0].t), h('span', null, `${xs.length} evento${xs.length === 1 ? '' : 's'}${fallas ? ` · ${fallas} falla${fallas === 1 ? '' : 's'}` : ''}`)),
        h('ol', { class: 'eventos-dia' }, xs.map((e) => {
          const n = nivelValido(e.nivel);
          return h('li', { class: `evento nivel-${n}` },
            h('span', { class: 'evento-hora' }, hora(e.t)),
            insigniaNivel(n),
            h('div', { class: 'evento-cuerpo' },
              h('strong', null, texto(e.nombre, e.componente)),
              h('span', null, texto(e.mensaje, '')),
              e.antes ? h('span', { class: 'transicion' }, `${NIVELES[nivelValido(e.antes)].texto}`, icono('derecha', { tam: 12 }), `${NIVELES[n].texto}`) : null));
        })));
    }));
  }

  async function cargar() {
    const r = await api.get(conParametros('/api/eventos', { limite: 500 }), { timeout: 30000 });
    const nuevos = lista(r?.eventos).filter(obj);
    const firma = nuevos.length ? `${nuevos.length}|${nuevos[0].t}|${nuevos[0].componente}` : '0';
    if (caja.dataset.f === firma && !caja.querySelector('.bloque-error, .cargando')) return;
    caja.dataset.f = firma;
    eventos = nuevos;
    opcionesComp();
    pintar();
  }
  const tCarga = periodico(() => cargarEn(caja, cargar, { reintentar: () => tCarga.ya() }), 30000);
  bus.on('actualizar-todo', () => tCarga.ya());

  return { el, mostrar() { tCarga.iniciar(); }, ocultar() { tCarga.detener(); } };
}
