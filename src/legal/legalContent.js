/**
 * =============================================================================
 * ARCHIVO: src/legal/legalContent.js
 * PROPÓSITO: Texto de Términos de Uso y Política de Tratamiento de Datos (Habeas
 * Data) de IncubApp. Redactado para favorecer al máximo, dentro de lo legalmente
 * posible en Colombia, al Operador/Propietario del SaaS (CDH Maker).
 * IMPORTANTE: revisar con abogado antes de publicar — ver nota en el chat de
 * la sesión que generó este archivo. Cambiar la versión (fecha) cada vez que
 * se edite el contenido para forzar re-aceptación de los usuarios.
 * Henry Stark Desarrollador · CDH Maker
 * =============================================================================
 */

export const OWNER_NAME = 'CDH Maker'
export const OWNER_LEGAL_PERSON = 'Henry Camilo Taborda Galeano'
export const OWNER_LEGAL_ID = 'NIT 1017189866'
export const OWNER_LEGAL_ADDRESS = 'Carrera 22C No. 59B-27, Medellín, Antioquia, Colombia'
export const OWNER_LEGAL_NOTE = `${OWNER_LEGAL_PERSON}, identificado con ${OWNER_LEGAL_ID}, con domicilio en ${OWNER_LEGAL_ADDRESS}`
export const PRODUCT_NAME = 'IncubApp'

export const TERMS_VERSION = '2026-07-10.2'
export const PRIVACY_VERSION = '2026-07-10.2'

