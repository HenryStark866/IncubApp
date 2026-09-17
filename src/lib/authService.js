/**
 * =============================================================================
 * ARCHIVO: src/lib/authService.js
 * PROPÓSITO: Servicio unificado de Autenticación, Recuperación de Contraseña,
 * Inicio de Sesión con Google y Sincronización con Base de Datos / Dependencias.
 * Mantenido por: Henry Stark Desarrollador — IncubApp SIG
 * =============================================================================
 */

import { supabase } from './supabase'

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
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const redirectTo = `${origin}/#type=recovery`

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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
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
  const hash = window.location.hash || ''
  return hash.includes('type=recovery') || (hash.includes('access_token=') && hash.includes('type=recovery'))
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
