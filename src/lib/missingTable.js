/**
 * ¿El error de Supabase es porque la tabla todavía no existe? Pasa cuando la app es más
 * nueva que la base del servidor (falta correr 7-ACTUALIZAR-APP). Se usa para mostrar el
 * resto de la pantalla en vez de romperla.
 * Henry Stark Desarrollador
 */
export const isMissingTable = (error) =>
  Boolean(error) &&
  (error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation "?[\w.]+"? does not exist|could not find the table/i.test(error.message || ''))