export const TERMS_SECTIONS = [
  {
    title: '1. Aceptación y ámbito de aplicación',
    paragraphs: [
      `Estos Términos y Condiciones de Uso ("Términos") regulan el acceso y uso de la plataforma ${PRODUCT_NAME} (el "Servicio"), operada y de titularidad exclusiva de ${OWNER_NAME} (el "Operador" o "Propietario"). El acceso o uso del Servicio, incluyendo el registro de una cuenta o la aceptación mediante clic, constituye la aceptación plena, irrevocable y sin reservas de estos Términos y de la Política de Tratamiento de Datos Personales, que se incorpora por referencia.`,
      `Si el usuario no está de acuerdo con la totalidad de estos Términos, debe abstenerse de usar el Servicio. La empresa contratante (el "Cliente") es responsable de que cada uno de sus empleados, contratistas o colaboradores que use el Servicio conozca y acepte estos Términos antes del primer uso.`,
    ],
  },
  {
    title: '2. Definiciones',
    paragraphs: [
      `"Operador" o "Propietario": ${OWNER_NAME}, marca comercial operada por ${OWNER_LEGAL_NOTE}, titular exclusivo de la plataforma ${PRODUCT_NAME}, su código, marca, diseño y toda propiedad intelectual asociada.`,
      '"Cliente": la persona jurídica que contrata el Servicio para su empresa (planta, granja u operación conexa) y que actúa, respecto de sus propios trabajadores, como empleador y responsable del cumplimiento de la normativa laboral aplicable.',
      '"Usuario": toda persona natural que accede al Servicio con una cuenta, ya sea en representación del Cliente, como su empleado, contratista o tercero autorizado.',
      '"Datos del Cliente": la información operativa, productiva, de personal, de geolocalización y demás datos que el Cliente o sus Usuarios cargan, generan o transmiten a través del Servicio.',
    ],
  },
  {
    title: '3. Licencia de uso',
    paragraphs: [
      `El Operador concede al Cliente y a sus Usuarios autorizados una licencia de uso limitada, no exclusiva, intransferible, revocable en cualquier momento y sujeta al pago vigente de las tarifas aplicables, para acceder y usar el Servicio exclusivamente para los fines internos del negocio del Cliente.`,
      'Queda expresamente prohibido: (i) copiar, descompilar, aplicar ingeniería inversa o intentar extraer el código fuente del Servicio; (ii) revender, sublicenciar, ceder o explotar comercialmente el Servicio a terceros sin autorización escrita del Operador; (iii) usar el Servicio para desarrollar un producto competidor; (iv) eliminar avisos de propiedad o marca.',
    ],
  },
  {
    title: '4. Obligaciones del Cliente y de los Usuarios',
    paragraphs: [
      'El Cliente y cada Usuario se obligan a: usar el Servicio conforme a la ley, la moral y el orden público; suministrar información veraz, exacta y actualizada; custodiar sus credenciales de acceso bajo su exclusiva responsabilidad; y responder por toda actividad realizada bajo su cuenta, haya sido o no autorizada.',
      'El Cliente, en su calidad de empleador, es el único responsable de informar a sus trabajadores sobre el uso del Servicio, de obtener las autorizaciones laborales que correspondan (incluidas las relativas a control de asistencia, fotografía y geolocalización) y de cumplir la normativa laboral, de seguridad social y de protección de datos que le sea aplicable frente a sus propios empleados. El Operador actúa como proveedor tecnológico y no asume ninguna responsabilidad laboral, contractual o extracontractual frente a los empleados del Cliente.',
      'El Cliente es responsable de mantener la confidencialidad de la información competitiva que decida no cargar en la plataforma, y reconoce que el Operador no garantiza que el Servicio esté libre de errores, ni asume responsabilidad por decisiones operativas, productivas o comerciales que el Cliente tome con base en los datos o reportes del Servicio.',
    ],
  },
  {
    title: '5. Geolocalización, fotografías y datos biométricos',
    paragraphs: [
      `El Servicio incluye funciones de geolocalización (GPS) para: (i) verificar la ubicación del Usuario dentro del radio calibrado de una sede al marcar ingreso/salida; (ii) proyectar en tiempo real la posición de personal sobre el plano de planta o granja; y (iii) rastrear en tiempo real vehículos, conductores y rutas de logística. El Servicio también captura fotografías ("selfies") con marca de agua para el control de asistencia.`,
      'El Usuario autoriza expresamente, mediante la aceptación de estos Términos y de la Política de Tratamiento de Datos, la captura, tratamiento y almacenamiento de su geolocalización y su imagen para los fines aquí descritos. Esta autorización es condición necesaria para el uso de las funciones de asistencia, plano en tiempo real y logística; quien no otorgue o revoque dicha autorización podrá quedar sin acceso a esas funciones específicas, sin que ello genere responsabilidad alguna para el Operador.',
      'El Cliente garantiza al Operador que ha obtenido, o se compromete a obtener antes de habilitar estas funciones, todas las autorizaciones laborales y de protección de datos que le sean exigibles frente a sus trabajadores para el uso de geolocalización y captura de imagen en el marco de la relación laboral, y mantendrá indemne al Operador frente a cualquier reclamación derivada del incumplimiento de esta garantía.',
    ],
  },
  {
    title: '6. Disponibilidad del Servicio',
    paragraphs: [
      'El Servicio se presta "tal cual" ("as is") y "según disponibilidad" ("as available"), sin garantía de funcionamiento ininterrumpido, libre de errores o exento de vulnerabilidades. El Operador podrá suspender temporalmente el Servicio por mantenimiento, actualizaciones, causas de fuerza mayor o caso fortuito, o por causas atribuibles a terceros proveedores (incluidos proveedores de infraestructura en la nube), sin que ello genere derecho a indemnización alguna a favor del Cliente.',
      'El Operador podrá modificar, limitar, suspender o discontinuar cualquier funcionalidad del Servicio en cualquier momento, a su sola discreción, con o sin previo aviso, cuando razones técnicas, de seguridad o de negocio lo justifiquen.',
    ],
  },
  {
    title: '7. Propiedad y uso de los Datos del Cliente',
    paragraphs: [
      'El Cliente conserva la titularidad de los Datos del Cliente en lo que corresponda conforme a la ley. No obstante, el Cliente otorga al Operador una licencia amplia, mundial, libre de regalías y por el tiempo de vigencia del contrato y con posterioridad a su terminación en los términos aquí previstos, para usar, copiar, procesar, almacenar, analizar y explotar dichos datos con el fin de: prestar y operar el Servicio; darle soporte y mantenimiento; mejorarlo; desarrollar nuevas funcionalidades; entrenar y mejorar modelos, algoritmos e inteligencia artificial propios del Operador; y generar estadísticas, reportes y datos agregados o anonimizados que en ningún caso identificarán al Cliente ni a sus Usuarios y que serán de exclusiva propiedad del Operador, pudiendo este último usarlos, publicarlos o comercializarlos libremente.',
      'A la terminación del contrato, el Operador podrá conservar copias de los Datos del Cliente por el plazo que exijan obligaciones legales, contables, fiscales o de defensa judicial, y podrá conservar indefinidamente los datos agregados o anonimizados generados conforme al párrafo anterior.',
    ],
  },
  {
    title: '8. Tarifas, pagos y suspensión',
    paragraphs: [
      'El acceso al Servicio está condicionado al pago oportuno de las tarifas pactadas. El Operador podrá suspender o restringir el acceso al Servicio, sin previo aviso, en caso de mora, sin que ello genere responsabilidad alguna a su cargo ni afecte la exigibilidad de las sumas adeudadas.',
      'Salvo pacto expreso en contrario, las tarifas no incluyen impuestos, y no habrá lugar a reembolsos por periodos parcialmente utilizados, suspensiones atribuibles al Cliente, o terminación anticipada por causas imputables al Cliente.',
    ],
  },
  {
    title: '9. Limitación de responsabilidad',
    paragraphs: [
      'En la máxima medida permitida por la ley aplicable, el Operador no será responsable por daños indirectos, incidentales, especiales, consecuenciales, lucro cesante, pérdida de datos, pérdida de oportunidad de negocio o daño reputacional derivados del uso o la imposibilidad de uso del Servicio, incluso si se le hubiera advertido de la posibilidad de tales daños.',
      'La responsabilidad total y acumulada del Operador frente al Cliente, por cualquier causa relacionada con el Servicio, no excederá en ningún caso el valor efectivamente pagado por el Cliente al Operador durante los tres (3) meses inmediatamente anteriores al hecho que origine el reclamo.',
      'El Operador no será responsable por fallas, retrasos o inexactitudes originadas en: la señal GPS o de red del dispositivo del Usuario; la calibración de sedes realizada por el propio Cliente; conexiones a internet; proveedores de infraestructura en la nube; ni por decisiones tomadas por el Cliente con base en la información del Servicio.',
    ],
  },
  {
    title: '10. Indemnidad',
    paragraphs: [
      'El Cliente se obliga a defender, indemnizar y mantener indemne al Operador, sus administradores, empleados y colaboradores, frente a cualquier reclamación, sanción, multa, demanda, costo o gasto (incluidos honorarios razonables de abogados) que se derive de: (i) el incumplimiento por el Cliente o sus Usuarios de estos Términos o de la ley aplicable; (ii) el uso indebido del Servicio; (iii) reclamaciones de los trabajadores o terceros del Cliente relacionadas con el control de asistencia, geolocalización, captura de imagen o cualquier tratamiento de datos personales realizado en el marco de la relación laboral o comercial del Cliente; y (iv) la veracidad de la información cargada por el Cliente en la plataforma.',
    ],
  },
  {
    title: '11. Modificaciones de estos Términos',
    paragraphs: [
      'El Operador podrá modificar estos Términos en cualquier momento y a su sola discreción. Los cambios sustanciales se comunicarán mediante aviso dentro del Servicio y/o requerirán nueva aceptación antes de continuar usando el Servicio. El uso continuado del Servicio después de la entrada en vigencia de una modificación constituye aceptación de la misma.',
    ],
  },
  {
    title: '12. Terminación y suspensión',
    paragraphs: [
      'El Operador podrá suspender o terminar, total o parcialmente, el acceso de cualquier Usuario o del Cliente al Servicio, en cualquier momento y a su sola discreción, con o sin causa, y con o sin previo aviso en casos de incumplimiento grave, riesgo de seguridad, uso fraudulento o mora en el pago, sin que ello genere derecho a indemnización a favor del Cliente o del Usuario.',
    ],
  },
  {
    title: '13. Propiedad intelectual',
    paragraphs: [
      `Todo el software, código fuente, bases de datos, arquitectura, diseño, interfaces, marcas (incluida "${PRODUCT_NAME}"), logotipos, metodologías y demás elementos del Servicio son propiedad exclusiva del Operador o de sus licenciantes, y están protegidos por las leyes de propiedad intelectual y derechos de autor. Nada en estos Términos transfiere derecho de propiedad intelectual alguno al Cliente o a los Usuarios.`,
    ],
  },
  {
    title: '14. Confidencialidad',
    paragraphs: [
      'Cada parte se obliga a mantener confidencial la información no pública de la otra parte a la que tenga acceso con ocasión de la relación contractual, y a no divulgarla a terceros sin autorización previa y escrita, salvo requerimiento de autoridad competente.',
    ],
  },
  {
    title: '15. Fuerza mayor',
    paragraphs: [
      'Ninguna de las partes será responsable por incumplimientos derivados de caso fortuito o fuerza mayor, incluyendo fallas de proveedores de infraestructura tecnológica, cortes de energía o de telecomunicaciones, actos de autoridad, desastres naturales, pandemias, ataques informáticos de terceros o disturbios sociales.',
    ],
  },
  {
    title: '16. Ley aplicable y jurisdicción',
    paragraphs: [
      `Estos Términos se rigen por las leyes de la República de Colombia. Para cualquier controversia derivada de estos Términos o del Servicio, las partes se someten a los jueces y tribunales competentes de la ciudad de Medellín, Antioquia, Colombia, domicilio del Operador (${OWNER_LEGAL_NOTE}), renunciando expresamente a cualquier otro fuero que pudiera corresponderles.`,
    ],
  },
  {
    title: '17. Disposiciones generales',
    paragraphs: [
      'Si alguna disposición de estos Términos fuera declarada inválida o inaplicable, las demás continuarán en pleno vigor. La falta de ejercicio por el Operador de algún derecho previsto en estos Términos no constituye renuncia al mismo. Estos Términos, junto con la Política de Tratamiento de Datos, constituyen el acuerdo íntegro entre las partes en relación con el Servicio.',
    ],
  },
  {
    title: '18. Contacto',
    paragraphs: [
      `Para consultas sobre estos Términos, el Usuario o Cliente puede contactar al Operador (${OWNER_NAME}, ${OWNER_LEGAL_NOTE}) a través de los canales de soporte dispuestos dentro del Servicio.`,
    ],
  },
]

