import { Router } from 'express';
import { hashPassword, publicUser, requireAuth, requireRole } from '../auth.js';
import { asyncHandler, HttpError } from '../errors.js';
import { validateUserInput } from '../validation.js';

/** Gestion des comptes (EF09). Les rôles on-chain sont accordés par l'admin via son portefeuille. */
export function userRoutes({ db, chain }) {
  const r = Router();
  r.use(requireAuth(db), requireRole('ADMIN'));

  r.get(
    '/',
    asyncHandler(async (_req, res) => {
      const users = db.prepare('SELECT * FROM users ORDER BY id').all();
      let chainAdmin = null;
      let chainError = null;
      const result = [];
      for (const u of users) {
        const dto = publicUser(u);
        dto.chainRoles = null;
        if (u.wallet_address && chain.enabled && !chainError) {
          try {
            dto.chainRoles = await chain.getRoles(u.wallet_address);
          } catch (err) {
            chainError = err.message;
          }
        }
        result.push(dto);
      }
      if (chain.enabled && !chainError) {
        try {
          chainAdmin = await chain.getAdmin();
        } catch (err) {
          chainError = err.message;
        }
      }
      res.json({ users: result, chainAdmin, chainError });
    }),
  );

  r.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = validateUserInput(req.body);
      if (input.role !== 'ADMIN' && !input.walletAddress) {
        throw new HttpError(400, 'Une adresse de portefeuille est obligatoire pour un fournisseur ou un opérateur');
      }
      try {
        const info = db
          .prepare(
            'INSERT INTO users (name, email, password_hash, role, wallet_address, active) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            input.name,
            input.email,
            await hashPassword(input.password),
            input.role,
            input.walletAddress ?? null,
            input.active === false ? 0 : 1,
          );
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
        res.status(201).json({ user: publicUser(user) });
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Email ou portefeuille déjà utilisé');
        throw err;
      }
    }),
  );

  r.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!existing) throw new HttpError(404, 'Utilisateur introuvable');
      const input = validateUserInput(req.body, { partial: true });
      if (id === req.user.id && (input.active === false || (input.role && input.role !== 'ADMIN'))) {
        throw new HttpError(400, 'Vous ne pouvez pas désactiver ou rétrograder votre propre compte');
      }

      const fields = [];
      const values = [];
      const set = (col, val) => {
        fields.push(`${col} = ?`);
        values.push(val);
      };
      if (input.name !== undefined) set('name', input.name);
      if (input.email !== undefined) set('email', input.email);
      if (input.role !== undefined) set('role', input.role);
      if ('walletAddress' in input) set('wallet_address', input.walletAddress);
      if (input.active !== undefined) set('active', input.active ? 1 : 0);
      if (input.password !== undefined) set('password_hash', await hashPassword(input.password));

      const role = input.role ?? existing.role;
      const wallet = 'walletAddress' in input ? input.walletAddress : existing.wallet_address;
      if (role !== 'ADMIN' && !wallet) throw new HttpError(400, 'Adresse de portefeuille obligatoire pour ce rôle');

      if (fields.length) {
        try {
          db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
        } catch (err) {
          if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Email ou portefeuille déjà utilisé');
          throw err;
        }
      }
      res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
    }),
  );

  return r;
}
