/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    buildAuthRedirectUrl,
    persistPendingSignupContext,
    readPendingSignupContext,
    clearPendingSignupContext,
    checkIsRecoveryUrl,
} from './authService'

describe('authService', () => {
    beforeEach(() => {
        window.localStorage.clear()
        window.history.replaceState({}, '', '/')
    })

    it('genera una URL de retorno consistente para recuperación y confirmación', () => {
        // Sin «#»: Auth pega «#access_token=…&type=recovery» y supabase-js debe poder leerlo.
        expect(buildAuthRedirectUrl('recovery')).toBe(`${window.location.origin}/`)
        expect(buildAuthRedirectUrl('confirm')).not.toContain('#')
    })

    it('guarda y recupera el contexto de alta de una cuenta nueva', () => {
        persistPendingSignupContext('org-123', 'Ana Gómez')
        expect(readPendingSignupContext()).toEqual({ orgId: 'org-123', fullName: 'Ana Gómez' })

        clearPendingSignupContext()
        expect(readPendingSignupContext()).toEqual({ orgId: null, fullName: null })
    })

    it('reconoce URLs de recuperación de clave en hash o query params', () => {
        window.history.replaceState({}, '', '/#type=recovery&access_token=abc')
        expect(checkIsRecoveryUrl()).toBe(true)

        window.history.replaceState({}, '', '/?type=recovery#access_token=abc')
        expect(checkIsRecoveryUrl()).toBe(true)
    })
})
