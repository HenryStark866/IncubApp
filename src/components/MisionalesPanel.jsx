/**
 * Desplazamientos Misionales — inspección pre-operacional de vehículos.
 * 06-10-2026: réplica de la ventana original de Misionales (repo_misionales):
 *  - Nueva inspección: form.html (tipo de vehículo, despacho y GPS del camión, datos,
 *    documentos con vencimientos, mantenimiento, aspectos B/R/M/N/A con foto en M/R,
 *    óptimas condiciones, firma dibujada o subida, observaciones, borrador automático).
 *  - Mis inspecciones: lista_inspecciones.html (contador al consolidado de 15,
 *    registros activos, detalle, PDF y Excel).
 *  - Admin (líderes): admin/inspecciones.html + dashboard.html (filtros, KPI,
 *    actividad, ranking, distribución y consolidados).
 * Activo para todos los usuarios de la empresa.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMisionales, urlEvidencia } from "../hooks/useMisionales";
import {
  VEHICLE_TYPES,
  FORMATO_MISIONAL,
  aspectosForTipo,
  aspectosIniciales,
  valoresParaItem,
  leyendaValores,
  valoresForTipo,
  calcularPorcentaje,
  nivelPorcentaje,
  contarCriticos,
  validarInspeccion,
  avisoVencimiento,
  documentoNoConforme,
  PROCESOS,
  LUGARES,
  GASOLINA,
  ESTADO_DOC,
  ESTADO_DOC_F,
  ESTADO_POLIZA,
  TIPOS_CARGA,
  LUGARES_DILIGENCIAMIENTO,
  MANTENIMIENTO_CAMION,
  PLACEHOLDERS,
  GRADE_LABEL,
} from "../lib/misionalesCatalog";
import {
  formularioVacio,
  aRegistro,
  ubicacionDe,
  cargaTexto,
} from "../lib/misionales/registro";
import { canManageOrgUsers } from "../lib/roles";
import {
  descargarPdfPreoperacional,
  descargarPdfConsolidado,
} from "../lib/misionales/descargarPdfPreoperacional";
import "./MisionalesPanel.css";

const CICLO = 15;

function fechaHoraCO(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });
}

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return enLinea;
}

export default function MisionalesPanel({
  orgId,
  userId,
  role,
  userName,
  orgName,
}) {
  const canSeeAll =
    canManageOrgUsers(role) ||
    role === "supervisor" ||
    role === "platform_admin" ||
    role === "developer";
  const api = useMisionales(orgId, userId, { canSeeAll });
  const [vista, setVista] = useState("form");
  const enLinea = useEnLinea();

  return (
    <div className="card wide mis-root">
      <header className="mis-topbar">
        <div className="mis-brand">
          <img src="/incubant-mark.png" alt="" className="mis-logo" />
          <div>
            <div className="mis-brand-title">
              Misionales{" "}
              <span className={enLinea ? "mis-conn" : "mis-conn offline"}>
                {enLinea ? "🟢 En línea" : "🔴 Sin conexión"}
              </span>
            </div>
            <div className="mis-brand-sub">Inspección Vehicular · SST</div>
          </div>
        </div>
        <nav className="mis-nav" aria-label="Misionales">
          <button
            type="button"
            className={vista === "form" ? "mis-pill active" : "mis-pill"}
            onClick={() => setVista("form")}
          >
            ✚ Nueva inspección
          </button>
          <button
            type="button"
            className={vista === "mias" ? "mis-pill active" : "mis-pill"}
            onClick={() => setVista("mias")}
          >
            📋 Mis inspecciones
          </button>
          {canSeeAll && (
            <button
              type="button"
              className={
                vista === "admin" ? "mis-pill amber active" : "mis-pill amber"
              }
              onClick={() => setVista("admin")}
            >
              ⚙ Admin
            </button>
          )}
        </nav>
        <div className="mis-user-chip">
          <span className="mis-user-dot" />
          <span className="mis-user-text">{userName || "—"}</span>
        </div>
      </header>

      {api.error && <div className="mis-msg-error">⚠ {api.error}</div>}
      {api.localMode && (
        <div className="mis-msg-warn">
          Sin conexión con la base: las inspecciones quedan en este dispositivo.
        </div>
      )}

      {vista === "form" && (
        <FormularioInspeccion
          orgId={orgId}
          userId={userId}
          userName={userName}
          onGuardar={api.createInspection}
          onVerMias={() => setVista("mias")}
        />
      )}
      {vista === "mias" && (
        <MisInspecciones
          api={api}
          userId={userId}
          userName={userName}
          orgName={orgName}
          onNueva={() => setVista("form")}
        />
      )}
      {vista === "admin" && canSeeAll && (
        <AdminMisionales api={api} orgName={orgName} />
      )}
    </div>
  );
}

/* ═════════════════════════ NUEVA INSPECCIÓN (form.html) ═════════════════════════ */

const CAMPOS_VEHICULO = [
  "placa",
  "proceso",
  "desde",
  "hasta",
  "marca",
  "gasolina",
  "modelo",
  "motor",
  "linea",
];
const CAMPOS_SOLO_CAMION = [
  "licencia_categoria",
  "soat_venc",
  "tecnomecanica_venc",
  "poliza_numero",
  "poliza_seguro_venc",
  "kilometraje",
  "numero_interno",
  "ciudad",
  "empresa",
  "ubicacion_selector",
  "ubicacion_otro",
  "tipo_carga",
  "tipo_carga_otro",
  ...MANTENIMIENTO_CAMION.map(([k]) => k),
];

function claveBorrador(orgId, userId) {
  return `incubapp_misionales_borrador_${orgId}_${userId}`;
}

