import { Router } from 'express';
import { publicUser, requireAuth, signToken, verifyPassword } from '../auth.js';
import { asyncHandler, HttpError } from '../errors.js';

export function authRoutes({ db }) {
  const r = Router();

  r.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        throw new HttpError(400, 'Email et mot de passe requis');
      }
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
      const ok = user ? await verifyPassword(password, user.password_hash) : false;
      if (!ok) throw new HttpError(401, 'Identifiants incorrects');
      if (!user.active) throw new HttpError(403, 'Compte désactivé');
      res.json({ token: signToken(user), user: publicUser(user) });
    }),
  );

  r.get('/me', requireAuth(db), (req, res) => res.json({ user: publicUser(req.user) }));

  return r;
}
