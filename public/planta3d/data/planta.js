/* =============================================================================
 * PLANTA 3D INCUBANT — datos reales de la planta
 * Origen: IncubApp / Supabase (tablas plants, rooms, machines) — planta PLANTA INCUBANT.
 * Todas las medidas están en METROS, con el mismo sistema del plano 2D de IncubApp:
 *   +X hacia el oriente del plano (derecha) · +Y hacia el sur del plano (abajo)
 * En 3D se usa: X = x del plano · Z = y del plano · Y = altura.
 * Instantánea tomada el 2026-09-05. Para actualizarla, vuelva a exportar de IncubApp.
 *
 * NOTA SOBRE LOS NOMBRES: la geometría es un volcado literal de Supabase, los rótulos no.
 * El 2026-07-29 se normalizaron en la base las erratas de S45, S47, S35, S50, S51 y S64,
 * así que esas seis ya coinciden. Siguen corregidas SOLO aquí, por falta de tildes en la
 * base, estas: S32 ALMACÉN DOTACIÓN · S8 ALMACÉN No 1 · S18 Almacenamiento
 * huevo comercial · S22 Cuarto Frío · S31 y S40 LAVANDERÍA · TUN PASILLO (túnel).
 * Al reexportar, conservarlas. (S26 y S34 salieron al eliminarse del plano.)
 * =============================================================================
 */
