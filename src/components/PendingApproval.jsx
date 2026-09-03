/**
 * =============================================================================
 * ARCHIVO: src/components/PendingApproval.jsx
 * PROPÓSITO: Componente UI «PendingApproval»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { supabase } from '../lib/supabase'

/**
 * Pantalla para cuentas registradas pero aún no aprobadas por el administrador.
 * El bloqueo real está en la base de datos (RLS exige is_approved);
 * esta pantalla solo informa.
 */
export default function PendingApproval({ email, variant = 'approval' }) {
  const isOrg = variant === 'org'
  return (
    <div className="card auth-card pending-card">
      <div className="pending-icon" aria-hidden="true">
        {isOrg ? '🏭' : '⏳'}
      </div>
      <h1>{isOrg ? 'Cuenta aprobada' : 'Cuenta en revisión'}</h1>
      <p className="brand-sub" style={{ textAlign: 'center' }}>
        {isOrg ? (
          <>
            Tu cuenta <strong>{email}</strong> está aprobada. El administrador de CDH Maker
            te asignará a una empresa y te dará un rol en breve.
          </>
        ) : (
          <>
            Tu cuenta <strong>{email}</strong> fue creada correctamente, pero necesita la
            aprobación del administrador de CDH Maker antes de poder ingresar.
          </>
        )}
      </p>
      <p className="hint" style={{ textAlign: 'center' }}>
        {isOrg
          ? 'Cuando te asignen a una empresa, verás aquí su espacio de trabajo.'
          : 'Recibirás acceso una vez el administrador valide tu registro y te asigne un rol.'}
      </p>
      <button className="ghost" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </button>
    </div>
  )
}
