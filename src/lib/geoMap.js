/**
 * =============================================================================
 * ARCHIVO: src/lib/geoMap.js
 * PROPÓSITO: Proyección GPS ↔ coordenadas de plano de planta/granja.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Proyección GPS ↔ coordenadas del plano (metros).
 *
 * Convención del plano FloorMap:
 *  - +X hacia la derecha
 *  - +Y hacia abajo (como CSS)
 * Con geo_rotation_deg = 0: el norte real queda hacia arriba del plano (−Y).
 */

const M_PER_DEG_LAT = 110540
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

/** Vector este/norte (metros) desde un origen GPS a un punto GPS. */
export function gpsDeltaMeters(from, to) {
  if (from?.lat == null || from?.lng == null || to?.lat == null || to?.lng == null) return null
  const east = (to.lng - from.lng) * mPerDegLng(from.lat)
  const north = (to.lat - from.lat) * M_PER_DEG_LAT
  return { east, north, distance: Math.hypot(east, north) }
}

/**
 * Calibración con 2 puntos:
 *  - Punto A: origen del plano (planX=0, planY=0) + GPS capturado allí
 *  - Punto B: hito en el plano (planX, planY) + GPS capturado en ese sitio real
 * Calcula rotación y escala automáticamente.
 *
 * @returns {{ originLat, originLng, rotationDeg, scale, distanceRealM, distancePlanM } | { error: string }}
 */
/** Export «calibrateFromTwoPoints»: API pública de este módulo. Henry Stark Desarrollador */
export function calibrateFromTwoPoints({ originGps, landmarkGps, landmarkPlan }) {
  if (originGps?.lat == null || originGps?.lng == null) {
    return { error: 'Falta el GPS del origen' }
  }
  if (landmarkGps?.lat == null || landmarkGps?.lng == null) {
    return { error: 'Falta el GPS del hito' }
  }
  const px = Number(landmarkPlan?.x)
  const py = Number(landmarkPlan?.y)
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return { error: 'Falta el punto del hito en el plano' }
  }
  const dPlan = Math.hypot(px, py)
  if (dPlan < 1) {
    return {
      error:
        'El hito debe estar al menos a ~1 m del origen en el plano (marque un punto más lejano).',
    }
  }
  const delta = gpsDeltaMeters(originGps, landmarkGps)
  if (!delta || delta.distance < 3) {
    return {
      error:
        'Los dos puntos GPS están demasiado cerca (mín. ~3 m reales). Sepárelos más o espere mejor señal.',
    }
  }

  // scale = metros reales por metro de plano
  const scale = delta.distance / dPlan
  if (scale < 0.05 || scale > 50) {
    return {
      error: `Escala poco creíble (${scale.toFixed(2)}). Revise que el hito del plano coincida con la posición real.`,
    }
  }

  const { east: A, north: B } = delta
  const u = px * scale
  const v = py * scale
  const det = A * A + B * B
  if (det < 1e-6) return { error: 'No se pudo calcular la rotación (vector GPS nulo)' }

  // [A B; -B A] [cos; sin] = [u; v]
  const cos = (A * u - B * v) / det
  const sin = (B * u + A * v) / det
  // normalizar por redondeo numérico
  const norm = Math.hypot(cos, sin) || 1
  let rotationDeg = (Math.atan2(sin / norm, cos / norm) * 180) / Math.PI
  // normalizar a (-180, 180]
  if (rotationDeg > 180) rotationDeg -= 360
  if (rotationDeg <= -180) rotationDeg += 360

  return {
    originLat: originGps.lat,
    originLng: originGps.lng,
    rotationDeg: Math.round(rotationDeg * 10) / 10,
    scale: Math.round(scale * 1000) / 1000,
    distanceRealM: Math.round(delta.distance * 10) / 10,
    distancePlanM: Math.round(dPlan * 10) / 10,
  }
}

/**
 * @param {{ lat: number, lng: number }} gps
 * @param {{ originLat: number, originLng: number, rotationDeg?: number, scale?: number }} geo
 * @returns {{ x: number, y: number }} metros en el plano
 */