window.PLANTA = {
  meta: {
    plantId: 'ea0d6e60-928a-4e47-84f9-504bf217136b',
    nombre: 'PLANTA INCUBANT',
    codigo: 'PLANTAIN',
    empresa: 'Antioqueña de Incubación SAS',
    ciudad: 'HISPANIA',
    direccion: 'Km 2, vía Hispania-Andes, vereda La Seca.',
    snapshot: '2026-09-05',
    alturaMuro: 2.9, // altura libre contra la fachada del frente (m)
    // La nave va a dos aguas pero NO es simetrica: arranca en 5,60 contra la
    // fachada de atras —la del norte, donde esta el ala de incubadoras—, sube
    // hasta 7,40 en la cumbrera del medio y baja hasta 2,90 contra la fachada
    // del frente, la de la oficina. Todas las cotas son internas y se miden
    // desde el piso de la planta.
    alturaMuroAtras: 5.6,
    alturaCumbrera: 7.4,
    // El entrepiso del segundo nivel, que cubre el ala de incubadoras hacia
    // atras. Por delante de esta linea la planta es de una sola altura.
    alturaEntrepiso: 3.4,
    // Vuelo del alero: lo que sobresale la cubierta del muro, el ancho de la
    // canoa de aguas lluvias. Los pasillos exteriores quedan al aire libre.
    aleroVuelo: 0.4,
    // Las salas que llevan entrepiso encima. Se enumeran en vez de sacarlas de
    // un corte por coordenada: el ala no es un rectangulo —el cuarto frio y la
    // recepcion de huevos bajan mas que el resto— y cualquier linea recta
    // dejaba fuera unas o metia otras que no van.
    entrepisoSalas: [
      // el nucleo de incubacion
      'REP', 'SI2', 'SI1', 'S63', 'S91', 'SN2', 'SN1', 'S33', 'S67', 'S67B',
      'S92', 'S46', 'TUN',
      // y el resto del ala, hasta la sala de cargue de despacho
      'S22', 'LAV', 'REC', 'S18', 'S19', 'S23', 'S24', 'S25',
      'SN3', 'SN4', 'S72', 'S21', 'S45', 'S48',
    ],
    // Salas con techo interno propio, mas bajo que la nave: un cielo raso que no
    // es segundo nivel. Lo llevaba la Oficina No 2 (S15) a la altura del
    // entrepiso, por el aire acondicionado. Esa sala se elimino del plano y la
    // nueva OFICINA PRODUCCION (S93) esta en la banda del frente, donde el muro
    // ya mide 2,90 y la cubierta baja justo encima: ahi un cielo raso a 3,40
    // quedaria por fuera del techo. Vacio hasta que haga falta otro.
    techoPropio: {},

    // Las dos fachadas largas, declaradas y no deducidas de las salas que haya:
    // una sala suelta fuera de sitio movia la cumbrera y descuadraba el techo
    // de toda la nave.
    fachadaAtrasY: 6.0,
    fachadaFrenteY: 32.9,
  },

  // ── SALAS / ÁREAS ────────────────────────────────────────────────────────
  // x,y = esquina superior izquierda en el plano (m) · w,h = ancho × largo (m)
  rooms: [
    { id: 'c77b848c-8be7-4598-bb18-5b7ba747dda9', code: 'LAV', name: 'Sala de lavado canastillas', type: 'washing', x: 29, y: 19, w: 4, h: 4.4, rot: 0, color: null, doors: [] },
    { id: '68727cbe-28b1-46fe-b199-457380d2f810', code: 'REC', name: 'Sala recepción de huevos', type: 'egg_storage', x: 29, y: 23.4, w: 4, h: 4.5, rot: 0, color: null, doors: [{ x: 1.2, y: 2.9, rot: 180, lado: 'abajo', type: 'loading' }, { x: 0, y: 2.4, rot: 270, lado: 'izquierda', type: 'sliding' }, { x: 0.2, y: 0, lado: 'arriba', type: 'sliding' }] },
    { id: '5e900000-0000-4000-8000-000000000026', code: 'REP', name: 'ALMACÉN DE REPUESTOS', type: 'other', x: 11, y: 6, w: 5, h: 3.5, rot: 0, color: null, doors: [{ x: 0, y: 2, rot: 270, w: 0.9, lado: 'izquierda', type: 'normal' }] },
    { id: '3167254d-1497-42b5-81a7-16014778a6c0', code: 'S16', name: 'PASILLO', type: 'hallway', x: 35, y: 23.4, w: 13.2, h: 1.6, rot: 0, color: '#55627e', doors: [{ x: 12.3, y: 0.35, rot: 90, w: 0.9, lado: 'derecha', type: 'normal' }, { x: 0.2, y: 0, rot: 180, lado: 'arriba', type: 'sliding' }] },
    { id: '9dd825c7-4799-4679-b5e8-8e55a9f77c55', code: 'S18', name: 'Almacenamiento huevo comercial', type: 'egg_storage', x: 33, y: 21, w: 6, h: 2.4, rot: 0, color: null, doors: [{ x: 0.2, y: 0.8, rot: 180, lado: 'abajo', type: 'sliding' }] },
    { id: 'e1380d3f-3e71-46f7-9b6c-0983eff1195c', code: 'S19', name: 'Almacenamiento de carros', type: 'washing', x: 41, y: 17.5, w: 3, h: 5.9, rot: 0, color: null, doors: [{ x: 1.4, y: 0, rot: 90, lado: 'derecha', type: 'sliding' }] },
    { id: '49dd2a59-f96a-4cd7-9659-3bc22e6ffd0d', code: 'S21', name: 'Lavado Nacimiento', type: 'chick_processing', x: 74, y: 18, w: 12.5, h: 5.4, rot: 0, color: null, doors: [{ x: 8.6, y: 0, lado: 'arriba', type: 'normal' }, { x: 0, y: 0.4, rot: 180, lado: 'izquierda', type: 'normal' }, { x: 10.9, y: 1.8, rot: 90, lado: 'derecha', type: 'sliding' }, { x: 8.8, y: 3.8, rot: 180, lado: 'abajo', type: 'sliding' }] },
    { id: 'e9c0f96e-671d-42bc-8e93-142e43a8f10d', code: 'S22', name: 'Cuarto Frío', type: 'egg_storage', x: 12, y: 19, w: 17, h: 9, rot: 0, color: null, doors: [] },
    { id: 'fec06f28-f257-4ed6-a340-a7b6c53bfc44', code: 'S23', name: 'PASILLO', type: 'hallway', x: 39, y: 21, w: 2, h: 2.4, rot: 0, color: null, parteDe: '7bd56237-435a-4105-aaaf-ae6707a4c03e', doors: [{ x: 0.55, y: 1.5, rot: 180, w: 0.9, lado: 'abajo', type: 'normal' }] },
    { id: '7bd56237-435a-4105-aaaf-ae6707a4c03e', code: 'S24', name: 'PASILLO', type: 'hallway', x: 33, y: 17.5, w: 8, h: 3.5, rot: 0, color: null, doors: [{ x: 0, y: 0, rot: 270, lado: 'izquierda', type: 'sliding' }, { x: 6.4, y: 1.8, rot: 90, lado: 'derecha', type: 'sliding' }] },
    { id: '700c88ff-37dd-4398-9b8c-00d73c829a83', code: 'S25', name: 'PASILLO', type: 'hallway', x: 6, y: 17.5, w: 27, h: 1.5, rot: 0, color: null, doors: [{ x: 19.6, y: 0, lado: 'arriba', type: 'sliding' }, { x: 19.6, y: 0.4, rot: 180, lado: 'abajo', type: 'sliding' }, { x: 2.2, y: 0, rot: 0, lado: 'abajo', abre: 'afuera', type: 'normal' }] },
    { id: 'a28b607f-357a-47d6-9782-2dc3c1f2cd80', code: 'S28', name: 'COMEDOR ZONA LIMPIA', type: 'other', x: 6, y: 6, w: 6, h: 11.5, rot: 0, color: null, doors: [{ x: 0, y: 4, w: 1, lado: 'izquierda', type: 'window' }, { x: 2.5, y: 10.6, rot: 180, w: 0.9, lado: 'abajo', type: 'normal' }] },
    { id: '4e925203-b6dd-4cfb-93ff-cc2158614a75', code: 'S29', name: 'FILTRO SANITARIO DAMAS', type: 'other', x: 6, y: 19, w: 2, h: 9, rot: 0, color: null, doors: [{ x: 0.55, y: 0, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: 'dcbcb77f-e012-445f-88b2-3dfb305218f3', code: 'S30', name: 'FILTRO SANITARIO HOMBRES', type: 'other', x: 10, y: 19, w: 2, h: 9, rot: 0, color: null, doors: [{ x: 0.55, y: 0, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: 'e90fbe82-b288-415f-87e8-e58a09477335', code: 'S31', name: 'LAVANDERÍA ZONA LIMPIA', type: 'washing', x: 8, y: 19, w: 2, h: 4, rot: 0, color: null, doors: [{ x: 0.2, y: 2.4, rot: 180, lado: 'abajo', type: 'normal' }, { x: 0.2, y: 0, lado: 'arriba', type: 'normal' }] },
    { id: 'b0d4c69a-d7b9-4ea9-a486-ec9f9d70afda', code: 'S32', name: 'ALMACÉN DOTACIÓN', type: 'other', x: 8, y: 23, w: 2, h: 2, rot: 0, color: null, doors: [] },
    { id: 'fcafa254-316b-475e-818a-c6dd76dadfe9', code: 'S33', name: 'SALA DE SEXAJE', type: 'chick_processing', x: 82, y: 6, w: 3, h: 12, rot: 0, color: null, doors: [{ x: 0.6, y: 0, rot: 0, lado: 'arriba', type: 'normal' }, { x: 1.4, y: 10, rot: 90, lado: 'derecha', type: 'normal' }, { x: 0, y: 4, rot: 270, lado: 'izquierda', type: 'sliding' }, { x: 0, y: 6.6, rot: 270, lado: 'izquierda', type: 'sliding' }] },
    { id: '2f93fd7a-2892-4a7a-8475-fa4523993e7d', code: 'S35', name: 'CORREDOR EXTERIOR', type: 'hallway', x: 63.8, y: 32.9, w: 17.2, h: 2, rot: 0, color: null, exterior: true, doors: [] },
    { id: '3332f10f-fbb0-4ce6-ba4c-173f21763964', code: 'S35B', name: 'CORREDOR EXTERIOR', type: 'hallway', x: 33, y: 32.9, w: 30.8, h: 2, rot: 0, color: '#55627e', exterior: true, doors: [{ x: 16.2, y: 0, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: '29db001f-fb0e-4d24-a594-1751fed17aa6', code: 'S36', name: 'CORREDOR EXTERIOR', type: 'hallway', x: 81, y: 27.6, w: 0.7, h: 7.4, rot: 0, color: null, exterior: true, doors: [] },
    { id: '209bdf63-d4d6-490e-a3d4-3b5781a56a2d', code: 'S37', name: 'COMEDOR ZONA SUCIA', type: 'other', x: 76, y: 25, w: 5, h: 7.9, rot: 0, color: null, doors: [{ x: 2.02, y: 6.86, w: 1, lado: 'abajo', type: 'window' }, { x: 0.2, y: 0, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: 'c229f81b-952a-470b-90f2-3e533ac2aaff', code: 'S38', name: 'FILTRO SANITARIO DAMAS', type: 'other', x: 67.8, y: 25, w: 2.6, h: 7.9, rot: 0, color: null, doors: [{ x: 1.05, y: 0, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: '7c23e6da-3128-46a4-bfc2-c9595f452d3d', code: 'S39', name: 'FILTRO SANITARIO HOMBRES', type: 'other', x: 73.4, y: 25, w: 2.6, h: 7.9, rot: 0, color: null, doors: [{ x: 0.38, y: 0, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: 'e393c0a1-9b49-44a7-b899-d62f94f3fd74', code: 'S40', name: 'LAVANDERÍA ZONA SUCIA', type: 'washing', x: 70.4, y: 25, w: 3, h: 2.4, rot: 0, color: null, doors: [{ x: 0.3, y: 0, rot: 270, lado: 'arriba', type: 'normal' }] },
    { id: '70eeb804-515a-4b58-9135-fdc46297d495', code: 'S41', name: 'INGRESO PLANTA ZONA LIMPIA', type: 'other', x: 8, y: 25, w: 2, h: 3, rot: 0, color: null, doors: [{ x: 1.1, y: 0.35, rot: 0, w: 0.9, lado: 'derecha', type: 'normal' }, { x: 0, y: 0.35, rot: 270, w: 0.9, lado: 'izquierda', type: 'normal' }] },
    { id: 'fe09e893-3ba4-426a-840c-95c62fea38d1', code: 'S42', name: 'INGRESO ZONA SUCIA', type: 'other', x: 70.4, y: 27.4, w: 3, h: 5.5, rot: 0, color: null, doors: [{ x: 2.1, y: 3.82, rot: 0, w: 0.9, lado: 'derecha', type: 'normal' }, { x: 0, y: 3.82, rot: 270, w: 0.9, lado: 'izquierda', type: 'normal' }, { x: 0.65, y: 4.6, rot: 180, w: 0.9, lado: 'abajo', type: 'normal' }] },
    { id: 'a0409687-cbec-4dcf-a034-25d6de251147', code: 'S43', name: 'W.C', type: 'other', x: 6, y: 15.5, w: 1, h: 2, rot: 0, color: null, doors: [{ x: 0.15, y: 1.3, w: 0.7, lado: 'abajo', type: 'normal' }] },
    { id: '3b240aee-cc0b-4892-a382-7a52b9641661', code: 'S43B', name: 'W.C', type: 'other', x: 7, y: 15.5, w: 1, h: 2, rot: 0, color: null, doors: [{ x: 0.15, y: 1.3, w: 0.7, lado: 'abajo', type: 'normal' }] },
    { id: 'b03eaa03-5916-46ab-85b2-7d7eb712423d', code: 'S44', name: 'W.C', type: 'other', x: 78, y: 25, w: 1, h: 2, rot: 0, color: null, doors: [{ x: 0.15, y: 0, w: 0.7, lado: 'arriba', type: 'normal' }] },
    { id: 'a0c9804b-4231-47d0-9410-5384ca27c6bb', code: 'S44B', name: 'W.C', type: 'other', x: 79, y: 25, w: 1, h: 2, rot: 0, color: null, doors: [{ x: 0.15, y: 0, w: 0.7, lado: 'arriba', type: 'normal' }] },
    { id: 'b9523ddf-85f9-4dda-bb2b-851b3db881de', code: 'S44C', name: 'W.C', type: 'other', x: 80, y: 25, w: 1, h: 2, rot: 0, color: null, doors: [{ x: 0.15, y: 0, w: 0.7, lado: 'arriba', type: 'normal' }] },
    { id: '94e62c74-fcee-4b68-a794-e08e8afd3a04', code: 'S45', name: 'ALMACÉN DE CANASTAS', type: 'chick_processing', x: 86.5, y: 19, w: 6.2, h: 4.4, rot: 0, color: '#f07070', doors: [{ x: 2.4, y: 0, lado: 'arriba', type: 'sliding' }] },
    { id: '6f09157d-ecf5-41c1-b5d9-c210589d578c', code: 'S46', name: 'DESPACHO', type: 'chick_processing', x: 91, y: 6, w: 6, h: 13, rot: 0, color: null, doors: [{ x: 0, y: 10, rot: 180, lado: 'izquierda', type: 'normal' }, { x: 4, y: 11.4, lado: 'abajo', type: 'sliding' }] },
    { id: '0673a216-b2d1-4692-84b4-479c860ca0b2', code: 'S47', name: 'ALMACÉN DE DESECHOS ORGÁNICOS', type: 'chick_processing', x: 86, y: 23.4, w: 2.9, h: 4.2, rot: 0, color: null, doors: [] },
    { id: '117ba8ad-99dd-4fc0-a613-056614a61947', code: 'S48', name: 'SALA DE CARGUE DESPACHO', type: 'chick_processing', x: 92.7, y: 19, w: 4.3, h: 4.4, rot: 0, color: null, doors: [{ x: 1.2, y: 2.8, rot: 180, lado: 'abajo', type: 'loading' }] },
    { id: '955a4ef0-c05b-4bde-9672-bc55c3ade4e3', code: 'S49', name: 'CORREDOR EXTERIOR', type: 'hallway', x: 6, y: 28, w: 23, h: 2, rot: 0, color: '#55627e', exterior: true, doors: [{ x: 2.55, y: 0, rot: 270, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: '1591740b-5bbc-4c4e-a532-94d59cd1f1ed', code: 'S50', name: 'CORREDOR EXTERIOR', type: 'hallway', x: 6, y: 4, w: 91, h: 2, rot: 0, color: '#4c5361', exterior: true, doors: [] },
    { id: '065476de-6075-4b45-8782-b0c627fd47be', code: 'S51', name: 'CORREDOR EXTERIOR NORTE', type: 'hallway', x: 4, y: 4, w: 2, h: 26, rot: 0, color: '#55627e', exterior: true, doors: [] },
    { id: '718014dd-e021-4c60-8c0b-5b4f1668e9bb', code: 'S56B', name: 'CORREDOR EXTERIOR', type: 'hallway', x: 97, y: 4, w: 1.5, h: 17.4, rot: 0, color: null, exterior: true, doors: [] },
    { id: '3e72a930-dadb-4fb6-819e-ff1ba669b727', code: 'S62', name: 'PASILLO', type: 'hallway', x: 48.2, y: 23.4, w: 32.8, h: 1.6, rot: 0, color: '#55627e', doors: [{ x: 20.4, y: 0, lado: 'arriba', type: 'normal' }, { x: 28.2, y: 0, lado: 'arriba', type: 'normal' }] },
    { id: 'be07ec69-1f1d-4933-9899-23d626ea9919', code: 'S63', name: 'ALMACENAMIENTO MAQ TRANSFERENCIA', type: 'technical', x: 65.2, y: 6, w: 4.8, h: 2.5, rot: 0, color: null, doors: [{ x: 1.6, y: 0, rot: 0, lado: 'arriba', type: 'normal' }] },
    { id: 'a137a92f-1e51-4957-aa34-ad0a3c9b71f6', code: 'S64', name: 'BODEGA AGROSAN', type: 'chick_processing', x: 81, y: 23.4, w: 5, h: 4.2, rot: 0, color: null, doors: [{ x: 1.8, y: 2.6, rot: 180, lado: 'abajo', type: 'loading' }, { x: 3.4, y: 0.6, rot: 90, lado: 'derecha', type: 'sliding' }] },
    { id: '16f2899e-851e-4129-be9c-bbccc6acecf5', code: 'S65', name: 'CORREDOR EXTERIOR', type: 'exterior', x: 88.9, y: 23.4, w: 2, h: 2.5, rot: 0, color: null, exterior: true, doors: [] },
    { id: 'ef2ada1d-9a67-4e18-85e0-3d8a45d18569', code: 'S66', name: 'CORREDOR EXTERIOR', type: 'exterior', x: 86, y: 27.6, w: 6, h: 1.9, rot: 0, color: null, exterior: true, doors: [] },
    { id: 'e6d5e84a-d9c0-4404-8b51-2454871d1d4b', code: 'S67', name: 'CUARTO DE VACUNA', type: 'technical', x: 89, y: 6, w: 2, h: 2.5, rot: 0, color: null, doors: [] },
    { id: '0b6390ad-61b6-45fa-b400-d729620f2dc7', code: 'S67B', name: 'CUARTO DE VACUNA', type: 'technical', x: 85, y: 6, w: 4, h: 2.5, rot: 0, color: null, doors: [{ x: 3.1, y: 0.6, rot: 90, w: 0.9, lado: 'derecha', type: 'normal' }] },
    { id: '7b469e4e-028b-4532-92fd-461bf29b387d', code: 'S68', name: 'CAVA DEL HUEVO', type: 'other', x: 88.9, y: 23.4, w: 2, h: 4.2, rot: 0, color: null, altura: 2.2, proyectada: true, doors: [{ x: 0.2, y: 0, lado: 'arriba', type: 'normal' }] },
    { id: '5c700000-0000-4000-8000-000000000070', code: 'S70', name: 'W.C', type: 'other', x: 47, y: 25, w: 1.2, h: 2, rot: 0, color: null, doors: [{ x: 0.25, y: 0, w: 0.7, lado: 'arriba', type: 'normal' }] },
    { id: 'f321e690-a106-4de1-b727-9deebcd4fd22', code: 'S70B', name: 'W.C', type: 'other', x: 46, y: 25, w: 1, h: 2, rot: 0, color: null, doors: [{ x: 0.15, y: 0, w: 0.7, lado: 'arriba', type: 'normal' }] },
    { id: 'd172b0ef-6800-45ad-9717-fc723f74eaa1', code: 'S71', name: 'PLATAFORMA CHILLERS', type: 'exterior', x: 41.1, y: 34.9, w: 14.4, h: 2, rot: 0, color: null, exterior: true, doors: [] },
    { id: '0cb0cf81-f97e-4660-9daa-9632a9037043', code: 'S72', name: 'LAVADO CARROS', type: 'chick_processing', x: 68, y: 18, w: 6, h: 5.4, rot: 0, color: null, doors: [{ x: 0.6, y: 0, lado: 'arriba', type: 'normal' }] },
    { id: '6294ecee-280b-4333-b1c5-4aef06fea5ba', code: 'S75', name: 'CUARTO DE MAQUINAS INC 2', type: 'technical', x: 12, y: 6, w: 29, h: 11.5, rot: 0, color: null, nivel: 2, doors: [{ x: 18, y: 7.2, w: 0.7, h: 0.8, base: 0, lado: 'abajo', type: 'normal' }] },
    { id: '2705c14b-aff9-43d5-b9d1-2857279498cd', code: 'S76', name: 'CUARTO DE MAQUINAS INC 1', type: 'technical', x: 41, y: 6, w: 25, h: 11.5, rot: 0, color: null, nivel: 2, doors: [] },
    { id: '9a917247-dd09-4c60-82a5-39c1c16cb20d', code: 'S78', name: 'TUNEL INCUBADORAS No 2', type: 'technical', x: 12, y: 9.5, w: 29, h: 4, rot: 0, color: null, nivel: 2, altura: 1.9, doors: [] },
    { id: '4fb5d978-6042-4b07-99b1-c3b75364b6f2', code: 'S79', name: 'TUNEL INCUBADORAS No 1', type: 'technical', x: 41, y: 9.5, w: 25, h: 4.1, rot: 0, color: null, nivel: 2, altura: 1.9, doors: [] },
    { id: '328fa33b-be24-413a-920c-307e6f053237', code: 'S8', name: 'ALMACÉN No 1', type: 'other', x: 63.8, y: 25, w: 4, h: 7.9, rot: 0, color: null, doors: [{ x: 1.55, y: 0, rot: 0, w: 0.9, lado: 'arriba', type: 'normal' }, { x: 1.52, y: 6.86, w: 1, lado: 'abajo', type: 'window' }] },
    { id: '2ea55eb0-b197-402b-92fc-8beea2655bdb', code: 'S80', name: 'TUNEL NACEDORAS No2', type: 'technical', x: 39, y: 18.4, w: 4, h: 5, rot: 0, color: null, nivel: 2, altura: 1.95, doors: [] },
    { id: 'e672a0bb-5bd6-4aa6-95e1-9e2ad3cf94b4', code: 'S81', name: 'TUNEL NACEDORAS No 1', type: 'technical', x: 82, y: 8.5, w: 2.5, h: 7, rot: 0, color: null, nivel: 2, altura: 1.85, doors: [{ x: 0, y: 5.4, rot: 270, w: 0.7, h: 0.9, base: 0.4, lado: 'izquierda', type: 'normal' }] },
    { id: '26be0a49-f99f-4039-8f0e-93683b1cf04d', code: 'S82', name: 'CUARTO DE MAQUINAS NAC 1', type: 'technical', x: 71, y: 14.6, w: 10.3, h: 1.8, rot: 0, color: null, nivel: 2, doors: [] },
    { id: 'a65ec9a5-c206-41e7-bed9-1b941e7d579b', code: 'S83', name: 'CUARTO DE MAQUINAS NAC 2', type: 'technical', x: 71, y: 7.6, w: 10.3, h: 1.8, rot: 0, color: null, nivel: 2, doors: [] },
    { id: 'f691d266-f3bf-4cb2-8b64-4c0c3a46f3bf', code: 'S84', name: 'CUARTO DE MAQUINAS NAC 3', type: 'technical', x: 56, y: 20.6, w: 10.3, h: 1.8, rot: 0, color: null, nivel: 2, doors: [] },
    { id: 'd1eee66d-9da5-4cd9-9e2c-595311fb35d0', code: 'S85', name: 'CUARTO DE MAQUINAS NAC 4', type: 'technical', x: 44, y: 20.6, w: 10.3, h: 1.8, rot: 0, color: null, nivel: 2, doors: [] },
    { id: '067ed2d2-3980-43f8-8bc0-51717b19ea93', code: 'S86', name: 'AREA TECNICA DE AMBIENTE CONTROLADO', type: 'technical', x: 12, y: 6, w: 85, h: 22, rot: 0, color: null, nivel: 2, puntos: [{ x: 0, y: 11.5 }, { x: 0, y: 22 }, { x: 17, y: 22 }, { x: 17, y: 17.5 }, { x: 85, y: 17.5 }, { x: 85, y: 0 }, { x: 54, y: 0 }, { x: 54, y: 11.5 }, { x: 0, y: 11.5 }], wallHeights: { izquierda: 3.4 }, doors: [{ x: 39.24, y: 16, rot: 180, w: 0.9, h: 2, base: 0, lado: 'abajo', abre: 'adentro', type: 'normal' }, { x: 31.2, y: 13.8, rot: 270, w: 0.9, h: 2, base: 0, lado: 'abajo', type: 'normal' }, { x: 22.2, y: 11.4, w: 0.9, h: 2, base: 0, lado: 'abajo', type: 'normal' }, { x: 52.4, y: 0.8, rot: 90, w: 0.9, h: 2, base: 0, lado: 'arriba', type: 'normal' }, { x: 52.6, y: 8.8, rot: 90, w: 0.9, h: 2, base: 0, lado: 'arriba', type: 'normal' }] },
    { id: 'a9cdfafe-a0c3-4661-9f01-103aec827d7e', code: 'S87', name: 'Plenum NAC 4', type: 'plenum', x: 44, y: 20.4, w: 12, h: 3, rot: 0, color: null, altura: 3.4, parteDe: 'd7da3177-a600-499c-979a-90eaf9f3deaf', puntos: [{ x: 10.5, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 2 }, { x: 10.5, y: 2 }, { x: 10.5, y: 0 }], doors: [{ x: 10.85, y: 0, w: 0.8, h: 2, base: 0, lado: 'arriba', abre: 'afuera', type: 'normal' }] },
    { id: '604fbba8-f481-4eb7-8692-808bc37dbf2b', code: 'S88', name: 'Plenum NAC 3', type: 'plenum', x: 56, y: 20.4, w: 12, h: 3, rot: 0, color: null, altura: 3.4, parteDe: '7a8eb99a-6f31-41a0-867d-789114bdbd2b', puntos: [{ x: 10.5, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 2 }, { x: 10.5, y: 2 }, { x: 10.5, y: 0 }], doors: [{ x: 10.85, y: 0, w: 0.8, h: 2, base: 0, lado: 'arriba', abre: 'afuera', type: 'normal' }] },
    { id: '994e7dff-c212-41d4-a1d9-12bea484fc9a', code: 'S89', name: 'Plenum NAC 2', type: 'plenum', x: 70, y: 6, w: 12, h: 3, rot: 0, color: null, altura: 3.4, parteDe: '4525b77b-4257-4a69-bb42-355e85935a13', puntos: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 3 }, { x: 10.5, y: 3 }, { x: 10.5, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }], doors: [{ x: 10.85, y: 3, w: 0.8, h: 2, base: 0, lado: 'abajo', abre: 'afuera', type: 'normal' }] },
    { id: '06d67ad7-47c7-4425-8681-0ae59a0819bc', code: 'S9', name: 'Sala técnica No 2', type: 'technical', x: 37, y: 25, w: 11.2, h: 7.9, rot: 0, color: null, medida: '2026-08-18', doors: [{ x: 0.6, y: 0, w: 0.9, lado: 'arriba', type: 'normal' }, { x: 2.29, y: 6.86, w: 1, lado: 'abajo', type: 'window' }, { x: 5.07, y: 6.86, w: 1, lado: 'abajo', type: 'window' }, { x: 7.86, y: 6.86, w: 1, lado: 'abajo', type: 'window' }] },
    { id: '00d03b3a-02e9-4d99-bace-8614966b4178', code: 'S90', name: 'Plenum NAC 1', type: 'plenum', x: 70, y: 15, w: 12, h: 3, rot: 0, color: null, altura: 3.4, parteDe: '058d4c41-3bd0-4840-be20-16d2b3ec758d', puntos: [{ x: 10.5, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 2 }, { x: 10.5, y: 2 }, { x: 10.5, y: 0 }], doors: [{ x: 10.85, y: 0, w: 0.8, h: 2, base: 0, lado: 'arriba', abre: 'afuera', type: 'normal' }] },
    { id: '23a3e4f5-6399-4dda-b795-39b6ebf132c0', code: 'S91', name: 'SALA DE TRANSFERENCIA', type: 'chick_processing', x: 65.2, y: 8.5, w: 4.8, h: 9.5, rot: 0, color: null, puntos: [{ x: 0, y: 0 }, { x: 4.8, y: 0 }, { x: 4.8, y: 9.5 }, { x: 2.8, y: 9.5 }, { x: 2.8, y: 9 }, { x: 0, y: 9 }, { x: 0, y: 0 }], doors: [{ x: 3.2, y: 1.4, rot: 90, lado: 'derecha', type: 'sliding' }, { x: 3.2, y: 4.2, rot: 90, lado: 'derecha', type: 'sliding' }, { x: 0, y: 2.4, rot: 270, lado: 'izquierda', type: 'sliding' }] },
    { id: 'e58e631e-6bc9-4e5b-a9a5-0732c3279291', code: 'S92', name: 'SALA DE VACUNACION', type: 'chick_processing', x: 85, y: 8.5, w: 6, h: 10.5, rot: 0, color: null, puntos: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 10.5 }, { x: 1.5, y: 10.5 }, { x: 1.5, y: 9.5 }, { x: 0, y: 9.5 }, { x: 0, y: 0 }], doors: [{ x: 2, y: 0, lado: 'arriba', type: 'normal' }] },
    { id: '78852afb-0469-48d4-b31c-622738a17fe4', code: 'S93', name: 'OFICINA PRODUCCION', type: 'office', x: 33, y: 23.4, w: 4, h: 9.5, rot: 0, color: null, puntos: [{ x: 0, y: 0 }, { x: 0, y: 9.5 }, { x: 4, y: 9.5 }, { x: 4, y: 1.5 }, { x: 2, y: 1.5 }, { x: 2, y: 0 }, { x: 0, y: 0 }], doors: [{ x: 1.4, y: 8, rot: 180, w: 1, lado: 'abajo', type: 'window' }] },
    { id: '15db632a-b7b0-455c-89a8-3d34f4106733', code: 'SI1', name: 'Sala de incubadoras 1', type: 'incubation', x: 41, y: 6, w: 24.2, h: 11.5, rot: 0, color: null, doors: [] },
    { id: '77fdd234-6016-4521-ac28-551277e059f4', code: 'SI2', name: 'Sala de incubadoras 2', type: 'incubation', x: 12, y: 6, w: 29, h: 11.5, rot: 0, color: null, doors: [{ x: 27.4, y: 4.8, rot: 90, lado: 'derecha', type: 'open' }] },
    { id: '058d4c41-3bd0-4840-be20-16d2b3ec758d', code: 'SN1', name: 'Sala de nacedoras 1', type: 'hatching', x: 70, y: 12, w: 12, h: 6, rot: 0, color: null, doors: [] },
    { id: '4525b77b-4257-4a69-bb42-355e85935a13', code: 'SN2', name: 'Sala de nacedoras 2', type: 'hatching', x: 70, y: 6, w: 12, h: 6, rot: 0, color: null, doors: [] },
    { id: '7a8eb99a-6f31-41a0-867d-789114bdbd2b', code: 'SN3', name: 'Sala de nacedoras 3', type: 'hatching', x: 56, y: 19, w: 12, h: 4.4, rot: 0, color: null, doors: [] },
    { id: 'd7da3177-a600-499c-979a-90eaf9f3deaf', code: 'SN4', name: 'Sala de nacedoras 4', type: 'hatching', x: 44, y: 19, w: 12, h: 4.4, rot: 0, color: null, doors: [] },
    { id: 'f1543983-33fc-4326-baa0-cd4b0e1d2ab0', code: 'TEC-1', name: 'Sala técnica No 1', type: 'technical', x: 48.2, y: 25, w: 15.6, h: 7.9, rot: 0, color: null, medida: '2026-08-18', doors: [{ x: 1.8, y: 0, rot: 0, w: 0.9, lado: 'arriba', type: 'normal' }] },
    { id: 'bd1349e6-727e-4d71-ac8f-d28b296b6cfa', code: 'TUN', name: 'PASILLO (túnel)', type: 'hallway', x: 44, y: 17.5, w: 24, h: 1.5, rot: 0, color: null, doors: [{ x: 22.2, y: 0, lado: 'arriba', type: 'sliding' }, { x: 10.2, y: 0, rot: 180, lado: 'abajo', type: 'sliding' }, { x: 22.2, y: -0.1, rot: 180, lado: 'abajo', type: 'sliding' }] },
  ],

  // ── EQUIPOS ──────────────────────────────────────────────────────────────
  // x,y  = posición dentro de la sala (m), desde su esquina superior izquierda
  // rot  = 0 el frente mira al norte · 90 oriente · 180 sur · 270 occidente
  // ops  = estado de operación (machine_ops_state): 'active' encendida · 'idle' apagada
  // foto = archivo en fotos/ con la última foto de ronda; null si nunca se le tomó una
  machines: [
    { id: '762dd932-8f14-411c-b1b5-58e2f18fe84e', code: 'CHI-01', name: 'Chiller 1', type: 'chiller', brand: null, status: 'active', room: 'd172b0ef-6800-45ad-9717-fc723f74eaa1', x: 10.29, y: 0.2, rot: 0, ops: 'idle', foto: 'CHI-01.jpg' },
    { id: '3478cf39-5bba-45d2-bc4f-2efe332b6986', code: 'CHI-02', name: 'Chiller 2', type: 'chiller', brand: null, status: 'active', room: 'd172b0ef-6800-45ad-9717-fc723f74eaa1', x: 3.79, y: 0.2, rot: 0, ops: 'idle', foto: 'CHI-02.jpg' },
    { id: '9414461d-5f89-439f-8cbe-3addf9cc5147', code: 'CHI-03', name: 'Chiller 3', type: 'chiller', brand: null, status: 'active', room: 'd172b0ef-6800-45ad-9717-fc723f74eaa1', x: 6.81, y: 0.2, rot: 0, ops: 'idle', foto: 'CHI-03.jpg' },
    { id: '6869f59f-a03b-49ef-ad7f-cd4844094e57', code: 'COM-01', name: 'Compresor 1', type: 'compressor', brand: null, status: 'active', room: 'f1543983-33fc-4326-baa0-cd4b0e1d2ab0', x: 6.4, y: 0.8, rot: 0, ops: 'idle', foto: null },
    { id: '6113ce82-ba28-4ec0-9836-f332184a3fde', code: 'COM-02', name: 'Compresor 2', type: 'compressor', brand: null, status: 'active', room: 'f1543983-33fc-4326-baa0-cd4b0e1d2ab0', x: 9.2, y: 0.8, rot: 0, ops: 'idle', foto: 'COM-02.jpg' },
    { id: '92cf96ab-291d-4bf7-9df0-415a33503228', code: 'INC-01', name: 'Inc 1', type: 'setter', brand: 'PETERSIME', status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 0.12, y: 0, rot: 180, ops: 'active', foto: 'INC-01.jpg' },
    { id: '843ba257-316c-4541-b79b-a59f993046fb', code: 'INC-02', name: 'Inc 2', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 4.2, y: 0, rot: 180, ops: 'active', foto: 'INC-02.jpg' },
    { id: '37385660-e05e-4828-8cd5-b18af03186d2', code: 'INC-03', name: 'Inc 3', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 8.2, y: 0, rot: 180, ops: 'idle', foto: 'INC-03.jpg' },
    { id: '2f26e91e-252f-4976-b846-614aa5a82fda', code: 'INC-04', name: 'Inc 4', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 12.2, y: 0, rot: 180, ops: 'active', foto: 'INC-04.jpg' },
    { id: '57f48375-2e2d-4d46-bfed-af8ca6940bff', code: 'INC-05', name: 'Inc 5', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 16.2, y: 0, rot: 180, ops: 'idle', foto: 'INC-05.jpg' },
    { id: '1e2894e5-c795-4d3b-b1bd-327615f0cb82', code: 'INC-06', name: 'Inc 6', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 20.2, y: 0, rot: 180, ops: 'active', foto: 'INC-06.jpg' },
    { id: 'd869c9c9-5e9e-4be5-887e-ef2e4f0571a1', code: 'INC-07', name: 'Inc 7', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 20, y: 7.6, rot: 0, ops: 'idle', foto: 'INC-07.jpg' },
    { id: '78d60dc6-6ced-488f-80b0-e8ba3fdf406f', code: 'INC-08', name: 'Inc 8', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 16, y: 7.6, rot: 0, ops: 'active', foto: 'INC-08.jpg' },
    { id: '1bff2328-f293-46ee-8f72-a616bc930e2e', code: 'INC-09', name: 'Inc 9', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 12, y: 7.6, rot: 0, ops: 'active', foto: 'INC-09.jpg' },
    { id: '89ddb92b-f007-455f-84ae-80ac12038e62', code: 'INC-10', name: 'Inc 10', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 8, y: 7.6, rot: 0, ops: 'idle', foto: 'INC-10.jpg' },
    { id: '8cd2861b-cf9c-4b1e-ad1d-b4da7eabf281', code: 'INC-11', name: 'Inc 11', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 4, y: 7.6, rot: 0, ops: 'active', foto: 'INC-11.jpg' },
    { id: 'f4520b18-98d3-4c9b-8aea-5f9d074e9d54', code: 'INC-12', name: 'Inc 12', type: 'setter', brand: null, status: 'active', room: '15db632a-b7b0-455c-89a8-3d34f4106733', x: 0, y: 7.6, rot: 0, ops: 'active', foto: 'INC-12.jpg' },
    { id: '147eb539-ad06-4959-9830-a581ee7cd92c', code: 'INC-13', name: 'Inc 13', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 25, y: 7.5, rot: 0, ops: 'active', foto: 'INC-13.jpg' },
    { id: '0c79e72e-c9a0-49a9-bacb-0da09784ab36', code: 'INC-14', name: 'Inc 14', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 21, y: 7.5, rot: 0, ops: 'active', foto: 'INC-14.jpg' },
    { id: '90bcbe24-f773-4933-9d6b-67d99d33d26e', code: 'INC-15', name: 'Inc 15', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 17, y: 7.5, rot: 0, ops: 'idle', foto: 'INC-15.jpg' },
    { id: '69de1aac-fd6a-4ce3-bf12-3634fd65e843', code: 'INC-16', name: 'Inc 16', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 8, y: 7.5, rot: 0, ops: 'active', foto: 'INC-16.jpg' },
    { id: '7787e4ab-0e13-43eb-850b-1705487c972e', code: 'INC-17', name: 'Inc 17', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 4, y: 7.5, rot: 0, ops: 'active', foto: 'INC-17.jpg' },
    { id: '6e2d2eae-84b5-4a1f-8ceb-a2061d4a7464', code: 'INC-18', name: 'Inc 18', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 0, y: 7.5, rot: 0, ops: 'active', foto: 'INC-18.jpg' },
    { id: '34c3c21f-3afa-4278-af0d-a7d80b8bc8e5', code: 'INC-19', name: 'Inc 19', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 4, y: 0, rot: 180, ops: 'idle', foto: 'INC-19.jpg' },
    { id: '6f703864-ef3e-4b45-9070-7d9dc8e4341d', code: 'INC-20', name: 'Inc 20', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 8, y: 0, rot: 180, ops: 'active', foto: 'INC-20.jpg' },
    { id: '1c97e9e4-f8e0-4b9e-8a36-5f4cb2050772', code: 'INC-21', name: 'Inc 21', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 12, y: 0, rot: 180, ops: 'active', foto: 'INC-21.jpg' },
    { id: 'a321bcdb-02f3-4718-b9db-529699aa3849', code: 'INC-22', name: 'Inc 22', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 16, y: 0, rot: 180, ops: 'active', foto: 'INC-22.jpg' },
    { id: '454c7e9b-1ebf-415a-8ffc-bda1e39ed02b', code: 'INC-23', name: 'Inc 23', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 20, y: 0, rot: 180, ops: 'idle', foto: 'INC-23.jpg' },
    { id: 'ae216cf4-4def-4f46-91ec-cf6e4619652e', code: 'INC-24', name: 'Inc 24', type: 'setter', brand: null, status: 'active', room: '77fdd234-6016-4521-ac28-551277e059f4', x: 24, y: 0, rot: 180, ops: 'active', foto: 'INC-24.jpg' },
    { id: '21ae42f9-b63f-4fca-82b9-19a6cf1e4585', code: 'NAC-01', name: 'Nac 1', type: 'hatcher', brand: null, status: 'maintenance', room: '058d4c41-3bd0-4840-be20-16d2b3ec758d', x: 0, y: 3.2, rot: 0, ops: 'idle', foto: 'NAC-01.jpg' },
    { id: '4ab6309c-649f-459f-8322-f1ff6878aaa2', code: 'NAC-02', name: 'Nac 2', type: 'hatcher', brand: null, status: 'active', room: '058d4c41-3bd0-4840-be20-16d2b3ec758d', x: 3.4, y: 3.2, rot: 0, ops: 'idle', foto: 'NAC-02.jpg' },
    { id: '424cb8b7-96ff-4b78-84b6-046e5bf174de', code: 'NAC-03', name: 'Nac 3', type: 'hatcher', brand: null, status: 'active', room: '058d4c41-3bd0-4840-be20-16d2b3ec758d', x: 6.8, y: 3.2, rot: 0, ops: 'idle', foto: 'NAC-03.jpg' },
    { id: '601e3c57-5c27-4ecf-8b0e-0e96e5fc953c', code: 'NAC-04', name: 'Nac 4', type: 'hatcher', brand: null, status: 'active', room: '4525b77b-4257-4a69-bb42-355e85935a13', x: 0, y: 1, rot: 180, ops: 'idle', foto: 'NAC-04.jpg' },
    { id: '26abf9b6-7c85-4ad3-92c8-4f9a06008962', code: 'NAC-05', name: 'Nac 5', type: 'hatcher', brand: null, status: 'active', room: '4525b77b-4257-4a69-bb42-355e85935a13', x: 3.4, y: 1, rot: 180, ops: 'idle', foto: 'NAC-05.jpg' },
    { id: '489703c6-a49e-4fad-9700-ebe69e79f7e5', code: 'NAC-06', name: 'Nac 6', type: 'hatcher', brand: null, status: 'active', room: '4525b77b-4257-4a69-bb42-355e85935a13', x: 6.8, y: 1, rot: 180, ops: 'idle', foto: 'NAC-06.jpg' },
    { id: '14e2fba0-b98e-447b-bdbb-fa51dbe49125', code: 'NAC-07', name: 'Nac 7', type: 'hatcher', brand: null, status: 'active', room: '7a8eb99a-6f31-41a0-867d-789114bdbd2b', x: 6.8, y: 1.6, rot: 0, ops: 'idle', foto: 'NAC-07.jpg' },
    { id: 'e38c7e55-33d6-44c1-89d7-cf36ebfca38c', code: 'NAC-08', name: 'Nac 8', type: 'hatcher', brand: null, status: 'active', room: '7a8eb99a-6f31-41a0-867d-789114bdbd2b', x: 3.4, y: 1.6, rot: 0, ops: 'idle', foto: 'NAC-08.jpg' },
    { id: 'b9648dbe-c0c1-4f4f-9de6-8916dc80243a', code: 'NAC-09', name: 'Nac 9', type: 'hatcher', brand: null, status: 'active', room: '7a8eb99a-6f31-41a0-867d-789114bdbd2b', x: 0, y: 1.6, rot: 0, ops: 'idle', foto: 'NAC-09.jpg' },
    { id: 'cc5689dc-c2c1-4941-9ea4-596982212113', code: 'NAC-10', name: 'Nac 10', type: 'hatcher', brand: null, status: 'active', room: 'd7da3177-a600-499c-979a-90eaf9f3deaf', x: 6.8, y: 1.6, rot: 0, ops: 'idle', foto: 'NAC-10.jpg' },
    { id: '0a34b622-e358-464f-b447-29f77c8ca788', code: 'NAC-11', name: 'Nac 11', type: 'hatcher', brand: null, status: 'active', room: 'd7da3177-a600-499c-979a-90eaf9f3deaf', x: 3.4, y: 1.6, rot: 0, ops: 'idle', foto: 'NAC-11.jpg' },
    { id: 'ca26a34f-53ca-4a2e-8c79-a9bc4bbf2241', code: 'NAC-12', name: 'Nac 12', type: 'hatcher', brand: null, status: 'active', room: 'd7da3177-a600-499c-979a-90eaf9f3deaf', x: 0, y: 1.6, rot: 0, ops: 'idle', foto: 'NAC-12.jpg' },
  ],

  // ── CATÁLOGOS (mismos colores y tamaños del plano 2D de IncubApp) ─────────
  tiposSala: {
    incubation:       { label: 'Incubación',            color: '#35d6e8', muro: true,  altura: 2.9 },
    hatching:         { label: 'Nacedora',              color: '#f0b34a', muro: true,  altura: 2.9 },
    egg_storage:      { label: 'Bodega de huevo',       color: '#57d9a3', muro: true,  altura: 2.9 },
    chick_processing: { label: 'Proceso de pollito',    color: '#f07070', muro: true,  altura: 2.9 },
    washing:          { label: 'Lavado',                color: '#8fa3c8', muro: true,  altura: 2.9 },
    technical:        { label: 'Cuarto técnico',        color: '#b48cf0', muro: true,  altura: 2.9 },
    office:           { label: 'Oficina',               color: '#6b7896', muro: true,  altura: 2.9 },
    hallway:          { label: 'Pasillo / corredor',    color: '#55627e', muro: false, altura: 0 },
    parking:          { label: 'Parqueadero',           color: '#7d8aa5', muro: false, altura: 0 },
    exterior:         { label: 'Exterior / Patio',      color: '#c9a06a', muro: false, altura: 0 },
    green_area:       { label: 'Zona verde',            color: '#5bbf6a', muro: false, altura: 0 },
    tank:             { label: 'Tanque / Silo',         color: '#6fb2c8', muro: true,  altura: 2.9 },
    road:             { label: 'Vía',                   color: '#a98a5b', muro: false, altura: 0 },
    // El plenum no levanta muro propio desde el piso —cuelga del cielo raso
    // de su sala anfitriona (parteDe), altura la de su campo `altura`—, así
    // que aquí solo importan el color y que `muro` quede en false.
    plenum:           { label: 'Plenum (técnico)',      color: '#5c6f8f', muro: false, altura: 0 },
    other:            { label: 'Otro',                  color: '#7f8ca6', muro: true,  altura: 2.9 },
  },

  // Tamaño real de cada equipo (m): ancho × fondo × alto
  // Incubadoras y nacedoras miden lo mismo de alto, y esa altura no es libre:
  // sale de las medidas de Henry. Los cuartos de máquinas del segundo nivel
  // bajan 1 m desde el entrepiso —que está a 3,40— y su suelo ES el techo de
  // las máquinas, así que el equipo mide 2,40. El 2,7 que había era un valor
  // genérico, nunca medido, y dejaba los cuartos metidos 30 cm en las máquinas.
  tiposEquipo: {
    setter:     { label: 'Incubadora', w: 4,   d: 3.5, h: 2.4, color: '#2fbfd6' },
    combo:      { label: 'Combinada',  w: 4,   d: 3.5, h: 2.4, color: '#2fbfd6' },
    hatcher:    { label: 'Nacedora',   w: 3.5, d: 1.8, h: 2.4, color: '#e8a53c' },
    chiller:    { label: 'Chiller',    w: 2.6, d: 1.8, h: 2.1, color: '#7fd4e8' },
    compressor: { label: 'Compresor',  w: 2.6, d: 1.8, h: 1.7, color: '#b6a0e8' },
    other:      { label: 'Equipo',     w: 2.6, d: 1.8, h: 1.8, color: '#9aa6bd' },
  },

  estadosEquipo: {
    active:         { label: 'Activa', color: '#37d67a' },
    idle:           { label: 'En espera', color: '#8fa3c8' },
    maintenance:    { label: 'En mantenimiento', color: '#f0b34a' },
    decommissioned: { label: 'Fuera de servicio', color: '#f07070' },
  },

  // Puntos de interés para el recorrido guiado (x, z en metros; mirando hacia yaw en grados)
  recorrido: [
    { code: 'S41',   titulo: 'Ingreso zona limpia' },
    { code: 'REC',   titulo: 'Recepción de huevos' },
    { code: 'S22',   titulo: 'Cuarto frío' },
    { code: 'SI2',   titulo: 'Sala de incubadoras 2' },
    { code: 'SI1',   titulo: 'Sala de incubadoras 1' },
    { code: 'S91',   titulo: 'Sala de transferencia' },
    { code: 'SN2',   titulo: 'Sala de nacedoras 2' },
    { code: 'SN1',   titulo: 'Sala de nacedoras 1' },
    { code: 'S33',   titulo: 'Sala de sexaje' },
    { code: 'S92',   titulo: 'Vacunación' },
    { code: 'S46',   titulo: 'Despacho' },
    { code: 'S21',   titulo: 'Lavado de nacimiento' },
    { code: 'TEC-1', titulo: 'Sala técnica No 1' },
  ],
}
