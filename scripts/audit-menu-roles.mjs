/**
 * Simula el menú real (buildClientNavItems + effectiveTabsFor + corpModules)
 * para CADA combinación de rol × área, sin necesitar login, para detectar:
 *   - duplicados: mismo tab/id aparece dos veces
 *   - fugas: un rol ve un tab que no le corresponde por privacyScopes
 *   - huérfanos: un tab del menú no tiene ruta en App.jsx
 * Solo lectura — no toca datos.
 */
import { ORG_ROLES, WORK_AREA_VALUES, DEPARTMENT_MODULES, canManageOrgUsers } from '../src/lib/roles.js'
import { effectiveTabsFor, capabilitiesFromTabs } from '../src/lib/privacyScopes.js'
import { buildClientNavItems } from '../src/lib/clientMenuTemplate.js'
import { readFileSync } from 'node:fs'

// Tabs con ruta real en App.jsx (extraídas del archivo — ver más abajo)
const appSrc = readFileSync('src/App.jsx', 'utf8')
const routedTabs = new Set()
for (const m of appSrc.matchAll(/tab === '([a-z0-9_-]+)'/g)) routedTabs.add(m[1])

function simulate(role, area) {
  // App.jsx: tabs = access.tabs (privacyScopes) + extras hardcodeados
  const tabs = effectiveTabsFor({ role, area, isOmniscient: false, grantedScopeIds: [] })
  if (canManageOrgUsers(role)) tabs.add('admin')
  if (['coordinator', 'management', 'management_auxiliary', 'owner', 'admin', 'supervisor'].includes(role)) {
    tabs.add('plantas')
    tabs.add('granjas')
  }
  const cap = capabilitiesFromTabs(tabs, { isOmniscient: false })
  const can = (t) => {
    if (t === 'admin' && canManageOrgUsers(role)) return true
    return cap.canOpen(t)
  }
  const items = buildClientNavItems({ can, role })
  const corp = DEPARTMENT_MODULES.filter((m) => can(m.tab))
  for (const m of corp) {
    if (items.some((n) => n.id === m.tab)) continue
    if (!can(m.tab)) continue
    items.push({ id: m.tab, label: m.label, group: 'Dirección', hint: m.tagline })
  }
  return items
}

console.log('═══ 1) DUPLICADOS: mismo tab aparece 2+ veces en el menú de un rol ═══')
let dupFound = false
for (const r of ORG_ROLES) {
  const areas = r.value === 'coordinator' ? WORK_AREA_VALUES : [null]
  for (const area of areas) {
    const items = simulate(r.value, area)
    const seen = new Map()
    for (const it of items) {
      const tab = it.id
      seen.set(tab, (seen.get(tab) || 0) + 1)
    }
    for (const [tab, n] of seen) {
      if (n > 1) {
        dupFound = true
        console.log(`  ${r.value}${area ? '/' + area : ''}: tab "${tab}" aparece ${n} veces`)
      }
    }
  }
}
if (!dupFound) console.log('  (ninguno por id exacto)')

console.log('\n═══ 2) ETIQUETAS duplicadas (mismo texto, distinto tab) por rol ═══')
let labelDup = false
for (const r of ORG_ROLES) {
  const areas = r.value === 'coordinator' ? WORK_AREA_VALUES : [null]
  for (const area of areas) {
    const items = simulate(r.value, area)
    const byLabel = new Map()
    for (const it of items) {
      if (!byLabel.has(it.label)) byLabel.set(it.label, [])
      byLabel.get(it.label).push(it.id)
    }
    for (const [label, ids] of byLabel) {
      if (ids.length > 1 && new Set(ids).size > 1) {
        labelDup = true
        console.log(`  ${r.value}${area ? '/' + area : ''}: "${label}" → tabs [${ids.join(', ')}]`)
      }
    }
  }
}
if (!labelDup) console.log('  (ninguna)')

console.log('\n═══ 3) Tabs del menú SIN ruta en App.jsx (clic no hace nada) ═══')
let orphan = false
const allTabsSeen = new Set()
for (const r of ORG_ROLES) {
  const areas = r.value === 'coordinator' ? WORK_AREA_VALUES : [null]
  for (const area of areas) {
    for (const it of simulate(r.value, area)) allTabsSeen.add(it.id)
  }
}
const ALWAYS_OK = new Set(['hoy', 'perfil', 'accesos', 'reportes', 'asistencia', 'cumplimiento'])
for (const t of [...allTabsSeen].sort()) {
  if (ALWAYS_OK.has(t)) continue
  if (!routedTabs.has(t)) {
    orphan = true
    console.log(`  "${t}" está en algún menú pero NO tiene "tab === '${t}'" en App.jsx`)
  }
}
if (!orphan) console.log('  (ninguno)')

console.log('\n═══ 4) Resumen de menú por rol (para inspección manual) ═══')
for (const r of ORG_ROLES) {
  const areas = r.value === 'coordinator' ? WORK_AREA_VALUES.filter((a) => a !== 'general' && a !== 'quality' && a !== 'hse' && a !== 'sales_logistics') : [null]
  for (const area of areas) {
    const items = simulate(r.value, area)
    console.log(`${r.value}${area ? '/' + area : ''}: ${items.map((i) => i.id).join(', ')}`)
  }
}
