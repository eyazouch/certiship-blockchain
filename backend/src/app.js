import cors from 'cors';
import express from 'express';
import { HttpError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { transactionRoutes } from './routes/transactions.js';
import { userRoutes } from './routes/users.js';

export function createApp({ db, chain, corsOrigin, syncOptions = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/config', (_req, res) =>
    res.json({ chainId: chain.chainId, contractAddress: chain.contractAddress, chainEnabled: chain.enabled }),
  );

  app.use('/api/auth', authRoutes({ db }));
  app.use('/api/users', userRoutes({ db, chain }));
  app.use('/api', productRoutes({ db, chain }));
  app.use('/api', transactionRoutes({ db, chain, syncOptions }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ressource introuvable')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  });

  return app;
}