/** Export «gpsToPlan»: API pública de este módulo. Henry Stark Desarrollador */
export function gpsToPlan(gps, geo) {
  if (gps?.lat == null || gps?.lng == null || geo?.originLat == null || geo?.originLng == null) {
    return null
  }
  const scale = Number(geo.scale) > 0 ? Number(geo.scale) : 1
  const east = (gps.lng - geo.originLng) * mPerDegLng(geo.originLat)
  const north = (gps.lat - geo.originLat) * M_PER_DEG_LAT
  const r = ((Number(geo.rotationDeg) || 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  // Rotación: 0° → norte = −Y (arriba en pantalla)
  const x = (east * cos + north * sin) / scale
  const y = (east * sin - north * cos) / scale
  return { x, y }
}

/**
 * @param {{ x: number, y: number }} plan
 * @param {{ originLat: number, originLng: number, rotationDeg?: number, scale?: number }} geo
 */
/** Export «planToGps»: API pública de este módulo. Henry Stark Desarrollador */
export function planToGps(plan, geo) {
  if (plan?.x == null || plan?.y == null || geo?.originLat == null || geo?.originLng == null) {
    return null
  }
  const scale = Number(geo.scale) > 0 ? Number(geo.scale) : 1
  const x = plan.x * scale
  const y = plan.y * scale
  const r = ((Number(geo.rotationDeg) || 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  // Inversa de gpsToPlan
  const east = x * cos + y * sin
  const north = x * sin - y * cos
  const lat = geo.originLat + north / M_PER_DEG_LAT
  const lng = geo.originLng + east / mPerDegLng(geo.originLat)
  return { lat, lng }
}

/** Bounds del plano a partir de salas, en metros, con margen. */
export function planBounds(rooms, pad = 8) {
  if (!rooms?.length) {
    return { minX: -pad, minY: -pad, maxX: 40 + pad, maxY: 30 + pad }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rooms) {
    const x0 = Number(r.pos_x) || 0
    const y0 = Number(r.pos_y) || 0
    const w = Number(r.width) || 0
    const h = Number(r.height) || 0
    minX = Math.min(minX, x0)
    minY = Math.min(minY, y0)
    maxX = Math.max(maxX, x0 + w)
    maxY = Math.max(maxY, y0 + h)
  }
  if (!Number.isFinite(minX)) {
    return { minX: -pad, minY: -pad, maxX: 40 + pad, maxY: 30 + pad }
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  }
}

/** Export «isInsidePlan»: API pública de este módulo. Henry Stark Desarrollador */
export function isInsidePlan(xy, bounds) {
  if (!xy || !bounds) return false
  return xy.x >= bounds.minX && xy.x <= bounds.maxX && xy.y >= bounds.minY && xy.y <= bounds.maxY
}

/**
 * Proyecta peers con GPS sobre el plano; solo devuelve los que están dentro.
 * @returns {Array<{ userId, name, roleLabel, isMe, x, y, accuracy, lat, lng }>}
 */
/** Export «projectPeopleOnPlan»: API pública de este módulo. Henry Stark Desarrollador */
export function projectPeopleOnPlan({ peers, geo, rooms, currentUserId, padMeters = 12 }) {
  if (!geo?.originLat || !geo?.originLng || !peers?.length) return []
  const bounds = planBounds(rooms, padMeters)
  const out = []
  for (const p of peers) {
    if (p.lat == null || p.lng == null) continue
    const xy = gpsToPlan({ lat: p.lat, lng: p.lng }, geo)
    if (!xy || !isInsidePlan(xy, bounds)) continue
    out.push({
      userId: p.userId,
      name: p.name,
      roleLabel: p.roleLabel || p.role || '—',
      isMe: p.userId === currentUserId,
      x: xy.x,
      y: xy.y,
      accuracy: p.accuracy,
      lat: p.lat,
      lng: p.lng,
    })
  }
  return out
}

/** Radio (m) por defecto para considerar "en la sede" cuando aún no se ha guardado uno propio. */
export const DEFAULT_SITE_RADIUS_M = 300

const storageKey = (plantId) => `incubapp_plant_geo_${plantId}`

/** Lee calibración desde fila de planta o localStorage. */
export function readPlantGeo(plant) {
  if (!plant?.id) return null
  if (plant.geo_origin_lat != null && plant.geo_origin_lng != null) {
    return {
      originLat: Number(plant.geo_origin_lat),
      originLng: Number(plant.geo_origin_lng),
      rotationDeg: Number(plant.geo_rotation_deg) || 0,
      scale: Number(plant.geo_scale) > 0 ? Number(plant.geo_scale) : 1,
      radiusM: Number(plant.geo_radius_m) > 0 ? Number(plant.geo_radius_m) : DEFAULT_SITE_RADIUS_M,
      source: 'db',
    }
  }
  try {
    const raw = localStorage.getItem(storageKey(plant.id))
    if (!raw) return null
    const j = JSON.parse(raw)
    if (j.originLat == null || j.originLng == null) return null
    return {
      originLat: Number(j.originLat),
      originLng: Number(j.originLng),
      rotationDeg: Number(j.rotationDeg) || 0,
      scale: Number(j.scale) > 0 ? Number(j.scale) : 1,
      radiusM: Number(j.radiusM) > 0 ? Number(j.radiusM) : DEFAULT_SITE_RADIUS_M,
      source: 'local',
    }
  } catch {
    return null
  }
}

/** Export «writePlantGeoLocal»: API pública de este módulo. Henry Stark Desarrollador */
export function writePlantGeoLocal(plantId, geo) {
  try {
    localStorage.setItem(
      storageKey(plantId),
      JSON.stringify({
        originLat: geo.originLat,
        originLng: geo.originLng,
        rotationDeg: geo.rotationDeg || 0,
        scale: geo.scale || 1,
        radiusM: geo.radiusM || DEFAULT_SITE_RADIUS_M,
      })
    )
  } catch {
    /* */
  }
}

/** Export «clearPlantGeoLocal»: API pública de este módulo. Henry Stark Desarrollador */
export function clearPlantGeoLocal(plantId) {
  try {
    localStorage.removeItem(storageKey(plantId))
  } catch {
    /* */
  }
}
