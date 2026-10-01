// Panel IncubApp · lanzar acciones del catálogo (GET /api/acciones) con su formulario de
// parámetros y su confirmación, y abrir su consola de trabajo.
import { h, lista, texto, bus } from './util.js';
import { api } from './api.js';
import { icono } from './iconos.js';
import { aviso, avisoError, dialogo, insigniaPeligro, chip } from './ui.js';
import { obtenerCatalogo, accion as accionDe, contenedores } from './datos.js';
import { abrirTrabajo } from './consola.js';

export const ICONO_ACCION = {
  revisar_todo: 'buscar', arranque_completo: 'play', arrancar_servidor: 'encender', reiniciar_contenedor: 'reiniciar',
  detener_contenedor: 'stop', encender_contenedor: 'play', reiniciar_app: 'app', reiniciar_supabase: 'base', recrear_tunel: 'tunel',
  respaldo_ahora: 'respaldo', actualizar_app: 'descargar', probar_correo: 'correo', studio_encender: 'studio', studio_apagar: 'studio',
  reiniciar_wsl: 'wsl', limpiar_docker: 'basura', diagnostico_red_wsl: 'red', estado_docker: 'docker', reporte_soporte: 'reporte', abrir: 'externo',
};
export const iconoAccion = (id) => ICONO_ACCION[id] || 'soporte';

export const DESTINOS = [
  { id: 'app_local', texto: 'App (en este equipo)', icono: 'app' },
  { id: 'publico', texto: 'App pública', icono: 'publico' },
  { id: 'studio', texto: 'Supabase Studio', icono: 'studio' },
  { id: 'n8n', texto: 'n8n', icono: 'n8n' },
  { id: 'carpeta_registros', texto: 'Carpeta de registros', icono: 'carpeta' },
  { id: 'carpeta_respaldos', texto: 'Carpeta de respaldos', icono: 'respaldo' },
  { id: 'carpeta_reportes', texto: 'Carpeta de reportes', icono: 'reporte' },
];

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
/** Acciones que solo leen/consultan: se ejecutan sin diálogo. */
const SOLO_CONSULTA = new Set(['estado_docker', 'diagnostico_red_wsl', 'reporte_soporte', 'abrir']);

/** Abre un destino (app, carpeta…) con la acción 'abrir' del backend. */
export async function abrirDestino(destino) {
  const d = DESTINOS.find((x) => x.id === destino);
  try {
    const r = await api.post('/api/acciones/abrir', { parametros: { destino } });
    aviso(`Abriendo ${d ? d.texto.toLowerCase() : destino}…`, 'info', { duracion: 3000 });
    // si el backend lo lanzó como trabajo, revisar en un momento si falló
    const t = r?.trabajo;
    if (t?.id) {
      setTimeout(async () => {
        try {
          const x = await api.get(`/api/trabajos/${encodeURIComponent(t.id)}?desde=0`);
          if (x?.estado === 'error') aviso(x.error || 'No se pudo abrir.', 'error');
        } catch { /* sin importancia */ }
      }, 1500);
    } else if (r && r.ok === false) aviso(r.mensaje || 'No se pudo abrir.', 'error');
  } catch (e) { avisoError(e, 'No se pudo abrir'); }
}

function campoParametro(p, valor) {
  const id = `prm-${p.nombre}-${Math.random().toString(36).slice(2, 7)}`;
  let control;
  const tipo = p.tipo || 'texto';
  if (tipo === 'contenedor') {
    const opciones = lista(p.opciones).length ? lista(p.opciones).map(String) : contenedores().map((c) => c.nombre).filter(Boolean);
    const info = new Map(contenedores().map((c) => [c.nombre, c]));
    control = h('select', { class: 'entrada', id, name: p.nombre },
      h('option', { value: '' }, '— Elija un servicio —'),
      opciones.sort((a, b) => a.localeCompare(b, 'es')).map((n) => {
        const c = info.get(n);
        const extra = c ? (c.estado === 'running' ? '' : ' (apagado)') + (c.sobra ? ' · sobra en producción' : '') : '';
        return h('option', { value: n, selected: n === valor }, `${n}${extra}`);
      }));
  } else if (tipo === 'opcion') {
    control = h('select', { class: 'entrada', id, name: p.nombre },
      p.requerido ? h('option', { value: '' }, '— Elija —') : null,
      lista(p.opciones).map((o) => h('option', { value: String(o), selected: String(o) === valor }, String(o))));
  } else {
    control = h('input', {
      class: 'entrada', id, name: p.nombre, type: tipo === 'correo' ? 'email' : 'text', value: valor ?? '',
      placeholder: tipo === 'correo' ? 'nombre@incubant.co' : (p.ayuda || ''), autocomplete: 'off', spellcheck: 'false', maxlength: '300',
    });
  }
  control.dataset.parametro = p.nombre;
  control.dataset.tipo = tipo;
  return h('div', { class: 'campo' },
    h('label', { for: id }, texto(p.etiqueta, p.nombre), p.requerido ? h('span', { class: 'texto-3' }, ' (obligatorio)') : null),
    control,
    p.ayuda && tipo !== 'texto' ? h('span', { class: 'campo-ayuda' }, p.ayuda) : null);
}

/**
 * Lanza una acción del catálogo. fijos: parámetros ya decididos (p. ej. {contenedor} desde una
 * tarjeta). Muestra formulario/confirmación si hace falta. Devuelve el trabajo o null.
 */
