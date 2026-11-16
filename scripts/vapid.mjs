// Generates a VAPID key pair for Web Push.
// Public key → wrangler.toml [vars] VAPID_PUBLIC_KEY, private key → `wrangler secret put VAPID_PRIVATE_KEY`.
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('raw', pair.publicKey);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
console.log('VAPID_PUBLIC_KEY =', b64url(pub));
console.log('VAPID_PRIVATE_KEY =', jwk.d);
