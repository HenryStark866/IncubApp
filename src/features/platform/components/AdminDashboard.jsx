/**
 * =============================================================================
 * ARCHIVO: src/components/AdminDashboard.jsx
 * PROPÃ“SITO: Componente UI Â«AdminDashboardÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { useAdmin } from '../features/platform/hooks/useAdmin'
import ListControls, { useListControls } from './ListControls'
import DataFixPanel from './DataFixPanel'
import {
  WORK_AREAS,
  orgRolesGrouped,
  roleNeedsArea,
  roleLabel,
} from '../lib/roles'
import { BRAND } from '../lib/brandIdentity'
import {
  ExecEmpty,
  ExecGroup,
  ExecHero,
  ExecKpiGrid,
  ExecList,
  ExecPanel,
  ExecStatus,
  healthLabel,
  healthTone,
} from './ExecBoard'

function RoleSelect({ value, onChange, id }) {
  // Nunca ofrecer developer a clientes / ni en UI de plataforma al asignar a empresas
  const groups = orgRolesGrouped({ includePlatformStaff: false })
  return (
    <select id={id} value={value} onChange={onChange}>
      {groups.map(({ group, roles }) => (
        <optgroup key={group} label={group}>
          {roles
            .filter((r) => r.value !== 'developer')
            .map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

function AreaSelect({ value, onChange, title }) {
  return (
    <select
      value={value || 'plant'}
      onChange={onChange}
      title={title || 'Ãrea del lÃ­der â€” define menÃº y herramientas (como LogÃ­stica)'}
      style={{ minWidth: 160 }}
    >
      {WORK_AREAS.map((a) => (
        <option key={a.value} value={a.value}>
          Ãrea: {a.label}
        </option>
      ))}
    </select>
  )
}

const PLANT_STATUS = [
  { value: 'active', label: 'Activa' },
  { value: 'inactive', label: 'Inactiva' },
]

const SENSOR_KIND_LABEL = {
  temperature: 'ðŸŒ¡ï¸ Temperatura',
  humidity: 'ðŸ’§ Humedad',
  co2: 'â˜ï¸ COâ‚‚',
  turning: 'ðŸ”„ Volteo',
  power: 'âš¡ EnergÃ­a',
  door: 'ðŸšª Puerta',
  pressure: 'ðŸŽšï¸ PresiÃ³n',
}

const ROOM_TYPE_LABEL = {
  incubation: 'IncubaciÃ³n',
  hatching: 'Nacedora',
  egg_storage: 'Bodega de huevo',
  chick_processing: 'Proceso de pollito',
  washing: 'Lavado',
  technical: 'Cuarto tÃ©cnico',
  office: 'Oficina',
  other: 'Otro',
}

const MACHINE_TYPE_LABEL = {
  setter: 'Incubadora',
  hatcher: 'Nacedora',
  combo: 'Combinada',
  chiller: 'Chiller',
  compressor: 'Compresor',
  other: 'Otro equipo',
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[Ì€-Í¯]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

const outOfRange = (value, s) =>
  value != null &&
  ((s.min_threshold != null && value < Number(s.min_threshold)) ||
    (s.max_threshold != null && value > Number(s.max_threshold)))

/* â•â• Resumen â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function OverviewSection({ admin }) {
  const pendientes = admin.users.filter((u) => !u.is_approved).length
  const activeSensors = admin.sensors.filter((s) => s.status === 'active')

  const alarms = activeSensors
    .map((s) => {
      const reading = admin.latest[s.id]
      if (!reading || !outOfRange(reading.value, s)) return null
      const machine = admin.machines.find((m) => m.id === s.machine_id)
      const plant = admin.plants.find((p) => p.id === machine?.plant_id)
      const org = admin.orgs.find((o) => o.id === s.org_id)
      return { sensor: s, reading, machine, plant, org }
    })
    .filter(Boolean)

  const activeWO = (admin.workOrders ?? []).filter((w) => w.status === 'open' || w.status === 'in_progress')
  const criticalWO = activeWO.filter((w) => w.priority === 'critical' || w.priority === 'high').length

  const realPlants = admin.plants.filter((p) => !(p.code?.startsWith('G') || p.name?.startsWith('G-')))
  const realFarms = admin.plants.filter((p) => p.code?.startsWith('G') || p.name?.startsWith('G-'))

  const health = {
    pending: pendientes,
    alarms: alarms.length,
    critical: criticalWO,
  }
  const tone = healthTone(health)

  const platformKpis = [
    {
      label: 'Usuarios',
      value: admin.users.length,
      sub: pendientes > 0 ? `${pendientes} por aprobar` : 'todos aprobados',
      warn: pendientes > 0,
    },
    { label: 'Empresas', value: admin.orgs.length, sub: 'tenant(s) en plataforma', ok: admin.orgs.length > 0 },
  ]

  const siteKpis = [
    { label: 'Plantas', value: realPlants.length, sub: 'incubaciÃ³n / proceso' },
    { label: 'Granjas', value: realFarms.length, sub: 'producciÃ³n de huevo' },
    { label: 'Salas / mÃ³dulos', value: admin.rooms.length },
    { label: 'Equipos', value: admin.machines.length },
  ]

  const opsKpis = [
    {
      label: 'Sensores activos',
      value: activeSensors.length,
      sub: `${admin.sensors.length} configurados`,
      ok: activeSensors.length > 0,
    },
    {
      label: 'OT activas',
      value: activeWO.length,
      sub: criticalWO > 0 ? `${criticalWO} prioritaria(s)` : 'mantenimiento al dÃ­a',
      warn: criticalWO > 0,
    },
    {
      label: 'Alarmas',
      value: alarms.length,
      sub: alarms.length === 0 ? 'todo en rango' : 'requieren atenciÃ³n',
      tone: alarms.length > 0 ? 'danger' : 'ok',
    },
  ]

  const alarmItems = alarms.map(({ sensor, reading, machine, plant, org }) => ({
    id: sensor.id,
    title: `${SENSOR_KIND_LABEL[sensor.kind] ?? sensor.kind} Â· ${sensor.code}`,
    meta: [org?.name, plant?.name, machine ? `${machine.name} (${machine.code})` : null]
      .filter(Boolean)
      .join(' Â· '),
    tone: 'alarm',
    side: (
      <>
        <span className="sensor-value alarm">
          <strong>{reading.value}</strong> {sensor.unit}
        </span>
        <span className="sensor-range">
          {sensor.min_threshold ?? 'âˆ’âˆž'} â€“ {sensor.max_threshold ?? '+âˆž'} {sensor.unit}
        </span>
        <span className="pill status off">Fuera de rango</span>
      </>
    ),
  }))

  const attentionItems = []
  if (pendientes > 0) {
    attentionItems.push({
      id: 'pending-users',
      title: `${pendientes} usuario${pendientes === 1 ? '' : 's'} por aprobar`,
      meta: 'Revisar en la pestaÃ±a Usuarios',
      warn: true,
    })
  }
  if (criticalWO > 0) {
    attentionItems.push({
      id: 'critical-wo',
      title: `${criticalWO} OT prioritaria${criticalWO === 1 ? '' : 's'} abiertas`,
      meta: `${activeWO.length} Ã³rdenes activas en total`,
      warn: true,
    })
  }

  return (
    <div className="exec-board">
      <ExecHero
        kicker={`IncubApp Â· ${BRAND.slogan}`}
        title="Resumen ejecutivo"
        subtitle="Panorama ordenado de usuarios, sedes y salud operativa en todas las empresas."
        status={<ExecStatus tone={tone}>{healthLabel(health)}</ExecStatus>}
      />

      <div className="exec-groups">
        <ExecGroup title="Plataforma" hint="Cuentas y tenancy">
          <ExecKpiGrid items={platformKpis} />
        </ExecGroup>
        <ExecGroup title="Instalaciones" hint="Cobertura multi-empresa">
          <ExecKpiGrid items={siteKpis} />
        </ExecGroup>
        <ExecGroup title="OperaciÃ³n y salud" hint="Monitoreo y mantenimiento">
          <ExecKpiGrid items={opsKpis} />
        </ExecGroup>
      </div>

      <div className="exec-split">
        <ExecPanel title="Alarmas de sensores">
          {alarms.length === 0 ? (
            <ExecEmpty ok>NingÃºn sensor fuera de rango. El sistema opera con normalidad.</ExecEmpty>
          ) : (
            <ExecList items={alarmItems} />
          )}
        </ExecPanel>
        <ExecPanel title="Requiere atenciÃ³n">
          {attentionItems.length === 0 && alarms.length === 0 ? (
            <ExecEmpty ok>Sin pendientes de administraciÃ³n.</ExecEmpty>
          ) : attentionItems.length === 0 ? (
            <ExecEmpty>Revise las alarmas de sensores a la izquierda.</ExecEmpty>
          ) : (
            <ExecList items={attentionItems} />
          )}
        </ExecPanel>
      </div>
    </div>
  )
}

/* â•â• Usuarios â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function NewUserForm({ onCreate, onCancel }) {
  const [form, setForm] = useState({ email: '', password: '', fullName: '', approved: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onCreate(form)
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Nombre completo
          <input type="text" value={form.fullName} onChange={set('fullName')} autoFocus />
        </label>
        <label>
          Correo
          <input type="email" value={form.email} onChange={set('email')} placeholder="usuario@empresa.com" />
        </label>
      </div>
      <div className="two-col">
        <label>
          ContraseÃ±a temporal
          <input type="text" value={form.password} onChange={set('password')} placeholder="MÃ­nimo 6 caracteres" />
        </label>
        <label className="check-label">
          <input type="checkbox" checked={form.approved} onChange={set('approved')} />
          Aprobar de inmediato
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !form.email || form.password.length < 6}>
          {busy ? 'Creandoâ€¦' : 'Crear usuario'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function EditUserForm({ user, onSave, onCancel }) {
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    await onSave(user.id, { full_name: fullName.trim(), phone: phone.trim() || null })
    setBusy(false)
    onCancel()
  }

  return (
    <div className="inline-form compact">
      <div className="two-col">
        <label>
          Nombre completo
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </label>
        <label>
          TelÃ©fono
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
        </label>
      </div>
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy}>
          {busy ? 'Guardandoâ€¦' : 'Guardar'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* AsignaciÃ³n de empresa y rol por usuario: esto define sus permisos y funcionalidades */
