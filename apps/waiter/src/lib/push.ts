/**
 * Web Push subscribe/unsubscribe helpers for the Waiter app.
 *
 * On iOS this only works if the app has been added to the Home Screen
 * (Share → "Add to Home Screen") — Safari doesn't allow push for a
 * regular browser tab. Desktop/Android Chrome work in a normal tab too.
 */

import { api } from '../api/client'

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied'

export function getPushSupport(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getPushStatus(): PushStatus {
  if (!getPushSupport()) return 'unsupported'
  return Notification.permission as PushStatus
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/**
 * Requests notification permission (if needed) and registers this device
 * for push. Returns true if the device is now subscribed.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!getPushSupport()) return false

  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') return false

  const { data } = await api.get('/push/vapid-public-key')
  if (!data?.data?.enabled || !data?.data?.publicKey) return false

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.data.publicKey),
    })
  }

  await api.post('/push/subscribe', subscription.toJSON())
  return true
}

export async function disablePushNotifications(): Promise<void> {
  if (!getPushSupport()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await api.post('/push/unsubscribe', { endpoint }).catch(() => {})
}
