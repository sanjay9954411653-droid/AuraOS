self.addEventListener('push', (event) => {
  let payload = {
    title: 'NF Restro',
    body: 'New order received',
  }

  try {
    if (event.data) {
      payload = event.data.json()
    }
  } catch {
    // Use the default notification if the payload is not JSON.
  }

  const options = {
    body: payload.body,
    icon: '/icon-512.png',
    badge: '/icon-512.png',
    tag: payload.tag || 'nf-restro-kitchen-order',
    renotify: true,
    vibrate: [300, 100, 300, 100, 300],
    requireInteraction: true,
    data: payload.data || {},
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus()
        }
      }

      if (self.clients.openWindow) {
  return self.clients.openWindow(
    event.notification.data?.url || '/kitchen'
  )
      }
    })
  )
})
