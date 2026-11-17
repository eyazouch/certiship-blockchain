import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { HttpError } from './errors.js';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

/** Hachage du mot de passe : scrypt avec sel aléatoire. Format : scrypt$<sel>$<hash>. */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const derived = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(expected, derived);
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    walletAddress: u.wallet_address,
    active: Boolean(u.active),
    createdAt: u.created_at,
  };
}

/** Middleware : vérifie le JWT et recharge l'utilisateur (compte actif obligatoire). */
export function requireAuth(db) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Authentification requise'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const user = stmt.get(Number(payload.sub));
      if (!user || !user.active) return next(new HttpError(401, 'Compte inexistant ou désactivé'));
      req.user = user;
      next();
    } catch {
      next(new HttpError(401, 'Session invalide ou expirée'));
    }
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Action non autorisée pour votre rôle'));
    }
    next();
  };
}
