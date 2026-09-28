/**
 * Marca comercial IncubApp + firma operador CDH Maker.
 * White-label de clientes (Incubant) solo dentro de su tenant.
 * Henry Stark Desarrollador · CDH Maker
 */

import { BRAND } from '../lib/brandIdentity'
import { PLATFORM } from '../lib/platform'

export const PLATFORM_NAME = PLATFORM.product
export const PLATFORM_SLOGAN = PLATFORM.slogan
export const PLATFORM_TAGLINE = PLATFORM.tagline
export const APP_NAME = BRAND.productName
export const APP_SLOGAN = BRAND.slogan
export const CORP_COMPANY = BRAND.productName
export const CORP_LEGACY = 'Incubant'

export function CdhWolf({ size = 22, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="CDH Maker"
    >
      <g stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M18 20 L13 5 L27 16" />
        <path d="M46 20 L51 5 L37 16" />
        <path d="M13 5 L20 30 L14 40 L32 55 L50 40 L44 30 L51 5" />
        <path d="M20 30 L28 34 L32 45 L36 34 L44 30" />
        <path d="M28 34 L32 41 L36 34" />
      </g>
      <path d="M22 24 L27.5 27" stroke="var(--cyan)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M42 24 L36.5 27" stroke="var(--cyan)" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  )
}

/** Marca producto IncubApp (SVG de marca) */
export function IncubAppProductMark({ size = 44, className = '' }) {
  return (
    <img
      className={className}
      src={BRAND.assets.mark}
      width={size}
      height={size}
      alt={BRAND.productName}
      draggable={false}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  )
}

export function IncubAppProductLogo({ mark = 48, center = true, showSlogan = true, light = false }) {
  return (
    <div className={`brand-lockup${center ? ' center' : ''}`}>
      <img
        src={light ? BRAND.assets.logoLight : BRAND.assets.logo}
        alt="Incubant"
        style={{
          height: Math.round(mark * 1.15),
          width: 'auto',
          maxWidth: '100%',
          // El logo de Incubant tiene letras oscuras: sobre fondo oscuro va en una placa clara.
          ...(light ? null : { background: '#FFFFFF', borderRadius: 12, padding: '6px 12px' }),
        }}
        draggable={false}
      />
      {showSlogan && (
        <span className="hint" style={{ margin: 0, textAlign: center ? 'center' : 'left' }}>
          {BRAND.tagline}
        </span>
      )}
    </div>
  )
}

/** Alias: fuera de tenant cliente, la marca visible es IncubApp */
export function CdhMark({ size = 44, className = '' }) {
  return <IncubAppProductMark size={size} className={className} />
}

export function CdhLogo({ mark = 48, center = true, showSlogan = true }) {
  return <IncubAppProductLogo mark={mark} center={center} showSlogan={showSlogan} />
}

/* Cliente Incubant (solo tenant white-label — assets en client-brands) */
const INCUBANT_MARK = '/client-brands/incubant/mark.png'
const INCUBANT_LOGO = '/client-brands/incubant/logo-full.png'
const INCUBANT_LOGO_FALLBACK = '/incubant-logo-full.png'

export function IncubAppMark({ size = 44, className = '' }) {
  return (
    <img
      className={className}
      src={INCUBANT_MARK}
      width={size}
      height={size}
      alt="Incubant"
      draggable={false}
      style={{
        display: 'block',
        borderRadius: Math.round(size * 0.18),
        objectFit: 'contain',
      }}
      onError={(e) => {
        e.currentTarget.src = INCUBANT_LOGO_FALLBACK
      }}
    />
  )
}

export function IncubAppLogo({ mark = 48, center = true }) {
  const h = Math.round(mark * 1.2)
  return (
    <div className={`brand-lockup${center ? ' center' : ''}`}>
      <img
        src={INCUBANT_LOGO}
        alt="Incubant — Antioqueña de Incubación SAS"
        style={{ height: h, width: 'auto', display: 'block', maxWidth: '100%' }}
        draggable={false}
        onError={(e) => {
          e.currentTarget.src = INCUBANT_LOGO_FALLBACK
        }}
      />
    </div>
  )
}

export const IncubantMark = IncubAppMark
export const IncubantLogo = IncubAppLogo

