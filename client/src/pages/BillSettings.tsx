/**
 * BillSettings — Admin page to configure how the customer bill looks and
 * what it charges: GSTIN/FSSAI, discount %, service & other charges,
 * a flat extra charge, the UPI ID used for the "Scan to Pay" QR, whether
 * the restaurant name is printed on the bill, and which social links (from
 * Branding) appear in the bill footer.
 *
 * Includes a live, scaled-down preview so changes are easy to judge before
 * saving.
 */
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import api, { getErrorMessage } from '../api'
import Card from '../components/Card'
import Button from '../components/Button'
import Loading from '../components/Loading'
import {
  ReceiptPercentIcon,
  QrCodeIcon,
  BuildingStorefrontIcon,
  ShareIcon,
} from '@heroicons/react/24/outline'

interface BillProfile {
  name: string
  logo_url: string | null
  gstin: string | null
  fssai_no: string | null
  upi_id: string | null
  discount_percent: number
  service_charge_percent: number
  other_charges_percent: number
  extra_charges_amount: number
  show_name_in_bill: boolean
  bill_social_keys: string[]
  social_links: Record<string, string>
}

const SOCIAL_OPTIONS: { key: string; label: string }[] = [
  { key: 'google_review', label: 'Google Review' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'Twitter / X' },
  { key: 'youtube', label: 'YouTube' },
]

const emptyFields = {
  gstin: '',
  fssai_no: '',
  upi_id: '',
  discount_percent: 0,
  service_charge_percent: 0,
  other_charges_percent: 0,
  extra_charges_amount: 0,
  show_name_in_bill: true,
  bill_social_keys: [] as string[],
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n)

