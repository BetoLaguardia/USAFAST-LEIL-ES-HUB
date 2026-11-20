import {
  getAuctionsFromStore,
  readLocalStore,
  sanitizeAuctions,
  saveAuctionsToStore,
} from '../server/auctionsStore.ts';

function setHeaders(res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(body: any): any {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export default async function handler(req: any, res: any) {
  setHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    try {
      const search = String(req.query?.search || '');
      const source = String(req.query?.source || '');
      const limit = req.query?.limit ? Number(req.query.limit) : undefined;
      const offset = req.query?.offset ? Number(req.query.offset) : undefined;
      const result = await getAuctionsFromStore({ search, source, limit, offset });
      return res.status(200).json(result);
    } catch (e: any) {
      console.error('[Vercel API GET /api/auctions] Erro:', e);
      const fallback = sanitizeAuctions(readLocalStore());
      return res.status(200).json({
        ok: true,
        count: fallback.length,
        total: fallback.length,
        hasMore: false,
        auctions: fallback,
        storage: 'local',
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = parseBody(req.body);
      const { auctions, mode } = body || {};
      const saveMode = mode === 'append' ? 'append' : mode === 'clear' ? 'clear' : 'replace';
      const result = await saveAuctionsToStore(saveMode === 'clear' ? [] : auctions, saveMode);

      if (!result.ok) {
        const statusCode = result.error === 'Array de leilões inválido' ? 400 : 500;
        return res.status(statusCode).json({ ok: false, error: result.error });
      }

      return res.status(200).json(result);
    } catch (e: any) {
      console.error('[Vercel API POST /api/auctions] Erro ao salvar:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'Falha ao salvar' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
