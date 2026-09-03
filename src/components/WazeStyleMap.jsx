/**
 * =============================================================================
 * ARCHIVO: src/components/WazeStyleMap.jsx
 * PROPÓSITO: Componente UI «WazeStyleMap»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Mapa interactivo estilo Waze: capas oscura / satélite, marcadores vivos,
 * rumbo, precisión y polilíneas de ruta.
 */

const TILES = {
  waze: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20,
  },
  // Imágenes satélite (realista)
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  hybridLabels: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    attr: '&copy; CARTO',
    maxZoom: 20,
  },
}

function driverIcon({ name, onRoute, heading }) {
  const rot = heading != null && !Number.isNaN(heading) ? heading : 0
  const color = onRoute ? '#00e5a8' : '#33b5ff'
  const html = `
    <div class="waze-pin ${onRoute ? 'on-route' : ''}" style="--pin:${color}">
      <div class="waze-pin-pulse"></div>
      <div class="waze-pin-core" style="transform:rotate(${rot}deg)">
        <span class="waze-arrow">▲</span>
      </div>
      <div class="waze-pin-label">${escapeHtml((name || '·').split(/\s+/)[0])}</div>
    </div>
  `
  return L.divIcon({
    className: 'waze-marker',
    html,
    iconSize: [48, 56],
    iconAnchor: [24, 28],
  })
}

function plantIcon(name) {
  return L.divIcon({
    className: 'waze-marker',
    html: `<div class="waze-plant"><span>P</span><div class="waze-pin-label">${escapeHtml(name || 'Planta')}</div></div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 24],
  })
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{
 *   points: Array<{ id, name, lat, lng, on_route?, heading?, accuracy?, speed?, plate? }>,
 *   plants?: Array<{ id, name, lat, lng }>,
 *   routes?: Array<{ id, positions: [lat,lng][], color? }>,
 *   followId?: string|null,
 *   className?: string,
 *   height?: number|string,
 * }} props
 */
export default function WazeStyleMap({
  points = [],
  plants = [],
  routes = [],
  followId = null,
  className = '',
  height = 420,
  onSelectPoint,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef({ markers: null, routes: null, plants: null })
  const tileRef = useRef({ base: null, labels: null })
  const [style, setStyle] = useState('waze') // waze | sat
  const [ready, setReady] = useState(false)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    }).setView([4.65, -74.1], 6)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const base = L.tileLayer(TILES.waze.url, {
      attribution: TILES.waze.attr,
      maxZoom: TILES.waze.maxZoom,
      subdomains: 'abcd',
    }).addTo(map)

    tileRef.current = { base, labels: null }
    layersRef.current = {
      markers: L.layerGroup().addTo(map),
      routes: L.layerGroup().addTo(map),
      plants: L.layerGroup().addTo(map),
    }
    mapRef.current = map
    setReady(true)

    // fix size after mount
    setTimeout(() => map.invalidateSize(), 80)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Switch basemap
  useEffect(() => {
    const map = mapRef.current
    if (!map || !tileRef.current.base) return
    map.removeLayer(tileRef.current.base)
    if (tileRef.current.labels) {
      map.removeLayer(tileRef.current.labels)
      tileRef.current.labels = null
    }
    if (style === 'sat') {
      tileRef.current.base = L.tileLayer(TILES.sat.url, {
        attribution: TILES.sat.attr,
        maxZoom: TILES.sat.maxZoom,
      }).addTo(map)
      tileRef.current.labels = L.tileLayer(TILES.hybridLabels.url, {
        attribution: TILES.hybridLabels.attr,
        maxZoom: TILES.hybridLabels.maxZoom,
        subdomains: 'abcd',
        opacity: 0.9,
      }).addTo(map)
    } else {
      tileRef.current.base = L.tileLayer(TILES.waze.url, {
        attribution: TILES.waze.attr,
        maxZoom: TILES.waze.maxZoom,
        subdomains: 'abcd',
      }).addTo(map)
    }
  }, [style])

  // Update overlays
  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers.markers) return

    layers.markers.clearLayers()
    layers.routes.clearLayers()
    layers.plants.clearLayers()

    for (const r of routes) {
      if (!r.positions?.length) continue
      L.polyline(r.positions, {
        color: r.color || '#33b5ff',
        weight: 6,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(layers.routes)
      // glow
      L.polyline(r.positions, {
        color: '#7ad7ff',
        weight: 12,
        opacity: 0.15,
      }).addTo(layers.routes)
    }

    for (const p of plants) {
      if (p.lat == null || p.lng == null) continue
      L.marker([p.lat, p.lng], { icon: plantIcon(p.name), zIndexOffset: 200 }).addTo(
        layers.plants
      )
    }

    const latlngs = []
    for (const p of points) {
      if (p.lat == null || p.lng == null) continue
      latlngs.push([p.lat, p.lng])
      const m = L.marker([p.lat, p.lng], {
        icon: driverIcon({
          name: p.name,
          onRoute: p.on_route,
          heading: p.heading,
        }),
        zIndexOffset: p.on_route ? 800 : 500,
      })
      const acc =
        p.accuracy != null ? `Precisión ±${Math.round(p.accuracy)} m` : 'Precisión n/d'
      const spd =
        p.speed != null && p.speed >= 0
          ? `${Math.round(p.speed * 3.6)} km/h`
          : null
      m.bindPopup(
        `<strong>${escapeHtml(p.name || 'Conductor')}</strong><br/>` +
          `${p.on_route ? 'En ruta' : 'Detenido / sin ruta'}<br/>` +
          `${acc}${spd ? `<br/>${spd}` : ''}` +
          (p.plate ? `<br/>${escapeHtml(p.plate)}` : '')
      )
      m.on('click', () => onSelectPoint?.(p))
      m.addTo(layers.markers)

      // círculo de precisión (tipo radar)
      if (p.accuracy != null && p.accuracy < 200) {
        L.circle([p.lat, p.lng], {
          radius: p.accuracy,
          color: p.on_route ? '#00e5a8' : '#33b5ff',
          weight: 1,
          fillColor: p.on_route ? '#00e5a8' : '#33b5ff',
          fillOpacity: 0.08,
        }).addTo(layers.markers)
      }
    }

    if (followId) {
      const f = points.find((x) => x.id === followId)
      if (f?.lat != null) {
        map.setView([f.lat, f.lng], Math.max(map.getZoom(), 15), { animate: true })
        return
      }
    }

    if (latlngs.length === 1) {
      map.setView(latlngs[0], 15)
    } else if (latlngs.length > 1) {
      map.fitBounds(latlngs, { padding: [48, 48], maxZoom: 16 })
    }

    setTimeout(() => map.invalidateSize(), 50)
  }, [points, plants, routes, followId, onSelectPoint, ready])

  return (
    <div className={`waze-map-shell ${className}`}>
      <div className="waze-map-toolbar">
        <button
          type="button"
          className={style === 'waze' ? 'waze-tb active' : 'waze-tb'}
          onClick={() => setStyle('waze')}
        >
          Vista Waze
        </button>
        <button
          type="button"
          className={style === 'sat' ? 'waze-tb active' : 'waze-tb'}
          onClick={() => setStyle('sat')}
        >
          Satélite
        </button>
        <span className="waze-tb-hint">
          {points.length} en mapa · GNSS alta precisión
        </span>
      </div>
      <div
        ref={containerRef}
        className="waze-map-canvas"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      />
      {!points.length && (
        <div className="waze-map-empty">
          Sin posiciones GPS aún. Inicie una ruta y active el rastreador de alta precisión.
        </div>
      )}
    </div>
  )
}
