// Panel IncubApp · llamadas al servidor del panel.
//
// - fetch con credentials 'same-origin' (la cookie la pone GET /entrar).
// - Toda petición que no sea GET lleva 'X-Panel: 1' y cuerpo JSON (el panel lo exige contra CSRF).
// - 401 → pantalla «abra el panel desde el acceso directo».
// - Si el servidor no contesta → franja roja y reintentos (lo maneja app.js con el bus).
import { bus } from './util.js';

export class ErrorApi extends Error {
  constructor(estado, mensaje, datos = null) {
    super(mensaje);
    this.estado = estado;      // 0 = sin conexión / tiempo agotado
    this.datos = datos;
  }
}

let conectado = true;
let sinSesion = false;

function marcarConectado() {
  if (!conectado) { conectado = true; bus.emit('conexion', true); }
}
function marcarDesconectado() {
  if (conectado) { conectado = false; bus.emit('conexion', false); }
}
export const estaConectado = () => conectado;

async function pedir(metodo, ruta, cuerpo, { timeout = 30000 } = {}) {
  if (sinSesion) throw new ErrorApi(401, 'Sin sesión.');
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), timeout);
  const opciones = {
    method: metodo, credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal,
    headers: { Accept: 'application/json' },
  };
  if (metodo !== 'GET') {
    opciones.headers['X-Panel'] = '1';
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo ?? {});
  }
  let r;
  try {
    r = await fetch(ruta, opciones);
  } catch (e) {
    clearTimeout(reloj);
    if (ctrl.signal.aborted) throw new ErrorApi(0, 'El panel tardó demasiado en responder. Intente de nuevo.');
    marcarDesconectado();
    throw new ErrorApi(0, 'Se perdió la conexión con el panel.');
  }
  let txt = '';
  try { txt = await r.text(); } catch { txt = ''; }
  clearTimeout(reloj);
  marcarConectado();
  let datos = null;
  try { datos = txt ? JSON.parse(txt) : null; } catch { datos = null; }
  const mensaje = (datos && typeof datos.error === 'string' && datos.error) || null;
  if (r.status === 401) {
    sinSesion = true;
    bus.emit('sin-sesion', mensaje);
    throw new ErrorApi(401, mensaje || 'Abra el panel desde el acceso directo «Panel IncubApp».');
  }
  if (!r.ok) {
    const porDefecto = r.status === 503 ? 'Esta parte del panel no cargó.' : `El panel respondió con un error (${r.status}).`;
    throw new ErrorApi(r.status, mensaje || porDefecto, datos);
  }
  if (datos === null && txt) throw new ErrorApi(r.status, 'El panel respondió algo que no se entiende (no es JSON).');
  return datos;
}

export const api = {
  get: (ruta, op) => pedir('GET', ruta, null, op),
  post: (ruta, cuerpo, op) => pedir('POST', ruta, cuerpo, op),
};

/** Arma «ruta?clave=valor&…» codificando los valores. */
export function conParametros(ruta, params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== null && v !== undefined && v !== '') u.set(k, String(v));
  const q = u.toString();
  return q ? `${ruta}?${q}` : ruta;
}
