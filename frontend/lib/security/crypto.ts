import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
// 32-byte secret key from process.env or fallback for development
const SECRET_KEY = process.env.TOKEN_ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_SECRET).digest()
  : crypto.createHash('sha256').update('stockai_default_encryption_secret_key_32b').digest();

export function encryptToken(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText; // fallback if unencrypted legacy
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Token decryption failed:', err);
    return '';
  }
}
