// Panel IncubApp · datos compartidos entre secciones (último estado, catálogo de acciones).
import { api } from './api.js';
import { bus, lista } from './util.js';

export const almacen = {
  estado: null,          // último ESTADO recibido
  estadoEn: 0,           // Date.now() del último ESTADO
  ping: null,            // {app, version, pid}
  trabajos: [],          // último GET /api/trabajos (sin líneas)
};

export function ponerEstado(e) {
  almacen.estado = e;
  almacen.estadoEn = Date.now();
  bus.emit('estado', e);
}

/** Nombres de contenedores del último estado (para los desplegables «Servicio»). */
export function contenedores() {
  return lista(almacen.estado?.contenedores);
}

// ── catálogo de acciones ──
let catalogo = null;
let pendiente = null;
export async function obtenerCatalogo(forzar = false) {
  if (catalogo && !forzar) return catalogo;
  if (pendiente) return pendiente;
  pendiente = api.get('/api/acciones')
    .then((r) => { catalogo = lista(r?.acciones).filter((a) => a && typeof a.id === 'string'); bus.emit('catalogo', catalogo); return catalogo; })
    .finally(() => { pendiente = null; });
  return pendiente;
}
export const catalogoActual = () => catalogo;
export function accion(id) { return (catalogo || []).find((a) => a.id === id) || null; }
