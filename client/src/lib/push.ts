/**
 * Web Push helpers for the Kitchen app.
 *
 * On iOS, push notifications require the app to be added
 * to the Home Screen. Android and desktop browsers can use
 * push notifications normally.
 */

import api from '../api'

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied'

export function getPushSupport(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getPushStatus(): PushStatus {
  if (!getPushSupport()) return 'unsupported'
  return Notification.permission as PushStatus
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

/**
 * Enable push notifications for this Kitchen device.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!getPushSupport()) return false

  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission

  if (permission !== 'granted') return false

  const { data } = await api.get('/push/vapid-public-key')

  if (!data?.data?.enabled || !data?.data?.publicKey) {
    return false
  }

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

/**
 * Disable push notifications for this Kitchen device.
 */
export async function disablePushNotifications(): Promise<void> {
  if (!getPushSupport()) return

  const registration = await navigator.serviceWorker.ready

  const subscription = await registration.pushManager.getSubscription()

  if (!subscription) return

  const endpoint = subscription.endpoint

  await subscription.unsubscribe()

  await api.post('/push/unsubscribe', { endpoint }).catch(() => {})
}
