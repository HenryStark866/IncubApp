// Panel IncubApp · RED de la empresa: internet (calidad y cortes), equipos conectados
// (inventario editable), auditoría de la red y herramientas (ping, traceroute, DNS, HTTP,
// puerto, Wake-on-LAN, UPnP). Los nombres de equipos y títulos web los puede poner cualquiera
// en la red: SIEMPRE se muestran como texto.
import { h, lista, obj, esNum, num, pct, ms, texto, vaciar, poner, relativo, fechaHora, fechaHoraCorta, duracion, bus, debounce, prefs, esIPv4, esMAC } from '../util.js';
import { api, conParametros } from '../api.js';
import { icono, iconoDispositivo } from '../iconos.js';
import { boton, botonIcono, interruptor, pestanas, segmentado, insigniaNivel, nivelValido, NIVELES, vacio, confirmar, dialogo, aviso, avisoError, chip, tarjeta, bloqueError } from '../ui.js';
import { GraficaLineas, medidor, aEpoch, nivelPuntaje } from '../graficas.js';
import { VistaHallazgos, conteoSeveridades, listaAlertas } from '../hallazgos.js';
import { lanzarTrabajo } from '../lanzador.js';
import { abrirTrabajo, seguirTrabajo } from '../consola.js';
import { vistaResultado } from '../resultados.js';
import { cabecera, cargarEn, periodico, Tabla } from './comun.js';

const RANGOS = [{ valor: '1', texto: '1 h' }, { valor: '6', texto: '6 h' }, { valor: '24', texto: '24 h' }, { valor: '168', texto: '7 días' }];
const PERFILES = [
  { id: 'rapido', texto: 'Rápido (20 puertos comunes, segundos)' },
  { id: 'comun', texto: 'Común (~100 puertos, menos de un minuto)' },
  { id: 'industrial', texto: 'Industrial (PLC, SCADA, cámaras)' },
  { id: 'completo', texto: 'Completo (1 a 1024 y más, tarda varios minutos)' },
];
const TIPOS = { router: 'Router', camara: 'Cámara', impresora: 'Impresora', pc: 'Computador', celular: 'Celular', plc: 'PLC / industrial', desconocido: 'Desconocido' };

