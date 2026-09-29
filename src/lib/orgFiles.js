/**
 * Fotos y documentos de registros (SST, ambiental) en el bucket privado «machine-checks»,
 * bajo {org_id}/<carpeta>/…, igual que las fotos de llegada del huevo. Las imágenes se
 * comprimen antes de subir; los PDF van tal cual. Para verlos se pide una URL firmada.
 * Henry Stark Desarrollador
 */
import { supabase } from './supabase'
import { compressImage } from './image'

export const RECORDS_BUCKET = 'machine-checks'
const MAX_PDF_BYTES = 10 * 1024 * 1024

const extOf = (file) => {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) return 'pdf'
  const m = String(file.name || '').match(/\.(jpe?g|png|webp|heic)$/i)
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

/**
 * Sube archivos y devuelve sus rutas. Si uno falla borra los que ya subió (no deja basura).
 * @returns {Promise<{ paths: string[], error: string | null }>}
 */
export async function uploadOrgFiles({ orgId, folder, files = [] }) {
  const paths = []
  const stamp = Date.now()
  for (const [i, original] of files.filter(Boolean).entries()) {
    let file = original
    const ext = extOf(file)
    if (ext === 'pdf') {
      if (file.size > MAX_PDF_BYTES) {
        if (paths.length) await supabase.storage.from(RECORDS_BUCKET).remove(paths)
        return { paths: [], error: `El PDF «${file.name}» pesa más de 10 MB` }
      }
    } else if (file.size > 900_000) {
      try {
        file = await compressImage(file, 1280, 0.7)
      } catch {
        /* usar original */
      }
    }
    const finalExt = ext === 'pdf' ? 'pdf' : file.type === 'image/jpeg' ? 'jpg' : ext
    const path = `${orgId}/${folder}/${stamp}-${i}.${finalExt}`
    const { error } = await supabase.storage.from(RECORDS_BUCKET).upload(path, file, {
      contentType: ext === 'pdf' ? 'application/pdf' : file.type || 'image/jpeg',
      upsert: false,
    })
    if (error) {
      if (paths.length) await supabase.storage.from(RECORDS_BUCKET).remove(paths)
      return { paths: [], error: `No se pudo subir «${original.name || 'el archivo'}»: ${error.message}` }
    }
    paths.push(path)
  }
  return { paths, error: null }
}

/** Abre una foto o PDF del bucket en otra pestaña con una URL firmada por 1 hora. */
export async function openOrgFile(path) {
  if (!path) return { error: 'Sin archivo' }
  // Se abre la pestaña antes de esperar la URL para que el navegador no la bloquee.
  const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
  const { data, error } = await supabase.storage.from(RECORDS_BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    win?.close()
    return { error: error?.message || 'No se pudo abrir el archivo' }
  }
  if (win) win.location.href = data.signedUrl
  else window.open(data.signedUrl, '_blank', 'noopener')
  return { error: null }
}
