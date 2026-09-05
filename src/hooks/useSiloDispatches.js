/**
 * Reportes / bandeja gerencial — Supabase + fallback local (a prueba de fallos).
 * Henry Stark Desarrollador
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/image'
import { domainsMemberOf } from '../lib/privacyScopes'
import {
  localInsertDispatch,
  localListDispatches,
  localUpdateDispatch,
} from '../lib/dispatchLocalStore'
import { isNetworkError, isOnline } from '../lib/network'
import { enqueueInsert, enqueueUpdate } from '../lib/offlineQueue'
import { cacheRead, cacheWrite } from '../lib/offlineCache'

function normalizeRow(r) {
  if (!r || typeof r !== 'object') return null
  let payload = r.payload
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = {}
    }
  }
  if (!payload || typeof payload !== 'object') payload = {}
  return {
    ...r,
    id: r.id || `tmp_${Date.now()}`,
    kind: r.kind || 'otro',
    title: r.title || '(sin título)',
    status: r.status || 'sent',
    payload,
    created_at: r.created_at || new Date().toISOString(),
  }
}

function isMissingTable(msg) {
  return /does not exist|schema cache|Could not find|relation|PGRST205|404/i.test(
    String(msg || '')
  )
}

export function useSiloDispatches({ orgId, userId, role, area }) {
  const [rows, setRows] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [localMode, setLocalMode] = useState(false)

  const myScopes = useMemo(() => {
    try {
      return domainsMemberOf(role, area).map((d) => d.id)
    } catch {
      return []
    }
  }, [role, area])

  const isGerencia =
    role === 'management' ||
    role === 'management_auxiliary' ||
    (role === 'coordinator' && area === 'management') ||
    myScopes.includes('gerencia')

  const mergeLocal = useCallback(
    (cloudList) => {
      const cloud = (cloudList || []).map(normalizeRow).filter(Boolean)
      const local = localListDispatches(orgId).map(normalizeRow).filter(Boolean)
      const ids = new Set(cloud.map((r) => r.id))
      return [...cloud, ...local.filter((r) => r._local && !ids.has(r.id))]
    },
    [orgId]
  )

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)

    try {
      const memP = supabase
        .from('organization_members')
        .select('user_id, role, area, profiles ( id, full_name, email, avatar_url )')
        .eq('org_id', orgId)

      // select * evita fallar si falta una columna concreta
      const dispP = supabase
        .from('silo_dispatches')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(400)

      const [disp, mem] = await Promise.all([dispP, memP])

      if (!mem.error && mem.data) {
        setMembers(
          (mem.data ?? []).map((r) => ({
            id: r.user_id,
            role: r.role,
            area: r.area,
            name: r.profiles?.full_name || r.profiles?.email || 'Usuario',
            email: r.profiles?.email,
            avatar: r.profiles?.avatar_url,
          }))
        )
      }

      if (disp.error) {
        const missing = isMissingTable(disp.error.message)
        const net = isNetworkError(disp.error.message)
        setTableMissing(missing)
        setLocalMode(true)
        setError(
          missing
            ? null
            : net
              ? null
              : disp.error.message
        )
        const cached = cacheRead(orgId, 'silo_dispatches')
        setRows(mergeLocal(cached?.data || []))
      } else {
        setTableMissing(false)
        setLocalMode(false)
        setError(null)
        const cloud = (disp.data ?? []).map(normalizeRow).filter(Boolean)
        cacheWrite(orgId, 'silo_dispatches', cloud)
        setRows(mergeLocal(cloud))
      }
    } catch {
      setLocalMode(true)
      setError(null)
      const cached = cacheRead(orgId, 'silo_dispatches')
      setRows(mergeLocal(cached?.data || []))
    }
    setLoading(false)
  }, [orgId, mergeLocal])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!orgId || tableMissing || localMode) return
    const ch = supabase
      .channel(`silo_dispatches:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'silo_dispatches', filter: `org_id=eq.${orgId}` },
        () => load()
      )
      .subscribe()
    return () => {
      try {
        supabase.removeChannel(ch)
      } catch {
        /* */
      }
    }
  }, [orgId, tableMissing, localMode, load])

  const send = useCallback(
    async ({
      title,
      body,
      kind = 'informe',
      recipientId = null,
      recipientScope = null,
      photoFile = null,
      location = null,
      payload = {},
      amount = null,
      currency = 'COP',
    }) => {
      if (!orgId || !userId) return { error: 'Sin sesión' }
      const t = (title || '').trim()
      if (!t) return { error: 'Título obligatorio' }
      if (!recipientId && !recipientScope) {
        return { error: 'Elige destinatario (persona o módulo)' }
      }

      let photo_path = null
      let fileName = null
      if (photoFile) {
        fileName = photoFile.name || 'adjunto'
        try {
          const file = photoFile.type?.startsWith('image/')
            ? await compressImage(photoFile, 1280, 0.72)
            : photoFile
          const safe = (photoFile.name || 'file').replace(/[^\w.-]+/g, '_')
          const path = `${orgId}/dispatches/${userId}/${Date.now()}_${safe}`
          const { error: upErr } = await supabase.storage
            .from('machine-checks')
            .upload(path, file, {
              contentType: photoFile.type || 'application/octet-stream',
              upsert: false,
            })
          if (!upErr) photo_path = path
          else {
            photo_path = await fileToLocalPath(photoFile)
          }
        } catch {
          try {
            photo_path = await fileToLocalPath(photoFile)
          } catch {
            /* sin adjunto */
          }
        }
      }

      const fullPayload = {
        ...(payload && typeof payload === 'object' ? payload : {}),
        ...(fileName ? { fileName } : {}),
        ...(amount != null && amount !== ''
          ? { amount: Number(amount), currency: currency || 'COP' }
          : {}),
      }

      const row = {
        org_id: orgId,
        sender_id: userId,
        sender_scope: myScopes[0] || role || null,
        recipient_id: recipientId || null,
        recipient_scope: recipientScope || null,
        kind,
        title: t,
        body: (body || '').trim() || null,
        payload: fullPayload,
        photo_path,
        status: 'sent',
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        accuracy_m: location?.accuracy ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (tableMissing || localMode || !isOnline()) {
        localInsertDispatch(orgId, row)
        try {
          if (!tableMissing) await enqueueInsert('silo_dispatches', row)
        } catch {
          /* */
        }
        await load()
        return { error: null, local: true, offline: !isOnline() }
      }

      const { error: err } = await supabase.from('silo_dispatches').insert(row)
      if (err) {
        localInsertDispatch(orgId, { ...row, _fallback: err.message })
        if (isNetworkError(err.message) || isMissingTable(err.message)) {
          if (isMissingTable(err.message)) setTableMissing(true)
          try {
            if (!isMissingTable(err.message)) await enqueueInsert('silo_dispatches', row)
          } catch {
            /* */
          }
        }
        setLocalMode(true)
        await load()
        return {
          error: null,
          local: true,
          warn: err.message,
          offline: isNetworkError(err.message),
        }
      }
      await load()
      return { error: null }
    },
    [orgId, userId, myScopes, role, tableMissing, localMode, load]
  )

  const setStatus = useCallback(
    async (id, status, note = null) => {
      if (!id) return { error: 'Sin id' }
      const patch = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (status === 'verified' || status === 'rejected' || status === 'approved') {
        patch.verified_by = userId
        patch.verified_at = new Date().toISOString()
        patch.verify_note = note
        if (status === 'approved') patch.status = 'verified'
      }

      const isLocal = String(id).startsWith('local_') || localMode || tableMissing || !isOnline()
      if (isLocal) {
        localUpdateDispatch(orgId, id, patch)
        if (!String(id).startsWith('local_') && !tableMissing) {
          try {
            await enqueueUpdate('silo_dispatches', id, patch)
          } catch {
            /* */
          }
        }
        await load()
        return { error: null, offline: !isOnline() }
      }

      const { error: err } = await supabase.from('silo_dispatches').update(patch).eq('id', id)
      if (err) {
        localUpdateDispatch(orgId, id, patch)
        if (isNetworkError(err.message)) {
          try {
            await enqueueUpdate('silo_dispatches', id, patch)
          } catch {
            /* */
          }
        }
        await load()
        return { error: null, warn: err.message }
      }
      await load()
      return { error: null }
    },
    [userId, orgId, localMode, tableMissing, load]
  )

  const signedUrl = useCallback(async (path) => {
    if (!path) return null
    const s = String(path)
    if (s.startsWith('blob:') || s.startsWith('data:') || s.startsWith('local:')) {
      if (s.startsWith('local:')) {
        try {
          return localStorage.getItem(s) || null
        } catch {
          return null
        }
      }
      return s
    }
    try {
      const { data, error: err } = await supabase.storage
        .from('machine-checks')
        .createSignedUrl(path, 3600)
      if (err) return null
      return data?.signedUrl ?? null
    } catch {
      return null
    }
  }, [])

  const safeRows = Array.isArray(rows) ? rows : []

  const inbox = useMemo(
    () =>
      safeRows.filter(
        (r) =>
          r.recipient_id === userId ||
          (r.recipient_scope && myScopes.includes(r.recipient_scope)) ||
          (isGerencia &&
            (r.recipient_scope === 'gerencia' ||
              ['purchase_order', 'invoice', 'quotation', 'solicitud'].includes(r.kind)))
      ),
    [safeRows, userId, myScopes, isGerencia]
  )

  const outbox = useMemo(
    () => safeRows.filter((r) => r.sender_id === userId),
    [safeRows, userId]
  )
  const verified = useMemo(
    () => safeRows.filter((r) => r.status === 'verified'),
    [safeRows]
  )
  const pending = useMemo(
    () => inbox.filter((r) => r.status === 'sent' || r.status === 'read'),
    [inbox]
  )

  const stats = useMemo(() => {
    const byKind = {}
    for (const r of inbox) {
      byKind[r.kind] = (byKind[r.kind] || 0) + 1
    }
    const pendingAmount = pending
      .filter((r) => r.payload?.amount != null)
      .reduce((s, r) => s + Number(r.payload.amount || 0), 0)
    return {
      inbox: inbox.length,
      pending: pending.length,
      verified: verified.length,
      outbox: outbox.length,
      byKind,
      pendingAmount,
    }
  }, [inbox, pending, verified, outbox])

  return {
    loading,
    error,
    tableMissing,
    localMode,
    rows: safeRows,
    members: Array.isArray(members) ? members : [],
    inbox,
    outbox,
    verified,
    pending,
    pendingVerify: pending,
    stats,
    isGerencia,
    send,
    setStatus,
    signedUrl,
    reload: load,
    myScopes,
  }
}

async function fileToLocalPath(file) {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const b64 = btoa(binary)
  const mime = file.type || 'application/octet-stream'
  const dataUrl = `data:${mime};base64,${b64}`
  if (dataUrl.length > 1_500_000) return null
  const key = `local:dispatch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  try {
    localStorage.setItem(key, dataUrl)
    return key
  } catch {
    return dataUrl.length < 400_000 ? dataUrl : null
  }
}
