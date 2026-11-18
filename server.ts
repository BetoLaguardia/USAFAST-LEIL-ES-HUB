import express from 'express';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { INITIAL_AUCTIONS } from './src/data/auctionsData.ts';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const STORE_PATH = path.resolve(process.cwd(), 'auctions_store.json');

const BANNED_PATTERNS = /govdeals|copart|liquidation\.com|apple certified/i;

const sanitizeAuctions = (lots: any[]): any[] => {
  if (!Array.isArray(lots)) return [];
  return lots.filter(lot => {
    const house = String(lot.auctionHouse || '');
    const title = String(lot.title || '');
    const source = String(lot.sourceType || '');
    return !BANNED_PATTERNS.test(house) && !BANNED_PATTERNS.test(title) && !BANNED_PATTERNS.test(source);
  });
};

const readLocalStore = (): any[] => {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Local Store] Falha ao ler auctions_store.json, usando INITIAL_AUCTIONS:', err);
  }
  return INITIAL_AUCTIONS;
};

const writeLocalStore = (lots: any[]): void => {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(lots, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Local Store] Falha ao gravar auctions_store.json:', err);
  }
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '100mb' }));

  // Endpoint para buscar leilões do Supabase (com fallback automático para auctions_store.json)
  app.get('/api/auctions', async (req, res) => {
    try {
      const q = String(req.query.search || '').trim().toLowerCase();
      const source = String(req.query.source || '').trim().toUpperCase();

      let auctionsData: any[] | null = null;

      if (supabase) {
        const { data: rows, error } = await supabase
          .from('leiloes_importados')
          .select('data');

        if (error) {
          console.error('[Supabase Error] Falha ao buscar, usando store local:', error);
        } else if (rows && rows.length > 0) {
          auctionsData = rows.map((r: any) => r.data);
        }
      }

      if (!auctionsData) {
        auctionsData = readLocalStore();
      }

      let results = sanitizeAuctions(auctionsData);

      if (source && source !== 'ALL') {
        results = results.filter((lot: any) => 
          (lot.sourceType || '').toUpperCase() === source ||
          (lot.auctionHouse || '').toUpperCase().includes(source)
        );
      }

      if (q) {
        results = results.filter((lot: any) =>
          (lot.title || '').toLowerCase().includes(q) ||
          (lot.lotNumber || '').toLowerCase().includes(q) ||
          (lot.modelFamily || '').toLowerCase().includes(q) ||
          (lot.location || '').toLowerCase().includes(q) ||
          (lot.primaryStorage || '').toLowerCase().includes(q)
        );
      }

      return res.json({ ok: true, count: results.length, total: results.length, auctions: results });
    } catch (e: any) {
      console.error('[API GET /api/auctions] Erro:', e);
      const fallback = sanitizeAuctions(readLocalStore());
      return res.json({ ok: true, count: fallback.length, total: fallback.length, auctions: fallback });
    }
  });

  // Endpoint para salvar os leilões importados
  app.post('/api/auctions', async (req, res) => {
    try {
      const { auctions } = req.body || {};
      if (Array.isArray(auctions) && auctions.length > 0) {
        const sanitized = sanitizeAuctions(auctions);

        if (supabase) {
          await supabase.from('leiloes_importados').delete().neq('id', 0);
          const rowsToInsert = sanitized.map(lot => ({ data: lot }));
          const { error: insertError } = await supabase
            .from('leiloes_importados')
            .insert(rowsToInsert);

          if (insertError) {
            console.error('[Supabase Error] Erro ao inserir:', insertError);
            return res.status(500).json({ ok: false, error: insertError.message });
          }
          console.log(`[Database Engine] Sincronizados ${sanitized.length} lotes com sucesso no Supabase!`);
        } else {
          writeLocalStore(sanitized);
          console.log(`[Local Store] Salvos ${sanitized.length} lotes em auctions_store.json`);
        }

        return res.json({ ok: true, count: sanitized.length });
      }
      return res.status(400).json({ ok: false, error: 'Array de leilões inválido' });
    } catch (e: any) {
      console.error('[API POST /api/auctions] Erro ao salvar:', e);
      return res.status(500).json({ ok: false, error: e?.message || 'Falha ao salvar' });
    }
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
