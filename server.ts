import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import {
  getAuctionsFromStore,
  isSupabaseConfigured,
  readLocalStore,
  sanitizeAuctions,
  saveAuctionsToStore,
} from './server/auctionsStore.ts';
import {
  deleteClientAccount,
  getAuthenticatedProfile,
  listClientsForAdmin,
  registerClientInSupabase,
  resolveClientIdentifier,
  updateClientAccessType,
  updateClientApprovalStatus,
} from './server/authService.ts';

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '100mb' }));

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.json({
      ok: true,
      runtime: 'express',
      supabaseConfigured: isSupabaseConfigured(),
      timestamp: new Date().toISOString(),
    });
  });

  // Endpoint para buscar leilões do Supabase (com fallback automático para auctions_store.json)
  app.get('/api/auctions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      const search = String(req.query.search || '');
      const source = String(req.query.source || '');
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const result = await getAuctionsFromStore({ search, source, limit, offset });
      return res.json(result);
    } catch (e: any) {
      console.error('[API GET /api/auctions] Erro:', e);
      const fallback = sanitizeAuctions(readLocalStore());
      return res.json({
        ok: true,
        count: fallback.length,
        total: fallback.length,
        hasMore: false,
        auctions: fallback,
        storage: 'local',
      });
    }
  });

  // Endpoint para salvar ou limpar os leilões importados
  app.post('/api/auctions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      const { auctions, mode } = req.body || {};
      const saveMode = mode === 'append' ? 'append' : mode === 'clear' ? 'clear' : 'replace';
      const result = await saveAuctionsToStore(saveMode === 'clear' ? [] : auctions, saveMode);
      if (!result.ok) {
        const statusCode = result.error === 'Array de leilões inválido' ? 400 : 500;
        return res.status(statusCode).json({ ok: false, error: result.error });
      }
      return res.json(result);
    } catch (e: any) {
      console.error('[API POST /api/auctions] Erro ao salvar:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'Falha ao salvar' });
    }
  });

  app.get('/api/auth', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const authHeader = req.headers.authorization;
    const action = String(req.query.action || 'me');
    if (action === 'clients') {
      const result = await listClientsForAdmin(authHeader);
      return res.status(result.status).json(result);
    }
    const result = await getAuthenticatedProfile(authHeader);
    return res.status(result.status).json(result);
  });

  app.post('/api/auth', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const authHeader = req.headers.authorization;
    const body = req.body || {};
    const action = String(body.action || '');

    if (action === 'resolve-identifier') {
      const result = await resolveClientIdentifier(body.identifier);
      return res.status(result.status).json(result);
    }

    if (action === 'register-client') {
      const result = await registerClientInSupabase(body);
      return res.status(result.status).json(result);
    }

    if (action === 'update-client-status') {
      const result = await updateClientApprovalStatus(authHeader, body);
      return res.status(result.status).json(result);
    }

    if (action === 'update-client-access') {
      const result = await updateClientAccessType(authHeader, body);
      return res.status(result.status).json(result);
    }

    if (action === 'delete-client') {
      const result = await deleteClientAccount(authHeader, body);
      return res.status(result.status).json(result);
    }

    if (action === 'me') {
      const result = await getAuthenticatedProfile(authHeader);
      return res.status(result.status).json(result);
    }

    return res.status(400).json({ ok: false, error: 'Ação inválida.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
