/**
 * Cumplimiento esperado vs reportado, rondas de turno y elegibilidad de bono.
 * Supabase + fallback local.
 * Henry Stark Desarrollador
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  BONUS_FUND_NOTE,
  BONUS_MIN_CONTINUOUS_DAYS,
  BONUS_MIN_SCORE_PCT,
  DEFAULT_MIN_ROUNDS_PER_SHIFT,
  bogotaDate,
  computeComplianceScore,
  defaultTargetsForRole,
  isShiftWorkerRole,
  touchUsageStreak,
} from '../lib/complianceEngine'
import {
  localGetUsage,
  localInsertLabor,
  localInsertRound,
  localListLabors,
  localListRounds,
  localListTargets,
  localSetUsage,
  localUpsertTarget,
} from '../lib/performanceLocalStore'

export function usePerformance({ orgId, userId, role, area }) {
  const [targets, setTargets] = useState([])
  const [rounds, setRounds] = useState([])
  const [labors, setLabors] = useState([])
  const [members, setMembers] = useState([])
  const [usageMap, setUsageMap] = useState({})
  const [attendanceToday, setAttendanceToday] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const isCoord =
    role === 'coordinator' ||
    role === 'supervisor' ||
    role === 'management' ||
    role === 'management_auxiliary' ||
    role === 'developer'

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }
    setLoading(true)

    const memP = supabase
      .from('organization_members')
      .select('user_id, role, area, created_at, profiles ( id, full_name, email )')
      .eq('org_id', orgId)

    const tgtP = supabase
      .from('performance_targets')
      .select(
        'id, org_id, labor_key, label, expected, unit, role, user_id, shift_code, active, created_by, updated_at'
      )
      .eq('org_id', orgId)
      .eq('active', true)

    const since = daysAgo(90)

    const rndP = supabase
      .from('round_reports')
      .select(
        'id, org_id, user_id, shift_date, shift_code, title, body, plant_id, room_id, lat, lng, created_at'
      )
      .eq('org_id', orgId)
      .gte('shift_date', since)
      .order('created_at', { ascending: false })
      .limit(2000)

    const labP = supabase
      .from('labor_completions')
      .select(
        'id, org_id, user_id, labor_key, qty, success, note, shift_date, created_at'
      )
      .eq('org_id', orgId)
      .gte('shift_date', since)
      .order('created_at', { ascending: false })
      .limit(2000)

    const useP = supabase
      .from('user_usage_streaks')
      .select(
        'user_id, first_active_date, last_active_date, continuous_days, total_active_days, updated_at'
      )
      .eq('org_id', orgId)

    const attP = supabase
      .from('attendance_punches')
      .select('id, user_id, punch_type, punched_at, shift_date, photo_path')
      .eq('org_id', orgId)
      .gte('shift_date', since)
      .order('punched_at', { ascending: false })
      .limit(3000)

    const [mem, tgt, rnd, lab, use, att] = await Promise.all([
      memP,
      tgtP,
      rndP,
      labP,
      useP,
      attP,
    ])

    if (!mem.error) {
      setMembers(
        (mem.data ?? []).map((r) => ({
          id: r.user_id,
          role: r.role,
          area: r.area,
          joinedAt: r.created_at,
          name: r.profiles?.full_name || r.profiles?.email || 'Usuario',
        }))
      )
    }

    const cloudFail =
      tgt.error || rnd.error || lab.error || use.error
        ? /does not exist|schema cache|Could not find|relation/i.test(
            [tgt.error, rnd.error, lab.error, use.error]
              .filter(Boolean)
              .map((e) => e.message)
              .join(' ')
          )
        : false

    if (cloudFail || tgt.error || rnd.error) {
      setTableMissing(cloudFail)
      setLocalMode(true)
      setError(cloudFail ? null : tgt.error?.message || rnd.error?.message || null)
      setTargets(localListTargets(orgId))
      setRounds(localListRounds(orgId))
      setLabors(localListLabors(orgId))
      // usage map local
      const um = {}
      for (const m of mem.data ?? []) {
        const u = localGetUsage(orgId, m.user_id)
        if (u) um[m.user_id] = u
      }
      if (userId) {
        const mine = localGetUsage(orgId, userId)
        if (mine) um[userId] = mine
      }
      setUsageMap(um)
    } else {
      setTableMissing(false)
      setLocalMode(false)
      setError(null)
      setTargets(tgt.data ?? [])
      setRounds([
        ...(rnd.data ?? []),
        ...localListRounds(orgId).filter((r) => r._local),
      ])
      setLabors([
        ...(lab.data ?? []),
        ...localListLabors(orgId).filter((r) => r._local),
      ])
      const um = {}
      for (const u of use.data ?? []) {
        um[u.user_id] = {
          firstActiveDate: u.first_active_date,
          lastActiveDate: u.last_active_date,
          continuousDays: u.continuous_days,
          totalActiveDays: u.total_active_days,
        }
      }
      // merge local leftovers
      if (userId && !um[userId]) {
        const mine = localGetUsage(orgId, userId)
        if (mine) um[userId] = mine
      }
      setUsageMap(um)
    }

    if (!att.error) setAttendanceToday(att.data ?? [])
    else setAttendanceToday([])

    setLoading(false)
  }, [orgId, userId])

  useEffect(() => {
    load()
  }, [load])

  /** Marca uso del día (racha continua) — llamar al entrar al workspace */
  const touchUsage = useCallback(async () => {
    if (!orgId || !userId) return null
    const prev = usageMap[userId] || localGetUsage(orgId, userId)
    const next = touchUsageStreak(prev)
    localSetUsage(orgId, userId, next)
    setUsageMap((m) => ({ ...m, [userId]: next }))

    if (!localMode && !tableMissing) {
      await supabase.from('user_usage_streaks').upsert(
        {
          org_id: orgId,
          user_id: userId,
          first_active_date: next.firstActiveDate,
          last_active_date: next.lastActiveDate,
          continuous_days: next.continuousDays,
          total_active_days: next.totalActiveDays,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,user_id' }
      )
    }
    return next
  }, [orgId, userId, usageMap, localMode, tableMissing])

  useEffect(() => {
    if (orgId && userId) touchUsage()
    // solo al montar / cambiar usuario
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId])

  const saveTarget = useCallback(
    async ({ laborKey, label, expected, unit, forRole = null, forUserId = null }) => {
      if (!orgId || !userId) return { error: 'Sin sesión' }
      if (!laborKey) return { error: 'Labor obligatoria' }
      const row = {
        org_id: orgId,
        labor_key: laborKey,
        label: label || laborKey,
        expected: Number(expected) || 0,
        unit: unit || '',
        role: forRole || null,
        user_id: forUserId || null,
        active: true,
        created_by: userId,
        updated_at: new Date().toISOString(),
      }

      if (localMode || tableMissing) {
        localUpsertTarget(orgId, row)
        await load()
        return { error: null, local: true }
      }

      let q = supabase
        .from('performance_targets')
        .select('id')
        .eq('org_id', orgId)
        .eq('labor_key', laborKey)
        .eq('active', true)
      q = forUserId ? q.eq('user_id', forUserId) : q.is('user_id', null)
      q = forRole ? q.eq('role', forRole) : q.is('role', null)
      const { data: existing } = await q.maybeSingle()

      let err
      if (existing?.id) {
        ;({ error: err } = await supabase
          .from('performance_targets')
          .update(row)
          .eq('id', existing.id))
      } else {
        ;({ error: err } = await supabase.from('performance_targets').insert(row))
      }
      if (err) {
        localUpsertTarget(orgId, row)
        setLocalMode(true)
        await load()
        return { error: null, local: true, warn: err.message }
      }
      await load()
      return { error: null }
    },
    [orgId, userId, localMode, tableMissing, load]
  )

  const submitRound = useCallback(
    async ({ title, body, shiftCode = 'T1', location = null }) => {
      if (!orgId || !userId) return { error: 'Sin sesión' }
      const t = (title || '').trim() || 'Ronda de turno'
      const row = {
        org_id: orgId,
        user_id: userId,
        shift_date: bogotaDate(),
        shift_code: shiftCode,
        title: t,
        body: (body || '').trim() || null,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        created_at: new Date().toISOString(),
      }

      await touchUsage()

      if (localMode || tableMissing) {
        localInsertRound(orgId, row)
        await load()
        return { error: null, local: true }
      }

      const { error: err } = await supabase.from('round_reports').insert(row)
      if (err) {
        localInsertRound(orgId, row)
        setLocalMode(true)
        await load()
        return { error: null, local: true, warn: err.message }
      }
      await load()
      return { error: null }
    },
    [orgId, userId, localMode, tableMissing, load, touchUsage]
  )

  const reportLabor = useCallback(
    async ({ laborKey, qty = 1, success = true, note = '' }) => {
      if (!orgId || !userId) return { error: 'Sin sesión' }
      const row = {
        org_id: orgId,
        user_id: userId,
        labor_key: laborKey,
        qty: Number(qty) || 1,
        success: !!success,
        note: note || null,
        shift_date: bogotaDate(),
        created_at: new Date().toISOString(),
      }
      await touchUsage()
      if (localMode || tableMissing) {
        localInsertLabor(orgId, row)
        await load()
        return { error: null, local: true }
      }
      const { error: err } = await supabase.from('labor_completions').insert(row)
      if (err) {
        localInsertLabor(orgId, row)
        setLocalMode(true)
        await load()
        return { error: null, local: true }
      }
      await load()
      return { error: null }
    },
    [orgId, userId, localMode, tableMissing, load, touchUsage]
  )

  const today = bogotaDate()

  const myRoundsToday = useMemo(
    () =>
      rounds.filter(
        (r) => r.user_id === userId && String(r.shift_date || '').startsWith(today)
      ),
    [rounds, userId, today]
  )

  const myLaborsToday = useMemo(
    () =>
      labors.filter(
        (r) =>
          r.user_id === userId &&
          String(r.shift_date || '').startsWith(today) &&
          r.success !== false
      ),
    [labors, userId, today]
  )

  const myAttendanceToday = useMemo(
    () =>
      attendanceToday.filter(
        (a) =>
          a.user_id === userId &&
          (String(a.shift_date || '').startsWith(today) ||
            String(a.punched_at || '').startsWith(today))
      ),
    [attendanceToday, userId, today]
  )

  const targetsFor = useCallback(
    (r, uid) => {
      const byUser = targets.filter((t) => t.user_id === uid)
      const byRole = targets.filter((t) => !t.user_id && t.role === r)
      const global = targets.filter((t) => !t.user_id && !t.role)
      const merged = new Map()
      for (const t of [...global, ...byRole, ...byUser]) {
        merged.set(t.labor_key, {
          labor_key: t.labor_key,
          label: t.label,
          expected: Number(t.expected),
          unit: t.unit,
        })
      }
      if (!merged.size) {
        for (const t of defaultTargetsForRole(r)) {
          merged.set(t.labor_key, t)
        }
      } else if (isShiftWorkerRole(r) && !merged.has('rounds')) {
        merged.set('rounds', {
          labor_key: 'rounds',
          label: 'Reportes de ronda por turno',
          expected: DEFAULT_MIN_ROUNDS_PER_SHIFT,
          unit: 'rondas',
        })
      }
      return [...merged.values()]
    },
    [targets]
  )

  const reportedFor = useCallback(
    (uid) => {
      const rnd = rounds.filter(
        (r) => r.user_id === uid && String(r.shift_date || '').startsWith(today)
      ).length
      const labs = labors.filter(
        (r) =>
          r.user_id === uid &&
          String(r.shift_date || '').startsWith(today) &&
          r.success !== false
      )
      const labQty = labs.reduce((s, r) => s + (Number(r.qty) || 1), 0)
      const att = attendanceToday.filter(
        (a) =>
          a.user_id === uid &&
          (String(a.shift_date || '').startsWith(today) ||
            String(a.punched_at || '').startsWith(today))
      )
      const hasIn = att.some((a) => a.punch_type === 'in')
      const hasOut = att.some((a) => a.punch_type === 'out')
      // Adherencia simple: 100 si ingreso+salida, 50 si solo uno
      let adherence = 0
      if (hasIn && hasOut) adherence = 100
      else if (hasIn) adherence = 50
      else adherence = 0

      return {
        rounds: rnd,
        labors_completed: labQty,
        attendance_punches: att.length,
        shift_adherence: adherence,
        reports_sent: 0,
      }
    },
    [rounds, labors, attendanceToday, today]
  )

  const myScore = useMemo(() => {
    const tg = targetsFor(role, userId)
    const rep = reportedFor(userId)
    return computeComplianceScore({
      targets: tg,
      reported: rep,
      role,
      usage: usageMap[userId],
      periodLabel: `Hoy ${today}`,
    })
  }, [targetsFor, reportedFor, role, userId, usageMap, today])

  const teamScores = useMemo(() => {
    if (!isCoord) return []
    return members
      .map((m) => {
        const score = computeComplianceScore({
          targets: targetsFor(m.role, m.id),
          reported: reportedFor(m.id),
          role: m.role,
          usage: usageMap[m.id],
          periodLabel: today,
        })
        return { ...m, score }
      })
      .sort((a, b) => b.score.scorePct - a.score.scorePct)
  }, [isCoord, members, userId, targetsFor, reportedFor, usageMap, today])

  return {
    loading,
    error,
    localMode,
    tableMissing,
    targets,
    rounds,
    labors,
    members,
    usageMap,
    /** Historial ~90 días para analítica */
    attendanceHistory: attendanceToday,
    myRoundsToday,
    myLaborsToday,
    myAttendanceToday,
    myScore,
    teamScores,
    isCoord,
    isShiftWorker: isShiftWorkerRole(role),
    minRounds: DEFAULT_MIN_ROUNDS_PER_SHIFT,
    minDays: BONUS_MIN_CONTINUOUS_DAYS,
    minScore: BONUS_MIN_SCORE_PCT,
    fundNote: BONUS_FUND_NOTE,
    saveTarget,
    submitRound,
    reportLabor,
    touchUsage,
    reload: load,
    today,
    role,
    area,
  }
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
