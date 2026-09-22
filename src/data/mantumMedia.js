const MANTUM_IMAGE_FILES = [
    '001.1__condensador.jpg', '001.2__atomizador-humificador.jpg', '001.4__evaporador.jpg', '001.jpg', '003.png',
    '004.1__banda-transportadora-1.jpg', '004.2__banda-transportadora-2.jpg', '004.3__banda-transportadora-3.jpg', '004.6__caros-trasporte-de-caja-de-pollo.jpg', '004.jpg',
    '005.1__compresor-de-tornillo-1.png', '005.10__tablero-electrico-420v.jpg', '005.11__ups-3000-kva.jpg', '005.12__ahu-manejadora-de-aire-3-nacedora.jpg', '005.13__ahu-manejadora-de-aire-2-incubadora.jpg', '005.2__compresor-de-tornillo-2.png', '005.3__secador-de-aire-alud.jpg', '005.4__chiller.png', '005.6__calentador-de-agua.jpg', '005.7__panel-de-alarma.jpg', '005.8__tablero-control-sb1.jpg', '005.9__tablero-electrico-220v.jpg', '005.jpg',
    '006.2__locativo-exterior.jpg', '006.3__locativo-interior.jpg', '006.4__arco-de-desinfecciones.jpg', '006.jpg', '007.1__metrologia.jpg', '007.png', '008.1__planta-de-emergencia-380.jpg', '008.jpg', '009.1__chevrolet-wcq-418.jpg', '009.2__chevrolet-wcq-419.jpg', '009.png', '010.png',
    '011.1__ahu-manejadora-de-aire-1-recepcion.jpg', '011.2__ahu-manejadora-de-aire-4-sexado.jpg', '011.3__ahu-manejadora-de-aire-5-despachos.jpg', '011.png', '012.png', '012168__dovac-desvac.jpg', '012169__dovac-desvac.jpg', '012173__dovac-desvac.jpg', '012177__dovac-desvac.jpg', '012178__dovac-desvac.jpg', '012179__dovac-desvac.jpg', '013.1__chiller-2.png', '013.2__chiller-3.png', '013.png',
    'AS-001.1__espumadora-02.jpg', 'AS-001.2__electro-bomba-de-lavado.jpg', 'AS-001.3__espumadora-01.jpg', 'as-001.jpg', 'cdp-001.jpg', 'cdp-002.jpg', 'cdp-003.jpg', 'cdp-004.jpg', 'cdp-005.jpg', 'cfh-001.jpg', 'CH-001.1__guadana.jpg', 'CH-001.2__fumigadora-de-espalda.jpg', 'ch-001.jpg', 'CM001.1__camaras-de-seguridad.jpg', 'cm001.jpg', 'crtf-001.jpg',
    'EQ-001__tanques-de-agua-potable-modulo-4.jpg', 'EQ-002__contador.png', 'EQ-003__bomba-ahu-incubadora.jpg', 'EQ-004__bomba-ahu-tunel-pequeno.jpg', 'EQ-005__bomba-ahu-despacho-pollito.jpg', 'EQ-006__bomba-ahu-nacimiento.jpg', 'EQ-007__bomba-ahu-recepcion.jpg', 'EQ-008__bomba-01-incubadora-y-nacedora.jpg', 'EQ-009__bomba-02-incubadora-y-nacedora.jpg', 'EQ-010__bomba-01-chiller.jpg', 'EQ-011__bomba-02-chiller.jpg', 'EQ-012__clasificadora-huevo.jpg', 'gr-001-03.jpg', 'inc.png',
    'INC-001.1__incubadora-1.jpg', 'INC-001.10__incubadora-10.jpg', 'INC-001.11__incubadora-11.jpg', 'INC-001.12__incubadora-12.jpg', 'INC-001.2__incubadora-2.jpg', 'INC-001.3__incubadora-3.jpg', 'INC-001.4__incubadora-4.jpg', 'INC-001.5__incubadora-5.jpg', 'INC-001.6__incubadora-6.jpg', 'INC-001.7__incubadora-7.jpg', 'INC-001.8__incubadora-8.jpg', 'INC-001.9__incubadora-9.jpg', 'inc-001.jpg', 'INC-002.13__incubadora-13.png', 'INC-002.14__incubadora-14.png', 'INC-002.15__incubadora-15.png', 'INC-002.16__incuvadora-16.png', 'INC-002.17__incubadora-17.png', 'INC-002.18__incubadora-18.png', 'INC-002.19__incubadora-19.png', 'INC-002.20__incubadora-20.png', 'INC-002.21__incubadora-21.png', 'INC-002.22__incubadora-22.png', 'INC-002.23__incubadora-23.png', 'INC-002.24__incubadora-24.png', 'inc-002.png', 'inc-gr.png', 'inc-gr-001.jpg', 'inc-pi.png', 'inc-pi-001.png',
    'NAC-001.1__nacedora-1.jpg', 'NAC-001.2__nacedora-2.jpg', 'NAC-001.3__nacedora-3.jpg', 'nac-001.jpg', 'NAC-002.4__nacedora-4.jpg', 'NAC-002.5__nacedora-5.jpg', 'NAC-002.6__nacedora-6.jpg', 'nac-002.png', 'NAC-003.1__nacedora-7.png', 'NAC-003.2__nacedora-8.png', 'NAC-003.3__nacedora-9.png', 'nac-003.png', 'NAC-004.1__nacedora-10.png', 'NAC-004.2__nacedora-11.png', 'NAC-004.3__nacedora-12.png', 'nac-004.png', 'pta-001.jpg', 'pta-002.jpg', 'PTAP-001__planta-de-tratamiento-de-agua-potable.jpg', 'PTAR-001__planta-de-tratamiento-aguas-residuales.jpg', 'st-001.jpg', 'TRF-001.1__transformador-chiller.jpg', 'trf-001.jpg', 'ub-001.jpg', 'VC-001.1__maquina-vacunadora-5014.jpg', 'VC-001.2__maquina-vacunadora-5015.jpg', 'VC-001.3__maquina-vacunadora-5016.jpg', 'VC-001.4__maquina-vacunadora-5018.jpg', 'VC-001.5__maquina-vacunadora-5011.jpg', 'VC-001.6__maquina-vacunadora-5013.jpg', 'VC-001.7__spra-vac.jpg', 'vc-001.jpg', 'zha-001.png', 'zha-002.png', 'zha-003.png',
]

function codeFromName(name) {
    return name.match(/^(?:[A-Z]{2,5}-?\d+(?:\.\d+)?|\d{3}\.\d+)/i)?.[0]?.toUpperCase() || null
}

export const MANTUM_MEDIA = MANTUM_IMAGE_FILES.map((fileName) => ({
    id: `mantum-media-${fileName}`,
    file_name: fileName,
    file_type: 'image',
    source: 'mantum',
    kind: 'mantum-media',
    machineCode: codeFromName(fileName),
    url: `/assets/equipos/${fileName}`,
    sourcePath: `MANTENIMIENTO/activos-mantum/${fileName}`,
    formatCode: 'IMAGEN MANTUM',
    workOrderTitle: 'Imagen de activo Mantum',
    note: 'Imagen importada del inventario Mantum',
}))

export function mediaForCode(code) {
    const normalized = String(code || '').trim().toUpperCase()
    return MANTUM_MEDIA.filter((item) => item.machineCode === normalized)
}
