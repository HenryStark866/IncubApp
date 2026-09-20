/**
 * =============================================================================
 * ARCHIVO: src/components/LandingPage.jsx
 * PROPÓSITO: Landing page pública de IncubApp — diseño premium glassmorphism dark.
 * Secciones: Hero → Métricas → Módulos → Cómo funciona → Testimonios → Precios → CTA → Footer
 * Henry Stark Desarrollador · CDH Maker
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react'
import { BRAND, GO_TO_MARKET } from '../lib/brandIdentity'

/* ─── Íconos SVG inline ────────────────────────────────────────────────── */
function Icon({ d, size = 20, stroke = 'currentColor', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  check: 'M20 6L9 17l-5-5',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01z',
  zap: 'M13 2L3 14h9l-1 10 10-12h-9z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  cpu: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  wifi: 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  menu: 'M3 12h18M3 6h18M3 18h18',
  x: 'M18 6L6 18M6 6l12 12',
  close: 'M18 6L6 18M6 6l12 12',
}

/* ─── Nav ──────────────────────────────────────────────────────────────── */
function LandingNav({ onLogin }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const links = ['Módulos', 'Cómo funciona', 'Precios', 'Clientes']

  function scrollTo(id) {
    const el = document.getElementById(id.toLowerCase().replace(/\s/g, '-').replace(/[áéíóú]/g, c => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[c])))
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setOpen(false)
  }

  return (
    <nav className={`lp-nav${scrolled ? ' lp-nav--scrolled' : ''}`} role="navigation" aria-label="Navegación principal">
      <div className="lp-nav__inner">
        {/* Logo */}
        <a href="#hero" className="lp-nav__logo" onClick={e => { e.preventDefault(); scrollTo('hero') }} aria-label="IncubApp inicio">
          <span className="lp-logo-mark" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="14" fill="url(#lpg)" />
              <g stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
                <path d="M18 20L13 5L27 16" /><path d="M46 20L51 5L37 16" />
                <path d="M13 5L20 30L14 40L32 55L50 40L44 30L51 5" />
                <path d="M20 30L28 34L32 45L36 34L44 30" />
              </g>
              <path d="M22 24L27.5 27" stroke="#35D6E8" strokeWidth="3" strokeLinecap="round" />
              <path d="M42 24L36.5 27" stroke="#35D6E8" strokeWidth="3" strokeLinecap="round" />
              <defs>
                <linearGradient id="lpg" x1="0" y1="0" x2="64" y2="64">
                  <stop stopColor="#0d1f3c" /><stop offset="1" stopColor="#162d52" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="lp-logo-name">IncubApp</span>
        </a>

        {/* Desktop links */}
        <ul className="lp-nav__links" role="list">
          {links.map(l => (
            <li key={l}>
              <button className="lp-nav__link" onClick={() => scrollTo(l)} type="button">{l}</button>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="lp-nav__actions">
          <button className="lp-btn lp-btn--ghost" onClick={onLogin} type="button">Ingresar</button>
          <button className="lp-btn lp-btn--primary" onClick={onLogin} type="button">
            Demo gratuita
          </button>
        </div>

        {/* Mobile hamburger */}
        <button className="lp-nav__burger" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open}
          onClick={() => setOpen(v => !v)} type="button">
          <Icon d={open ? ICONS.x : ICONS.menu} size={22} />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lp-nav__mobile" role="dialog" aria-modal="true" aria-label="Menú móvil">
          {links.map(l => (
            <button key={l} className="lp-nav__mobile-link" onClick={() => scrollTo(l)} type="button">{l}</button>
          ))}
          <button className="lp-btn lp-btn--primary lp-btn--full" onClick={() => { onLogin(); setOpen(false) }} type="button">
            Solicitar demo
          </button>
        </div>
      )}
    </nav>
  )
}

/* ─── Contador animado ─────────────────────────────────────────────────── */
function CountUp({ to, suffix = '', prefix = '', duration = 1800 }) {
  const [val, setVal] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      obs.disconnect()
      const start = Date.now()
      const tick = () => {
        const progress = Math.min((Date.now() - start) / duration, 1)
        const ease = 1 - Math.pow(1 - progress, 3)
        setVal(Math.round(ease * to))
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [to, duration])

  return <span ref={ref}>{prefix}{val.toLocaleString('es-CO')}{suffix}</span>
}

