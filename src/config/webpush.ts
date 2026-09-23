import webpush from 'web-push';
import { env } from './env';

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
} else {
  // eslint-disable-next-line no-console
  console.warn('⚠️  VAPID keys not set — push notifications disabled (socket-only alerts still work).');
}

export { webpush };
