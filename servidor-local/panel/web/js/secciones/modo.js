// Panel IncubApp · MODO SERVIDOR («servidor activo»): para cuando el responsable no está en la
// planta. Muestra qué protecciones están puestas (botón de encendido y de suspender sin efecto,
// sin «Apagar» en la pantalla de inicio, Escritorio remoto con NLA, firewall solo para los equipos
// permitidos), edita la lista de equipos permitidos, activa/desactiva el modo (trabajo que pide
// permiso de administrador), bloquea la pantalla y explica cómo entrar desde fuera con Tailscale
// y «Conexión a Escritorio remoto».
//
// Seguridad: las IP, nombres y fabricantes de los equipos vienen de la red (no son confiables):
// todo se arma con h()/textContent, nunca innerHTML.
import { h, lista, obj, texto, vaciar, poner, relativo, fechaHora, bus, esIPv4, copiar } from '../util.js';
import { api } from '../api.js';
import { icono } from '../iconos.js';
import { boton, botonIcono, confirmar, aviso, avisoError, tarjeta, vacio, cargando, bloqueError } from '../ui.js';
import { lanzarTrabajo, abrirDestino } from '../lanzador.js';
import { abrirTrabajo, seguirTrabajo } from '../consola.js';
import { cabecera, cargarEn, periodico } from './comun.js';

const RED_TAILSCALE = '100.64.0.0/10';
const MAX_PERMITIDOS = 30;
// Si el panel no manda sus avisos, se muestran estos (lo honesto: hay cosas que no se pueden bloquear).
const AVISOS_BASE = [
  'Mantener presionado el botón de encendido 4 segundos apaga el equipo a la fuerza (lo hace el hardware): eso no se puede bloquear por software. Proteja el equipo físicamente (gabinete o cuarto con llave).',
  'Desconectar el cable o un corte de luz también lo apagan.',
];
const SERVICIO_TS = { Running: 'Funcionando', Stopped: 'Detenido', StartPending: 'Arrancando', StopPending: 'Deteniéndose', Paused: 'En pausa' };
const TITULO_ESTADO = { ok: 'MODO SERVIDOR ACTIVO', aviso: 'Modo servidor PARCIAL', apagado: 'Modo servidor INACTIVO', desconocido: 'Estado del modo servidor desconocido' };
const ICONO_ESTADO = { ok: 'candado', aviso: 'aviso', apagado: 'apagado', desconocido: 'desconocido' };

// ── IP y redes: validación básica en la pantalla (el backend valida de verdad) ──
const aNumero = (ip) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
const aTexto = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const mascara = (pref) => (pref === 0 ? 0 : (0xFFFFFFFF << (32 - pref)) >>> 0);
const PRIVADAS = [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10]];

/** «192.168.5.37» o «192.168.5.0/24» → {red, pref} (red ya normalizada) o null. */
function leerRed(x) {
  const m = String(x ?? '').trim().match(/^([0-9.]{7,15})(?:\/(\d{1,2}))?$/);
  if (!m || !esIPv4(m[1])) return null;
  const pref = m[2] === undefined ? 32 : Number(m[2]);
  if (pref > 32) return null;
  return { red: (aNumero(m[1]) & mascara(pref)) >>> 0, pref };
}
const dentroDe = (r, base, bpref) => r.pref >= bpref && ((r.red & mascara(bpref)) >>> 0) === aNumero(base);
const esDeTailscale = (v) => { const r = leerRed(v); return !!r && dentroDe(r, '100.64.0.0', 10); };

/** Valida y normaliza lo que escribe la persona → {valor} o {error}. */
function normalizar(x) {
  const t = String(x ?? '').trim();
  if (!t) return { error: 'Escriba una IP o una red.' };
  const r = leerRed(t);
  if (!r) return { error: `«${t.slice(0, 40)}» no es una IP ni una red válida (ejemplos: 192.168.5.37 o 100.64.0.0/10).` };
  if (r.pref < 10) return { error: `«${t}» es demasiado amplia.` };
  if (!PRIVADAS.some(([b, p]) => dentroDe(r, b, p))) return { error: `«${t}» es una dirección de internet: solo se permiten IP de la planta o de Tailscale.` };
  return { valor: r.pref === 32 ? aTexto(r.red) : `${aTexto(r.red)}/${r.pref}` };
}

