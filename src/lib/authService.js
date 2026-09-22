/**
 * =============================================================================
 * ARCHIVO: src/lib/authService.js
 * PROPÓSITO: Servicio unificado de Autenticación, Recuperación de Contraseña,
 * Inicio de Sesión con Google y Sincronización con Base de Datos / Dependencias.
 * Mantenido por: Henry Stark Desarrollador — IncubApp SIG
 * =============================================================================
 */

import { supabase } from './supabase'

export function buildAuthRedirectUrl(mode = 'recovery') {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  const target = mode === 'recovery' ? 'type=recovery' : 'type=confirm'
  return `${origin}/#${target}`
}

export function persistPendingSignupContext(orgId, fullName) {
  if (typeof window === 'undefined') return

  if (orgId) {
    window.localStorage.setItem('incubapp_pending_org_id', String(orgId))
  } else {
    window.localStorage.removeItem('incubapp_pending_org_id')
  }

  const safeName = typeof fullName === 'string' ? fullName.trim() : ''
  if (safeName) {
    window.localStorage.setItem('incubapp_pending_full_name', safeName)
  } else {
    window.localStorage.removeItem('incubapp_pending_full_name')
  }
}

export function readPendingSignupContext() {
  if (typeof window === 'undefined') return { orgId: null, fullName: null }
  return {
    orgId: window.localStorage.getItem('incubapp_pending_org_id') || null,
    fullName: window.localStorage.getItem('incubapp_pending_full_name') || null,
  }
}

export function clearPendingSignupContext() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem('incubapp_pending_org_id')
  window.localStorage.removeItem('incubapp_pending_full_name')
}

/**
 * Solicita el restablecimiento de contraseña enviando un correo con enlace seguro.
 * @param {string} email 
 * @returns {Promise<{ success: boolean, error?: string }>} 
 */
export async function resetPasswordForEmail(email) {
  if (!email || !email.trim()) {
    return { success: false, error: 'Ingresa un correo electrónico válido.' }
  }
  try {
    const redirectTo = buildAuthRedirectUrl('recovery')

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    })

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message || 'Error de conexión al enviar correo.' }
  }
}

/**
 * Actualiza la contraseña del usuario actualmente autenticado (en flujo de recuperación o sesión activa).
 * @param {string} newPassword 
 * @returns {Promise<{ success: boolean, error?: string }>} 
 */
export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'La contraseña debe contener al menos 6 caracteres.' }
  }
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    // Limpiar hash de la URL tras éxito
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message || 'Error al actualizar contraseña.' }
  }
}

/**
 * Inicia sesión mediante OAuth de Google.
 * @returns {Promise<{ success: boolean, error?: string }>} 
 */
export async function signInWithGoogle() {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: origin,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    })
    if (error) return { success: false, error: error.message }

    if (data?.url) {
      // Verificar si el proveedor está habilitado en Supabase antes de redirigir al usuario
      const checkRes = await fetch(data.url, { method: 'GET', redirect: 'manual' }).catch(() => null)
      if (checkRes && checkRes.status === 400) {
        const json = await checkRes.json().catch(() => null)
        if (json?.error_code === 'validation_failed' || json?.msg?.includes('provider is not enabled')) {
          return {
            success: false,
            error: 'El acceso con Google no está activado en este servidor de Supabase. Por favor ingresa con tu correo y contraseña.',
          }
        }
      }
      window.location.href = data.url
      return { success: true }
    }
    return { success: false, error: 'No se obtuvo URL de inicio de sesión.' }
  } catch (err) {
    return { success: false, error: err.message || 'Error al conectar con Google.' }
  }
}

/**
 * Comprueba si la ventana actual contiene el hash de recuperación de contraseña de Supabase.
 * @returns {boolean}
 */
export function checkIsRecoveryUrl() {
  if (typeof window === 'undefined') return false
  const combined = `${window.location.hash || ''}${window.location.search || ''}`
  return combined.includes('type=recovery') || (combined.includes('access_token') && combined.includes('recovery'))
}

/**
 * Sincroniza el perfil de usuario en la base de datos Supabase (`profiles`).
 * @param {string} userId 
 * @param {Object} data 
 */
export async function syncUserProfile(userId, data = {}) {
  if (!userId) return { success: false, error: 'ID de usuario requerido' }
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        updated_at: new Date().toISOString(),
        ...data,
      })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
