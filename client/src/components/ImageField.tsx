import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { PhotoIcon, ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/outline'
import { isUploadConfigured, uploadImage } from '../lib/imageUpload'

interface ImageFieldProps {
  label: string
  value: string
  onChange: (url: string) => void
  /** Preview shape: square photo, wide cover banner, or logo. */
  shape?: 'square' | 'wide' | 'logo'
  /** Longest side (px) the photo is shrunk to before upload. */
  maxSize?: number
  folder?: string
  help?: string
}

const PREVIEW_CLASS: Record<NonNullable<ImageFieldProps['shape']>, string> = {
  square: 'w-28 h-28 rounded-xl object-cover',
  wide: 'w-full h-32 rounded-xl object-cover',
  logo: 'w-20 h-20 rounded-full object-contain bg-white',
}

/**
 * Photo picker: upload a file (when Cloudinary is set up) or paste an https
 * link. Shows a preview and a Remove button.
 */
const ImageField: React.FC<ImageFieldProps> = ({
  label,
  value,
  onChange,
  shape = 'square',
  maxSize = 900,
  folder,
  help,
}) => {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [broken, setBroken] = useState(false)
  const canUpload = isUploadConfigured()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file, { maxSize, folder, keepTransparency: shape === 'logo' })
      setBroken(false)
      onChange(url)
      toast.success('Photo uploaded')
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const actions = (
    <>
      <div className="flex flex-wrap gap-2">
        {canUpload && (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              <ArrowUpTrayIcon className="w-4 h-4" />
              {uploading ? 'Uploading…' : value ? 'Change photo' : 'Upload photo'}
            </button>
          </>
        )}
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setBroken(false) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50"
          >
            <TrashIcon className="w-4 h-4" />
            Remove
          </button>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => { setBroken(false); onChange(e.target.value) }}
        placeholder={canUpload ? 'or paste an image link (https://…)' : 'Paste an image link (https://…)'}
        className="block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
      />
      {!canUpload && (
        <p className="text-xs text-amber-600">
          Photo upload is not switched on yet — paste a link for now.
        </p>
      )}
    </>
  )

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>

      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className={shape === 'wide' ? 'w-full' : 'shrink-0'}>
          {value && !broken ? (
            <img
              src={value}
              alt={`${label} preview`}
              className={`${PREVIEW_CLASS[shape]} border border-gray-200`}
              onError={() => setBroken(true)}
            />
          ) : (
            <div
              className={`${PREVIEW_CLASS[shape]} border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400 text-xs`}
            >
              <PhotoIcon className="w-7 h-7" />
              <span className="mt-1">{broken ? "Can't load" : 'No photo'}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {shape !== 'wide' && (
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            {actions}
          </div>
        )}
      </div>

      {shape === 'wide' && (
        <div className="flex flex-col gap-2 mt-2">
          {actions}
        </div>
      )}

      {help && <p className="text-xs text-gray-400 mt-1">{help}</p>}
    </div>
  )
}

export default ImageField