export const PRIVACY_SECTIONS = [
  {
    title: '1. Responsable y Encargado del tratamiento',
    paragraphs: [
      `${OWNER_NAME} (${OWNER_LEGAL_NOTE}), operador de la plataforma ${PRODUCT_NAME}, actúa como Responsable del tratamiento respecto de los datos de la cuenta y uso de la plataforma (identificación, credenciales, datos de navegación), y como Encargado del tratamiento respecto de los Datos del Cliente que este cargue u obtenga a través del Servicio sobre sus propios trabajadores (incluida la información de asistencia, geolocalización y fotografías), actuando en este último caso por instrucción y bajo la responsabilidad del Cliente, quien conserva la calidad de Responsable frente a sus propios trabajadores en su condición de empleador.`,
      'Esta Política de Tratamiento de Datos Personales se expide en cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 (y las normas que los modifiquen, adicionen o sustituyan) y demás disposiciones aplicables en Colombia sobre protección de datos personales ("Habeas Data").',
    ],
  },
  {
    title: '2. Datos personales recolectados',
    paragraphs: [
      'Según el rol del Titular y las funciones que use, el Servicio puede recolectar: datos de identificación y contacto (nombre, correo, teléfono); credenciales de acceso; rol y área dentro de la organización; fotografías tomadas para el control de asistencia (selfies con marca de agua de nombre, fecha, hora y coordenadas); datos de geolocalización GPS (en tiempo real, con precisión de pocos metros, incluyendo velocidad y rumbo cuando aplique para conductores en ruta); datos de uso de la plataforma, dirección IP y características del dispositivo; y demás información operativa que el Cliente decida cargar al Servicio.',
    ],
  },
  {
    title: '3. Finalidades del tratamiento',
    paragraphs: [
      'Los datos se tratan para: gestionar el acceso y la autenticación de Usuarios; controlar el ingreso y la salida de personal (asistencia), incluida la verificación de que dicha marca ocurre dentro del radio geográfico calibrado de la sede correspondiente; proyectar en tiempo real la ubicación de personal sobre el plano de planta o granja; rastrear en tiempo real vehículos, conductores y rutas de la operación logística; prevenir fraude y usos indebidos; generar reportes operativos, de cumplimiento y de desempeño; brindar soporte técnico; mejorar y desarrollar el Servicio, incluyendo el entrenamiento de modelos analíticos o de inteligencia artificial con datos agregados o anonimizados; y cumplir obligaciones legales, contractuales o requerimientos de autoridad competente.',
    ],
  },
  {
    title: '4. Autorización del Titular',
    paragraphs: [
      'Al aceptar esta Política, el Titular otorga al Responsable y al Encargado autorización previa, expresa e informada para el tratamiento de sus datos personales conforme a las finalidades aquí descritas, incluyendo el tratamiento de su geolocalización y su imagen. Esta autorización es libre pero necesaria para el uso de las funciones de asistencia, plano en tiempo real y logística; el Titular puede revocarla en cualquier momento con los efectos y limitaciones descritos en la sección 5, entendiendo que la revocatoria puede implicar la imposibilidad de usar dichas funciones.',
      'El Cliente, en su calidad de empleador, declara que ha informado a sus trabajadores sobre el uso del Servicio y que ha obtenido o gestionará las autorizaciones adicionales que la normativa laboral colombiana exija para el control de geolocalización y captura de imagen de sus empleados, siendo el único responsable frente a estos por dicho cumplimiento.',
    ],
  },
  {
    title: '5. Derechos del Titular',
    paragraphs: [
      'Conforme a la ley colombiana, el Titular de los datos tiene derecho a: conocer, actualizar y rectificar sus datos personales; solicitar prueba de la autorización otorgada; ser informado sobre el uso dado a sus datos; presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley; revocar la autorización y/o solicitar la supresión del dato cuando no exista un deber legal o contractual que lo impida; y acceder gratuitamente a sus datos personales.',
      'Para ejercer estos derechos, el Titular debe dirigir su solicitud al canal de contacto indicado en la sección 11, o, cuando se trate de datos cargados por su empleador (el Cliente) en el marco de la relación laboral, también podrá dirigirse directamente a este último. Las solicitudes se atenderán dentro de los plazos legales aplicables (consultas: máximo 10 días hábiles, prorrogables por 5 días hábiles adicionales; reclamos: máximo 15 días hábiles, prorrogables por 8 días hábiles adicionales).',
    ],
  },
  {
    title: '6. Transferencia y transmisión de datos',
    paragraphs: [
      'Para la prestación del Servicio, los datos personales se almacenan y procesan mediante proveedores de infraestructura tecnológica en la nube, que pueden ubicarse fuera de Colombia. El Titular autoriza dicha transmisión y, cuando aplique, transferencia internacional de datos, en cuanto resulte necesaria para la prestación del Servicio, entendiendo que el Operador exigirá a dichos proveedores estándares de seguridad razonables conforme a sus propias políticas.',
      'El Operador podrá compartir datos con autoridades públicas cuando exista requerimiento legal, judicial o administrativo válido.',
    ],
  },
  {
    title: '7. Almacenamiento, seguridad y conservación',
    paragraphs: [
      'El Operador implementa medidas técnicas, humanas y administrativas razonables para proteger los datos personales contra pérdida, uso indebido, acceso no autorizado o alteración, sin que ello constituya una garantía absoluta de seguridad, dada la naturaleza de los sistemas de información. El Operador no será responsable por accesos no autorizados a los datos que no le sean imputables a título de dolo o culpa grave.',
      'Los datos se conservarán mientras subsista la relación entre el Titular (o el Cliente) y el Servicio, y con posterioridad, durante los plazos exigidos por la ley (laboral, contable, fiscal) o los necesarios para la defensa de los intereses del Operador, tras lo cual serán eliminados o anonimizados, salvo los datos agregados o anonimizados que podrán conservarse indefinidamente.',
    ],
  },
  {
    title: '8. Menores de edad',
    paragraphs: [
      'El Servicio está dirigido exclusivamente a empresas y a Usuarios mayores de edad en el ámbito laboral o comercial. El Operador no recolecta intencionalmente datos de menores de edad.',
    ],
  },
  {
    title: '9. Cookies y tecnologías similares',
    paragraphs: [
      'El Servicio puede usar almacenamiento local del navegador y tecnologías similares para mantener la sesión del Usuario, recordar preferencias y mejorar el desempeño de la plataforma.',
    ],
  },
  {
    title: '10. Cambios a esta Política',
    paragraphs: [
      'El Operador podrá modificar esta Política en cualquier momento. Los cambios sustanciales se comunicarán dentro del Servicio y podrán requerir nueva aceptación por parte del Titular antes de continuar usando el Servicio.',
    ],
  },
  {
    title: '11. Contacto',
    paragraphs: [
      `Para el ejercicio de los derechos ARCO o cualquier consulta sobre el tratamiento de datos personales, el Titular puede contactar a ${OWNER_NAME} (${OWNER_LEGAL_NOTE}) a través de los canales de soporte dispuestos dentro del Servicio.`,
    ],
  },
]
