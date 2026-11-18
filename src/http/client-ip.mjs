import { isIP } from 'node:net';

const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopbackPeer(remoteAddress) {
  return typeof remoteAddress === 'string' && LOOPBACK_PEERS.has(remoteAddress);
}

/** One IPv6 /64 is one client for abuse limits (a single subscriber holds the whole prefix); IPv4-mapped forms become IPv4. */
function normalizeForLimits(address) {
  if (isIP(address) !== 6) return address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];
  const [head, tail = ''] = address.toLowerCase().split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = address.includes('::') && tail !== '' ? tail.split(':') : [];
  const groups = address.includes('::') ? [...headGroups, ...Array(8 - headGroups.length - tailGroups.length).fill('0'), ...tailGroups] : headGroups;
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * Resolve the client address used for abuse limits. X-Forwarded-For is trusted only when the
 * socket peer is this machine (the reverse proxy); the entry the proxy appended is the last
 * one, so earlier entries a client could have forged are ignored. Any other peer is used as is.
 * The result is a limiter key, not a display address: IPv6 clients are grouped by /64.
 */
export function resolveClientIp({ remoteAddress, forwardedFor } = {}) {
  const peer = typeof remoteAddress === 'string' && remoteAddress.length > 0 ? remoteAddress : 'unknown';
  if (!isLoopbackPeer(remoteAddress) || typeof forwardedFor !== 'string') return peer;
  const entries = forwardedFor.split(',').map((entry) => entry.trim()).filter(Boolean);
  const proxied = entries.at(-1);
  return proxied && isIP(proxied) !== 0 ? normalizeForLimits(proxied) : peer;
}