/* ─── Hero ─────────────────────────────────────────────────────────────── */
function HeroSection({ onLogin }) {
  const canvasRef = useRef(null)

  // Animated particle grid background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf
    let t = 0
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })

    const dots = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.4 + 0.1,
    }))

    const draw = () => {
      t += 0.005
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      dots.forEach(d => {
        const x = (d.x + Math.sin(t * d.speed + d.y * 10) * 0.02) * canvas.width
        const y = (d.y + Math.cos(t * d.speed * 0.7 + d.x * 10) * 0.015) * canvas.height
        ctx.beginPath()
        ctx.arc(x, y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(53,214,232,${d.opacity})`
        ctx.fill()
      })

      // Connect nearby dots
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const ax = (dots[i].x + Math.sin(t * dots[i].speed + dots[i].y * 10) * 0.02) * canvas.width
          const ay = (dots[i].y + Math.cos(t * dots[i].speed * 0.7 + dots[i].x * 10) * 0.015) * canvas.height
          const bx = (dots[j].x + Math.sin(t * dots[j].speed + dots[j].y * 10) * 0.02) * canvas.width
          const by = (dots[j].y + Math.cos(t * dots[j].speed * 0.7 + dots[j].x * 10) * 0.015) * canvas.height
          const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(ax, ay)
            ctx.lineTo(bx, by)
            ctx.strokeStyle = `rgba(53,214,232,${0.08 * (1 - dist / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <section id="hero" className="lp-hero" aria-label="Presentación principal">
      <canvas ref={canvasRef} className="lp-hero__canvas" aria-hidden="true" />

      <div className="lp-hero__glow lp-hero__glow--1" aria-hidden="true" />
      <div className="lp-hero__glow lp-hero__glow--2" aria-hidden="true" />

      <div className="lp-container lp-hero__inner">
        {/* Badge */}
        <div className="lp-hero__badge" role="note">
          <span className="lp-live-dot" aria-hidden="true" />
          Plataforma en producción · Colombia
        </div>

        {/* Headline */}
        <h1 className="lp-hero__h1">
          Operación industrial<br />
          <span className="lp-gradient-text">con inteligencia real</span>
        </h1>
        <p className="lp-hero__sub">
          IncubApp centraliza plantas de incubación, granjas y equipos en un solo SaaS multiempresa.
          Evidencia fotográfica, roles herméticos, operación offline y tableros de gerencia — en tiempo real.
        </p>

        {/* CTAs */}
        <div className="lp-hero__ctas">
          <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onLogin} type="button">
            Solicitar demo gratuita
            <Icon d={ICONS.arrow} size={18} />
          </button>
          <button className="lp-btn lp-btn--glass lp-btn--lg" onClick={onLogin} type="button">
            Ver plataforma en vivo
          </button>
        </div>

        {/* Trust line */}
        <p className="lp-hero__trust">
          <Icon d={ICONS.shield} size={15} />
          Multi-tenant · Datos aislados por empresa · Offline-first
        </p>

        {/* Dashboard mockup */}
        <div className="lp-hero__mockup" aria-label="Vista previa del dashboard de IncubApp">
          <div className="lp-mockup-frame">
            <div className="lp-mockup-bar" aria-hidden="true">
              <span /><span /><span />
            </div>
            <img
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='480' viewBox='0 0 900 480'%3E%3Crect width='900' height='480' fill='%23050a14'/%3E%3Crect x='0' y='0' width='180' height='480' fill='%230a1628'/%3E%3Crect x='180' y='0' width='720' height='48' fill='%230d1f3c'/%3E%3Crect x='20' y='20' width='140' height='8' rx='4' fill='%2335D6E8' opacity='0.7'/%3E%3Crect x='20' y='60' width='30' height='30' rx='6' fill='%2335D6E8' opacity='0.2'/%3E%3Crect x='56' y='66' width='90' height='8' rx='4' fill='%23ffffff' opacity='0.3'/%3E%3Crect x='20' y='105' width='30' height='30' rx='6' fill='%237C5CFF' opacity='0.2'/%3E%3Crect x='56' y='111' width='80' height='8' rx='4' fill='%23ffffff' opacity='0.2'/%3E%3Crect x='20' y='150' width='30' height='30' rx='6' fill='%237C5CFF' opacity='0.15'/%3E%3Crect x='56' y='156' width='95' height='8' rx='4' fill='%23ffffff' opacity='0.2'/%3E%3Crect x='20' y='195' width='30' height='30' rx='6' fill='%2335D6E8' opacity='0.15'/%3E%3Crect x='56' y='201' width='75' height='8' rx='4' fill='%23ffffff' opacity='0.2'/%3E%3Crect x='200' y='60' width='200' height='120' rx='10' fill='%230d1f3c' stroke='%2335D6E8' stroke-width='0.5' stroke-opacity='0.4'/%3E%3Crect x='215' y='75' width='80' height='6' rx='3' fill='%23ffffff' opacity='0.4'/%3E%3Crect x='215' y='88' width='50' height='20' rx='4' fill='%2335D6E8' opacity='0.8'/%3E%3Cpath d='M215 150 Q240 130 260 135 Q280 140 300 120 Q320 100 360 110 Q380 115 390 105' stroke='%2335D6E8' stroke-width='2' fill='none' opacity='0.8'/%3E%3Crect x='415' y='60' width='200' height='120' rx='10' fill='%230d1f3c' stroke='%237C5CFF' stroke-width='0.5' stroke-opacity='0.4'/%3E%3Crect x='430' y='75' width='80' height='6' rx='3' fill='%23ffffff' opacity='0.4'/%3E%3Crect x='430' y='88' width='50' height='20' rx='4' fill='%237C5CFF' opacity='0.8'/%3E%3Crect x='432' y='120' width='20' height='30' rx='3' fill='%237C5CFF' opacity='0.5'/%3E%3Crect x='458' y='130' width='20' height='20' rx='3' fill='%237C5CFF' opacity='0.4'/%3E%3Crect x='484' y='115' width='20' height='35' rx='3' fill='%2335D6E8' opacity='0.5'/%3E%3Crect x='510' y='125' width='20' height='25' rx='3' fill='%237C5CFF' opacity='0.35'/%3E%3Crect x='536' y='110' width='20' height='40' rx='3' fill='%2335D6E8' opacity='0.6'/%3E%3Crect x='630' y='60' width='240' height='120' rx='10' fill='%230d1f3c' stroke='%2335D6E8' stroke-width='0.5' stroke-opacity='0.3'/%3E%3Crect x='645' y='75' width='100' height='6' rx='3' fill='%23ffffff' opacity='0.4'/%3E%3Ccircle cx='700' cy='125' r='35' fill='none' stroke='%230d1f3c' stroke-width='10'/%3E%3Ccircle cx='700' cy='125' r='35' fill='none' stroke='%2335D6E8' stroke-width='10' stroke-dasharray='154 66' stroke-dashoffset='38' opacity='0.9'/%3E%3Ctext x='700' y='130' text-anchor='middle' fill='%23fff' font-size='16' font-family='monospace'%3E70%25%3C/text%3E%3Crect x='200' y='200' width='670' height='240' rx='10' fill='%230d1f3c' stroke='%231e3358' stroke-width='0.5'/%3E%3Crect x='215' y='215' width='200' height='8' rx='4' fill='%23ffffff' opacity='0.4'/%3E%3Crect x='215' y='235' width='640' height='1' fill='%231e3358'/%3E%3Crect x='215' y='248' width='120' height='7' rx='3' fill='%23ffffff' opacity='0.2'/%3E%3Crect x='400' y='248' width='80' height='7' rx='3' fill='%233DDC97' opacity='0.6'/%3E%3Crect x='540' y='248' width='60' height='7' rx='3' fill='%23ffffff' opacity='0.2'/%3E%3Crect x='215' y='268' width='640' height='1' fill='%231e3358'/%3E%3Crect x='215' y='281' width='140' height='7' rx='3' fill='%23ffffff' opacity='0.15'/%3E%3Crect x='400' y='281' width='80' height='7' rx='3' fill='%233DDC97' opacity='0.5'/%3E%3Crect x='540' y='281' width='50' height='7' rx='3' fill='%23ffffff' opacity='0.15'/%3E%3Crect x='215' y='301' width='640' height='1' fill='%231e3358'/%3E%3Crect x='215' y='314' width='110' height='7' rx='3' fill='%23ffffff' opacity='0.15'/%3E%3Crect x='400' y='314' width='80' height='7' rx='3' fill='%23FFAA00' opacity='0.6'/%3E%3Crect x='540' y='314' width='70' height='7' rx='3' fill='%23ffffff' opacity='0.15'/%3E%3C/svg%3E"
              alt="Dashboard IncubApp mostrando KPIs de producción, nacimiento y asistencia en tiempo real"
              className="lp-mockup-img"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Métricas ─────────────────────────────────────────────────────────── */
function MetricsSection() {
  const metrics = [
    { value: 98, suffix: '%', label: 'Uptime garantizado', icon: ICONS.zap },
    { value: 12, suffix: '+', label: 'Módulos operativos', icon: ICONS.layers },
    { value: 100, suffix: '%', label: 'Offline-first', icon: ICONS.wifi },
    { value: 30, suffix: ' días', label: 'Piloto de adopción', icon: ICONS.chart },
  ]

  return (
    <section className="lp-metrics" aria-label="Métricas clave del producto">
      <div className="lp-container">
        <ul className="lp-metrics__grid" role="list">
          {metrics.map(m => (
            <li key={m.label} className="lp-metrics__card">
              <span className="lp-metrics__icon" aria-hidden="true">
                <Icon d={m.icon} size={22} stroke="var(--lp-cyan)" />
              </span>
              <strong className="lp-metrics__value">
                <CountUp to={m.value} suffix={m.suffix} />
              </strong>
              <span className="lp-metrics__label">{m.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ─── Módulos ──────────────────────────────────────────────────────────── */
function ModulesSection() {
  const modules = [
    {
      icon: ICONS.chart,
      color: 'cyan',
      title: 'Tableros de gerencia',
      desc: 'KPIs de producción, nacimiento, asistencia y logística en tiempo real. Cockpit ejecutivo con exportes membretados.',
    },
    {
      icon: ICONS.shield,
      color: 'purple',
      title: 'Control de accesos',
      desc: 'Roles herméticos por empresa. Sin acceso cruzado entre tenants. Logs de auditoría completos.',
    },
    {
      icon: ICONS.map,
      color: 'cyan',
      title: 'Planta y granja geo',
      desc: 'Mapa interactivo de sedes con planos 2D/3D. GPS de precisión y calibración por área.',
    },
    {
      icon: ICONS.layers,
      color: 'purple',
      title: 'Operación offline',
      desc: 'Rondas, OT y evidencias fotográficas sin conexión. Sincronización automática al reconectar.',
    },
    {
      icon: ICONS.wifi,
      color: 'cyan',
      title: 'IoT y bioseguridad',
      desc: 'Sensores de temperatura y humedad. Alertas en tiempo real. Trazabilidad completa por lote.',
    },
    {
      icon: ICONS.users,
      color: 'purple',
      title: 'Multi-empresa',
      desc: 'Un SaaS, múltiples tenants aislados. White-label por cliente. Onboarding guiado por CDH Maker.',
    },
  ]

  return (
    <section id="módulos" className="lp-section lp-modules" aria-labelledby="modules-title">
      <div className="lp-container">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Plataforma completa</span>
          <h2 id="modules-title" className="lp-section__h2">
            Todo lo que necesita su operación industrial
          </h2>
          <p className="lp-section__desc">
            Desde la planta hasta la gerencia — un solo sistema con datos aislados por empresa.
          </p>
        </div>

        <ul className="lp-modules__grid" role="list">
          {modules.map(m => (
            <li key={m.title} className={`lp-module-card lp-module-card--${m.color}`}>
              <span className="lp-module-card__icon" aria-hidden="true">
                <Icon d={m.icon} size={24} stroke={m.color === 'cyan' ? 'var(--lp-cyan)' : 'var(--lp-purple)'} />
              </span>
              <h3 className="lp-module-card__title">{m.title}</h3>
              <p className="lp-module-card__desc">{m.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ─── Cómo funciona ────────────────────────────────────────────────────── */
function HowItWorksSection() {
  const steps = [
    {
      n: '01',
      title: 'Piloto en 30 días',
      desc: 'CDH Maker onboarding su empresa: configuramos módulos, roles y estructura de datos. Sin fricción técnica.',
    },
    {
      n: '02',
      title: 'Su equipo opera',
      desc: 'Rondas, reportes, evidencias y OT desde cualquier dispositivo. Offline cuando no hay señal.',
    },
    {
      n: '03',
      title: 'Gerencia decide',
      desc: 'Tableros con KPIs actualizados al minuto. Exportes con membrete. IA asistida para análisis.',
    },
    {
      n: '04',
      title: 'Escala con usted',
      desc: 'Agrega sedes, módulos y empresas sin migrar datos. Multi-tenant nativo desde el día uno.',
    },
  ]

  return (
    <section id="cómo-funciona" className="lp-section lp-how" aria-labelledby="how-title">
      <div className="lp-container">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Adopción sin fricción</span>
          <h2 id="how-title" className="lp-section__h2">Cómo funciona IncubApp</h2>
        </div>

        <ol className="lp-how__steps" role="list">
          {steps.map(s => (
            <li key={s.n} className="lp-how__step">
              <span className="lp-how__num" aria-hidden="true">{s.n}</span>
              <div className="lp-how__content">
                <h3 className="lp-how__title">{s.title}</h3>
                <p className="lp-how__desc">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ─── Testimonios ──────────────────────────────────────────────────────── */
function TestimonialsSection() {
  const testimonials = [
    {
      quote: 'IncubApp transformó nuestra operación. Ahora tenemos evidencia fotográfica de cada ronda y los tableros permiten tomar decisiones con datos reales, no con intuición.',
      name: 'Director de Operaciones',
      company: 'Antioqueña de Incubación SAS',
      initials: 'DO',
    },
    {
      quote: 'El modo offline fue clave. Nuestras granjas no siempre tienen señal y seguimos operando sin perder ningún registro. La sincronización es transparente.',
      name: 'Coordinador de Granja',
      company: 'Planta avícola · Antioquia',
      initials: 'CG',
    },
    {
      quote: 'La gestión multi-sede desde un solo panel cambió todo. Antes necesitábamos llamadas y correos; ahora el estado de cada planta está en tiempo real.',
      name: 'Gerente General',
      company: 'Grupo avícola regional',
      initials: 'GG',
    },
  ]

  const [active, setActive] = useState(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return
    const id = setInterval(() => setActive(v => (v + 1) % testimonials.length), 5000)
    return () => clearInterval(id)
  }, [testimonials.length])

  return (
    <section id="clientes" className="lp-section lp-testimonials" aria-labelledby="testimonials-title">
      <div className="lp-container">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Clientes reales</span>
          <h2 id="testimonials-title" className="lp-section__h2">Operadores que confían en IncubApp</h2>
        </div>

        <div className="lp-testimonials__slider" role="region" aria-label="Testimonios de clientes" aria-live="polite">
          <div className="lp-testimonials__card">
            <blockquote className="lp-testimonials__quote">
              <p>"{testimonials[active].quote}"</p>
            </blockquote>
            <div className="lp-testimonials__author">
              <span className="lp-testimonials__avatar" aria-hidden="true">{testimonials[active].initials}</span>
              <div>
                <strong className="lp-testimonials__name">{testimonials[active].name}</strong>
                <span className="lp-testimonials__company">{testimonials[active].company}</span>
              </div>
            </div>
          </div>

          <div className="lp-testimonials__dots" role="tablist" aria-label="Seleccionar testimonio">
            {testimonials.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === active}
                aria-label={`Testimonio ${i + 1} de ${testimonials.length}`}
                className={`lp-dot${i === active ? ' lp-dot--active' : ''}`}
                onClick={() => setActive(i)}
                type="button"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Precios ──────────────────────────────────────────────────────────── */
function PricingSection({ onLogin }) {
  const plans = GO_TO_MARKET.packaging.map((p, i) => ({
    ...p,
    highlight: i === 1,
    cta: i === 0 ? 'Solicitar piloto' : i === 1 ? 'Empezar ahora' : 'Contactar ventas',
    badge: i === 1 ? 'Más popular' : null,
    features: [
      i >= 0 && 'Rondas y OT con evidencia fotográfica',
      i >= 0 && 'Asistencia y roles herméticos',
      i >= 0 && 'Operación offline',
      i >= 0 && 'Multi-usuario',
      i >= 1 && 'Módulo de nacimiento y cargue',
      i >= 1 && 'Inventarios y sensores IoT',
      i >= 1 && 'Reportes y exportes',
      i >= 2 && 'Multi-sede y multi-empresa',
      i >= 2 && 'White-label por cliente',
      i >= 2 && 'SLA y onboarding CDH Maker',
    ].filter(Boolean),
  }))

  return (
    <section id="precios" className="lp-section lp-pricing" aria-labelledby="pricing-title">
      <div className="lp-container">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Planes</span>
          <h2 id="pricing-title" className="lp-section__h2">Escoge el plan para su operación</h2>
          <p className="lp-section__desc">Todos los planes incluyen onboarding, soporte y actualizaciones sin costo extra.</p>
        </div>

        <ul className="lp-pricing__grid" role="list">
          {plans.map(plan => (
            <li key={plan.name} className={`lp-plan${plan.highlight ? ' lp-plan--highlight' : ''}`}>
              {plan.badge && <span className="lp-plan__badge" aria-label={`Plan destacado: ${plan.badge}`}>{plan.badge}</span>}
              <h3 className="lp-plan__name">{plan.name}</h3>
              <p className="lp-plan__includes">{plan.includes}</p>
              <ul className="lp-plan__features" role="list" aria-label={`Características incluidas en ${plan.name}`}>
                {plan.features.map(f => (
                  <li key={f} className="lp-plan__feature">
                    <Icon d={ICONS.check} size={15} stroke="var(--lp-cyan)" />
                    {f}
                  </li>
                ))}
              </ul>
              <button className={`lp-btn ${plan.highlight ? 'lp-btn--primary' : 'lp-btn--outline'} lp-btn--full`}
                onClick={onLogin} type="button">
                {plan.cta}
              </button>
            </li>
          ))}
        </ul>

        <p className="lp-pricing__note">
          Precio por acuerdo comercial · Piloto 30–90 días con métricas de cumplimiento · <a href="mailto:hola@cdhmaker.com" className="lp-link">hola@cdhmaker.com</a>
        </p>
      </div>
    </section>
  )
}

/* ─── CTA final ─────────────────────────────────────────────────────────── */
function FinalCTA({ onLogin }) {
  return (
    <section className="lp-section lp-final-cta" aria-label="Llamada a la acción final">
      <div className="lp-container lp-final-cta__inner">
        <div className="lp-final-cta__glow" aria-hidden="true" />
        <span className="lp-eyebrow">Empiece hoy</span>
        <h2 className="lp-section__h2">
          Su planta merece<br />
          <span className="lp-gradient-text">infraestructura de nivel industrial</span>
        </h2>
        <p className="lp-section__desc">
          Solicite una demo personalizada. Sin compromiso, sin tarjeta de crédito.
        </p>
        <div className="lp-final-cta__btns">
          <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onLogin} type="button">
            Solicitar demo gratuita
            <Icon d={ICONS.arrow} size={18} />
          </button>
          <a href="mailto:hola@cdhmaker.com" className="lp-btn lp-btn--glass lp-btn--lg">
            Escribir al equipo
          </a>
        </div>
      </div>
    </section>
  )
}

/* ─── Footer ────────────────────────────────────────────────────────────── */
function LandingFooter() {
  return (
    <footer className="lp-footer" role="contentinfo">
      <div className="lp-container lp-footer__inner">
        <div className="lp-footer__brand">
          <span className="lp-logo-name lp-footer__logo-name">IncubApp</span>
          <p className="lp-footer__tagline">{BRAND.tagline}</p>
          <p className="lp-footer__op">Operado por <strong>CDH Maker</strong></p>
        </div>

        <nav className="lp-footer__links" aria-label="Pie de página">
          <div>
            <strong>Plataforma</strong>
            <ul role="list">
              <li><a href="#módulos" className="lp-footer__link">Módulos</a></li>
              <li><a href="#precios" className="lp-footer__link">Precios</a></li>
              <li><a href="#cómo-funciona" className="lp-footer__link">Cómo funciona</a></li>
            </ul>
          </div>
          <div>
            <strong>Empresa</strong>
            <ul role="list">
              <li><a href="mailto:hola@cdhmaker.com" className="lp-footer__link">Contacto</a></li>
              <li><a href="mailto:soporte@cdhmaker.com" className="lp-footer__link">Soporte</a></li>
            </ul>
          </div>
          <div>
            <strong>Legal</strong>
            <ul role="list">
              <li><span className="lp-footer__link">Política de privacidad</span></li>
              <li><span className="lp-footer__link">Términos de uso</span></li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="lp-footer__bottom">
        <p>© {new Date().getFullYear()} CDH Maker · IncubApp. Todos los derechos reservados. · Colombia</p>
      </div>
    </footer>
  )
}

/* ─── Componente principal ─────────────────────────────────────────────── */
export default function LandingPage({ onLogin }) {
  // Animate sections on scroll
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const sections = document.querySelectorAll('.lp-animate')
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('lp-animate--in') }),
      { threshold: 0.12 }
    )
    sections.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div className="lp-root" data-theme="dark">
      <LandingNav onLogin={onLogin} />
      <main id="main-content">
        <HeroSection onLogin={onLogin} />
        <MetricsSection />
        <ModulesSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <PricingSection onLogin={onLogin} />
        <FinalCTA onLogin={onLogin} />
      </main>
      <LandingFooter />
    </div>
  )
}
