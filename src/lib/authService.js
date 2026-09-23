/**
 * =============================================================================
 * ARCHIVO: src/lib/authService.js
 * PROPÓSITO: Servicio unificado de Autenticación, Recuperación de Contraseña y
 * Sincronización con Base de Datos / Dependencias. El acceso con Google se retiró
 * el 23-09-2026 (a pedido de Henry): se entra solo con correo y contraseña.
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