function UserRoleAssign({ user, admin }) {
  const memberships = admin.members.filter(
    (m) => m.user_id === user.id && m.role !== 'developer'
  )
  const available = admin.tenantMode
    ? [] // en empresa: solo su org; si no tiene membership se asigna abajo
    : admin.orgs.filter((o) => !memberships.some((m) => m.org_id === o.id))
  const [pickOrg, setPickOrg] = useState(admin.tenantMode ? admin.scopeOrgId || '' : '')
  const [pickRole, setPickRole] = useState('operator')
  const [pickArea, setPickArea] = useState('plant')
  const [busy, setBusy] = useState(false)

  const assign = async () => {
    const orgId = admin.tenantMode ? admin.scopeOrgId : pickOrg
    if (!orgId) return
    setBusy(true)
    await admin.addMember(
      orgId,
      user.id,
      pickRole,
      roleNeedsArea(pickRole) ? pickArea || 'plant' : null
    )
    setBusy(false)
    if (!admin.tenantMode) setPickOrg('')
  }

  const needsAssign =
    admin.tenantMode && !memberships.some((m) => m.org_id === admin.scopeOrgId)

  return (
    <div className="role-assign">
      <p className="hint" style={{ margin: '0 0 6px' }}>
        {admin.tenantMode
          ? 'Asigne el rol del personal dentro de esta empresa. No se puede usar el rol de desarrollador (solo CDH Maker).'
          : 'Multi-tenant: puedes asignar el mismo usuario a una o varias empresas con roles distintos. No asignes roles de desarrollo a personal de clientes.'}
      </p>
      {memberships.length === 0 && (
        <p className="hint" style={{ margin: '0 0 4px' }}>
          Sin empresa ni rol â€” este usuario no puede operar.
        </p>
      )}
      {memberships.map((m) => (
        <MemberEditRow
          key={m.org_id}
          orgId={m.org_id}
          member={m}
          user={user}
          admin={admin}
          showOrgName={!admin.tenantMode}
        />
      ))}
      {(available.length > 0 || needsAssign) && (
        <div className="admin-row compact add-member" style={{ margin: 0, flexWrap: 'wrap', gap: 6 }}>
          {!admin.tenantMode && (
            <select value={pickOrg} onChange={(e) => setPickOrg(e.target.value)}>
              <option value="">Asignar a empresaâ€¦</option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <RoleSelect value={pickRole} onChange={(e) => setPickRole(e.target.value)} />
          {roleNeedsArea(pickRole) && (
            <AreaSelect value={pickArea} onChange={(e) => setPickArea(e.target.value)} />
          )}
          <button
            className="primary small"
            disabled={
              busy ||
              (roleNeedsArea(pickRole) && !pickArea) ||
              (!admin.tenantMode && !pickOrg)
            }
            onClick={assign}
          >
            {busy ? 'Guardandoâ€¦' : admin.tenantMode ? 'Asignar a la empresa' : 'Asignar y guardar'}
          </button>
        </div>
      )}
    </div>
  )
}

function UsersSection({ admin, myId }) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [roleId, setRoleId] = useState(null)
  const lc = useListControls(admin.users, (u, q) =>
    [u.email, u.full_name, u.phone].some((v) => v?.toLowerCase().includes(q))
  )

  const onDelete = async (u) => {
    const msg = admin.tenantMode
      ? `Â¿Quitar a "${u.email}" de la empresa? No se borra la cuenta global.`
      : `Â¿Eliminar la cuenta de "${u.email}"? Se borrarÃ¡n sus membresÃ­as. Esta acciÃ³n no se puede deshacer.`
    if (!window.confirm(msg)) return
    await admin.deleteUser(u.id)
  }

  return (
    <>
      <div className="admin-section-head">
        <p className="hint" style={{ margin: 0 }}>
          {admin.users.length} usuario{admin.users.length === 1 ? '' : 's'}{' '}
          {admin.tenantMode ? 'en la empresa' : `registrado${admin.users.length === 1 ? '' : 's'}`}
        </p>
        {!showForm && (
          <button className="chip ghost" onClick={() => setShowForm(true)}>
            + Crear usuario
          </button>
        )}
      </div>
      {showForm && <NewUserForm onCreate={admin.createUser} onCancel={() => setShowForm(false)} />}
      <ListControls lc={lc} placeholder="Buscar por nombre, correo o telÃ©fonoâ€¦" />

      <div className="admin-list">
        {lc.visible.map((u) => {
          const isMe = u.id === myId
          const memberships = admin.members.filter(
            (m) => m.user_id === u.id && m.role !== 'developer'
          )
          const roleLabels = memberships
            .map((m) => {
              const orgN = admin.orgs.find((o) => o.id === m.org_id)?.name ?? 'â€”'
              const areaN =
                m.role === 'coordinator' && m.area
                  ? WORK_AREAS.find((a) => a.value === m.area)?.label || m.area
                  : null
              return admin.tenantMode
                ? `${roleLabel(m.role)}${areaN ? ` Â· ${areaN}` : ''}`
                : `${orgN}: ${roleLabel(m.role)}${areaN ? ` Â· ${areaN}` : ''}`
            })
            .join(' Â· ')
          const needsRole = u.is_approved && memberships.length === 0 && u.platform_role !== 'admin'
          const roleOpen = roleId === u.id || needsRole
          return (
            <div key={u.id} className="admin-card">
              <div className={`admin-row${u.is_approved ? '' : ' pending'}`}>
                <div className="admin-row-main">
                  <strong>{u.full_name || '(sin nombre)'}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {u.email}{u.phone ? ` Â· ${u.phone}` : ''}
                    {roleLabels ? ` Â· ðŸ·ï¸ ${roleLabels}` : ''}
                  </span>
                </div>
                {!admin.tenantMode && u.platform_role === 'admin' && (
                  <span className="pill role">Admin plataforma</span>
                )}
                {!u.is_approved && <span className="pill status warn">Pendiente</span>}
                {u.is_approved && u.platform_role !== 'admin' && memberships.length === 0 && (
                  <span className="pill status warn">Sin rol</span>
                )}
                {u.is_approved && memberships.length > 0 && (
                  <span className="pill status ok">Aprobado</span>
                )}
                <span className="admin-row-actions">
                  {!needsRole && (
                    <button className="ghost" onClick={() => setRoleId(roleId === u.id ? null : u.id)}>
                      {roleId === u.id ? 'â–¾' : 'â–¸'} Rol
                    </button>
                  )}
                  <button className="ghost" onClick={() => setEditId(editId === u.id ? null : u.id)}>
                    Editar
                  </button>
                  {!isMe && (
                    <>
                      {u.is_approved ? (
                        <button className="ghost" onClick={() => admin.setUserAccess(u.id, { approved: false })}>
                          Revocar
                        </button>
                      ) : (
                        <button className="primary small" onClick={() => admin.setUserAccess(u.id, { approved: true })}>
                          Aprobar
                        </button>
                      )}
                      <button className="ghost danger" onClick={() => onDelete(u)}>
                        {admin.tenantMode ? 'Quitar' : 'Eliminar'}
                      </button>
                    </>
                  )}
                  {isMe && <span className="hint" style={{ margin: 0 }}>(tÃº)</span>}
                </span>
              </div>
              {roleOpen && <UserRoleAssign user={u} admin={admin} />}
              {editId === u.id && (
                <EditUserForm user={u} onSave={admin.updateProfile} onCancel={() => setEditId(null)} />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* â•â• Empresas â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function OrgForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [nit, setNit] = useState(initial?.nit ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const isEdit = Boolean(initial)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onSubmit({ name: name.trim(), slug: slug || slugify(name), nit: nit.trim() || null })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Nombre de la empresa
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!isEdit) setSlug(slugify(e.target.value))
            }}
            autoFocus
          />
        </label>
        <label>
          Identificador (URL)
          <input type="text" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} disabled={isEdit} />
        </label>
      </div>
      <label>
        NIT (opcional)
        <input type="text" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900123456-7" />
      </label>
      {!isEdit && (
        <p className="hint" style={{ margin: '0 0 8px' }}>
          Se aplicarÃ¡ la <strong>estructura base</strong> del producto (menÃº, mÃ³dulos y roles
          sugeridos). Luego elija la compaÃ±Ã­a en la barra superior para construirla o editarla.
        </p>
      )}
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || name.trim().length < 2}>
          {busy ? 'Guardandoâ€¦' : submitLabel}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** Fila de miembro con borrador local + Â«Guardar cambiosÂ» (rol + Ã¡rea logistics, etc.) */
function MemberEditRow({ orgId, member, user, admin, showOrgName = false }) {
  const [role, setRole] = useState(member.role)
  const [area, setArea] = useState(member.area || 'plant')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const orgName = admin.orgs?.find((o) => o.id === orgId)?.name

  // Sincronizar si recarga admin
  useEffect(() => {
    setRole(member.role)
    setArea(member.area || 'plant')
    setMsg(null)
  }, [member.role, member.area, member.user_id, orgId])

  const dirty =
    role !== member.role ||
    (roleNeedsArea(role)
      ? (area || 'plant') !== (member.area || 'plant')
      : !!(member.area && roleNeedsArea(member.role)))

  const needsArea = roleNeedsArea(role)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const { error } = await admin.saveMember(orgId, member.user_id, {
      role,
      area: needsArea ? area || 'plant' : null,
    })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error })
    else setMsg({ kind: 'ok', text: 'Cambios guardados' })
  }

  const title = showOrgName
    ? orgName || 'Empresa'
    : user?.full_name || user?.email || member.user_id
  const sub = showOrgName
    ? user?.full_name || user?.email || ''
    : user?.email || ''

  return (
    <div className="admin-row compact member-edit-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      <div className="admin-row-main" style={{ minWidth: 140 }}>
        <strong>{title}</strong>
        <span className="hint" style={{ margin: 0 }}>
          {sub}
          {member.role === 'coordinator' && member.area
            ? ` Â· actual: ${WORK_AREAS.find((a) => a.value === member.area)?.label || member.area}`
            : ''}
        </span>
      </div>
      <RoleSelect
        value={role}
        onChange={(e) => {
          const r = e.target.value
          setRole(r)
          if (r === 'coordinator' && !area) setArea('plant')
          setMsg(null)
        }}
      />
      {needsArea && (
        <AreaSelect
          value={area}
          onChange={(e) => {
            setArea(e.target.value)
            setMsg(null)
          }}
        />
      )}
      <button
        type="button"
        className="primary small"
        disabled={!dirty || busy || (needsArea && !area)}
        onClick={save}
        title="Guarda rol y Ã¡rea juntos (incluye LogÃ­stica)"
      >
        {busy ? 'Guardandoâ€¦' : 'Guardar cambios'}
      </button>
      <button
        type="button"
        className="ghost danger"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              `Â¿Quitar a ${user?.full_name || user?.email} de esta empresa?`
            )
          ) {
            admin.removeMember(orgId, member.user_id)
          }
        }}
      >
        Quitar
      </button>
      {msg && (
        <p className={`msg ${msg.kind === 'error' ? 'error' : 'ok'}`} style={{ width: '100%', margin: '4px 0 0' }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}

function OrgMembers({ org, admin }) {
  const rows = admin.members.filter((m) => m.org_id === org.id)
  const userOf = (id) => admin.users.find((u) => u.id === id)
  const available = admin.users.filter((u) => u.is_approved && !rows.some((m) => m.user_id === u.id))
  const [pick, setPick] = useState('')
  const [role, setRole] = useState('viewer')
  const [area, setArea] = useState('plant')
  const [busyAdd, setBusyAdd] = useState(false)
  const [addErr, setAddErr] = useState(null)

  const leaders = rows.filter((m) => m.role === 'coordinator')

  const add = async () => {
    if (!pick) return
    setBusyAdd(true)
    setAddErr(null)
    const { error } = await admin.addMember(
      org.id,
      pick,
      role,
      roleNeedsArea(role) ? area || 'plant' : null
    )
    setBusyAdd(false)
    if (error) setAddErr(error)
    else setPick('')
  }

  return (
    <div className="org-members">
      <p className="hint" style={{ margin: '0 10px 10px' }}>
        Elige rol y Ã¡rea (ej. <strong>LÃ­der de Ã¡rea Â· LogÃ­stica</strong>) y pulsa{' '}
        <strong>Guardar cambios</strong>. No se aplica hasta guardar. Requiere migraciÃ³n SQL{' '}
        <code>work_area</code> si el servidor rechaza &quot;logistics&quot;.
      </p>
      {leaders.length > 0 && (
        <div className="tool-card" style={{ margin: '0 10px 12px', padding: 10 }}>
          <strong style={{ fontSize: 13 }}>LÃ­deres de Ã¡rea en esta empresa</strong>
          <ul className="hint" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {leaders.map((m) => {
              const u = userOf(m.user_id)
              const a = WORK_AREAS.find((x) => x.value === m.area)
              return (
                <li key={m.user_id}>
                  {u?.full_name || u?.email || m.user_id}
                  {' Â· '}
                  <strong>{a?.label || m.area || 'sin Ã¡rea'}</strong>
                  {!m.area && (
                    <span style={{ color: 'var(--danger)' }}> â€” asigna Ã¡rea y guarda</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {rows.length === 0 && <p className="hint" style={{ margin: '0 10px 8px' }}>Sin miembros.</p>}
      {rows.map((m) => (
        <MemberEditRow
          key={m.user_id}
          orgId={org.id}
          member={m}
          user={userOf(m.user_id)}
          admin={admin}
        />
      ))}
      {available.length > 0 && (
        <div className="admin-row compact add-member" style={{ flexWrap: 'wrap', gap: 6 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Agregar usuarioâ€¦</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
          <RoleSelect
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              if (e.target.value === 'coordinator' && !area) setArea('plant')
            }}
          />
          {roleNeedsArea(role) && (
            <AreaSelect value={area} onChange={(e) => setArea(e.target.value)} />
          )}
          <button
            className="primary small"
            disabled={!pick || busyAdd || (roleNeedsArea(role) && !area)}
            onClick={add}
          >
            {busyAdd ? 'Guardandoâ€¦' : 'Agregar y guardar'}
          </button>
          {addErr && <p className="msg error" style={{ width: '100%' }}>{addErr}</p>}
        </div>
      )}
    </div>
  )
}

function OrgsSection({ admin }) {
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [editId, setEditId] = useState(null)
  const lc = useListControls(admin.orgs, (o, q) =>
    [o.name, o.slug, o.nit].some((v) => v?.toLowerCase().includes(q))
  )

  const onDelete = async (o) => {
    const nPlants = admin.plants.filter((p) => p.org_id === o.id).length
    if (!window.confirm(`Â¿Eliminar la empresa "${o.name}"? Se borrarÃ¡n sus ${nPlants} planta(s) y todos sus datos. Irreversible.`)) return
    await admin.deleteOrg(o.id)
  }

  return (
    <>
      <div className="admin-section-head">
        <p className="hint" style={{ margin: 0 }}>
          {admin.orgs.length} empresa{admin.orgs.length === 1 ? '' : 's'}
        </p>
        {!showForm && (
          <button className="chip ghost" onClick={() => setShowForm(true)}>
            + Crear empresa
          </button>
        )}
      </div>
      {showForm && (
        <OrgForm onSubmit={admin.createOrg} onCancel={() => setShowForm(false)} submitLabel="Crear empresa" />
      )}
      <ListControls lc={lc} placeholder="Buscar por nombre, identificador o NITâ€¦" />

      <div className="admin-list">
        {lc.visible.map((o) => {
          const nMembers = admin.members.filter((m) => m.org_id === o.id).length
          const nPlants = admin.plants.filter((p) => p.org_id === o.id).length
          const open = openId === o.id
          return (
            <div key={o.id} className="admin-card">
              <div className="admin-row">
                <div className="admin-row-main">
                  <strong>{o.name}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {o.slug}{o.nit ? ` Â· NIT ${o.nit}` : ''} Â· {nMembers} miembro(s) Â· {nPlants} planta(s)
                  </span>
                </div>
                <span className="admin-row-actions">
                  <button className="ghost" onClick={() => setEditId(editId === o.id ? null : o.id)}>
                    Editar
                  </button>
                  <button className="ghost" onClick={() => setOpenId(open ? null : o.id)}>
                    {open ? 'â–¾ Miembros' : 'â–¸ Miembros'}
                  </button>
                  <button className="ghost danger" onClick={() => onDelete(o)}>
                    Eliminar
                  </button>
                </span>
              </div>
              {editId === o.id && (
                <OrgForm
                  initial={o}
                  onSubmit={(patch) => admin.updateOrg(o.id, { name: patch.name, nit: patch.nit })}
                  onCancel={() => setEditId(null)}
                  submitLabel="Guardar cambios"
                />
              )}
              {open && <OrgMembers org={o} admin={admin} />}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* â•â• Plantas y componentes â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function PlantForm({ orgs, initial, onSubmit, onCancel, submitLabel }) {
  const [form, setForm] = useState({
    orgId: initial?.org_id ?? orgs[0]?.id ?? '',
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    city: initial?.city ?? '',
    status: initial?.status ?? 'active',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isEdit = Boolean(initial)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onSubmit(form)
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Empresa
          <select value={form.orgId} onChange={set('orgId')} disabled={isEdit}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label>
          Nombre de la planta
          <input type="text" value={form.name} onChange={set('name')} autoFocus />
        </label>
      </div>
      <div className="two-col">
        <label>
          CÃ³digo
          <input type="text" value={form.code} onChange={set('code')} placeholder="Ej. PLN" />
        </label>
        <label>
          Ciudad
          <input type="text" value={form.city} onChange={set('city')} />
        </label>
      </div>
      {isEdit && (
        <label>
          Estado
          <select value={form.status} onChange={set('status')}>
            {PLANT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      )}
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !form.orgId || form.name.trim().length < 2}>
          {busy ? 'Guardandoâ€¦' : submitLabel}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function EditRoomInline({ room, onSave, onCancel }) {
  const [name, setName] = useState(room.name)
  const [code, setCode] = useState(room.code)
  const [type, setType] = useState(room.type)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    await onSave(room.id, { name: name.trim(), code: code.trim(), type })
    setBusy(false)
    onCancel()
  }

  return (
    <div className="inline-form compact" style={{ margin: '0 10px 8px' }}>
      <div className="two-col">
        <label>
          Nombre
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          CÃ³digo
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
      </div>
      <label>
        Tipo
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(ROOM_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy || name.trim().length < 2}>
          {busy ? 'Guardandoâ€¦' : 'Guardar'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function PlantComponents({ plant, admin }) {
  const rooms = admin.rooms.filter((r) => r.plant_id === plant.id)
  const machines = admin.machines.filter((m) => m.plant_id === plant.id)
  const roomName = (id) => rooms.find((r) => r.id === id)?.name ?? 'Sin sala'
  const [editRoomId, setEditRoomId] = useState(null)

  const delRoom = async (r) => {
    if (!window.confirm(`Â¿Eliminar la sala "${r.name}"?`)) return
    await admin.deleteRoom(r.id)
  }
  const delMachine = async (m) => {
    if (!window.confirm(`Â¿Eliminar la mÃ¡quina "${m.name}" (${m.code})?`)) return
    await admin.deleteMachine(m.id)
  }

  return (
    <div className="org-members">
      <p className="component-title">Salas ({rooms.length})</p>
      {rooms.length === 0 && <p className="hint" style={{ margin: '0 10px 8px' }}>Sin salas.</p>}
      {rooms.map((r) => (
        <div key={r.id}>
          <div className="admin-row compact">
            <div className="admin-row-main">
              <strong>{r.name}</strong>
              <span className="hint" style={{ margin: 0 }}>
                {r.code} Â· {ROOM_TYPE_LABEL[r.type] ?? r.type}
              </span>
            </div>
            <button className="ghost" onClick={() => setEditRoomId(editRoomId === r.id ? null : r.id)}>
              Editar
            </button>
            <button className="ghost danger" onClick={() => delRoom(r)}>
              Eliminar
            </button>
          </div>
          {editRoomId === r.id && (
            <EditRoomInline room={r} onSave={admin.updateRoom} onCancel={() => setEditRoomId(null)} />
          )}
        </div>
      ))}

      <p className="component-title">MÃ¡quinas ({machines.length})</p>
      {machines.length === 0 && <p className="hint" style={{ margin: '0 10px 8px' }}>Sin mÃ¡quinas.</p>}
      {machines.map((m) => (
        <div key={m.id} className="admin-row compact">
          <div className="admin-row-main">
            <strong>{m.name}</strong>
            <span className="hint" style={{ margin: 0 }}>
              {m.code} Â· {MACHINE_TYPE_LABEL[m.type] ?? m.type} Â· {roomName(m.room_id)}
            </span>
          </div>
          <button className="ghost danger" onClick={() => delMachine(m)}>
            Eliminar
          </button>
        </div>
      ))}
      <p className="hint" style={{ margin: '4px 10px 8px' }}>
        Para crear salas, mÃ¡quinas y sensores usa la pestaÃ±a <strong>Plantas</strong> del workspace.
      </p>
    </div>
  )
}

function PlantsSection({ admin }) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const orgName = (id) => admin.orgs.find((o) => o.id === id)?.name ?? 'â€”'
  
  const realPlants = admin.plants.filter((p) => !(p.code?.startsWith('G') || p.name?.startsWith('G-')))
  const lc = useListControls(realPlants, (p, q) =>
    [p.name, p.code, p.city, orgName(p.org_id)].some((v) => v?.toLowerCase().includes(q))
  )

  const onDelete = async (p) => {
    if (!window.confirm(`Â¿Eliminar la planta "${p.name}"? Se borrarÃ¡n sus salas, mÃ¡quinas y sensores. Irreversible.`)) return
    await admin.deletePlant(p.id)
  }

  return (
    <>
      <div className="admin-section-head">
        <p className="hint" style={{ margin: 0 }}>
          {realPlants.length} planta{realPlants.length === 1 ? '' : 's'} en total
        </p>
        {!showForm && admin.orgs.length > 0 && (
          <button className="chip ghost" onClick={() => setShowForm(true)}>
            + Crear planta
          </button>
        )}
      </div>
      {showForm && (
        <PlantForm orgs={admin.orgs} onSubmit={admin.createPlant} onCancel={() => setShowForm(false)} submitLabel="Crear planta" />
      )}
      <ListControls lc={lc} placeholder="Buscar por planta, cÃ³digo, ciudad o empresaâ€¦" />

      <div className="admin-list">
        {lc.visible.map((p) => {
          const nRooms = admin.rooms.filter((r) => r.plant_id === p.id).length
          const nMachines = admin.machines.filter((m) => m.plant_id === p.id).length
          const open = openId === p.id
          return (
            <div key={p.id} className="admin-card">
              <div className="admin-row">
                <div className="admin-row-main">
                  <strong>{p.name}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {p.code} Â· {orgName(p.org_id)}{p.city ? ` Â· ${p.city}` : ''} Â· {nRooms} sala(s) Â· {nMachines} mÃ¡quina(s)
                  </span>
                </div>
                {p.status !== 'active' && <span className="pill status idle">Inactiva</span>}
                <span className="admin-row-actions">
                  <button className="ghost" onClick={() => setEditId(editId === p.id ? null : p.id)}>
                    Editar
                  </button>
                  <button className="ghost" onClick={() => setOpenId(open ? null : p.id)}>
                    {open ? 'â–¾ Componentes' : 'â–¸ Componentes'}
                  </button>
                  <button className="ghost danger" onClick={() => onDelete(p)}>
                    Eliminar
                  </button>
                </span>
              </div>
              {editId === p.id && (
                <PlantForm
                  orgs={admin.orgs}
                  initial={p}
                  onSubmit={(f) =>
                    admin.updatePlant(p.id, {
                      name: f.name.trim(),
                      code: f.code?.trim() || p.code,
                      city: f.city?.trim() || null,
                      status: f.status,
                    })
                  }
                  onCancel={() => setEditId(null)}
                  submitLabel="Guardar cambios"
                />
              )}
              {open && <PlantComponents plant={p} admin={admin} />}
            </div>
          )
        })}
      </div>
    </>
  )
}

function FarmsSection({ admin }) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const orgName = (id) => admin.orgs.find((o) => o.id === id)?.name ?? 'â€”'
  
  const realFarms = admin.plants.filter((p) => p.code?.startsWith('G') || p.name?.startsWith('G-'))
  const lc = useListControls(realFarms, (p, q) =>
    [p.name, p.code, p.city, orgName(p.org_id)].some((v) => v?.toLowerCase().includes(q))
  )

  const onDelete = async (p) => {
    if (!window.confirm(`Â¿Eliminar la granja "${p.name}"? Se borrarÃ¡n sus mÃ³dulos y galpones. Irreversible.`)) return
    await admin.deletePlant(p.id)
  }

  const createFarm = async (form) => {
    // Prefix 'G-' for farms
    return admin.createPlant({ ...form, name: `G-${form.name.replace(/^G-\s*/i, '')}` })
  }

  return (
    <>
      <div className="admin-section-head">
        <p className="hint" style={{ margin: 0 }}>
          {realFarms.length} granja{realFarms.length === 1 ? '' : 's'} en total
        </p>
        {!showForm && admin.orgs.length > 0 && (
          <button className="chip ghost" onClick={() => setShowForm(true)}>
            + Crear granja
          </button>
        )}
      </div>
      {showForm && (
        <PlantForm orgs={admin.orgs} onSubmit={createFarm} onCancel={() => setShowForm(false)} submitLabel="Crear granja" />
      )}
      <ListControls lc={lc} placeholder="Buscar por granja, cÃ³digo, ciudad o empresaâ€¦" />

      <div className="admin-list">
        {lc.visible.map((p) => {
          const nRooms = admin.rooms.filter((r) => r.plant_id === p.id).length
          const nMachines = admin.machines.filter((m) => m.plant_id === p.id).length
          const open = openId === p.id
          return (
            <div key={p.id} className="admin-card">
              <div className="admin-row">
                <div className="admin-row-main">
                  <strong>{p.name}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {p.code} Â· {orgName(p.org_id)}{p.city ? ` Â· ${p.city}` : ''} Â· {nRooms} mÃ³dulo(s) Â· {nMachines} galpÃ³n/equipo(s)
                  </span>
                </div>
                {p.status !== 'active' && <span className="pill status idle">Inactiva</span>}
                <span className="admin-row-actions">
                  <button className="ghost" onClick={() => setEditId(editId === p.id ? null : p.id)}>
                    Editar
                  </button>
                  <button className="ghost" onClick={() => setOpenId(open ? null : p.id)}>
                    {open ? 'â–¾ Componentes' : 'â–¸ Componentes'}
                  </button>
                  <button className="ghost danger" onClick={() => onDelete(p)}>
                    Eliminar
                  </button>
                </span>
              </div>
              {editId === p.id && (
                <PlantForm
                  orgs={admin.orgs}
                  initial={p}
                  onSubmit={(f) =>
                    admin.updatePlant(p.id, {
                      name: f.name.trim(),
                      code: f.code?.trim() || p.code,
                      city: f.city?.trim() || null,
                      status: f.status,
                    })
                  }
                  onCancel={() => setEditId(null)}
                  submitLabel="Guardar cambios"
                />
              )}
              {open && <PlantComponents plant={p} admin={admin} />}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* â•â• Panel principal â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/**
 * @param {{ myId: string, orgId?: string|null, orgName?: string, mode?: 'platform'|'tenant' }} props
 * mode tenant = admin de la licencia de la empresa (coordinadores / gerencia): mismas herramientas, solo su org.
 */
export default function AdminDashboard({ myId, orgId = null, orgName = null, mode = 'platform' }) {
  const tenantMode = mode === 'tenant' && !!orgId
  const admin = useAdmin(tenantMode ? { enabled: true, orgId } : true)
  const [section, setSection] = useState('resumen')
  const pendientes = admin.users.filter((u) => !u.is_approved).length

  // Si en tenant alguien quedÃ³ en pestaÃ±a oculta, volver a resumen
  useEffect(() => {
    if (!tenantMode) return
    if (['empresas', 'datos'].includes(section)) setSection('resumen')
  }, [tenantMode, section])

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>
            {tenantMode
              ? `AdministraciÃ³n Â· ${orgName || admin.orgs[0]?.name || 'Empresa'}`
              : 'AdministraciÃ³n CDH Maker'}
          </h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {tenantMode
              ? 'AdministraciÃ³n de la licencia en su empresa: usuarios, plantas, granjas y operaciÃ³n. Sin herramientas de desarrollo ni otras empresas.'
              : 'Plataforma multi-empresa Â· usuarios, sedes y salud operativa'}
          </p>
        </div>
        {pendientes > 0 && <span className="pill status warn">{pendientes} por aprobar</span>}
      </div>

      <div className="tabs" role="tablist">
        <button className={section === 'resumen' ? 'tab active' : 'tab'} onClick={() => setSection('resumen')}>
          Resumen
        </button>
        <button className={section === 'usuarios' ? 'tab active' : 'tab'} onClick={() => setSection('usuarios')}>
          Usuarios
        </button>
        {!tenantMode && (
          <button className={section === 'empresas' ? 'tab active' : 'tab'} onClick={() => setSection('empresas')}>
            Empresas
          </button>
        )}
        <button className={section === 'plantas' ? 'tab active' : 'tab'} onClick={() => setSection('plantas')}>
          Plantas
        </button>
        <button className={section === 'granjas' ? 'tab active' : 'tab'} onClick={() => setSection('granjas')}>
          Granjas
        </button>
        {!tenantMode && (
          <button className={section === 'datos' ? 'tab active' : 'tab'} onClick={() => setSection('datos')}>
            ðŸ›  Datos
          </button>
        )}
      </div>

      {admin.error && <p className="msg error">{admin.error}</p>}
      {admin.loading ? (
        <p className="hint">Cargandoâ€¦</p>
      ) : section === 'resumen' ? (
        <OverviewSection admin={admin} />
      ) : section === 'usuarios' ? (
        <UsersSection admin={admin} myId={myId} />
      ) : section === 'empresas' && !tenantMode ? (
        <OrgsSection admin={admin} />
      ) : section === 'plantas' ? (
        <PlantsSection admin={admin} />
      ) : section === 'datos' && !tenantMode ? (
        <DataFixPanel orgs={admin.orgs} />
      ) : (
        <FarmsSection admin={admin} />
      )}
    </div>
  )
}

