/**
 * PlatformBranding — Super-admin-only page to edit AuraOS's own branding:
 * the platform's logo, favicon, and theme colors, shown across the product
 * (currently: the sidebar logo everywhere in the app, and the browser tab icon).
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { getErrorMessage } from '../api'
import Card from '../components/Card'
import Button from '../components/Button'
import Loading from '../components/Loading'
import { PhotoIcon, SwatchIcon } from '@heroicons/react/24/outline'

interface PlatformSettings {
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
}

const PlatformBranding: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<PlatformSettings>({
    logo_url: '',
    favicon_url: '',
    primary_color: '#4f46e5',
    secondary_color: '#f59e0b',
    accent_color: '#10b981',
  })

  useEffect(() => {
    api.get<{ success: boolean; data: PlatformSettings }>('/admin/platform-settings')
      .then((res) => {
        const d = res.data.data
        setSettings({
          logo_url: d.logo_url || '',
          favicon_url: d.favicon_url || '',
          primary_color: d.primary_color,
          secondary_color: d.secondary_color,
          accent_color: d.accent_color,
        })
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const update = (key: keyof PlatformSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/admin/platform-settings', {
        logo_url: settings.logo_url || null,
        favicon_url: settings.favicon_url || null,
        primary_color: settings.primary_color,
        secondary_color: settings.secondary_color,
        accent_color: settings.accent_color,
      })
      toast.success('Platform branding saved — refresh to see it applied')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loading size="lg" text="Loading platform settings..." />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Branding</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          NF Restro's own logo, icon, and colors — used across the whole product
        </p>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <PhotoIcon className="h-5 w-5 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Logo & Favicon</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL</label>
            <input
              type="text"
              value={settings.logo_url || ''}
              onChange={(e) => update('logo_url', e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            {settings.logo_url && (
              <img
                src={settings.logo_url}
                alt="Logo preview"
                className="h-12 mt-2 rounded border border-slate-200 object-contain bg-slate-50 px-2"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Favicon URL</label>
            <input
              type="text"
              value={settings.favicon_url || ''}
              onChange={(e) => update('favicon_url', e.target.value)}
              placeholder="https://... (small square image, e.g. 512x512)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            {settings.favicon_url && (
              <img
                src={settings.favicon_url}
                alt="Favicon preview"
                className="h-8 w-8 mt-2 rounded border border-slate-200 object-contain bg-slate-50"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <SwatchIcon className="h-5 w-5 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Theme Colors</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {([
            ['primary_color', 'Primary'],
            ['secondary_color', 'Secondary'],
            ['accent_color', 'Accent'],
          ] as [keyof PlatformSettings, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings[key] as string}
                  onChange={(e) => update(key, e.target.value)}
                  className="h-9 w-9 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={settings[key] as string}
                  onChange={(e) => update(key, e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={save} isLoading={saving}>
            Save Platform Branding
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default PlatformBranding