const mismaLista = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const nombreDisp = (d) => texto(d.nombre || d.nombre_red, 'Sin nombre').slice(0, 60);

export function crear() {
  let modo = null;              // último MODO (null = no se pudo leer)
  let permitidos = [];          // la lista que se está editando
  let editado = false;          // la persona cambió la lista: la recarga periódica no la pisa
  let dispositivos = [];        // inventario de la red (no confiable)
  let dispCargados = false;
  let trabajoEnCurso = null;

  // ── estado (tarjeta grande) ──
  const luz = h('span', { class: 'semaforo-luz' }, icono('desconocido', { tam: 32 }));
  const titulo = h('h2', null, 'Leyendo el estado del equipo…');
  const detalle = h('p', null, 'Revisando el botón de encendido, el Escritorio remoto y el firewall.');
  const fechaTxt = h('span', { class: 'texto-3 texto-chico' });
  const btnActivar = boton('Activar modo servidor', { icono: 'candado', clase: 'boton-primario', alPulsar: () => activar() });
  const btnDesactivar = boton('Desactivar', { icono: 'apagado', clase: 'boton-sutil', alPulsar: () => desactivar() });
  const btnBloquear = boton('Bloquear pantalla ahora', { icono: 'candado', clase: 'boton-sutil', alPulsar: () => bloquear() });
  const btnProgreso = boton('Ver progreso', { icono: 'terminal', clase: 'boton-chico', alPulsar: () => trabajoEnCurso && abrirTrabajo(trabajoEnCurso) });
  btnProgreso.hidden = true;
  btnDesactivar.hidden = true;
  const estadoTarjeta = h('section', { class: 'tarjeta estado-general modo-estado nivel-desconocido', 'aria-label': 'Estado del modo servidor' },
    luz,
    h('div', { class: 'estado-general-texto' }, titulo, detalle,
      h('p', { class: 'modo-explica' }, 'Qué hace: el botón de encendido y el de suspender no hacen nada, no aparece «Apagar» en la pantalla de inicio de sesión y solo sus equipos permitidos entran por Escritorio remoto (con la contraseña de Windows).'),
      fechaTxt,
      h('div', { class: 'grupo-botones', style: { 'margin-top': '8px' } }, btnActivar, btnDesactivar, btnBloquear, btnProgreso)));

  // ── avisos honestos ──
  const avisosCaja = h('ul', { class: 'modo-avisos', 'aria-label': 'Lo que el modo servidor no puede impedir' });
  function pintarAvisos(av) {
    const xs = lista(av).filter((x) => typeof x === 'string' && x.trim());
    vaciar(avisosCaja, (xs.length ? xs : AVISOS_BASE).map((t) => h('li', { class: 'nota nota-aviso' }, icono('aviso', { tam: 16 }), h('span', null, t))));
  }
  pintarAvisos(null);

  // ── protecciones ──
  const protSub = h('span');
  const protCaja = h('div', null, cargando('Leyendo las protecciones…'));
  function pintarProtecciones(m) {
    if (!m) { poner(protSub, ''); vaciar(protCaja, vacio('Sin datos: no se pudo leer el estado del equipo.', 'desconocido')); return; }
    const ps = lista(m.protecciones).filter(obj);
    if (!ps.length) { poner(protSub, ''); vaciar(protCaja, vacio('El panel no informó las protecciones.')); return; }
    const nOk = ps.filter((p) => p.ok === true).length;
    poner(protSub, `${nOk} de ${ps.length} puestas`);
    // lo que falta: ámbar si el modo quedó a medias o está activo, gris si el modo está apagado
    const nivelNo = m.activo === true || m.parcial === true ? 'aviso' : 'apagado';
    vaciar(protCaja, h('ul', { class: 'modo-protecciones' }, ps.map((p) => {
      const ok = p.ok === true;
      return h('li', { class: `modo-proteccion nivel-${ok ? 'ok' : nivelNo}` },
        icono(ok ? 'ok' : 'falla', { tam: 20 }),
        h('div', null,
          h('strong', null, texto(p.titulo, texto(p.id))),
          p.detalle ? h('span', null, String(p.detalle)) : null,
          h('span', { class: 'oculto-visual' }, ok ? 'Puesta.' : 'No está puesta.')));
    })));
  }

  // ── equipos permitidos ──
  const listaPerm = h('ul', { class: 'modo-permitidos', 'aria-label': 'Equipos permitidos para el acceso remoto' });
  const entrada = h('input', { class: 'entrada mono', type: 'text', id: 'modo-nueva-ip', placeholder: 'Ej.: 192.168.5.37 o 100.64.0.0/10', autocomplete: 'off', spellcheck: 'false', maxlength: '40' });
  const errorIp = h('p', { class: 'color-nivel nivel-falla texto-chico', role: 'alert', hidden: true });
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarDesdeEntrada(); } });
  entrada.addEventListener('input', () => { errorIp.hidden = true; });
  const btnTs = boton(`Agregar la red de Tailscale (${RED_TAILSCALE})`, { icono: 'publico', clase: 'boton-chico', alPulsar: () => agregar(RED_TAILSCALE) });
  const selDisp = h('select', { class: 'entrada', id: 'modo-disp' });
  selDisp.addEventListener('change', () => { errorIp.hidden = true; });
  const filaDisp = h('div', { class: 'modo-agregar' },
    h('div', { class: 'campo' }, h('label', { for: 'modo-disp' }, 'O elija un equipo de la red de la planta'), selDisp),
    boton('Agregar este equipo', { icono: 'mas', alPulsar: () => { if (selDisp.value) agregar(selDisp.value); else mostrarErrorIp('Elija primero un equipo de la lista.'); } }));
  const dispCaja = h('div');
  const notaSinTs = h('p', { class: 'nota nota-aviso', hidden: true }, icono('aviso', { tam: 16 }),
    h('span', null, 'Sin la red de Tailscale solo podrá entrar estando en la planta. Para entrar desde fuera, agregue la red de Tailscale.'));
  const notaCambiosTxt = h('span');
  const notaCambios = h('div', { class: 'nota nota-admin', hidden: true }, icono('info_c', { tam: 16 }),
    h('div', null, notaCambiosTxt, ' ', h('button', { class: 'enlace', type: 'button', on: { click: () => deshacer() } }, 'Deshacer los cambios')));

  function mostrarErrorIp(msj) { poner(errorIp, msj); errorIp.hidden = false; }
  function agregar(x) {
    const r = normalizar(x);
    if (r.error) { mostrarErrorIp(r.error); return false; }
    if (permitidos.includes(r.valor)) { mostrarErrorIp(`${r.valor} ya está en la lista.`); return false; }
    if (permitidos.length >= MAX_PERMITIDOS) { mostrarErrorIp(`Se permiten como máximo ${MAX_PERMITIDOS} equipos o redes.`); return false; }
    errorIp.hidden = true;
    permitidos = [...permitidos, r.valor];
    editado = true;
    pintarPermitidos();
    return true;
  }
  function agregarDesdeEntrada() { if (agregar(entrada.value)) { entrada.value = ''; entrada.focus(); } }
  function quitar(v) { permitidos = permitidos.filter((x) => x !== v); editado = true; pintarPermitidos(); }
  function deshacer() { editado = false; permitidos = permitidosDe(modo); errorIp.hidden = true; pintarPermitidos(); }
  const permitidosDe = (m) => lista(m?.permitidos).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, MAX_PERMITIDOS);

  function describir(v) {
    if (v === RED_TAILSCALE) return 'Red de Tailscale: sus equipos con Tailscale, desde cualquier lugar';
    if (v.includes('/')) return esDeTailscale(v) ? 'Parte de la red de Tailscale' : `Toda una red: cualquier equipo con IP en ${v}`;
    if (v === modo?.equipo?.ip_lan) return 'Este mismo servidor';
    const d = dispositivos.find((x) => x.ip === v);
    if (d) return [nombreDisp(d), d.fabricante ? String(d.fabricante).slice(0, 60) : null].filter(Boolean).join(' · ');
    return esDeTailscale(v) ? 'Un equipo con Tailscale' : 'Un equipo de la red de la planta';
  }

  function pintarPermitidos() {
    vaciar(listaPerm, permitidos.length
      ? permitidos.map((v) => h('li', { class: 'modo-permitido' },
        icono(v === RED_TAILSCALE ? 'publico' : v.includes('/') ? 'red' : 'pc', { tam: 16 }),
        h('span', { class: 'mono' }, v),
        h('span', { class: 'texto-2' }, describir(v)),
        botonIcono('cerrar', `Quitar ${v}`, { clase: 'boton-sutil boton-chico', alPulsar: () => quitar(v) })))
      : h('li', null, vacio('No hay equipos permitidos: nadie podría entrar a distancia. Agregue al menos uno.', 'aviso')));
    btnTs.disabled = permitidos.includes(RED_TAILSCALE);
    notaSinTs.hidden = !permitidos.length || permitidos.some(esDeTailscale);
    const cambio = editado && !mismaLista(permitidos, permitidosDe(modo));
    notaCambios.hidden = !cambio;
    poner(notaCambiosTxt, modo?.activo === true
      ? 'Cambió la lista: se aplica en Windows al pulsar «Aplicar la nueva lista».'
      : 'Cambió la lista: se aplica en Windows al pulsar «Activar modo servidor».');
    actualizarBotones();
  }

  async function cargarDispositivos() {
    const r = await api.get('/api/red/dispositivos', { timeout: 30000 });
    dispositivos = lista(r?.dispositivos).filter(obj).filter((d) => esIPv4(d.ip));
    const propia = modo?.equipo?.ip_lan;
    const opciones = dispositivos.filter((d) => d.ip !== propia).sort((a, b) => aNumero(a.ip) - aNumero(b.ip));
    vaciar(selDisp,
      h('option', { value: '' }, opciones.length ? '— Elija un equipo de la red —' : 'No hay equipos en el inventario (escanee la red en la sección Red)'),
      opciones.map((d) => h('option', { value: d.ip }, `${nombreDisp(d)} — ${d.ip}${d.fabricante ? ` · ${String(d.fabricante).slice(0, 40)}` : ''}`)));
    if (!dispCaja.contains(filaDisp)) vaciar(dispCaja, filaDisp);
    pintarPermitidos();          // las descripciones usan los nombres del inventario
  }

  // ── Tailscale y cómo conectarse ──
  function datoCopiar(valor) {
    return h('span', { class: 'modo-copiar' }, h('span', { class: 'mono' }, valor),
      botonIcono('copiar', `Copiar ${valor}`, {
        clase: 'boton-sutil boton-chico',
        alPulsar: async () => { const ok = await copiar(valor); aviso(ok ? `Copiado: ${valor}` : 'No se pudo copiar.', ok ? 'ok' : 'error', { duracion: 2500 }); },
      }));
  }
  const tsCaja = h('div', { class: 'columna', style: { gap: '12px' } }, cargando());
  function pintarTailscale(m) {
    if (!m) { vaciar(tsCaja, vacio('Sin datos: no se pudo leer el estado del equipo.', 'desconocido')); return; }
    const ts = obj(m.tailscale) || {};
    const inst = ts.instalado === true;
    const ip = esIPv4(ts.ip) ? ts.ip : null;
    const sino = (si, txtSi, txtNo) => (si ? h('span', { class: 'color-nivel nivel-ok' }, icono('ok', { tam: 14 }), ` ${txtSi}`) : h('span', { class: 'color-nivel nivel-aviso' }, icono('aviso', { tam: 14 }), ` ${txtNo}`));
    vaciar(tsCaja,
      h('dl', { class: 'lista-datos' },
        h('dt', null, 'Instalado en este servidor'), h('dd', null, sino(inst, 'Sí', 'No')),
        h('dt', null, 'Servicio'), h('dd', null, ts.servicio ? sino(ts.servicio === 'Running', SERVICIO_TS[ts.servicio] || String(ts.servicio), SERVICIO_TS[ts.servicio] || String(ts.servicio)) : '—'),
        h('dt', null, 'IP de Tailscale del servidor'), h('dd', null, ip ? datoCopiar(ip) : '—'),
        h('dt', null, 'Nombre en Tailscale'), h('dd', null, typeof ts.nombre === 'string' && ts.nombre ? h('span', { class: 'mono' }, ts.nombre.slice(0, 80)) : '—')),
      !inst ? [
        h('ol', { class: 'modo-pasos' },
          h('li', null, 'Pulse «Descargar Tailscale», instálelo en este servidor e inicie sesión con su cuenta.'),
          h('li', null, 'Instale Tailscale también en su PC y entre con la misma cuenta.'),
          h('li', null, 'Vuelva a esta pantalla: aquí aparecerá la IP de Tailscale del servidor (empieza por 100.).'),
          h('li', null, `Deje la red de Tailscale (${RED_TAILSCALE}) en los equipos permitidos y active el modo servidor.`)),
        h('div', { class: 'grupo-botones' }, boton('Descargar Tailscale', { icono: 'descargar', clase: 'boton-primario', alPulsar: () => abrirDestino('tailscale') })),
      ]
        : ts.servicio !== 'Running' ? h('p', { class: 'nota nota-aviso' }, icono('aviso', { tam: 16 }), h('span', null, 'El servicio de Tailscale no está funcionando: abra Tailscale desde el menú Inicio e inicie sesión con su cuenta.'))
          : !ip ? h('p', { class: 'nota nota-aviso' }, icono('aviso', { tam: 16 }), h('span', null, 'Tailscale todavía no tiene IP: ábralo desde el menú Inicio e inicie sesión con su cuenta.'))
            : h('p', { class: 'nota' }, icono('info_c', { tam: 16 }), h('span', null, 'Tailscale es una red privada y cifrada entre sus equipos: no abre ningún puerto a internet. Su PC también debe tener Tailscale encendido.')));
  }

  const conCaja = h('div', { class: 'columna', style: { gap: '12px' } });
  function pintarConexion(m) {
    const eq = obj(m?.equipo) || {};
    const ts = obj(m?.tailscale) || {};
    const puerto = Number(m?.escritorio_remoto?.puerto);
    const conPuerto = (ip) => (Number.isInteger(puerto) && puerto > 0 && puerto < 65536 && puerto !== 3389 ? `${ip}:${puerto}` : ip);
    const ipTs = esIPv4(ts.ip) ? ts.ip : null;
    const ipLan = esIPv4(eq.ip_lan) ? eq.ip_lan : null;
    const usuario = typeof eq.usuario === 'string' && eq.usuario.trim() ? eq.usuario.trim().slice(0, 80) : null;
    const nombre = typeof eq.nombre === 'string' && eq.nombre.trim() ? eq.nombre.trim().slice(0, 40) : null;
    vaciar(conCaja,
      h('ol', { class: 'modo-pasos' },
        h('li', null, 'En su PC abra «Conexión a Escritorio remoto»: pulse la tecla Windows, escriba ', h('strong', { class: 'mono' }, 'mstsc'), ' y pulse Enter.'),
        h('li', null, 'En «Equipo» escriba la dirección de este servidor:',
          h('ul', { class: 'modo-pasos', style: { 'margin-top': '6px' } },
            h('li', null, 'Desde fuera de la planta (con Tailscale encendido en su PC): ', ipTs ? datoCopiar(conPuerto(ipTs)) : h('em', null, 'primero instale Tailscale (vea la tarjeta de Tailscale).')),
            h('li', null, 'Si está en la planta: ', ipLan ? datoCopiar(conPuerto(ipLan)) : h('em', null, 'no se pudo leer la IP de este equipo.')))),
        h('li', null, 'Usuario: ', usuario ? h('strong', null, usuario) : 'el usuario de Windows de este servidor',
          usuario && nombre ? h('span', { class: 'texto-2' }, ` (si se lo pide así: ${nombre}\\${usuario})`) : null,
          '. Contraseña: la de Windows de este servidor.'),
        h('li', null, 'Mientras usted esté conectado, la pantalla de este equipo queda bloqueada. Al terminar cierre la ventana: el servidor y la app siguen funcionando.')),
      m && m.activo !== true ? h('p', { class: 'nota nota-aviso' }, icono('aviso', { tam: 16 }), h('span', null, 'El acceso remoto solo funciona con el modo servidor activo y desde un equipo permitido.')) : null);
  }
  pintarConexion(null);

  // ── estado ──
  function pintarEstado(m) {
    const n = !m ? 'desconocido' : m.activo === true ? 'ok' : m.parcial === true ? 'aviso' : 'apagado';
    estadoTarjeta.className = `tarjeta estado-general modo-estado nivel-${n}`;
    if (luz.dataset.nivel !== n) { luz.dataset.nivel = n; luz.replaceChildren(icono(ICONO_ESTADO[n], { tam: 32 })); }
    const ps = lista(m?.protecciones).filter(obj);
    const faltan = ps.filter((p) => p.ok !== true).length;
    poner(titulo, TITULO_ESTADO[n]);
    poner(detalle, {
      ok: 'Este equipo solo se controla a distancia, desde los equipos permitidos.',
      aviso: `Algunas protecciones están puestas y otras no${ps.length ? ` (faltan ${faltan} de ${ps.length})` : ''}. Pulse «Activar modo servidor» para completarlo o «Desactivar» para quitarlo.`,
      apagado: 'El equipo funciona normal: el botón de encendido lo apaga y el acceso remoto del panel está cerrado.',
      desconocido: 'No se pudo leer el estado del equipo.',
    }[n]);
    poner(fechaTxt, m?.activado_en ? `Activado ${relativo(m.activado_en)} (${fechaHora(m.activado_en)})` : '');
    actualizarBotones();
  }

  function actualizarBotones() {
    const ocupado = !!trabajoEnCurso;
    const activo = modo?.activo === true;
    const parcial = modo?.parcial === true;
    const cambio = !mismaLista(permitidos, permitidosDe(modo));
    btnActivar.hidden = activo && !cambio;
    poner(btnActivar.querySelector('span'), ocupado ? 'Aplicando…' : activo ? 'Aplicar la nueva lista' : 'Activar modo servidor');
    btnDesactivar.hidden = !(activo || parcial);
    btnActivar.disabled = ocupado || !modo;
    btnDesactivar.disabled = ocupado || !modo;
    btnBloquear.disabled = !modo;
    btnProgreso.hidden = !ocupado;
  }

  function aplicar(m) {
    modo = m;
    if (m && !editado) permitidos = permitidosDe(m);
    pintarEstado(m);
    pintarProtecciones(m);
    pintarAvisos(m?.avisos);
    pintarTailscale(m);
    pintarConexion(m);
    pintarPermitidos();
  }

  // ── acciones ──
  async function activar() {
    if (!permitidos.length) { mostrarErrorIp('Agregue al menos un equipo o red permitida (por ejemplo la red de Tailscale).'); entrada.focus(); return; }
    const lista_ = [...permitidos];
    const yaActivo = modo?.activo === true;
    const casilla = h('input', { type: 'checkbox', id: 'modo-bloquear' });
    const ok = await confirmar({
      titulo: yaActivo ? 'Aplicar la nueva lista de equipos permitidos' : 'Activar el modo servidor',
      mensaje: 'Este equipo quedará para controlarse solo a distancia, desde los equipos permitidos.',
      detalle: [
        'El botón de encendido y el de suspender dejan de hacer algo al pulsarlos.',
        'Desaparece «Apagar» de la pantalla de inicio de sesión y de bloqueo.',
        `Se enciende el Escritorio remoto con verificación previa (NLA), solo para: ${lista_.join(', ')}.`,
        'Se cierran las reglas generales de Escritorio remoto de Windows: ningún otro equipo puede intentar entrar.',
        'El equipo no se suspende ni hiberna.',
        'La app, la base de datos y el túnel siguen funcionando igual: no se reinicia nada.',
      ],
      extra: [
        h('p', { class: 'nota nota-aviso' }, icono('aviso', { tam: 16 }), h('span', null, 'Mantener el botón 4 segundos sigue apagando el equipo a la fuerza: eso lo hace el hardware y ningún programa lo puede impedir.')),
        h('label', { class: 'modo-casilla', for: 'modo-bloquear' }, casilla, h('span', null, 'Bloquear la pantalla al terminar')),
      ],
      peligro: 'medio', admin: true, textoBoton: yaActivo ? 'Aplicar la nueva lista' : 'Activar modo servidor',
    });
    if (!ok) return;
    const t = await lanzarTrabajo('/api/modo/activar', { permitidos: lista_, bloquear: casilla.checked }, {
      errorPrefijo: 'No se pudo activar el modo servidor',
      alTerminar: (x) => terminado(x),
    });
    if (t) ponerTrabajo(t);
  }

  async function desactivar() {
    const ok = await confirmar({
      titulo: 'Desactivar el modo servidor',
      mensaje: 'El equipo vuelve a funcionar normal.',
      detalle: [
        'El botón de encendido vuelve a apagar el equipo y vuelve «Apagar» a la pantalla de inicio de sesión.',
        'Se apaga el Escritorio remoto y se borra la regla «IncubApp acceso remoto».',
        'Si usted está conectado a distancia, se cortará su conexión y no podrá volver a entrar hasta que alguien active el modo desde la planta.',
        'La app, la base de datos y el túnel siguen funcionando igual.',
      ],
      peligro: 'alto', admin: true, textoBoton: 'Desactivar',
    });
    if (!ok) return;
    const t = await lanzarTrabajo('/api/modo/desactivar', {}, {
      errorPrefijo: 'No se pudo desactivar el modo servidor',
      alTerminar: (x) => terminado(x),
    });
    if (t) ponerTrabajo(t);
  }

  function terminado(x) {
    ponerTrabajo(null);
    if (x?.estado === 'ok') {
      editado = false;
      const e = obj(x?.resultado?.estado);
      if (e) { aplicar(e); bus.emit('modo', e); }
      if (x?.resultado?.ok === false) aviso(x.resultado.mensaje || 'El modo servidor quedó a medias: revise la lista de protecciones.', 'aviso');
    }
    tCarga.ya();
  }

  async function bloquear() {
    const ok = await confirmar({
      titulo: 'Bloquear la pantalla ahora',
      mensaje: 'Se bloquea la pantalla de este equipo (igual que con Windows + L).',
      detalle: ['Para volver a entrar hace falta la contraseña de Windows de este equipo.', 'El servidor, la app y este panel siguen funcionando.'],
      peligro: 'medio', textoBoton: 'Bloquear pantalla',
    });
    if (!ok) return;
    try {
      const r = await api.post('/api/modo/bloquear', {});
      if (r?.ok === false) aviso('Windows no bloqueó la pantalla.', 'error');
      else aviso('Pantalla bloqueada.', 'ok', { duracion: 3000 });
    } catch (e) { avisoError(e, 'No se pudo bloquear la pantalla'); }
  }

  function ponerTrabajo(t) {
    trabajoEnCurso = t;
    actualizarBotones();
    if (t) seguirTrabajo(t, () => { ponerTrabajo(null); tCarga.ya(); });
  }
  // un trabajo del modo lanzado antes (o desde otra pantalla) también deshabilita los botones
  bus.on('trabajos', (ts) => {
    const t = lista(ts).find((x) => x?.tipo === 'modo' && x.estado === 'corriendo') || null;
    if ((t?.id || null) !== (trabajoEnCurso?.id || null)) ponerTrabajo(t);
  });
  bus.on('trabajo-terminado', (t) => { if (t?.tipo === 'modo') tCarga.ya(); });
  bus.on('actualizar-todo', () => tCarga.ya());

  // ── armado ──
  const errorCaja = h('div');
  const el = h('div', { class: 'seccion' },
    cabecera('Modo servidor', 'modo', 'Para cuando usted no está en la planta: este equipo se controla solo a distancia, desde sus equipos.',
      boton('Abrir el manual (PDF)', { icono: 'manual', alPulsar: () => abrirDestino('manual') })),
    errorCaja,
    estadoTarjeta,
    tarjeta({ titulo: 'Lo que ningún programa puede impedir', icono: 'aviso', cuerpo: [avisosCaja] }),
    h('div', { class: 'rejilla rejilla-2', style: { 'align-items': 'start' } },
      h('div', { class: 'columna' },
        tarjeta({ titulo: 'Protecciones', icono: 'modo', subtitulo: protSub, cuerpo: [protCaja] }),
        tarjeta({
          titulo: 'Equipos permitidos para el acceso remoto', icono: 'remoto',
          cuerpo: [
            h('p', { class: 'texto-2' }, 'Solo estos equipos llegan al Escritorio remoto. Desde fuera de la planta se entra por Tailscale: deje su red en la lista.'),
            listaPerm, notaSinTs,
            h('div', { class: 'modo-agregar' },
              h('div', { class: 'campo' }, h('label', { for: 'modo-nueva-ip' }, 'Agregar una IP o una red'), entrada),
              boton('Agregar', { icono: 'mas', alPulsar: () => agregarDesdeEntrada() })),
            h('div', { class: 'grupo-botones' }, btnTs),
            dispCaja,
            errorIp,
            notaCambios,
          ],
        })),
      h('div', { class: 'columna' },
        tarjeta({ titulo: 'Tailscale: entrar desde fuera de la planta', icono: 'publico', cuerpo: [tsCaja] }),
        tarjeta({ titulo: 'Cómo conectarse desde su PC', icono: 'remoto', cuerpo: [conCaja] }))));
  pintarPermitidos();

  // ── datos ──
  async function cargar() {
    const r = obj(await api.get('/api/modo', { timeout: 60000 }));
    if (!r) throw new Error('El panel devolvió una respuesta vacía.');
    aplicar(r);
    bus.emit('modo', r);
  }
  const tCarga = periodico(async () => {
    try { await cargar(); vaciar(errorCaja); } catch (e) {
      if (e?.estado === 401 || e?.estado === 0) return;
      aplicar(null);
      vaciar(errorCaja, bloqueError(e?.estado === 503 ? `La parte «modo servidor» del panel no cargó: ${e.message}` : (e?.message || 'Error desconocido.'), () => tCarga.ya()));
    }
  }, 60000);

  return {
    el,
    mostrar() {
      tCarga.iniciar();
      if (!dispCargados) {
        dispCargados = true;
        const cargarDisp = () => cargarEn(dispCaja, cargarDispositivos, { reintentar: () => cargarDisp() });
        cargarDisp();
      }
    },
    ocultar() { tCarga.detener(); },
  };
}
