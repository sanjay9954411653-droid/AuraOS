/**
 * Image helpers for menu photos, logo and cover image.
 *
 * Policy (see migrations/022): the database stores image URLs only, never image
 * bytes. Files are shrunk in the browser, uploaded straight to Cloudinary, and
 * only the returned https URL is saved.
 */
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../config/imageUpload'

export const isUploadConfigured = (): boolean =>
  Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET)

const MAX_FILE_MB = 15

/** Shrink a photo in the browser so uploads are fast on mobile data. */
async function resizeImage(file: File, maxSize: number, keepTransparency: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image')

  const asPng = keepTransparency && file.type === 'image/png'
  if (!asPng) {
    ctx.fillStyle = '#ffffff' // JPEG has no transparency
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the image'))),
      asPng ? 'image/png' : 'image/jpeg',
      0.82,
    )
  })
}

interface UploadOptions {
  /** Longest side in pixels after shrinking (menu photo 900, cover 1400, logo 500). */
  maxSize?: number
  /** Keep PNG transparency (use for logos). */
  keepTransparency?: boolean
  folder?: string
}

/** Uploads an image file and returns its https URL. */
export async function uploadImage(file: File, opts: UploadOptions = {}): Promise<string> {
  if (!isUploadConfigured()) throw new Error('Photo upload is not set up yet')
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Image is too big (max ${MAX_FILE_MB} MB)`)

  const blob = await resizeImage(file, opts.maxSize ?? 900, opts.keepTransparency ?? false)

  const form = new FormData()
  form.append('file', blob)
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  if (opts.folder) form.append('folder', opts.folder)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('Upload failed — please try again')
  const data = await res.json()
  if (!data.secure_url) throw new Error('Upload failed — please try again')
  return data.secure_url as string
}

/**
 * For Cloudinary images, ask the CDN for a smaller, web-optimised version
 * (right size + best format). Any other URL is returned unchanged.
 */
export function optimizeImageUrl(url: string | null | undefined, width: number): string {
  if (!url) return ''
  const marker = '/image/upload/'
  if (url.includes('res.cloudinary.com') && url.includes(marker) && !url.includes('/f_auto')) {
    return url.replace(marker, `${marker}f_auto,q_auto,w_${width}/`)
  }
  return url
}