/** Foto del celular → JPEG de máx. 1280 px (como el original) */
function reducirFoto(file, max = 1280, calidad = 0.75) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onerror = mal;
    r.onload = () => {
      const img = new Image();
      img.onerror = mal;
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > max) {
          h = Math.round((h * max) / w);
          w = max;
        }
        if (h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        ok(cv.toDataURL("image/jpeg", calidad));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function FormularioInspeccion({
  orgId,
  userId,
  userName,
  onGuardar,
  onVerMias,
}) {
  const [tipo, setTipoState] = useState("Moto");
  const [f, setF] = useState(() => formularioVacio("Moto"));
  const [aspectos, setAspectos] = useState(() => aspectosIniciales("Moto"));
  const [evidencias, setEvidencias] = useState({});
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState({ estado: "off" });
  const [ahora, setAhora] = useState(() => new Date());
  const [guardando, setGuardando] = useState(false);
  const firmaRef = useRef(null);
  const formRef = useRef(null);

  // Reloj del encabezado (fecha y hora)
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Borrador automático: se recupera al entrar y se guarda al escribir.
  useEffect(() => {
    try {
      const b = JSON.parse(
        localStorage.getItem(claveBorrador(orgId, userId)) || "null",
      );
      if (b?.f?.tipo) {
        setTipoState(b.f.tipo);
        setF({ ...formularioVacio(b.f.tipo), ...b.f });
        const base = aspectosIniciales(b.f.tipo);
        if (
          b.aspectos &&
          Object.keys(b.aspectos).length === Object.keys(base).length
        )
          setAspectos(b.aspectos);
        else setAspectos(base);
      }
    } catch {
      /* sin borrador */
    }
  }, [orgId, userId]);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          claveBorrador(orgId, userId),
          JSON.stringify({ f, aspectos }),
        );
        setGuardando(true);
        setTimeout(() => setGuardando(false), 900);
      } catch {
        /* almacenamiento lleno o bloqueado */
      }
    }, 800);
    return () => clearTimeout(id);
  }, [f, aspectos, orgId, userId]);

  const capturarGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps({ estado: "error", texto: "⚠ Este dispositivo no soporta GPS" });
      return;
    }
    setGps({ estado: "buscando" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          estado: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      (err) =>
        setGps({
          estado: "error",
          texto:
            {
              1: "⚠ Permiso denegado. Habilita GPS en el navegador.",
              2: "⚠ GPS desactivado. Actívalo en el dispositivo.",
              3: "⚠ Tiempo agotado. Reintenta.",
            }[err.code] || "⚠ Error de ubicación.",
        }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  // GPS solo para Camión (misiones entre sedes), como el original.
  useEffect(() => {
    if (tipo === "Camion") capturarGps();
    else setGps({ estado: "off" });
  }, [tipo, capturarGps]);

  const setTipo = (nuevo) => {
    if (nuevo === tipo) return;
    setTipoState(nuevo);
    setF((prev) => {
      const limpio = { ...prev, tipo: nuevo, condiciones_optimas: "SI" };
      for (const k of CAMPOS_VEHICULO) limpio[k] = "";
      if (nuevo !== "Camion")
        for (const k of CAMPOS_SOLO_CAMION) limpio[k] = "";
      return limpio;
    });
    setAspectos(aspectosIniciales(nuevo));
    setEvidencias({});
    setErrores({});
    setMensaje(null);
    firmaRef.current?.limpiar();
  };

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    if (errores[k]) setErrores((er) => ({ ...er, [k]: undefined }));
  };

  const lista = aspectosForTipo(tipo);
  const { m: countM, r: countR } = contarCriticos(aspectos);
  const pct = calcularPorcentaje(aspectos);
  const camion = tipo === "Camion";
  const noConforme = documentoNoConforme(f);
  const optimoBloqueado = countM > 0 || noConforme;
  const tv = VEHICLE_TYPES.find((v) => v.id === tipo);
  const ph = PLACEHOLDERS[tipo];

  // Con M (o documento no conforme) no puede quedar en «Sí»
  useEffect(() => {
    if (optimoBloqueado && f.condiciones_optimas !== "NO")
      setF((x) => ({ ...x, condiciones_optimas: "NO" }));
  }, [optimoBloqueado, f.condiciones_optimas]);

  const setValor = (i, valor) => {
    const k = String(i + 1);
    setAspectos((a) => ({ ...a, [k]: { valor, label: lista[i] } }));
    if (valor !== "M" && valor !== "R")
      setEvidencias((ev) => ({ ...ev, [k]: undefined }));
  };

  const subirEvidencia = async (i, file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await reducirFoto(file);
      setEvidencias((ev) => ({ ...ev, [String(i + 1)]: dataUrl }));
    } catch {
      setMensaje({
        tipo: "error",
        texto: "No se pudo leer la foto. Intente de nuevo.",
      });
    }
  };

  const limpiarTodo = () => {
    setTipoState("Moto");
    setF(formularioVacio("Moto"));
    setAspectos(aspectosIniciales("Moto"));
    setEvidencias({});
    setErrores({});
    firmaRef.current?.limpiar();
    try {
      localStorage.removeItem(claveBorrador(orgId, userId));
    } catch {
      /* */
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    setMensaje(null);
    const firma = firmaRef.current?.valor() || null;
    const ubicacion = ubicacionDe(f);
    const errs = validarInspeccion({
      ...f,
      ubicacion,
      aspectos,
      evidencias,
      firma,
      gps,
    });
    // El lugar de diligenciamiento se marca bajo su selector
    if (errs.ubicacion && !f.ubicacion_selector)
      errs.ubicacion_selector = errs.ubicacion;
    else if (errs.ubicacion && f.ubicacion_selector === "OTRO")
      errs.ubicacion_otro = errs.ubicacion;
    delete errs.ubicacion;
    const sinErrores = Object.fromEntries(
      Object.entries(errs).filter(([, v]) => v),
    );
    setErrores(sinErrores);
    if (Object.keys(sinErrores).length) {
      if (sinErrores._global)
        setMensaje({ tipo: "error", texto: sinErrores._global });
      setTimeout(() => {
        formRef.current
          ?.querySelector(".f-error.visible, .mis-msg-error")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 30);
      return;
    }
    setBusy(true);
    const evid = Object.fromEntries(
      Object.entries(evidencias).filter(([, v]) => v),
    );
    const res = await onGuardar(
      aRegistro(f, {
        aspectos,
        evidencias: evid,
        firma,
        gps,
        conductor: userName || "",
      }),
    );
    if (res.error) {
      setBusy(false);
      setMensaje({ tipo: "error", texto: `⚠ ${res.error}` });
      return;
    }
    // Como el original: al enviar se genera y descarga el PDF.
    // Las fotos recién tomadas van directo al PDF (sin volver a bajarlas)
    const pdf = res.row
      ? await descargarPdfPreoperacional(res.row, { evidenciasImgs: evid })
      : { error: null };
    setBusy(false);
    limpiarTodo();
    const consol = res.consolidados?.length
      ? ` · Se completó el consolidado de ${CICLO}: descárguelo en Mis inspecciones.`
      : "";
    setMensaje({
      tipo: pdf.error ? "error" : "ok",
      texto: pdf.error
        ? `Inspección registrada, pero ${pdf.error}${consol}`
        : `✓ PDF generado correctamente${consol}`,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const err = (k) =>
    errores[k] ? <span className="f-error visible">⚠ {errores[k]}</span> : null;
  const hintVenc = (k) => {
    const a = avisoVencimiento(f[k]);
    return a ? (
      <span
        className={`f-hint ${a.nivel === "vencido" ? "doc-vencido" : "doc-alerta"}`}
      >
        {a.texto}
      </span>
    ) : null;
  };
  const campo = (k, label, props = {}, req = false) => (
    <div className="field">
      <label className="f-label" htmlFor={`mis-${k}`}>
        {label} {req && <span className="required-star">*</span>}
      </label>
      <input
        id={`mis-${k}`}
        className="f-input"
        value={f[k]}
        onChange={set(k)}
        {...props}
      />
      {err(k)}
    </div>
  );
  const lista_ = (k, label, opciones, req = false) => (
    <div className="field">
      <label className="f-label" htmlFor={`mis-${k}`}>
        {label} {req && <span className="required-star">*</span>}
      </label>
      <select
        id={`mis-${k}`}
        className="f-select"
        value={f[k]}
        onChange={set(k)}
      >
        <option value="">Seleccione...</option>
        {opciones.map((o) => {
          const [val, txt] = Array.isArray(o) ? o : [o, o];
          return (
            <option key={val} value={val}>
              {txt}
            </option>
          );
        })}
      </select>
      {err(k)}
    </div>
  );
  const conMarca = (estados) =>
    estados.map((v) => [
      v,
      v === "Vigente" ? `✓ ${v}` : v === "No aplica" ? v : `✕ ${v}`,
    ]);

  return (
    <form ref={formRef} className="mis-page" onSubmit={enviar} noValidate>
      <div className="form-hero">
        <div className="hero-egg" />
        <div>
          <div className="form-title-main">{tv.titulo}</div>
          <div className="form-meta-chips">
            <span className="meta-chip">
              Código: <em>{FORMATO_MISIONAL.codigo}</em>
            </span>
            <span className="meta-chip">
              Fecha: <em>{ahora.toLocaleDateString("es-CO")}</em>
            </span>
            <span className="meta-chip">
              Hora:{" "}
              <em>
                {ahora.toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </em>
            </span>
            <span className="meta-chip">
              Versión: <em>{FORMATO_MISIONAL.version}</em>
            </span>
            <span className={`meta-chip pct-${nivelPorcentaje(pct)}`}>
              Estado: <em>{pct}%</em>
            </span>
          </div>
        </div>
      </div>

      {mensaje && (
        <div className={mensaje.tipo === "ok" ? "mis-msg-ok" : "mis-msg-error"}>
          {mensaje.texto}
          {mensaje.tipo === "ok" && (
            <button type="button" className="mis-link" onClick={onVerMias}>
              Ver mis inspecciones →
            </button>
          )}
        </div>
      )}

      <div
        className="tipo-vehiculo-selector"
        role="radiogroup"
        aria-label="Tipo de vehículo"
      >
        {VEHICLE_TYPES.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={tipo === v.id}
            className={tipo === v.id ? "tipo-btn active" : "tipo-btn"}
            onClick={() => setTipo(v.id)}
          >
            <span className="tipo-btn-check">✓</span>
            <span className="tipo-btn-icon">{v.icon}</span>
            <span className="tipo-btn-label">{v.label}</span>
          </button>
        ))}
      </div>

      {camion && (
        <Seccion
          icono="📍"
          titulo={
            <>
              Ubicación de la inspección{" "}
              <span className="required-star">*</span>
            </>
          }
        >
          <div
            className={`geo-estado ${gps.estado === "ok" ? "ok" : gps.estado === "error" ? "error" : ""}`}
          >
            <div className="geo-texto">
              <div>
                {gps.estado === "ok"
                  ? "✓ Ubicación capturada"
                  : gps.estado === "error"
                    ? gps.texto
                    : "📡 Obteniendo ubicación..."}
              </div>
              {gps.estado === "ok" && (
                <div className="geo-precision">
                  Precisión: ±{gps.accuracy}m | Lat: {gps.lat.toFixed(4)} | Lon:{" "}
                  {gps.lng.toFixed(4)}
                </div>
              )}
            </div>
            {gps.estado === "error" && (
              <button
                type="button"
                className="evidencia-btn"
                onClick={capturarGps}
              >
                ↻ Reintentar
              </button>
            )}
          </div>
          {err("gps")}
          <span className="f-hint">
            Tu ubicación se capturará automáticamente. Permite el acceso a GPS
            en tu dispositivo.
          </span>
        </Seccion>
      )}

      {camion && (
        <Seccion icono="🚦" titulo="Datos del despacho">
          <div className="grid-2">
            {campo(
              "kilometraje",
              "Kilometraje",
              { inputMode: "numeric", placeholder: "ej: 45230" },
              true,
            )}
            {campo("numero_interno", "Número interno", {}, true)}
            {campo("ciudad", "Ciudad", {}, true)}
            {campo("empresa", "Empresa", {}, true)}
            {lista_(
              "ubicacion_selector",
              "Lugar de diligenciamiento",
              [
                ...LUGARES_DILIGENCIAMIENTO,
                ["COPIAR_ORIGEN", "Igual al origen (Desde)"],
                ["OTRO", "Otro"],
              ],
              true,
            )}
            {f.ubicacion_selector === "OTRO" &&
              campo(
                "ubicacion_otro",
                "Especifique el lugar",
                { maxLength: 100 },
                true,
              )}
            {lista_(
              "tipo_carga",
              "Tipo de carga",
              Object.entries(TIPOS_CARGA),
              true,
            )}
            {f.tipo_carga === "OTRO" &&
              campo(
                "tipo_carga_otro",
                "Especifique la carga",
                { maxLength: 100 },
                true,
              )}
          </div>
        </Seccion>
      )}

      <Seccion icono={tv.icon} titulo={tv.datos}>
        <div className="grid-2">
          {campo(
            "placa",
            "Placa",
            { placeholder: "ej: GSZ34F", autoCapitalize: "characters" },
            true,
          )}
          {lista_("proceso", "Proceso", PROCESOS, true)}
          <datalist id="mis-lugares">
            {LUGARES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          {campo(
            "desde",
            "Desde",
            { list: "mis-lugares", placeholder: "Origen..." },
            true,
          )}
          {campo(
            "hasta",
            "Hasta",
            { list: "mis-lugares", placeholder: "Destino..." },
            true,
          )}
          {campo("marca", "Marca", { placeholder: ph.marca }, true)}
          {lista_("gasolina", "Gasolina", GASOLINA, true)}
          {campo("modelo", "Modelo (año)", {
            placeholder: ph.modelo,
            maxLength: 4,
            inputMode: "numeric",
          })}
          {campo("motor", "Motor", { placeholder: ph.motor })}
          {campo("linea", "Línea", { placeholder: ph.linea }, true)}
        </div>
      </Seccion>

      <Seccion icono="📄" titulo="Revisión de documentos">
        <div className="grid-2">
          {campo("licencia_num", "Licencia No.", {
            placeholder: "Número de licencia",
          })}
          {camion &&
            campo("licencia_categoria", "Categoría licencia", {
              placeholder: "ej: C2, C3",
            })}
          <div className="field">
            <label className="f-label" htmlFor="mis-licencia_venc">
              Vencimiento licencia
            </label>
            <input
              id="mis-licencia_venc"
              type="date"
              className="f-input"
              value={f.licencia_venc}
              onChange={set("licencia_venc")}
            />
            {err("licencia_venc")}
            {hintVenc("licencia_venc")}
          </div>
          {lista_(
            "porte_propiedad",
            "Tarjeta de propiedad",
            conMarca(ESTADO_DOC_F),
            true,
          )}
          {lista_("soat", "SOAT", conMarca(ESTADO_DOC), true)}
          {camion && (
            <div className="field">
              <label className="f-label" htmlFor="mis-soat_venc">
                Vencimiento SOAT
              </label>
              <input
                id="mis-soat_venc"
                type="date"
                className="f-input"
                value={f.soat_venc}
                onChange={set("soat_venc")}
              />
              {err("soat_venc")}
              {hintVenc("soat_venc")}
            </div>
          )}
          {lista_(
            "certificado_emision",
            "Revisión tecnomecánica / CDA",
            conMarca(ESTADO_DOC),
            true,
          )}
          {camion && (
            <div className="field">
              <label className="f-label" htmlFor="mis-tecnomecanica_venc">
                Vencimiento CDA
              </label>
              <input
                id="mis-tecnomecanica_venc"
                type="date"
                className="f-input"
                value={f.tecnomecanica_venc}
                onChange={set("tecnomecanica_venc")}
              />
              {err("tecnomecanica_venc")}
              {hintVenc("tecnomecanica_venc")}
            </div>
          )}
          {lista_(
            "poliza_seguro",
            "Póliza adicional de seguro",
            conMarca(ESTADO_POLIZA),
            camion,
          )}
          {camion &&
            campo("poliza_numero", "Número de póliza", { maxLength: 60 })}
          {camion && (
            <div className="field">
              <label className="f-label" htmlFor="mis-poliza_seguro_venc">
                Vencimiento póliza
              </label>
              <input
                id="mis-poliza_seguro_venc"
                type="date"
                className="f-input"
                value={f.poliza_seguro_venc}
                onChange={set("poliza_seguro_venc")}
              />
              {err("poliza_seguro_venc")}
              {hintVenc("poliza_seguro_venc")}
            </div>
          )}
        </div>
        {noConforme && (
          <p className="f-hint doc-vencido" style={{ marginTop: 10 }}>
            Documento vencido o inexistente: el vehículo queda NO apto y la
            observación debe tener mínimo 40 caracteres.
          </p>
        )}
      </Seccion>

      {camion && (
        <Seccion icono="🛠" titulo="Historial de mantenimiento del camión">
          <div className="grid-2">
            {MANTENIMIENTO_CAMION.map(([k, label]) => (
              <div className="field" key={k}>
                <label className="f-label" htmlFor={`mis-${k}`}>
                  {label}
                </label>
                <input
                  id={`mis-${k}`}
                  type="date"
                  className="f-input"
                  value={f[k]}
                  onChange={set(k)}
                />
              </div>
            ))}
          </div>
        </Seccion>
      )}

      <Seccion
        icono="🔍"
        titulo={`Aspectos a revisar (${lista.length})`}
        extra={
          <>
            {(countM > 0 || countR > 0) && (
              <span className="aspectos-badge visible">
                ⚠{" "}
                {[countM && `${countM}M`, countR && `${countR}R`]
                  .filter(Boolean)
                  .join(" ")}
              </span>
            )}
            <span className="bm-legend">{leyendaValores(tipo)}</span>
          </>
        }
      >
        <p
          className="f-hint"
          style={{ margin: "0 0 0.75rem", lineHeight: 1.45 }}
        >
          Califique con <strong>B</strong> si es Bueno o <strong>M</strong> si
          es Malo
          {(valoresForTipo(tipo).includes("N/A") || tipo === "Moto") && (
            <>
              ; use <strong>N/A</strong> si no aplica
            </>
          )}
          {valoresForTipo(tipo).includes("R") && (
            <>
              ; o <strong>R</strong> si está Regular
            </>
          )}
          . Todo M o R necesita foto.
        </p>
        <div className="aspectos-grid">
          {lista.map((texto, i) => {
            const k = String(i + 1);
            const v = aspectos[k]?.valor || "B";
            const critico = v === "M" || v === "R";
            return (
              <div key={`${tipo}-${k}`}>
                <div
                  className={`aspecto-row${v === "M" ? " has-m" : ""}${v === "R" ? " has-r" : ""}${v === "N/A" ? " has-na" : ""}`}
                >
                  <span className="aspecto-num">{k}</span>
                  <span className="aspecto-label">{texto}</span>
                  <div
                    className="bm-toggle"
                    role="radiogroup"
                    aria-label={`Aspecto ${k}`}
                  >
                    {valoresParaItem(tipo, i + 1).map((val) => (
                      <button
                        key={val}
                        type="button"
                        role="radio"
                        aria-checked={v === val}
                        title={GRADE_LABEL[val]}
                        className={`bm-opt bm-${val === "N/A" ? "na" : val.toLowerCase()}${v === val ? " on" : ""}`}
                        onClick={() => setValor(i, val)}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
                {critico && (
                  <div className="evidencia-row">
                    <span>📷 Evidencia:</span>
                    <label
                      className={
                        evidencias[k] ? "evidencia-btn tiene" : "evidencia-btn"
                      }
                    >
                      {evidencias[k] ? "✓ Cambiar" : "Subir foto"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={(e) => subirEvidencia(i, e.target.files?.[0])}
                      />
                    </label>
                    {evidencias[k] && (
                      <img
                        src={evidencias[k]}
                        className="evidencia-thumb"
                        alt={`Evidencia ${k}`}
                      />
                    )}
                    {evidencias[k] ? (
                      <span className="evid-ok">✓ Cargada</span>
                    ) : (
                      errores._global && (
                        <span className="evidencia-falta">⚠ Falta foto</span>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Seccion>

      <Seccion icono="✅" titulo="¿Óptimas condiciones para operación?">
        <div className="optimas-toggle" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={f.condiciones_optimas === "SI"}
            disabled={optimoBloqueado}
            className={`opt opt-si${f.condiciones_optimas === "SI" ? " on" : ""}`}
            onClick={() => setF((x) => ({ ...x, condiciones_optimas: "SI" }))}
          >
            ✓ Sí
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={f.condiciones_optimas === "NO"}
            className={`opt opt-no${f.condiciones_optimas === "NO" ? " on" : ""}`}
            onClick={() => setF((x) => ({ ...x, condiciones_optimas: "NO" }))}
          >
            ✕ No
          </button>
        </div>
        {optimoBloqueado && (
          <span className="f-hint">
            {countM > 0
              ? "Hay aspectos en M: el vehículo no puede quedar como óptimo."
              : "Documento no conforme: queda NO apto."}
          </span>
        )}
      </Seccion>

      <FirmaConductor ref={firmaRef} error={errores.firma} />

      <Seccion icono="📝" titulo="Observaciones">
        <textarea
          className="f-textarea"
          rows={4}
          placeholder="Ingresa observaciones si hay M o R..."
          value={f.observaciones}
          onChange={set("observaciones")}
        />
        <div className="f-hint">
          {countM > 0
            ? `⚠ ${countM} M → mínimo 60 caracteres`
            : countR > 0
              ? `⚠ ${countR} R → mínimo 40 caracteres`
              : ""}
        </div>
        {err("observaciones")}
      </Seccion>

      <div className="submit-row">
        <button type="submit" className="btn-submit" disabled={busy}>
          {busy ? (
            <>
              <span className="mis-spinner" /> Generando PDF...
            </>
          ) : (
            "📄 Enviar y generar PDF"
          )}
        </button>
        <button
          type="button"
          className="btn-reset"
          onClick={() => {
            limpiarTodo();
            setMensaje(null);
          }}
        >
          ↺ Limpiar
        </button>
      </div>
      <div className={guardando ? "save-indicator on" : "save-indicator"}>
        💾 Borrador guardado
      </div>
    </form>
  );
}

function Seccion({ icono, titulo, extra, children }) {
  return (
    <div className="section-card">
      <div className="section-head">
        <div className="section-icon">{icono}</div>
        <span className="section-label">{titulo}</span>
        {extra}
      </div>
      <div className="section-body">{children}</div>
    </div>
  );
}

/* ─────────── Firma: dibujar o subir imagen (máx. 2 MB) ─────────── */

const FirmaConductor = forwardRef(function FirmaConductor({ error }, ref) {
  const [modo, setModo] = useState("dibujar");
  const [hayTrazo, setHayTrazo] = useState(false);
  const [imagen, setImagen] = useState(null);
  const [aviso, setAviso] = useState("");
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const dibujando = useRef(false);
  const trazo = useRef(false);

  const limpiarCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    trazo.current = false;
    setHayTrazo(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      valor: () => {
        if (modo === "imagen") return imagen;
        if (!trazo.current || !canvasRef.current) return null;
        // Fondo blanco para el PDF
        const c = canvasRef.current;
        const out = document.createElement("canvas");
        out.width = c.width;
        out.height = c.height;
        const ctx = out.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(c, 0, 0);
        return out.toDataURL("image/png");
      },
      limpiar: () => {
        limpiarCanvas();
        setImagen(null);
        setModo("dibujar");
      },
    }),
    [modo, imagen, limpiarCanvas],
  );

  useEffect(() => {
    if (modo !== "dibujar") return undefined;
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return undefined;
    const ctx = c.getContext("2d");
    const ajustar = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const copia = trazo.current ? c.toDataURL() : null;
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (copia) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
        img.src = copia;
      }
    };
    ajustar();
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    };
    const ini = (e) => {
      e.preventDefault();
      dibujando.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const mover = (e) => {
      if (!dibujando.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (!trazo.current) {
        trazo.current = true;
        setHayTrazo(true);
      }
    };
    const fin = () => {
      dibujando.current = false;
    };
    c.addEventListener("mousedown", ini);
    c.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", fin);
    c.addEventListener("touchstart", ini, { passive: false });
    c.addEventListener("touchmove", mover, { passive: false });
    c.addEventListener("touchend", fin);
    window.addEventListener("resize", ajustar);
    return () => {
      c.removeEventListener("mousedown", ini);
      c.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", fin);
      c.removeEventListener("touchstart", ini);
      c.removeEventListener("touchmove", mover);
      c.removeEventListener("touchend", fin);
      window.removeEventListener("resize", ajustar);
    };
  }, [modo]);

  const cargarImagen = async (file) => {
    setAviso("");
    if (!file) return;
    if (!/image\/(jpeg|png)/.test(file.type)) {
      setAviso("Solo JPG o PNG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAviso(
        `Imagen muy grande (${(file.size / 1048576).toFixed(2)} MB). Máximo 2 MB.`,
      );
      return;
    }
    try {
      setImagen(await reducirFoto(file, 600, 0.9));
    } catch {
      setAviso("No se pudo leer la imagen");
    }
  };

  return (
    <div className="section-card">
      <div className="section-head">
        <div className="section-icon">✍</div>
        <span className="section-label">Firma del conductor</span>
        <div className="firma-tabs">
          <button
            type="button"
            className={modo === "dibujar" ? "firma-tab active" : "firma-tab"}
            onClick={() => setModo("dibujar")}
          >
            ✍ Dibujar
          </button>
          <button
            type="button"
            className={modo === "imagen" ? "firma-tab active" : "firma-tab"}
            onClick={() => setModo("imagen")}
          >
            🖼 Subir
          </button>
        </div>
      </div>
      <div className="section-body">
        {modo === "dibujar" ? (
          <>
            <div
              ref={wrapRef}
              className={
                hayTrazo ? "firma-canvas-wrap has-firma" : "firma-canvas-wrap"
              }
            >
              <canvas ref={canvasRef} aria-label="Área de firma" />
              {!hayTrazo && (
                <div className="firma-placeholder">
                  <div className="firma-placeholder-icon">✍</div>
                  <div className="firma-placeholder-text">
                    Firme aquí con el dedo o mouse
                  </div>
                </div>
              )}
            </div>
            <div className="firma-actions-row">
              <button
                type="button"
                className="btn-limpiar"
                onClick={limpiarCanvas}
              >
                ✕ Limpiar
              </button>
              {hayTrazo && <span className="firma-ok">✓ Firma lista</span>}
            </div>
          </>
        ) : imagen ? (
          <div className="mis-firma-img">
            <img src={imagen} alt="Firma" />
            <button
              type="button"
              className="btn-limpiar"
              onClick={() => setImagen(null)}
            >
              ✕ Quitar
            </button>
          </div>
        ) : (
          <label className="firma-upload-area">
            <div className="firma-upload-icon">🖼</div>
            <div className="firma-upload-text">
              Toca para seleccionar imagen
            </div>
            <div className="firma-upload-hint">JPG, PNG · Máximo 2MB</div>
            <input
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => cargarImagen(e.target.files?.[0])}
            />
          </label>
        )}
        {aviso && <span className="f-error visible">⚠ {aviso}</span>}
        {error && <span className="f-error visible">⚠ {error}</span>}
      </div>
    </div>
  );
});

/* ═════════════════════ MIS INSPECCIONES (lista_inspecciones.html) ═════════════════════ */

function MisInspecciones({ api, userId, userName, orgName, onNueva }) {
  const mias = useMemo(
    () => api.rows.filter((r) => r.user_id === userId),
    [api.rows, userId],
  );
  const activas = useMemo(
    () =>
      mias
        .filter((r) => !r.report_id)
        .sort((a, b) =>
          String(a.inspected_at).localeCompare(String(b.inspected_at)),
        ),
    [mias],
  );
  const misReportes = useMemo(
    () => api.reports.filter((r) => r.user_id === userId),
    [api.reports, userId],
  );
  const [detalle, setDetalle] = useState(null);
  const total = activas.length;
  const restantes = Math.max(CICLO - total, 0);
  const pctCiclo = Math.min((total * 100) / CICLO, 100);

  const exportar = async () => {
    const { exportToExcel } = await import("../lib/exportExcel");
    await exportToExcel(
      "Misionales_mis_inspecciones",
      [{ name: "Inspecciones", rows: mias.map(filaExcel) }],
      {
        title: "Misionales · Mis inspecciones",
        orgName,
        module: "SST · Misionales",
        generatedBy: userName,
      },
    );
  };

  return (
    <div className="mis-page">
      <div className="page-hero">
        <div className="hero-egg" />
        <div className="hero-title">Historial de inspecciones</div>
        <div className="hero-sub">
          {userName || "—"} · Registro personal SST
        </div>
      </div>

      <div className="kpi-row">
        <div className="mis-kpi amber">
          <div className="kpi-label">Total registros</div>
          <div className="kpi-val">{total}</div>
          <div className="kpi-sub">En curso</div>
        </div>
        <div className="mis-kpi golden">
          <div className="kpi-label">Para consolidado</div>
          <div className="kpi-val">{restantes}</div>
          <div className="kpi-sub">Inspecciones restantes</div>
        </div>
        <div className="mis-kpi ember">
          <div className="kpi-label">Próximo PDF</div>
          <div className="kpi-val">
            {total}/{CICLO}
          </div>
          <div className="kpi-sub">Consolidado mensual</div>
        </div>
      </div>

      <div className="progress-card">
        <div className="progress-header">
          <span className="progress-label">
            Progreso hacia el consolidado de {CICLO}
          </span>
          <span className="progress-count">
            {total} / {CICLO}
          </span>
        </div>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${pctCiclo}%` }} />
        </div>
        <div className="progress-hint">
          {total >= CICLO
            ? `✓ Completado — el consolidado de los últimos ${CICLO} registros se genera al enviar la próxima inspección`
            : `Faltan ${restantes} inspecciones para el consolidado mensual`}
        </div>
      </div>

      <div className="table-card">
        <div className="table-header">
          <div>
            <div className="table-title">Registros activos</div>
            <div className="table-count">
              {api.loading
                ? "Cargando..."
                : `${total} inspecciones pendientes de consolidar`}
            </div>
          </div>
          <button
            type="button"
            className="btn-excel"
            onClick={exportar}
            disabled={!mias.length}
          >
            📥 Exportar Excel
          </button>
        </div>
        {api.loading ? (
          <div className="empty-state">⏳ Cargando inspecciones...</div>
        ) : total === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🐣</div>
            <div>No tienes inspecciones registradas aún.</div>
            <button type="button" className="mis-link" onClick={onNueva}>
              ← Ir al formulario
            </button>
          </div>
        ) : (
          <TablaInspecciones
            filas={[...activas].reverse()}
            numerar
            onVer={setDetalle}
          />
        )}
      </div>

      <TablaConsolidados reportes={misReportes} api={api} />

      {detalle && (
        <DetalleInspeccion row={detalle} onCerrar={() => setDetalle(null)} />
      )}
    </div>
  );
}

function filaExcel(r) {
  const fx = r.formato || {};
  const { m, r: rr } = contarCriticos(r.aspects);
  return {
    Fecha: fechaHoraCO(r.inspected_at),
    Conductor: r.driver_name,
    Placa: r.plate,
    Tipo: r.vehicle_type,
    Proceso: r.process,
    Desde: r.origin,
    Hasta: r.destination,
    Marca: r.brand,
    Línea: r.line,
    Modelo: r.model,
    Gasolina: r.fuel,
    Kilometraje: r.odometer,
    "Tipo de carga": cargaTexto(fx),
    "Cumplimiento %": r.compliance_pct,
    "Aspectos M": m,
    "Aspectos R": rr,
    "Óptimas condiciones": r.optimal ? "SI" : "NO",
    Observaciones: r.observations,
    Consolidado: r.report_id ? "Sí" : "No",
  };
}

function PctEstado({ pct }) {
  if (pct == null) return <span className="mis-muted">—</span>;
  return <span className={`pct-chip pct-${nivelPorcentaje(pct)}`}>{pct}%</span>;
}

function TablaInspecciones({
  filas,
  numerar = false,
  conConductor = false,
  onVer,
  onEliminar,
}) {
  return (
    <>
      <div className="table-scroll mis-solo-ancho">
        <table className="hist">
          <thead>
            <tr>
              {numerar && <th>#</th>}
              <th>Fecha</th>
              {conConductor && <th>Conductor</th>}
              <th>Placa</th>
              {conConductor && <th>Tipo</th>}
              <th>Proceso</th>
              <th>Ruta</th>
              {conConductor && <th>Condición</th>}
              <th>Estado</th>
              {conConductor && <th>Aspectos</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const { m, r: rr } = contarCriticos(r.aspects);
              return (
                <tr key={r.id}>
                  {numerar && <td className="mis-muted">{filas.length - i}</td>}
                  <td>{fechaHoraCO(r.inspected_at)}</td>
                  {conConductor && <td>{r.driver_name}</td>}
                  <td>
                    <span className="placa">{r.plate}</span>
                  </td>
                  {conConductor && (
                    <td>
                      {VEHICLE_TYPES.find((v) => v.id === r.vehicle_type)?.icon}{" "}
                      {r.vehicle_type}
                    </td>
                  )}
                  <td>{r.process || "—"}</td>
                  <td>
                    {r.origin || "?"} → {r.destination || "?"}
                  </td>
                  {conConductor && (
                    <td>
                      <span className={r.optimal ? "cond ok" : "cond no"}>
                        {r.optimal ? "Óptimo" : "No óptimo"}
                      </span>
                    </td>
                  )}
                  <td>
                    <PctEstado pct={r.compliance_pct} />
                  </td>
                  {conConductor && (
                    <td>
                      {m ? <span className="bad-m">{m}M</span> : null}{" "}
                      {rr ? <span className="bad-r">{rr}R</span> : null}
                      {!m && !rr && <span className="mis-muted">Todo B</span>}
                    </td>
                  )}
                  <td className="acciones">
                    <button
                      type="button"
                      className="btn-ver"
                      onClick={() => onVer(r)}
                    >
                      Ver
                    </button>
                    {onEliminar && (
                      <button
                        type="button"
                        className="btn-del"
                        onClick={() => onEliminar(r)}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card-list mis-solo-movil">
        {filas.map((r) => (
          <button
            type="button"
            key={r.id}
            className="insp-card"
            onClick={() => onVer(r)}
          >
            <div className="insp-card-top">
              <span className="placa">{r.plate}</span>
              <PctEstado pct={r.compliance_pct} />
            </div>
            <div className="insp-card-sub">
              {fechaHoraCO(r.inspected_at)} · {r.vehicle_type}
              {conConductor ? ` · ${r.driver_name}` : ""}
            </div>
            <div className="insp-card-sub">
              {r.origin || "?"} → {r.destination || "?"} ·{" "}
              {r.optimal ? "Óptimo" : "No óptimo"}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function TablaConsolidados({ reportes, api, conConductor = false }) {
  const [bajando, setBajando] = useState(null);
  const [error, setError] = useState("");
  if (!reportes.length) return null;
  const bajar = async (rep) => {
    setError("");
    setBajando(rep.id);
    const filas = await api.filasDeReporte(rep.id);
    const res = await descargarPdfConsolidado(filas, rep);
    if (res.error) setError(res.error);
    setBajando(null);
  };
  return (
    <div className="table-card">
      <div className="table-header">
        <div>
          <div className="table-title">📁 PDFs consolidados generados</div>
          <div className="table-count">{reportes.length} consolidado(s)</div>
        </div>
      </div>
      {error && <div className="mis-msg-error">{error}</div>}
      <div className="table-scroll">
        <table className="hist">
          <thead>
            <tr>
              <th>Fecha generación</th>
              {conConductor && <th>Conductor</th>}
              <th>Inspecciones</th>
              <th>Período</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {reportes.map((rep) => (
              <tr key={rep.id}>
                <td>{fechaHoraCO(rep.created_at)}</td>
                {conConductor && <td>{rep.driver_name || "—"}</td>}
                <td>
                  {rep.total}/{CICLO}
                </td>
                <td>
                  {fechaHoraCO(rep.first_at).split(",")[0]} –{" "}
                  {fechaHoraCO(rep.last_at).split(",")[0]}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-ver"
                    disabled={bajando === rep.id}
                    onClick={() => bajar(rep)}
                  >
                    {bajando === rep.id ? "Generando…" : "📄 PDF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetalleInspeccion({ row, onCerrar }) {
  const [fotos, setFotos] = useState({});
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");
  const fx = row.formato || {};
  useEffect(() => {
    let vivo = true;
    const rutas = fx.evidencias || {};
    Promise.all(
      Object.entries(rutas).map(async ([k, p]) => [k, await urlEvidencia(p)]),
    ).then((pares) => {
      if (vivo) setFotos(Object.fromEntries(pares.filter(([, u]) => u)));
    });
    return () => {
      vivo = false;
    };
  }, [fx.evidencias]);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  const lista = aspectosForTipo(row.vehicle_type);
  const asp = row.aspects || {};
  const claves = Object.keys(asp).sort((a, b) => Number(a) - Number(b));
  const pdf = async () => {
    setBajando(true);
    setError("");
    const res = await descargarPdfPreoperacional(row, { urlEvidencia });
    if (res.error) setError(res.error);
    setBajando(false);
  };
  const dato = (label, valor) =>
    valor ? (
      <div className="det-dato">
        <span>{label}</span>
        <strong>{valor}</strong>
      </div>
    ) : null;

  // Capa propia sobre toda la app (la tarjeta del panel limita el z-index)
  return createPortal(
    <div className="mis-root mis-capa">
      <div className="modal-overlay" onClick={onCerrar} role="presentation">
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Detalle de inspección"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <div className="modal-titulo">Detalle de inspección</div>
              <div className="modal-sub">
                {row.plate} · {row.vehicle_type} ·{" "}
                {fechaHoraCO(row.inspected_at)}
              </div>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <div className="modal-cuerpo">
            <div className="det-grid">
              {dato("Conductor", row.driver_name)}
              {dato("Proceso", row.process)}
              {dato("Ruta", `${row.origin || "?"} → ${row.destination || "?"}`)}
              {dato(
                "Marca / Línea",
                [row.brand, row.line].filter(Boolean).join(" / "),
              )}
              {dato(
                "Modelo / Motor",
                [row.model, row.engine].filter(Boolean).join(" / "),
              )}
              {dato("Gasolina", row.fuel)}
              {dato("Kilometraje", row.odometer)}
              {dato("Empresa", fx.empresa)}
              {dato("Ciudad", row.city)}
              {dato("Tipo de carga", cargaTexto(fx))}
              {dato("Lugar", fx.ubicacion)}
              {dato("Licencia", row.license_num)}
              {dato("SOAT", row.soat)}
              {dato("Tecnomecánica", row.gas_cert)}
              {dato("Póliza", row.insurance)}
              {dato(
                "Cumplimiento",
                row.compliance_pct != null ? `${row.compliance_pct}%` : null,
              )}
              {dato("Óptimas condiciones", row.optimal ? "SÍ" : "NO")}
            </div>
            <div className="det-titulo">Aspectos ({claves.length})</div>
            <div className="det-aspectos">
              {claves.map((k) => {
                const v = asp[k]?.valor ?? asp[k];
                return (
                  <div
                    key={k}
                    className={`det-asp v-${String(v).replace("/", "").toLowerCase()}`}
                  >
                    <span className="aspecto-num">{k}</span>
                    <span className="det-asp-label">
                      {asp[k]?.label || lista[Number(k) - 1]}
                    </span>
                    <span className="det-asp-v">{v}</span>
                    {fotos[k] && (
                      <a href={fotos[k]} target="_blank" rel="noreferrer">
                        <img
                          src={fotos[k]}
                          alt={`Evidencia ${k}`}
                          className="evidencia-thumb"
                        />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            {row.observations && (
              <>
                <div className="det-titulo">Observaciones</div>
                <p className="det-obs">{row.observations}</p>
              </>
            )}
            {row.signature_data && (
              <>
                <div className="det-titulo">Firma del conductor</div>
                <img
                  src={row.signature_data}
                  alt="Firma"
                  className="det-firma"
                />
              </>
            )}
            {error && <div className="mis-msg-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-reset" onClick={onCerrar}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn-submit"
              onClick={pdf}
              disabled={bajando}
            >
              {bajando ? "Generando…" : "📄 Descargar PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ═════════════════ ADMIN (admin/inspecciones.html + dashboard.html) ═════════════════ */

function AdminMisionales({ api, orgName }) {
  const [filtro, setFiltro] = useState({
    conductor: "",
    placa: "",
    tipo: "",
    desde: "",
    hasta: "",
  });
  const [aplicado, setAplicado] = useState(filtro);
  const [detalle, setDetalle] = useState(null);
  const [periodo, setPeriodo] = useState(14);

  const filas = useMemo(() => {
    const c = aplicado.conductor.trim().toLowerCase();
    const p = aplicado.placa.trim().toUpperCase();
    return api.rows.filter((r) => {
      const dia = new Date(r.inspected_at).toLocaleDateString("sv-SE", {
        timeZone: "America/Bogota",
      });
      if (
        c &&
        !String(r.driver_name || "")
          .toLowerCase()
          .includes(c)
      )
        return false;
      if (p && !String(r.plate || "").includes(p)) return false;
      if (aplicado.tipo && r.vehicle_type !== aplicado.tipo) return false;
      if (aplicado.desde && dia < aplicado.desde) return false;
      if (aplicado.hasta && dia > aplicado.hasta) return false;
      return true;
    });
  }, [api.rows, aplicado]);

  const activas = filas.filter((r) => !r.report_id);
  const conM = filas.filter((r) => contarCriticos(r.aspects).m > 0).length;
  const conductores = new Set(filas.map((r) => r.user_id)).size;
  const promedio = filas.length
    ? Math.round(
        filas.reduce((s, r) => s + (Number(r.compliance_pct) || 0), 0) /
          filas.length,
      )
    : null;

  // Actividad por día (14 días o todo)
  const actividad = useMemo(() => {
    const porDia = new Map();
    for (const r of filas) {
      const d = new Date(r.inspected_at).toLocaleDateString("sv-SE", {
        timeZone: "America/Bogota",
      });
      porDia.set(d, (porDia.get(d) || 0) + 1);
    }
    let dias = [...porDia.keys()].sort();
    if (periodo) {
      dias = Array.from({ length: periodo }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (periodo - 1 - i));
        return d.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
      });
    }
    return dias.map((d) => ({ d, n: porDia.get(d) || 0 }));
  }, [filas, periodo]);
  const maxAct = Math.max(1, ...actividad.map((a) => a.n));

  const ranking = useMemo(() => {
    const m = new Map();
    for (const r of filas) {
      const k = r.driver_name || "—";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filas]);
  const maxRank = Math.max(1, ...ranking.map((r) => r[1]));
  const distribucion = VEHICLE_TYPES.map((v) => ({
    ...v,
    n: filas.filter((r) => r.vehicle_type === v.id).length,
  }));

  const exportar = async () => {
    const { exportToExcel } = await import("../lib/exportExcel");
    await exportToExcel(
      "Misionales_inspecciones",
      [{ name: "Inspecciones", rows: filas.map(filaExcel) }],
      {
        title: "Misionales · Inspecciones",
        orgName,
        module: "SST · Misionales",
      },
    );
  };

  return (
    <div className="mis-page wide">
      <div className="page-hero">
        <div className="hero-egg" />
        <div className="hero-title">Inspecciones · Administración</div>
        <div className="hero-sub">
          {orgName || "Empresa"} · Todas las inspecciones de los conductores
        </div>
      </div>

      <div className="kpi-row four">
        <div className="mis-kpi amber">
          <div className="kpi-label">Activas en sistema</div>
          <div className="kpi-val">{activas.length}</div>
          <div className="kpi-sub">
            Sin consolidar · {filas.length} en total
          </div>
        </div>
        <div className="mis-kpi ember">
          <div className="kpi-label">Con aspectos M</div>
          <div className="kpi-val">{conM}</div>
          <div className="kpi-sub">Requieren seguimiento</div>
        </div>
        <div className="mis-kpi golden">
          <div className="kpi-label">Conductores activos</div>
          <div className="kpi-val">{conductores}</div>
          <div className="kpi-sub">Con inspecciones</div>
        </div>
        <div className="mis-kpi orange">
          <div className="kpi-label">Promedio</div>
          <div className="kpi-val">
            {promedio == null ? "—" : `${promedio}%`}
          </div>
          <div className="kpi-sub">Cumplimiento</div>
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Actividad reciente</div>
              <div className="chart-desc">Inspecciones por día</div>
            </div>
            <div className="period-btns">
              <button
                type="button"
                className={periodo === 14 ? "period-btn active" : "period-btn"}
                onClick={() => setPeriodo(14)}
              >
                14d
              </button>
              <button
                type="button"
                className={periodo === 0 ? "period-btn active" : "period-btn"}
                onClick={() => setPeriodo(0)}
              >
                Todo
              </button>
            </div>
          </div>
          <div
            className="mis-barras"
            role="img"
            aria-label="Inspecciones por día"
          >
            {actividad.map((a) => (
              <div key={a.d} className="mis-barra" title={`${a.d}: ${a.n}`}>
                <span className="mis-barra-n">{a.n || ""}</span>
                <span
                  className="mis-barra-v"
                  style={{ height: `${(a.n / maxAct) * 100}%` }}
                />
                <span className="mis-barra-d">{a.d.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Ranking conductores</div>
              <div className="chart-desc">Más inspecciones</div>
            </div>
          </div>
          {ranking.length ? (
            ranking.map(([nombre, n], i) => (
              <div key={nombre} className="rank-row">
                <span className="rank-pos">{i + 1}</span>
                <span className="rank-nombre">{nombre}</span>
                <span className="rank-bar">
                  <span style={{ width: `${(n / maxRank) * 100}%` }} />
                </span>
                <strong>{n}</strong>
              </div>
            ))
          ) : (
            <div className="mis-muted">Sin datos</div>
          )}
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Distribución</div>
              <div className="chart-desc">Por tipo de vehículo</div>
            </div>
          </div>
          {distribucion.map((d) => (
            <div key={d.id} className="rank-row">
              <span className="rank-pos">{d.icon}</span>
              <span className="rank-nombre">{d.label}</span>
              <span className="rank-bar">
                <span
                  style={{
                    width: `${filas.length ? (d.n / filas.length) * 100 : 0}%`,
                  }}
                />
              </span>
              <strong>{d.n}</strong>
            </div>
          ))}
        </div>
      </div>

      <form
        className="filter-card"
        onSubmit={(e) => {
          e.preventDefault();
          setAplicado(filtro);
        }}
      >
        <div className="filter-title">🔍 Filtrar inspecciones</div>
        <div className="filter-row">
          <label className="field">
            <span className="f-label">Conductor</span>
            <input
              className="f-input"
              value={filtro.conductor}
              onChange={(e) =>
                setFiltro({ ...filtro, conductor: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span className="f-label">Placa</span>
            <input
              className="f-input"
              value={filtro.placa}
              onChange={(e) => setFiltro({ ...filtro, placa: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="f-label">Tipo vehículo</span>
            <select
              className="f-select"
              value={filtro.tipo}
              onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}
            >
              <option value="">Todos</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.icon} {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="f-label">Desde</span>
            <input
              type="date"
              className="f-input"
              value={filtro.desde}
              onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="f-label">Hasta</span>
            <input
              type="date"
              className="f-input"
              value={filtro.hasta}
              onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })}
            />
          </label>
        </div>
        <div className="filter-btns">
          <button type="submit" className="btn-filter">
            Filtrar
          </button>
          <button
            type="button"
            className="btn-reset"
            onClick={() => {
              const v = {
                conductor: "",
                placa: "",
                tipo: "",
                desde: "",
                hasta: "",
              };
              setFiltro(v);
              setAplicado(v);
            }}
          >
            Limpiar
          </button>
        </div>
      </form>

      <div className="table-card">
        <div className="table-header">
          <div>
            <div className="table-title">Inspecciones</div>
            <div className="table-count">
              {api.loading ? "Cargando..." : `${filas.length} registro(s)`}
            </div>
          </div>
          <button
            type="button"
            className="btn-excel"
            onClick={exportar}
            disabled={!filas.length}
          >
            📥 Exportar Excel
          </button>
        </div>
        {filas.length ? (
          <TablaInspecciones
            filas={filas}
            conConductor
            onVer={setDetalle}
            onEliminar={async (r) => {
              if (
                !window.confirm(
                  `¿Eliminar la inspección de ${r.plate} (${fechaHoraCO(r.inspected_at)})?`,
                )
              )
                return;
              const res = await api.removeInspection(r.id);
              if (res.error) window.alert(res.error);
            }}
          />
        ) : (
          <div className="empty-state">Sin inspecciones con esos filtros.</div>
        )}
      </div>

      <TablaConsolidados reportes={api.reports} api={api} conConductor />

      {detalle && (
        <DetalleInspeccion row={detalle} onCerrar={() => setDetalle(null)} />
      )}
    </div>
  );
}
