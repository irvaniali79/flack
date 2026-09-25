// TOTP two-factor authentication (RFC 6238) — implemented on node:crypto so
// there are no native dependencies. Also covers recovery (backup) codes,
// which are stored sha256-hashed and shown exactly once at enable time.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

// ─── Base32 (RFC 4648, no padding) ──────────────────────────────────────────

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char)
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

// ─── TOTP core (RFC 4226 HOTP + RFC 6238 time step) ─────────────────────────

const PERIOD = 30 // seconds per step
const DIGITS = 6

/** HOTP for a specific counter, per RFC 4226. */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  // counter as big-endian 64-bit
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter % 0x100000000, 4)
  const hmac = createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return (code % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

/** Current 6-digit code for a base32 secret. */
export function totpNow(secretBase32: string): string {
  return hotp(base32Decode(secretBase32), Math.floor(Date.now() / 1000 / PERIOD))
}

/**
 * Verify a 6-digit TOTP code with a ±1 step (30s) drift window,
 * constant-time per candidate.
 */
export function verifyTotp(secretBase32: string, code: string, drift = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const secret = base32Decode(secretBase32)
  const counter = Math.floor(Date.now() / 1000 / PERIOD)
  for (let i = -drift; i <= drift; i++) {
    const candidate = hotp(secret, counter + i)
    const a = Buffer.from(candidate)
    const b = Buffer.from(code)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

/** Fresh 20-byte (160-bit) base32 secret for a new enrollment. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** The otpauth:// provisioning URI authenticators scan as a QR code. */
export function otpauthUri(email: string, secretBase32: string, issuer = 'Acme Chat'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  return (
    `otpauth://totp/${label}?secret=${secretBase32}` +
    `&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`
  )
}

// ─── Recovery (backup) codes ─────────────────────────────────────────────────

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no lookalikes

function randomWord(len: number): string {
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/** 8 one-time recovery codes, e.g. "acme-k7m2-x9pq" (returned in plain text ONCE). */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => `acme-${randomWord(4)}-${randomWord(4)}`)
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex')
}

/** Constant-time-ish check of a candidate against the hashed set. */
export function matchRecoveryCode(candidate: string, hashedJson: string): boolean {
  let hashes: string[] = []
  try {
    const parsed = JSON.parse(hashedJson)
    if (Array.isArray(parsed)) hashes = parsed.filter((h) => typeof h === 'string')
  } catch {
    return false
  }
  const candidateHash = hashRecoveryCode(candidate)
  // Compare against every hash so timing doesn't leak list position
  let matched = false
  for (const h of hashes) {
    if (h.length === candidateHash.length && timingSafeEqual(Buffer.from(h), Buffer.from(candidateHash))) {
      matched = true
    }
  }
  return matched
}

/** Remove one used code from the stored JSON (returns the updated JSON string). */
export function consumeRecoveryCode(candidate: string, hashedJson: string): string | null {
  const candidateHash = hashRecoveryCode(candidate)
  let hashes: string[] = []
  try {
    const parsed = JSON.parse(hashedJson)
    if (Array.isArray(parsed)) hashes = parsed.filter((h) => typeof h === 'string')
  } catch {
    return null
  }
  const next = hashes.filter((h) => h !== candidateHash)
  if (next.length === hashes.length) return null // nothing consumed
  return JSON.stringify(next)
}