export async function ejecutarAccion(id, { fijos = {}, alTerminar = null } = {}) {
  if (id === 'abrir' && fijos.destino) { await abrirDestino(fijos.destino); return null; }
  // el backend real pone en los componentes acciones «abrir:<destino>» (p. ej. abrir:publico)
  if (typeof id === 'string' && id.startsWith('abrir:')) { await abrirDestino(id.slice(6)); return null; }
  let def;
  try { await obtenerCatalogo(); def = accionDe(id); } catch (e) { avisoError(e, 'No se pudo cargar el catálogo de acciones'); return null; }
  if (!def) { aviso(`La acción «${id}» no está disponible en este servidor.`, 'error'); return null; }
  const params = lista(def.parametros).filter((p) => p && typeof p.nombre === 'string');
  const libres = params.filter((p) => fijos[p.nombre] === undefined || fijos[p.nombre] === null || fijos[p.nombre] === '');
  const alto = def.peligro === 'alto';
  // Este equipo es el servidor de PRODUCCIÓN: toda acción que cambia algo pide al menos un clic
  // de confirmación (aunque el catálogo no traiga texto de confirmación). Solo las de consulta van directo.
  const necesitaDialogo = libres.length > 0 || !!def.confirmar || alto || !!def.admin || !SOLO_CONSULTA.has(id);
  const parametros = {};
  for (const p of params) if (!libres.includes(p)) parametros[p.nombre] = fijos[p.nombre];

  if (necesitaDialogo) {
    const campos = libres.map((p) => campoParametro(p, null));
    const casilla = alto ? h('input', { type: 'checkbox', id: 'acc-entiendo' }) : null;
    const cuerpo = [
      def.descripcion ? h('p', { class: 'texto-2' }, def.descripcion) : null,
      h('div', { class: 'grupo-botones' }, insigniaPeligro(def.peligro), def.admin ? chip('Pide permiso de administrador', 'chip-admin') : null),
      params.filter((p) => !libres.includes(p)).map((p) => h('div', { class: 'parametro-fijo' }, h('span', { class: 'texto-2' }, `${texto(p.etiqueta, p.nombre)}:`), h('strong', null, String(fijos[p.nombre])))),
      campos.length ? h('div', { class: 'formulario' }, campos) : null,
      def.confirmar ? h('p', { class: 'dialogo-mensaje' }, def.confirmar) : null,
      def.admin ? h('p', { class: 'nota nota-admin' }, icono('escudo', { tam: 16 }), h('span', null, 'Windows va a pedir permiso de administrador en esta pantalla: pulse «Sí» en el aviso de Windows.')) : null,
      alto ? h('label', { class: 'casilla-entiendo', for: 'acc-entiendo' }, casilla, h('span', null, 'Entiendo lo que va a pasar')) : null,
    ];
    const r = await dialogo({
      titulo: def.titulo || id, icono: alto ? 'aviso' : iconoAccion(id), clase: alto ? 'dialogo-peligro' : '', cuerpo,
      botones: [
        { texto: 'Cancelar', valor: null, clase: 'boton-sutil' },
        { texto: alto ? 'Sí, ejecutar' : def.confirmar ? 'Sí, continuar' : 'Ejecutar', valor: 'si', clase: alto ? 'boton-peligro' : 'boton-primario', icono: alto ? 'aviso' : 'play' },
      ],
      validar: () => {
        for (const c of campos) {
          const ctl = c.querySelector('[data-parametro]');
          const p = libres.find((x) => x.nombre === ctl.dataset.parametro);
          const v = String(ctl.value || '').trim();
          if (p?.requerido && !v) { ctl.focus(); return `Falta «${texto(p.etiqueta, p.nombre)}».`; }
          if (ctl.dataset.tipo === 'correo' && v && !RE_CORREO.test(v)) { ctl.focus(); return 'Escriba un correo válido, por ejemplo nombre@incubant.co.'; }
        }
        if (alto && !casilla.checked) return 'Marque «Entiendo lo que va a pasar» para continuar.';
        return null;
      },
    });
    if (r !== 'si') return null;
    for (const c of campos) {
      const ctl = c.querySelector('[data-parametro]');
      const v = String(ctl.value || '').trim();
      if (v) parametros[ctl.dataset.parametro] = v;
    }
  }
  try {
    const resp = await api.post(`/api/acciones/${encodeURIComponent(id)}`, { parametros });
    const t = resp?.trabajo;
    if (t?.id) {
      abrirTrabajo(t, { alTerminar });
      bus.emit('trabajo-lanzado', t);
      return t;
    }
    aviso(resp?.mensaje || 'Listo.', resp?.ok === false ? 'error' : 'ok');
    return null;
  } catch (e) {
    avisoError(e, `No se pudo ejecutar «${def.titulo || id}»`);
    return null;
  }
}

/** Lanza un POST que devuelve {trabajo} (auditar, escanear…) y abre su consola. */
export async function lanzarTrabajo(ruta, cuerpo = {}, { alTerminar = null, errorPrefijo = 'No se pudo iniciar' } = {}) {
  try {
    const r = await api.post(ruta, cuerpo);
    if (r?.trabajo?.id) {
      abrirTrabajo(r.trabajo, { alTerminar });
      bus.emit('trabajo-lanzado', r.trabajo);
      return r.trabajo;
    }
    aviso('El panel no devolvió el trabajo.', 'error');
  } catch (e) { avisoError(e, errorPrefijo); }
  return null;
}