export function ContextualLogo({ brand, mark = 48, center = true }) {
  if (brand?.mode === 'client' && brand.logoPath) {
    const h = Math.round(mark * 1.2)
    return (
      <div className={`brand-lockup${center ? ' center' : ''}`}>
        <img
          src={brand.logoPath}
          alt={`${brand.product || ''} — ${brand.legalName || ''}`}
          style={{
            height: h,
            width: 'auto',
            display: 'block',
            maxWidth: '100%',
          }}
          draggable={false}
        />
      </div>
    )
  }
  return <IncubAppProductLogo mark={mark} center={center} />
}

export function ContextualMark({ brand, size = 40 }) {
  if (brand?.mode === 'client' && (brand.markPath || brand.logoPath)) {
    if (
      brand.client?.id === 'incubant' ||
      brand.markPath?.includes('incubant') ||
      brand.logoPath?.includes('incubant')
    ) {
      return <IncubAppMark size={size} />
    }
    return (
      <img
        src={brand.markPath || brand.logoPath}
        width={size}
        height={size}
        alt={brand.legacyBrand || brand.legalName || ''}
        style={{
          borderRadius: 10,
          objectFit: 'contain',
          background: 'transparent',
        }}
        draggable={false}
      />
    )
  }
  if (brand?.mode === 'tenant' && brand.orgName) {
    // Iniciales de la empresa (sin robar marca de otro cliente)
    const initials = String(brand.orgName)
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          fontWeight: 800,
          fontSize: size * 0.36,
        }}
        aria-label={brand.orgName}
      >
        {initials || '·'}
      </span>
    )
  }
  return <IncubAppProductMark size={size} />
}

export function CdhSignature({ className = '', label = 'SaaS', clientMode = false }) {
  return (
    <span className={`cdh-sig ${className}`}>
      <span className="cdh-sig-wolf">
        <img src={BRAND.assets.mark} alt="" width={18} height={18} draggable={false} style={{ display: 'block' }} />
      </span>
      <span className="cdh-sig-text">
        {clientMode || label === 'powered' ? (
          <>
            operado con <strong>IncubApp</strong>
          </>
        ) : label === 'by' ? (
          <>
            <strong>IncubApp</strong>
            <span className="hint" style={{ marginLeft: 6 }}>
              · {BRAND.tagline}
            </span>
          </>
        ) : (
          <>
            <strong>{BRAND.productName}</strong>
            <span className="hint" style={{ marginLeft: 6 }}>
              · {BRAND.slogan}
            </span>
          </>
        )}
      </span>
    </span>
  )
}

/**
 * Insignia oficial del Sistema Integrado de Gestión (SIG) · Antioqueña de Incubación S.A.S.
 */
export function IncubantSigBadge({ className = '', showSlogan = true }) {
  return (
    <div
      className={`incubant-sig-badge ${className}`}
      title="Sistema Integrado de Gestión (SIG) · Antioqueña de Incubación S.A.S."
    >
      <img
        src="/client-brands/incubant/logo_sig.png"
        alt="SIG Antioqueña de Incubación"
        className="incubant-sig-logo-img"
        onError={(e) => {
          e.currentTarget.src = '/logo_sig.png'
        }}
      />
      <div className="incubant-sig-text">
        <span className="incubant-sig-title">SISTEMA INTEGRADO DE GESTIÓN</span>
        <span className="incubant-sig-subtitle">Antioqueña de Incubación S.A.S. · NIT 900.762.687-1</span>
        {showSlogan && <span className="incubant-sig-slogan">"Nuestra calidad nos define."</span>}
      </div>
    </div>
  )
}

/**
 * Píldora compacta para cabeceras y tarjetas operativas
 */
export function IncubantSigPill({ className = '', text = 'SIG · Antioqueña de Incubación SAS' }) {
  return (
    <span className={`incubant-sig-pill ${className}`} title="Proceso certificado bajo Sistema Integrado de Gestión">
      <img
        src="/client-brands/incubant/logo_sig.png"
        alt="SIG"
        style={{ width: 14, height: 14, objectFit: 'contain' }}
        onError={(e) => {
          e.currentTarget.src = '/logo_sig.png'
        }}
      />
      {text}
    </span>
  )
}
