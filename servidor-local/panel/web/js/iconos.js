// Panel IncubApp · íconos propios (trazos de 24×24). Se arman con createElementNS: nada de
// innerHTML. Cada ícono es una lista de [etiqueta, atributos].
import { s } from './util.js';

const P = (d) => ['path', { d }];
const C = (cx, cy, r) => ['circle', { cx, cy, r }];
const R = (x, y, width, height, rx = 1.5) => ['rect', { x, y, width, height, rx }];

const D = {
  // ── navegación ──
  inicio: [R(3, 3, 7, 9), R(14, 3, 7, 5), R(14, 12, 7, 9), R(3, 16, 7, 5)],
  servicios: [R(3, 4, 18, 6), R(3, 14, 18, 6), P('M7 7h.01M7 17h.01M11 7h6M11 17h6')],
  recursos: [P('M3 12h4l3-8 4 16 3-8h4')],
  registros: [P('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z'), P('M14 3v6h6'), P('M8 13h8M8 17h6')],
  soporte: [C(12, 12, 9), C(12, 12, 4), P('M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6')],
  seguridad: [P('M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z'), P('M9 12l2 2 4-4')],
  red: [R(9, 3, 6, 5, 1), R(3, 16, 6, 5, 1), R(15, 16, 6, 5, 1), P('M12 8v4M6 16v-4h12v4')],
  eventos: [C(12, 12, 9), P('M12 7v5l3 2')],
  ajustes: [P('M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1'), C(15, 6, 2), C(9, 12, 2), C(17, 18, 2)],

  // ── niveles ──
  ok: [C(12, 12, 9), P('M8 12.5l2.5 2.5L16 9.5')],
  aviso: [P('M12 3.5L2.8 19.5h18.4z'), P('M12 10v4M12 17h.01')],
  falla: [P('M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z'), P('M9.5 9.5l5 5M14.5 9.5l-5 5')],
  apagado: [C(12, 12, 9), P('M8 12h8')],
  desconocido: [C(12, 12, 9), P('M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01')],
  critico: [P('M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z'), P('M12 7.5v5.5M12 16.5h.01')],
  alto: [P('M12 3.5L2.8 19.5h18.4z'), P('M12 9.5v4.5M12 17h.01')],
  medio: [C(12, 12, 9), P('M12 7.5v5.5M12 16.5h.01')],
  bajo: [C(12, 12, 9), P('M8 12h8')],
  info: [C(12, 12, 9), P('M12 11v5M12 8h.01')],

  // ── componentes ──
  equipo: [R(3, 4, 18, 12), P('M8 20h8M12 16v4')],
  wsl: [R(3, 4, 18, 16, 2), P('M3 8h18'), P('M7 12l2 2-2 2M11 16h4')],
  docker: [R(4, 10, 4, 3.5, 0.5), R(8.5, 10, 4, 3.5, 0.5), R(13, 10, 4, 3.5, 0.5), R(8.5, 6, 4, 3.5, 0.5), P('M2 14h19.5c-.6 3.6-3.8 6-8.5 6H8.5C5 20 2.8 17.7 2 14z')],
  app: [R(3, 4, 18, 16, 2), P('M3 9h18'), P('M6.5 6.5h.01M9 6.5h.01')],
  api: [P('M9 3v4M15 3v4'), P('M6 7h12v4a6 6 0 0 1-12 0z'), P('M12 17v4')],
  publico: [C(12, 12, 9), P('M3 12h18'), P('M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z')],
  tunel: [P('M7 18.5h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.2 9.6 4.5 4.5 0 0 0 7 18.5z')],
  ngrok: [P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'), P('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')],
  base: [['ellipse', { cx: 12, cy: 5.5, rx: 7.5, ry: 2.5 }], P('M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13'), P('M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5')],
  auth: [C(8, 15, 4), P('M10.8 12.2L20 3M16 7l2.5 2.5M18.5 4.5L21 7')],
  rest: [P('M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1'), P('M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1')],
  storage: [R(3, 4, 18, 16, 2), C(9, 10, 2), P('M21 16l-5-5-9 9')],
  realtime: [P('M13 2L4 14h7l-1 8 9-12h-7z')],
  envoy: [P('M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4'), P('M10 16l4-4-4-4M3 12h11')],
  meta: [R(3, 4, 18, 16, 2), P('M3 10h18M9 10v10')],
  edge: [P('M15 4h-1.5A2.5 2.5 0 0 0 11 6.5v11A2.5 2.5 0 0 1 8.5 20H7'), P('M7.5 11h7.5')],
  studio: [R(3, 3, 18, 18, 2), P('M3 9h18M9 9v12')],
  pooler: [P('M12 3l9 5-9 5-9-5z'), P('M3 13l9 5 9-5')],
  imgproxy: [P('M6 2v14a2 2 0 0 0 2 2h14'), P('M18 22V8a2 2 0 0 0-2-2H2')],
  correo: [R(3, 5, 18, 14, 2), P('M3 7l9 6 9-6')],
  lector: [P('M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'), C(12, 13, 3.5)],
  asistente: [R(9, 3, 6, 11, 3), P('M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6')],
  n8n: [C(5, 12, 2), C(12, 6, 2), C(12, 18, 2), C(19, 12, 2), P('M6.6 10.8l3.8-3.6M6.6 13.2l3.8 3.6M13.6 7.2l3.8 3.6M13.6 16.8l3.8-3.6')],
  respaldo: [R(3, 4, 18, 5, 1), P('M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9'), P('M10 13h4')],
  vigilante: [P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z'), C(12, 12, 3)],
  arranque: [C(12, 12, 9), P('M10 8.5v7l6-3.5z')],
  version: [C(6, 5, 2), C(6, 19, 2), C(18, 7, 2), P('M6 7v10'), P('M18 9c0 5-6 4-11.4 8.4')],
  panel: [R(3, 4, 18, 16, 2), P('M7 15l3-4 3 2 4-5')],

  // ── dispositivos de la red ──
  router: [R(3, 13, 18, 7, 2), P('M7 16.5h.01M10.5 16.5h.01M15 16.5h3'), P('M8 13l-1.5-6M16 13l1.5-6')],
  camara: [R(2.5, 7, 13, 10, 2), P('M15.5 10.5l6-3.5v10l-6-3.5')],
  impresora: [P('M6 9V3h12v6'), R(3, 9, 18, 8, 2), P('M6 14h12v7H6z')],
  pc: [R(3, 4, 18, 12), P('M8 20h8M12 16v4')],
  celular: [R(7, 2, 10, 20, 2), P('M11 18h2')],
  plc: [R(6, 6, 12, 12, 1.5), R(9.5, 9.5, 5, 5, 0.5), P('M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4')],
  dispositivo: [C(12, 12, 9), P('M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01')],

  // ── acciones y varios ──
  apagar: [P('M12 3v9'), P('M6.3 6.6a8 8 0 1 0 11.4 0')],
  actualizar: [P('M20 11a8 8 0 0 0-14.3-4.9L4 8'), P('M4 4v4h4'), P('M4 13a8 8 0 0 0 14.3 4.9L20 16'), P('M20 20v-4h-4')],
  terminal: [R(3, 4, 18, 16, 2), P('M7 9l3 3-3 3M12 15h5')],
  reiniciar: [P('M20 12a8 8 0 1 1-2.3-5.7L20 8.5'), P('M20 3.5v5h-5')],
  play: [P('M7 4.5v15l12-7.5z')],
  stop: [R(6, 6, 12, 12, 1.5)],
  minimizar: [P('M5 12h14')],
  maximizar: [R(4, 4, 16, 16, 2)],
  cerrar: [P('M6 6l12 12M18 6L6 18')],
  abajo: [P('M6 9l6 6 6-6')],
  arriba: [P('M6 15l6-6 6 6')],
  derecha: [P('M9 6l6 6-6 6')],
  izquierda: [P('M15 6l-6 6 6 6')],
  buscar: [C(11, 11, 7), P('M20 20l-4-4')],
  copiar: [R(8, 8, 12, 12, 2), P('M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2')],
  carpeta: [P('M3 6.5A2.5 2.5 0 0 1 5.5 4h3.7l2 2.2h7.3A2.5 2.5 0 0 1 21 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z')],
  externo: [P('M14 4h6v6'), P('M20 4l-9 9'), P('M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5')],
  sol: [C(12, 12, 4), P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  luna: [P('M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z')],
  sonido: [P('M4 9h4l5-4v14l-5-4H4z'), P('M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12')],
  silencio: [P('M4 9h4l5-4v14l-5-4H4z'), P('M17 9.5l5 5M22 9.5l-5 5')],
  editar: [P('M4 20h4L19 9l-4-4L4 16z'), P('M13.5 6.5l4 4')],
  basura: [P('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3')],
  radar: [C(12, 12, 9), C(12, 12, 5), P('M12 12l6.4-6.4'), C(12, 12, 0.8)],
  puertos: [R(4, 8, 16, 11, 1.5), P('M8 8V5h8v3M8.5 12.5v2.5M12 12.5v2.5M15.5 12.5v2.5')],
  descargar: [P('M12 3v12M7 10l5 5 5-5M5 21h14')],
  filtro: [P('M3 5h18l-7 8.5V20l-4-2v-4.5z')],
  wifi: [P('M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0'), P('M12 19h.01')],
  usuarios: [C(9, 8, 3.5), P('M2.5 20a6.5 6.5 0 0 1 13 0'), P('M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8')],
  usuario: [C(12, 8, 4), P('M4 21a8 8 0 0 1 16 0')],
  disco: [R(3, 13, 18, 7, 2), P('M3 15l3-10h12l3 10'), P('M7 16.5h.01M11 16.5h.01')],
  cpu: [R(6, 6, 12, 12, 1.5), R(9.5, 9.5, 5, 5, 0.5), P('M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4')],
  memoria: [R(3, 7, 18, 10, 1), P('M7 10v4M11 10v4M15 10v4M6 17v3M18 17v3')],
  campana: [P('M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z'), P('M10 20a2 2 0 0 0 4 0')],
  arreglar: [P('M4 20L15 9'), P('M14 3.5l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z'), P('M19 9.5l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z')],
  candado: [R(5, 11, 14, 10, 2), P('M8 11V7.5a4 4 0 0 1 8 0V11')],
  escudo: [P('M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z')],
  enlace: [P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'), P('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')],
  lista: [P('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01')],
  reporte: [P('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z'), P('M14 3v6h6'), P('M8 17v-3M12 17v-5M16 17v-2')],
  cargando: [P('M12 3a9 9 0 1 1-9 9')],
  rayo: [P('M13 2L4 14h7l-1 8 9-12h-7z')],
  ruta: [C(6, 19, 2), C(18, 5, 2), P('M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16')],
  dns: [C(12, 12, 9), P('M8 12h8M12 8v8')],
  web: [R(3, 4, 18, 16, 2), P('M3 9h18'), P('M8 13.5l-2 1.5 2 1.5M16 13.5l2 1.5-2 1.5M13 13l-2 5')],
  encender: [P('M12 3v9'), P('M6.3 6.6a8 8 0 1 0 11.4 0')],
  upnp: [C(12, 12, 2), P('M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14')],
  ping: [C(12, 12, 2.5), P('M12 3v3M12 18v3M3 12h3M18 12h3')],
  info_c: [C(12, 12, 9), P('M12 11v5M12 8h.01')],
  punto: [C(12, 12, 4)],
  ojo: [P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z'), C(12, 12, 3)],
  mas: [P('M12 5v14M5 12h14')],
  guardar: [P('M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z'), P('M8 4v5h7V4M8 20v-6h8v6')],
};

/** Crea un <svg> con el ícono pedido. */
export function icono(nombre, { tam = 18, clase = '', titulo = null } = {}) {
  const el = s('svg', {
    viewBox: '0 0 24 24', width: tam, height: tam, class: `ico ${clase}`.trim(),
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': titulo ? null : 'true', role: titulo ? 'img' : null, focusable: 'false',
  });
  if (titulo) el.appendChild(s('title', null, titulo));
  for (const [tag, at] of (D[nombre] || D.punto)) el.appendChild(s(tag, at));
  return el;
}

export function existeIcono(nombre) { return Object.prototype.hasOwnProperty.call(D, nombre); }

/** Ícono por id de componente (con respaldo genérico). */
export function iconoComponente(id) {
  return existeIcono(id) ? id : 'servicios';
}

/** Ícono por tipo de dispositivo de la red. */
export function iconoDispositivo(tipo) {
  return ({ router: 'router', camara: 'camara', impresora: 'impresora', pc: 'pc', celular: 'celular', plc: 'plc' })[tipo] || 'dispositivo';
}