const BillSettings: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<BillProfile | null>(null)
  const [fields, setFields] = useState(emptyFields)

  useEffect(() => {
    api.get<{ success: boolean; data: BillProfile }>('/restaurants/me')
      .then((res) => {
        const p = res.data.data
        setProfile(p)
        setFields({
          gstin: p.gstin || '',
          fssai_no: p.fssai_no || '',
          upi_id: p.upi_id || '',
          discount_percent: Number(p.discount_percent || 0),
          service_charge_percent: Number(p.service_charge_percent || 0),
          other_charges_percent: Number(p.other_charges_percent || 0),
          extra_charges_amount: Number(p.extra_charges_amount || 0),
          show_name_in_bill: p.show_name_in_bill !== false,
          bill_social_keys: p.bill_social_keys || [],
        })
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const update = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const toggleSocial = (key: string) => {
    setFields((prev) => ({
      ...prev,
      bill_social_keys: prev.bill_social_keys.includes(key)
        ? prev.bill_social_keys.filter((k) => k !== key)
        : [...prev.bill_social_keys, key],
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.put('/restaurants/me', {
        gstin: fields.gstin.trim() || null,
        fssai_no: fields.fssai_no.trim() || null,
        upi_id: fields.upi_id.trim() || null,
        discount_percent: Number(fields.discount_percent) || 0,
        service_charge_percent: Number(fields.service_charge_percent) || 0,
        other_charges_percent: Number(fields.other_charges_percent) || 0,
        extra_charges_amount: Number(fields.extra_charges_amount) || 0,
        show_name_in_bill: fields.show_name_in_bill,
        bill_social_keys: fields.bill_social_keys,
      })
      setProfile((prev) => (prev ? { ...prev, ...res.data.data } : prev))
      toast.success('Bill settings saved')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // ── Live preview math (sample order, mirrors BillScreen's calc) ──────────
  const preview = useMemo(() => {
    const sampleItems = [
      { name: 'Paneer Butter Masala', qty: 1, price: 260 },
      { name: 'Butter Naan', qty: 2, price: 45 },
      { name: 'Sweet Lassi', qty: 1, price: 90 },
    ]
    const subtotal = sampleItems.reduce((s, i) => s + i.qty * i.price, 0)
    const discount = (subtotal * Number(fields.discount_percent || 0)) / 100
    const afterDiscount = subtotal - discount
    const serviceCharge = (afterDiscount * Number(fields.service_charge_percent || 0)) / 100
    const otherCharges = (afterDiscount * Number(fields.other_charges_percent || 0)) / 100
    const extra = Number(fields.extra_charges_amount || 0)
    const taxableBase = afterDiscount + serviceCharge + otherCharges + extra
    const taxRate = 5 // sample only — real tax_rate lives on the restaurant
    const gst = (taxableBase * taxRate) / 100
    const grandTotal = taxableBase + gst
    return { sampleItems, subtotal, discount, serviceCharge, otherCharges, extra, gst, grandTotal, taxRate }
  }, [fields])

  if (loading) return <Loading text="Loading bill settings…" />
  if (!profile) return null

  return (
    <div className="animate-fade-in max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bill Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Control what appears on the customer bill and which charges get added automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* ── Form ─────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <BuildingStorefrontIcon className="h-5 w-5 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Bill Details</h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                <span className="text-sm text-slate-700">Show restaurant name on bill</span>
                <input
                  type="checkbox"
                  checked={fields.show_name_in_bill}
                  onChange={(e) => update('show_name_in_bill', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={fields.gstin}
                    onChange={(e) => update('gstin', e.target.value)}
                    placeholder="e.g. 18AAAAA0000A1Z5"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">FSSAI No.</label>
                  <input
                    type="text"
                    value={fields.fssai_no}
                    onChange={(e) => update('fssai_no', e.target.value)}
                    placeholder="e.g. 12345678901234"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <ReceiptPercentIcon className="h-5 w-5 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Charges</h2>
            </div>
            <p className="text-xs text-slate-500 -mt-2 mb-4">
              Applied automatically to every bill, in order: discount first, then service &amp; other charges, then GST.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Discount %</label>
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={fields.discount_percent}
                  onChange={(e) => update('discount_percent', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service Charge %</label>
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={fields.service_charge_percent}
                  onChange={(e) => update('service_charge_percent', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Other Charges %</label>
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={fields.other_charges_percent}
                  onChange={(e) => update('other_charges_percent', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Extra Charges (flat ₹ per bill)</label>
              <input
                type="number" min={0} step="1"
                value={fields.extra_charges_amount}
                onChange={(e) => update('extra_charges_amount', Number(e.target.value))}
                placeholder="e.g. packaging charge"
                className="w-full sm:w-1/3 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <QrCodeIcon className="h-5 w-5 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Payment</h2>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">UPI ID</label>
              <input
                type="text"
                value={fields.upi_id}
                onChange={(e) => update('upi_id', e.target.value)}
                placeholder="e.g. yourname@okhdfcbank"
                className="w-full sm:w-1/2 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">Shows a "Scan to Pay" QR code at the bottom of the bill.</p>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <ShareIcon className="h-5 w-5 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Bill Footer — Social Links</h2>
            </div>
            <p className="text-xs text-slate-500 -mt-2 mb-4">
              Choose which links (set up under Branding) also show on the printed / WhatsApp bill.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SOCIAL_OPTIONS.map((opt) => {
                const hasUrl = !!profile.social_links?.[opt.key]
                const checked = fields.bill_social_keys.includes(opt.key)
                return (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      hasUrl ? 'border-slate-200 cursor-pointer' : 'border-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!hasUrl}
                      checked={checked}
                      onChange={() => toggleSocial(opt.key)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {opt.label}
                    {!hasUrl && <span className="text-[10px] ml-auto">not set</span>}
                  </label>
                )
              })}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save} isLoading={saving}>
              Save Bill Settings
            </Button>
          </div>
        </div>

        {/* ── Live preview ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 lg:sticky lg:top-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Live Preview</p>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mx-auto max-w-[300px] rounded-xl bg-white shadow-sm border border-slate-100 p-5 font-mono text-[11px] leading-relaxed text-slate-800">
              <div className="text-center space-y-0.5 mb-2">
                {profile.logo_url && (
                  <img src={profile.logo_url} alt="" className="h-10 w-10 rounded-full object-cover mx-auto mb-1" />
                )}
                {fields.show_name_in_bill && (
                  <p className="font-bold text-sm">{profile.name}</p>
                )}
                {fields.gstin && <p className="text-[10px] text-slate-500">GSTIN: {fields.gstin}</p>}
                {fields.fssai_no && <p className="text-[10px] text-slate-500">FSSAI: {fields.fssai_no}</p>}
              </div>
              <div className="border-t border-dashed border-slate-300 my-2" />
              {preview.sampleItems.map((it) => (
                <div key={it.name} className="flex justify-between">
                  <span>{it.name} x{it.qty}</span>
                  <span>{fmt(it.qty * it.price)}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-slate-300 my-2" />
              <div className="flex justify-between"><span>Subtotal</span><span>{fmt(preview.subtotal)}</span></div>
              {preview.discount > 0 && (
                <div className="flex justify-between text-emerald-600"><span>Discount ({fields.discount_percent}%)</span><span>-{fmt(preview.discount)}</span></div>
              )}
              {preview.serviceCharge > 0 && (
                <div className="flex justify-between text-slate-500"><span>Service Charge ({fields.service_charge_percent}%)</span><span>{fmt(preview.serviceCharge)}</span></div>
              )}
              {preview.otherCharges > 0 && (
                <div className="flex justify-between text-slate-500"><span>Other Charges ({fields.other_charges_percent}%)</span><span>{fmt(preview.otherCharges)}</span></div>
              )}
              {preview.extra > 0 && (
                <div className="flex justify-between text-slate-500"><span>Extra Charges</span><span>{fmt(preview.extra)}</span></div>
              )}
              <div className="flex justify-between text-slate-500"><span>GST ({preview.taxRate}%)</span><span>{fmt(preview.gst)}</span></div>
              <div className="border-t border-slate-300 mt-2 pt-2 flex justify-between font-bold text-sm">
                <span>Grand Total</span><span>{fmt(preview.grandTotal)}</span>
              </div>
              {fields.upi_id && (
                <div className="border-t border-dashed border-slate-300 mt-3 pt-3 text-center">
                  <div className="w-16 h-16 mx-auto rounded bg-slate-900 flex items-center justify-center text-white text-[8px]">
                    QR
                  </div>
                  <p className="mt-1 text-[10px]">Scan to Pay · {fields.upi_id}</p>
                </div>
              )}
              {fields.bill_social_keys.length > 0 && (
                <p className="mt-3 text-center text-[10px] text-slate-400">
                  Follow us: {fields.bill_social_keys.map((k) => SOCIAL_OPTIONS.find((o) => o.key === k)?.label).join(' · ')}
                </p>
              )}
              <p className="mt-3 text-center text-[10px] text-slate-400">Thank you for dining with us!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BillSettings
