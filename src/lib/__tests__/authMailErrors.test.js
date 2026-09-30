import { describe, it, expect } from 'vitest'
import { authErrorEs, MAIL_UNAVAILABLE } from '../offlineAuth'

describe('recuperar contraseña sin servidor de correo', () => {
  it('el error de envío de correo de Supabase dice qué hacer, no «sin conexión»', () => {
    expect(authErrorEs({ message: 'Error sending recovery email', status: 500 })).toBe(MAIL_UNAVAILABLE)
    expect(authErrorEs({ message: 'Error sending confirmation mail' })).toBe(MAIL_UNAVAILABLE)
    expect(authErrorEs({ message: 'gomail: could not send email 1: smtp: connection refused' })).toBe(MAIL_UNAVAILABLE)
    expect(MAIL_UNAVAILABLE).toMatch(/contraseña temporal/)
  })

  it('una caída de red sigue diciendo que no hay conexión', () => {
    expect(authErrorEs({ name: 'TypeError', message: 'Failed to fetch' })).toMatch(/No hay conexión/)
  })
})