export function crear({ marcarNav }) {
  let resumenRed = null;
  let dispositivos = [];
  let filtroDisp = 'todos';
  let buscarDisp = '';
  const resaltados = new Set();

  // ── resumen ──
  const resCaja = h('div', { class: 'rejilla rejilla-3' });
  const alertasCaja = h('div');

  // ── calidad de internet ──
  let horas = String(prefs.get('red.horas', '24'));
  if (!RANGOS.some((r) => r.valor === horas)) horas = '24';
  const graf = new GraficaLineas({
    etiqueta: 'Latencia de la red', area: false, min: 0,
    series: [{ clave: 'puerta', nombre: 'Puerta de enlace', color: 2 }, { clave: '1.1.1.1', nombre: 'Cloudflare 1.1.1.1', color: 1 }, { clave: '8.8.8.8', nombre: 'Google 8.8.8.8', color: 3 }, { clave: 'dns_ms', nombre: 'Consulta DNS', color: 5 }],
    formato: (v, eje) => (eje ? `${num(v)} ms` : ms(v)),
  });
  const perdidaCaja = h('div', { class: 'chips' });
  const cortesCaja = h('div');
  const calErr = h('div');
  const rangoCal = segmentado({ etiqueta: 'Rango de tiempo', opciones: RANGOS, valor: horas, alCambiar: (v) => { horas = v; prefs.set('red.horas', v); tCal.ya(); } });
  const calidad = tarjeta({ titulo: 'Calidad de internet', icono: 'wifi', subtitulo: 'latencia (ms); las franjas rojas son cortes', acciones: rangoCal,
    cuerpo: [calErr, graf.el, h('div', { class: 'rejilla rejilla-2', style: { 'align-items': 'start' } },
      h('div', null, h('div', { class: 'campo-etiqueta', style: { 'margin-bottom': '6px' } }, 'Paquetes perdidos en el rango'), perdidaCaja),
      h('div', null, h('div', { class: 'campo-etiqueta', style: { 'margin-bottom': '6px' } }, 'Cortes'), cortesCaja))] });

  // ── dispositivos ──
  const tDisp = new Tabla({
    etiqueta: 'Equipos de la red', clave: (d) => d.mac || d.ip,
    orden: { clave: 'ip', desc: false }, vacio: 'No hay equipos para mostrar. Pulse «Escanear la red».',
    claseFila: (d) => [resaltados.has(d.mac) ? 'resaltada' : '', d.en_linea === false ? 'atenuada' : ''].join(' ').trim(),
    firma: (d) => JSON.stringify([d, resaltados.has(d.mac), Math.floor(Date.now() / 60000)]),
    columnas: [
      { clave: 'nombre', titulo: 'Equipo', ordenar: (d) => (d.nombre || d.nombre_red || '~').toLowerCase(), celda: celdaEquipo },
      { clave: 'ip', titulo: 'Dirección', ordenar: (d) => ipNum(d.ip), celda: (d) => h('div', null,
        h('span', { class: 'mono celda-principal' }, texto(d.ip)),
        h('span', { class: 'celda-sub mono' }, texto(d.mac, '')), d.mac_aleatoria ? chip('MAC aleatoria', 'chip-admin') : null) },
      { clave: 'fabricante', titulo: 'Fabricante', ordenar: (d) => d.fabricante || '~', celda: (d) => h('span', { class: 'romper' }, texto(d.fabricante, 'Desconocido')) },
      { clave: 'conocido', titulo: 'Conocido', ordenar: (d) => (d.conocido ? 1 : 0), celda: (d) => {
        const sw = interruptor({ etiqueta: `Marcar ${texto(d.nombre || d.ip)} como conocido`, valor: !!d.conocido, oculto: true, alCambiar: (v) => guardar(d, { conocido: v }) });
        return h('div', { class: 'grupo-botones' }, sw, !d.conocido ? chip('Sin identificar', 'chip-nuevo') : null);
      } },
      { clave: 'en_linea', titulo: 'En línea', ordenar: (d) => (d.en_linea ? 0 : 1), celda: (d) => h('div', null,
        d.en_linea ? h('span', { class: 'en-linea-si' }, icono('ok', { tam: 14 }), ' Sí') : h('span', { class: 'en-linea-no' }, icono('apagado', { tam: 14 }), ' No'),
        h('span', { class: 'celda-sub', title: fechaHora(d.ultima_vez) }, [d.ultima_vez ? `visto ${relativo(d.ultima_vez)}` : null, d.en_linea && esNum(d.ms) ? ms(d.ms) : null].filter(Boolean).join(' · '))) },
      { clave: 'primera_vez', titulo: 'Primera vez', clase: 'col-secundaria', ordenar: (d) => d.primera_vez || '', celda: (d) => h('span', { title: fechaHora(d.primera_vez) }, d.primera_vez ? fechaHoraCorta(d.primera_vez) : '—') },
      { clave: 'puertos', titulo: 'Puertos', celda: (d) => (lista(d.puertos).length ? h('div', { class: 'chips', style: { 'max-width': '170px' } }, lista(d.puertos).slice(0, 8).map((p) => chip(String(p))), lista(d.puertos).length > 8 ? chip(`+${lista(d.puertos).length - 8}`) : null) : h('span', { class: 'texto-3' }, '—')) },
      { clave: 'acciones', titulo: '', clase: 'min', celda: (d) => h('div', { class: 'grupo-botones', style: { 'flex-wrap': 'nowrap' } },
        botonIcono('puertos', `Escanear puertos de ${texto(d.ip)}`, { alPulsar: () => dialogoPuertos(d.ip) }),
        botonIcono('editar', 'Editar nombre y notas', { alPulsar: () => editar(d) }),
        botonIcono('basura', 'Olvidar este equipo', { clase: 'peligro', alPulsar: () => olvidar(d) })) },
    ],
  });

  function celdaEquipo(d) {
    const entrada = h('input', { class: 'entrada', type: 'text', value: d.nombre || '', placeholder: d.nombre_red ? `${d.nombre_red}` : 'Ponerle nombre…', 'aria-label': `Nombre para ${texto(d.ip)}`, maxlength: '60', spellcheck: 'false' });
    const enviar = () => { const v = entrada.value.trim(); if (v !== (d.nombre || '')) guardar(d, { nombre: v }); };
    entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); entrada.blur(); } if (e.key === 'Escape') { entrada.value = d.nombre || ''; entrada.blur(); } });
    entrada.addEventListener('change', enviar);
    return h('div', { class: 'celda-editar' },
      h('span', { class: 'dispositivo-ico', title: TIPOS[d.tipo] || 'Equipo' }, icono(iconoDispositivo(d.tipo), { tam: 18 })),
      h('div', { style: { 'min-width': '0', flex: '1' } }, entrada,
        h('span', { class: 'celda-sub', style: { 'padding-left': '8px' } }, [d.nombre_red ? `En la red: ${d.nombre_red}` : null, TIPOS[d.tipo] && d.tipo !== 'desconocido' ? TIPOS[d.tipo] : null, d.notas || null].filter(Boolean).join(' · ')),
        resaltados.has(d.mac) ? chip('Nuevo', 'chip-nuevo') : null));
  }
  const ipNum = (ip) => (esIPv4(ip) ? ip.split('.').reduce((a, b) => a * 256 + Number(b), 0) : Infinity);

  async function guardar(d, cambios) {
    try {
      const r = await api.post('/api/red/dispositivos', { mac: d.mac, ...cambios });
      const nuevo = obj(r) && (r.mac || r.ip) ? r : { ...d, ...cambios };
      dispositivos = dispositivos.map((x) => (x.mac === d.mac ? { ...x, ...nuevo } : x));
      pintarDisp();
      aviso('Guardado.', 'ok', { duracion: 2000 });
    } catch (e) { avisoError(e, 'No se pudo guardar'); pintarDisp(); }
  }

  async function editar(d) {
    const nom = h('input', { class: 'entrada', id: 'dsp-nombre', value: d.nombre || '', maxlength: '60', placeholder: texto(d.nombre_red, 'Nombre del equipo') });
    const notas = h('textarea', { class: 'entrada', id: 'dsp-notas', rows: '3', maxlength: '300' });
    notas.value = d.notas || '';
    const conocido = h('input', { type: 'checkbox', id: 'dsp-conocido', checked: !!d.conocido });
    const r = await dialogo({
      titulo: `Equipo ${texto(d.ip)}`, icono: iconoDispositivo(d.tipo),
      cuerpo: [
        h('dl', { class: 'lista-datos' }, h('dt', null, 'MAC'), h('dd', { class: 'mono' }, texto(d.mac)), h('dt', null, 'Fabricante'), h('dd', null, texto(d.fabricante, 'Desconocido')), h('dt', null, 'Nombre en la red'), h('dd', null, texto(d.nombre_red))),
        h('div', { class: 'campo' }, h('label', { for: 'dsp-nombre' }, 'Nombre'), nom),
        h('div', { class: 'campo' }, h('label', { for: 'dsp-notas' }, 'Notas (dónde está, de quién es…)'), notas),
        h('label', { class: 'interruptor', for: 'dsp-conocido', style: { gap: '8px' } }, conocido, h('span', null, 'Es un equipo conocido de la empresa')),
      ],
      botones: [{ texto: 'Cancelar', valor: null, clase: 'boton-sutil' }, { texto: 'Guardar', valor: 'si', clase: 'boton-primario', icono: 'guardar' }],
    });
    if (r === 'si') guardar(d, { nombre: nom.value.trim(), notas: notas.value.trim(), conocido: conocido.checked });
  }

  async function olvidar(d) {
    const ok = await confirmar({ titulo: 'Olvidar este equipo', mensaje: `¿Quitar ${texto(d.nombre || d.nombre_red || d.ip)} (${texto(d.mac)}) del inventario?`, detalle: 'Si vuelve a aparecer en la red, se mostrará como equipo nuevo.', peligro: 'medio', textoBoton: 'Olvidar' });
    if (!ok) return;
    try {
      await api.post('/api/red/dispositivos/olvidar', { mac: d.mac });
      dispositivos = dispositivos.filter((x) => x.mac !== d.mac);
      pintarDisp();
      aviso('Equipo olvidado.', 'ok', { duracion: 2500 });
    } catch (e) { avisoError(e, 'No se pudo olvidar'); }
  }

  async function dialogoPuertos(host) {
    const inHost = h('input', { class: 'entrada', id: 'pt-host', value: host || '', maxlength: '253', spellcheck: 'false' });
    const selPerfil = h('select', { class: 'entrada', id: 'pt-perfil' }, PERFILES.map((p) => h('option', { value: p.id, selected: p.id === 'comun' }, p.texto)));
    const r = await dialogo({
      titulo: 'Escanear puertos', icono: 'puertos',
      cuerpo: [
        h('p', { class: 'texto-2' }, 'Revisa qué servicios responden en ese equipo (solo prueba conectarse; no cambia nada en él).'),
        h('div', { class: 'campo' }, h('label', { for: 'pt-host' }, 'Equipo (IP o nombre)'), inHost),
        h('div', { class: 'campo' }, h('label', { for: 'pt-perfil' }, 'Qué tan a fondo'), selPerfil),
      ],
      botones: [{ texto: 'Cancelar', valor: null, clase: 'boton-sutil' }, { texto: 'Escanear', valor: 'si', clase: 'boton-primario', icono: 'radar' }],
      validar: () => (validarHost(inHost.value.trim()) ? null : 'Escriba una IP (por ejemplo 192.168.5.1) o un nombre válido.'),
    });
    if (r !== 'si') return;
    lanzarTrabajo('/api/red/puertos', { host: inHost.value.trim(), perfil: selPerfil.value }, { errorPrefijo: 'No se pudo iniciar el escaneo', alTerminar: () => tDispC.ya() });
  }
  const validarHost = (x) => esIPv4(x) || /^[A-Za-z0-9.-]{1,253}$/.test(x);

  const segDisp = segmentado({
    etiqueta: 'Filtrar equipos', valor: 'todos',
    opciones: [{ valor: 'todos', texto: 'Todos' }, { valor: 'linea', texto: 'En línea' }, { valor: 'nuevos', texto: 'Nuevos y sin identificar' }],
    alCambiar: (v) => { filtroDisp = v; pintarDisp(); },
  });
  const inDisp = h('input', { class: 'entrada', type: 'search', placeholder: 'Buscar IP, MAC, nombre o fabricante…', 'aria-label': 'Buscar equipo' });
  inDisp.addEventListener('input', debounce(() => { buscarDisp = inDisp.value.trim().toLowerCase(); pintarDisp(); }, 150));
  const dispResumen = h('span', { class: 'texto-2' });
  const dispCaja = h('div', null, tDisp.el);
  function pintarDisp() {
    let ds = dispositivos;
    if (filtroDisp === 'linea') ds = ds.filter((d) => d.en_linea);
    else if (filtroDisp === 'nuevos') ds = ds.filter((d) => !d.conocido || resaltados.has(d.mac));
    if (buscarDisp) ds = ds.filter((d) => [d.ip, d.mac, d.nombre, d.nombre_red, d.fabricante, d.notas, TIPOS[d.tipo]].some((x) => String(x ?? '').toLowerCase().includes(buscarDisp)));
    tDisp.poner(ds);
    const enLinea = dispositivos.filter((d) => d.en_linea).length;
    const sinId = dispositivos.filter((d) => !d.conocido).length;
    poner(dispResumen, `${dispositivos.length} equipos · ${enLinea} en línea · ${sinId} sin identificar`);
  }
  async function cargarDisp() {
    const r = await api.get('/api/red/dispositivos', { timeout: 30000 });
    dispositivos = lista(r?.dispositivos).filter((d) => obj(d) && (d.mac || d.ip));
    if (!dispCaja.contains(tDisp.el)) vaciar(dispCaja, tDisp.el);
    pintarDisp();
  }

  // ── auditoría de la red ──
  const audMed = h('div');
  const audTitulo = h('h3', null, 'Sin auditoría de la red todavía');
  const audConteo = h('div');
  const audFecha = h('span', { class: 'texto-3 texto-chico' });
  const audVista = new VistaHallazgos({ mensajeVacio: 'Pulse «Auditar la red» para revisar el router, el DNS, UPnP, los equipos industriales y las cámaras.' });
  const audSw = interruptor({ etiqueta: 'Ocultar las revisiones que están bien', valor: true, alCambiar: (v) => { audVista.ocultarOk = v; audVista.dibujar(); } });
  const btnAudRed = boton('Auditar la red', { icono: 'escudo', clase: 'boton-primario', alPulsar: () => auditarRed() });
  const audErr = h('div');
  async function cargarAuditoria() {
    const r = await api.get('/api/red/auditoria', { timeout: 30000 });
    const a = obj(r?.auditoria);
    vaciar(audMed, medidor(a?.puntaje, { tam: 120, grosor: 11, etiqueta: 'Puntaje de la red' }));
    poner(audTitulo, a ? `${esNum(a.puntaje) ? `${Math.round(a.puntaje)} de 100 · ` : ''}${({ ok: 'Red bien protegida', aviso: 'La red se puede mejorar', falla: 'La red tiene riesgos importantes', desconocido: 'Sin puntaje' })[nivelPuntaje(a.puntaje)]}` : 'Sin auditoría de la red todavía');
    vaciar(audConteo, a ? conteoSeveridades(a.resumen) : null);
    poner(audFecha, a?.generado ? `Última auditoría ${relativo(a.generado)}${esNum(a.segundos) ? ` · tardó ${num(a.segundos, 1)} s` : ''}` : '');
    audVista.poner(a?.hallazgos || []);
    const t = obj(r?.trabajo);
    if (t?.estado === 'corriendo') { btnAudRed.disabled = true; seguirTrabajo(t, () => { btnAudRed.disabled = false; cargarEn(audErr, cargarAuditoria, { silencioso: true }); }); }
  }
  async function auditarRed() {
    btnAudRed.disabled = true;
    const t = await lanzarTrabajo('/api/red/auditar', {}, { errorPrefijo: 'No se pudo iniciar la auditoría de la red', alTerminar: () => { btnAudRed.disabled = false; cargarEn(audErr, cargarAuditoria, { silencioso: true }); } });
    if (!t) btnAudRed.disabled = false;
  }

  // ── herramientas ──
  function herramienta(tipo, descripcion, campos, armar) {
    const resultado = h('div', { class: 'herramienta-resultado' }, vacio('El resultado aparece aquí (y la salida completa en la consola del trabajo).', 'terminal'));
    const error = h('p', { class: 'dialogo-error', role: 'alert', hidden: true });
    const btn = boton('Ejecutar', { icono: 'play', clase: 'boton-primario', tipo: 'submit' });
    const form = h('form', { class: 'formulario', novalidate: true }, h('p', { class: 'texto-2' }, descripcion), h('div', { class: 'fila-campos' }, campos.map((c) => c.el)), error, h('div', null, btn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const params = armar();
      if (typeof params === 'string') { error.textContent = params; error.hidden = false; return; }
      error.hidden = true;
      btn.disabled = true;
      vaciar(resultado, h('div', { class: 'cargando' }, h('span', { class: 'girando' }, icono('cargando', { tam: 18 })), 'Ejecutando…'));
      const t = await lanzarTrabajo('/api/red/herramienta', { tipo, ...params }, {
        errorPrefijo: 'No se pudo ejecutar',
        alTerminar: (x) => { btn.disabled = false; vaciar(resultado, vistaResultado(x) || vacio('Sin resultado.')); },
      });
      if (!t) { btn.disabled = false; vaciar(resultado, vacio('No se ejecutó.', 'falla')); }
    });
    return h('div', { class: 'herramienta' }, tarjeta({ cuerpo: [form] }), tarjeta({ titulo: 'Resultado', icono: 'lista', cuerpo: [resultado] }));
  }
  function campo(etiqueta, attrs, ayuda = null, angosto = false) {
    const id = `hr-${Math.random().toString(36).slice(2, 8)}`;
    const input = h('input', { class: 'entrada', id, autocomplete: 'off', spellcheck: 'false', ...attrs });
    return { el: h('div', { class: `campo${angosto ? ' angosto' : ''}` }, h('label', { for: id }, etiqueta), input, ayuda ? h('span', { class: 'campo-ayuda' }, ayuda) : null), input };
  }
  const puerta = () => resumenRed?.puerta || '192.168.5.1';
  const cPingHost = campo('Equipo (IP o nombre)', { value: '192.168.5.1', maxlength: '253' });
  const cPingN = campo('Veces', { type: 'number', min: '1', max: '50', value: '4' }, null, true);
  const cTrHost = campo('Destino', { value: '1.1.1.1', maxlength: '253' });
  const cDns = campo('Nombre a consultar', { value: 'incubapp.cdhmaker.com', maxlength: '253' });
  const cHttp = campo('Dirección web', { value: 'https://incubapp.cdhmaker.com', maxlength: '300' }, 'Debe empezar por http:// o https://');
  const cPtHost = campo('Equipo', { value: '192.168.5.1', maxlength: '253' });
  const cPtN = campo('Puerto', { type: 'number', min: '1', max: '65535', value: '80' }, null, true);
  const cWol = campo('MAC del equipo', { placeholder: '00:23:24:AA:BB:CC', maxlength: '17', list: 'lista-macs' }, 'El equipo debe tener Wake-on-LAN activado en su BIOS/tarjeta de red.');
  const listaMacs = h('datalist', { id: 'lista-macs' });
  const hostOk = (x) => (validarHost(x) ? null : 'Escriba una IP (por ejemplo 192.168.5.1) o un nombre válido.');
  const herrTabs = pestanas({
    etiqueta: 'Herramientas de red', clase: 'pestanas-chicas',
    items: [{ id: 'ping', titulo: 'Ping', icono: 'ping' }, { id: 'traceroute', titulo: 'Traceroute', icono: 'ruta' }, { id: 'dns', titulo: 'DNS', icono: 'dns' }, { id: 'http', titulo: 'HTTP', icono: 'web' }, { id: 'puerto', titulo: 'Puerto', icono: 'puertos' }, { id: 'wol', titulo: 'Wake-on-LAN', icono: 'encender' }, { id: 'upnp', titulo: 'UPnP', icono: 'upnp' }],
  });
  herrTabs.paneles.get('ping').append(herramienta('ping', '¿Responde un equipo? Mide cuánto tarda y si se pierden paquetes.', [cPingHost, cPingN], () => {
    const host = cPingHost.input.value.trim(); const n = Number(cPingN.input.value);
    return hostOk(host) || (!(n >= 1 && n <= 50) ? 'La cantidad debe estar entre 1 y 50.' : { host, cantidad: n });
  }));
  herrTabs.paneles.get('traceroute').append(herramienta('traceroute', 'Muestra por dónde pasan los paquetes hasta llegar a un destino (sirve para ver dónde se corta internet).', [cTrHost], () => {
    const host = cTrHost.input.value.trim(); return hostOk(host) || { host };
  }));
  herrTabs.paneles.get('dns').append(herramienta('dns', 'Compara lo que responde el DNS de la empresa con 1.1.1.1 y 8.8.8.8 (si no coinciden, puede haber un problema o una suplantación).', [cDns], () => {
    const nombre = cDns.input.value.trim(); return /^[A-Za-z0-9.-]{1,253}$/.test(nombre) ? { nombre } : 'Escriba un nombre válido, por ejemplo incubapp.cdhmaker.com.';
  }));
  herrTabs.paneles.get('http').append(herramienta('http', 'Abre una dirección web y revisa el código, el tiempo, las cabeceras de seguridad y el certificado.', [cHttp], () => {
    const url = cHttp.input.value.trim(); return /^https?:\/\/[^\s]{1,300}$/i.test(url) ? { url } : 'Escriba una dirección que empiece por http:// o https://';
  }));
  herrTabs.paneles.get('puerto').append(herramienta('puerto', 'Prueba si un puerto de un equipo acepta conexiones.', [cPtHost, cPtN], () => {
    const host = cPtHost.input.value.trim(); const p = Number(cPtN.input.value);
    return hostOk(host) || (!(p >= 1 && p <= 65535) ? 'El puerto debe estar entre 1 y 65535.' : { host, puerto: p });
  }));
  herrTabs.paneles.get('wol').append(listaMacs, herramienta('wol', 'Enciende un equipo apagado de la red mandándole un «paquete mágico».', [cWol], () => {
    const mac = cWol.input.value.trim(); return esMAC(mac) ? { mac } : 'Escriba una MAC válida, por ejemplo 00:23:24:AA:BB:CC.';
  }));
  herrTabs.paneles.get('upnp').append(herramienta('upnp', 'Busca equipos que anuncian servicios UPnP (routers, impresoras, televisores…). Un router con UPnP activo deja que cualquier programa abra puertos hacia internet.', [], () => ({})));

  // ── pestañas principales ──
  const cargadas = new Set();
  const tabs = pestanas({
    etiqueta: 'Red',
    items: [{ id: 'dispositivos', titulo: 'Equipos conectados', icono: 'dispositivo' }, { id: 'auditoria', titulo: 'Auditoría de la red', icono: 'escudo' }, { id: 'herramientas', titulo: 'Herramientas', icono: 'terminal' }],
    alCambiar: (id) => { if (id === 'auditoria' && !cargadas.has(id)) { cargadas.add(id); cargarEn(audErr, cargarAuditoria); } },
  });
  tabs.paneles.get('dispositivos').append(h('div', { class: 'columna' },
    h('div', { class: 'barra-herramientas' }, h('div', { class: 'entrada-buscar' }, icono('buscar', { tam: 16 }), inDisp), segDisp, h('span', { class: 'espacio' }), dispResumen),
    dispCaja,
    h('p', { class: 'nota' }, icono('info_c', { tam: 16 }), h('span', null, 'Póngale nombre a cada equipo y márquelo como «conocido». Así el panel avisa cuando aparece uno que nadie reconoce. Los nombres «en la red» los pone cada equipo y pueden ser falsos.'))));
  tabs.paneles.get('auditoria').append(h('div', { class: 'columna' },
    audErr,
    h('section', { class: 'tarjeta' }, h('div', { class: 'puntaje-caja' }, audMed, h('div', { class: 'puntaje-texto' }, audTitulo, audConteo, audFecha), h('div', { style: { 'align-self': 'flex-start' } }, btnAudRed))),
    h('div', { class: 'barra-herramientas' }, audSw), audVista.el));
  tabs.paneles.get('herramientas').append(h('div', { class: 'columna' }, herrTabs.lista, ...herrTabs.paneles.values()));

  const btnEscanear = boton('Escanear la red', { icono: 'radar', clase: 'boton-primario', alPulsar: () => escanear() });
  const btnFab = boton('Actualizar base de fabricantes', { icono: 'descargar', clase: 'boton-sutil', titulo: 'Descarga de internet la lista de fabricantes de tarjetas de red (Wireshark)', alPulsar: () => fabricantes() });
  const errRes = h('div');
  const el = h('div', { class: 'seccion' },
    cabecera('Red', 'red', 'La red de la empresa: internet, equipos conectados y revisiones de seguridad.', [btnFab, btnEscanear]),
    errRes, resCaja, alertasCaja, calidad,
    h('div', null, tabs.lista, ...tabs.paneles.values()));

  async function escanear() {
    btnEscanear.disabled = true;
    const t = await lanzarTrabajo('/api/red/escanear', { red: null }, {
      errorPrefijo: 'No se pudo iniciar el escaneo',
      alTerminar: (x) => {
        btnEscanear.disabled = false;
        for (const d of lista(x?.resultado?.nuevos)) if (d?.mac) resaltados.add(d.mac);
        tDispC.ya(); tRes.ya();
        if (resaltados.size) { tabs.activar('dispositivos'); }
      },
    });
    if (!t) btnEscanear.disabled = false;
  }
  async function fabricantes() {
    const ok = await confirmar({ titulo: 'Actualizar base de fabricantes', mensaje: 'Se descarga de internet (wireshark.org) la lista pública de fabricantes de tarjetas de red, para reconocer mejor los equipos.', detalle: 'Necesita internet. Tarda menos de un minuto.', peligro: 'bajo', textoBoton: 'Descargar' });
    if (ok) lanzarTrabajo('/api/red/fabricantes', {}, { errorPrefijo: 'No se pudo actualizar', alTerminar: () => tDispC.ya() });
  }

  // ── resumen y calidad ──
  // (el backend real a veces manda objetos vacíos en la lista de DNS: solo se muestran textos)
  const dnsTexto = (xs) => lista(xs).filter((v) => typeof v === 'string' && v).join(', ');
  function pintarResumen(r) {
    resumenRed = r;
    const i = obj(r?.internet);
    const d = obj(r?.dispositivos);
    const ifs = lista(r?.interfaces).filter(obj);
    if (!cPingHost.input.dataset.tocado && r?.puerta) { cPingHost.input.value = puerta(); cPtHost.input.value = puerta(); }
    vaciar(resCaja,
      tarjeta({ titulo: 'Internet', icono: 'wifi', cuerpo: [
        i ? insigniaNivel(i.nivel, texto(i.texto, NIVELES[nivelValido(i.nivel)].texto)) : vacio('Sin datos del monitor de internet.'),
        i ? h('dl', { class: 'lista-datos' },
          h('dt', null, 'Puerta de enlace'), h('dd', null, ms(i.puerta_ms)),
          h('dt', null, 'Internet'), h('dd', null, ms(i.internet_ms)),
          h('dt', null, 'DNS'), h('dd', null, ms(i.dns_ms)),
          h('dt', null, 'Paquetes perdidos'), h('dd', null, pct(i.perdida_pct, 1))) : null] }),
      tarjeta({ titulo: 'Esta red', icono: 'router', cuerpo: [
        h('dl', { class: 'lista-datos' },
          h('dt', null, 'Red'), h('dd', { class: 'mono' }, texto(r?.red)),
          h('dt', null, 'Puerta de enlace'), h('dd', { class: 'mono' }, texto(r?.puerta))),
        ifs.length ? h('div', { class: 'interfaces' }, ifs.map((x) => h('div', { class: 'interfaz' },
          h('strong', null, texto(x.nombre)), h('span', { class: 'texto-2' }, ` · ${texto(x.tipo, '')}`),
          h('div', { class: 'mono texto-2' }, `${texto(x.ip)}${x.mascara ? ` / ${x.mascara}` : ''}${x.mac ? ` · ${x.mac}` : ''}`),
          dnsTexto(x.dns) ? h('div', { class: 'texto-3 texto-chico' }, `DNS: ${dnsTexto(x.dns)}`) : null))) : null] }),
      tarjeta({ titulo: 'Equipos', icono: 'dispositivo', cuerpo: [d ? h('dl', { class: 'lista-datos' },
        h('dt', null, 'En la red'), h('dd', null, esNum(d.en_linea) ? `${num(d.total)} (${num(d.en_linea)} en línea ahora)` : num(d.total)),
        h('dt', null, 'Conocidos'), h('dd', null, num(d.conocidos)),
        h('dt', null, 'Nuevos'), h('dd', null, d.nuevos ? h('span', { class: 'chip chip-nuevo' }, `${num(d.nuevos)} sin identificar`) : 'ninguno'),
        h('dt', null, 'Último escaneo'), h('dd', null, d.ultimo_escaneo ? relativo(d.ultimo_escaneo) : 'nunca')) : vacio('Sin datos.')] }));
    const al = listaAlertas(r?.alertas);
    vaciar(alertasCaja, al ? tarjeta({ titulo: 'Alertas de la red', icono: 'campana', clase: 'tarjeta-alertas', cuerpo: [al] }) : null);
    const n = lista(r?.alertas).filter((x) => x && !['ok', 'info'].includes(x.nivel)).length;
    marcarNav('red', n, lista(r?.alertas).some((x) => ['critico', 'alto'].includes(x?.nivel)) ? 'falla' : 'aviso');
  }
  async function cargarCalidad() {
    const c = await api.get(conParametros('/api/red/calidad', { horas }), { timeout: 30000 });
    const ahora = Date.now() / 1000;
    const cortes = lista(c?.cortes).filter(obj);
    graf.poner({ t: lista(c?.t), series: obj(c?.series) || {}, desde: ahora - Number(horas) * 3600, hasta: ahora,
      sombras: cortes.map((x) => ({ inicio: aEpoch(x.inicio), fin: aEpoch(x.fin) ?? ahora, texto: `Corte ${texto(x.objetivo, '')}: ${duracion(x.segundos)}` })).filter((x) => esNum(x.inicio)) });
    const perd = obj(c?.perdida) || {};
    const nombres = { puerta: 'Puerta de enlace', '1.1.1.1': '1.1.1.1', '8.8.8.8': '8.8.8.8' };
    vaciar(perdidaCaja, Object.keys(perd).length ? Object.entries(perd).map(([k, v]) => chip(`${nombres[k] || k}: ${pct(v, 1)}`, Number(v) >= 2 ? 'chip-nuevo' : '')) : h('span', { class: 'texto-3' }, 'Sin datos.'));
    vaciar(cortesCaja, cortes.length ? h('ul', { class: 'cortes' }, [...cortes].reverse().slice(0, 30).map((x) => h('li', null,
      icono('falla', { tam: 14, clase: 'color-nivel nivel-falla' }), h('span', null, fechaHoraCorta(x.inicio)), h('strong', null, duracion(x.segundos)), h('span', { class: 'texto-2' }, texto(x.objetivo, ''))))) : h('span', { class: 'texto-2' }, 'Sin cortes en este rango.'));
  }

  const tRes = periodico(() => cargarEn(errRes, async () => { pintarResumen(await api.get('/api/red', { timeout: 30000 })); vaciar(errRes); }, { silencioso: true }), 30000);
  const tCal = periodico(() => cargarEn(calErr, async () => { await cargarCalidad(); vaciar(calErr); }, { silencioso: true }), 60000);
  const tDispC = periodico(async () => {
    await cargarEn(dispCaja, cargarDisp, { silencioso: true, reintentar: () => tDispC.ya() });
    vaciar(listaMacs, dispositivos.filter((d) => esMAC(d.mac)).map((d) => h('option', { value: d.mac }, `${texto(d.nombre || d.nombre_red || d.ip)}`)));
  }, 60000);
  for (const c of [cPingHost, cPtHost]) c.input.addEventListener('input', () => { c.input.dataset.tocado = '1'; });
  const tareas = [tRes, tCal, tDispC];
  bus.on('trabajo-terminado', (t) => {
    if (t?.tipo === 'escaneo_red' || t?.tipo === 'fabricantes') { for (const d of lista(t?.resultado?.nuevos)) if (d?.mac) resaltados.add(d.mac); tDispC.ya(); tRes.ya(); }
    if (t?.tipo === 'auditoria_red') cargarEn(audErr, cargarAuditoria, { silencioso: true });
  });
  void bloqueError; void abrirTrabajo;

  return {
    el,
    mostrar(op = {}) {
      if (op.pestana) tabs.activar(op.pestana);
      for (const t of tareas) t.iniciar();
    },
    ocultar() { for (const t of tareas) t.detener(); },
  };
}
