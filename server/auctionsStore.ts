import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_AUCTIONS } from '../src/data/auctionsData.ts';

const BANNED_PATTERNS = /govdeals|copart|liquidation\.com|apple certified/i;
const ROOT_STORE_PATH = path.resolve(process.cwd(), 'auctions_store.json');
const TMP_STORE_PATH = '/tmp/auctions_store.json';

function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

export function sanitizeAuctions(lots: any[]): any[] {
  if (!Array.isArray(lots)) return [];
  return lots.filter((lot) => {
    const house = String(lot?.auctionHouse || '');
    const title = String(lot?.title || '');
    const source = String(lot?.sourceType || '');
    return (
      !BANNED_PATTERNS.test(house) &&
      !BANNED_PATTERNS.test(title) &&
      !BANNED_PATTERNS.test(source)
    );
  });
}

export function readLocalStore(): any[] {
  const candidatePaths = [TMP_STORE_PATH, ROOT_STORE_PATH];

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`[Local Store] Falha ao ler ${filePath}:`, err);
    }
  }

  return INITIAL_AUCTIONS;
}

export function writeLocalStore(lots: any[]): 'local' | 'tmp' | 'memory' {
  const serialized = JSON.stringify(lots, null, 2);

  try {
    fs.writeFileSync(ROOT_STORE_PATH, serialized, 'utf-8');
    return 'local';
  } catch {
    // Em ambientes serverless como Vercel, o diretório raiz é somente leitura; tenta /tmp
    try {
      fs.writeFileSync(TMP_STORE_PATH, serialized, 'utf-8');
      return 'tmp';
    } catch (err) {
      console.warn('[Local Store] Falha ao gravar em disco e /tmp:', err);
      return 'memory';
    }
  }
}

export async function getAuctionsFromStore(options?: {
  search?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  ok: boolean;
  count: number;
  total: number;
  hasMore: boolean;
  auctions: any[];
  storage: 'supabase' | 'local';
}> {
  const q = String(options?.search || '').trim().toLowerCase();
  const source = String(options?.source || '').trim().toUpperCase();
  const offset = Math.max(0, Number(options?.offset) || 0);
  const limit = Number(options?.limit) > 0 ? Math.min(2000, Number(options?.limit)) : 0;

  let auctionsData: any[] | null = null;
  let storage: 'supabase' | 'local' = 'local';

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const pageSize = 1000;
      let from = 0;
      const allRows: any[] = [];

      while (true) {
        const { data: rows, error } = await supabase
          .from('leiloes_importados')
          .select('data')
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) {
          console.error('[Supabase Error] Falha ao buscar, usando store local:', error);
          break;
        }

        if (!rows || rows.length === 0) {
          break;
        }

        for (const r of rows) {
          if (r && r.data) {
            allRows.push(r.data);
          }
        }

        if (rows.length < pageSize) {
          break;
        }
        from += pageSize;
      }

      if (allRows.length > 0) {
        auctionsData = allRows;
        storage = 'supabase';
      }
    } catch (err) {
      console.error('[Supabase Error] Exceção ao consultar leilões:', err);
    }
  }

  if (!auctionsData) {
    auctionsData = readLocalStore();
    storage = 'local';
  }

  let results = sanitizeAuctions(auctionsData);

  if (source && source !== 'ALL') {
    results = results.filter(
      (lot: any) =>
        (lot.sourceType || '').toUpperCase() === source ||
        (lot.auctionHouse || '').toUpperCase().includes(source)
    );
  }

  if (q) {
    results = results.filter(
      (lot: any) =>
        (lot.title || '').toLowerCase().includes(q) ||
        (lot.lotNumber || '').toLowerCase().includes(q) ||
        (lot.modelFamily || '').toLowerCase().includes(q) ||
        (lot.location || '').toLowerCase().includes(q) ||
        (lot.primaryStorage || '').toLowerCase().includes(q)
    );
  }

  const total = results.length;
  const paged = limit > 0 ? results.slice(offset, offset + limit) : results.slice(offset);
  const hasMore = offset + paged.length < total;

  return {
    ok: true,
    count: paged.length,
    total,
    hasMore,
    auctions: paged,
    storage,
  };
}

export async function saveAuctionsToStore(
  auctions: any[],
  mode: 'replace' | 'append' = 'replace'
): Promise<{
  ok: boolean;
  count: number;
  storage: 'supabase' | 'local' | 'tmp' | 'memory';
  error?: string;
}> {
  if (!Array.isArray(auctions) || auctions.length === 0) {
    return {
      ok: false,
      count: 0,
      storage: 'memory',
      error: 'Array de leilões inválido',
    };
  }

  const sanitized = sanitizeAuctions(auctions);
  const supabase = getSupabaseClient();

  if (supabase) {
    if (mode === 'replace') {
      const { error: deleteError } = await supabase
        .from('leiloes_importados')
        .delete()
        .neq('id', 0);

      if (deleteError) {
        console.error('[Supabase Error] Erro ao limpar registros antigos:', deleteError);
        return {
          ok: false,
          count: 0,
          storage: 'supabase',
          error: deleteError.message,
        };
      }
    }

    const chunkSize = 200;
    for (let i = 0; i < sanitized.length; i += chunkSize) {
      const chunk = sanitized.slice(i, i + chunkSize).map((lot) => ({ data: lot }));
      const { error: insertError } = await supabase
        .from('leiloes_importados')
        .insert(chunk);

      if (insertError) {
        console.error('[Supabase Error] Erro ao inserir lote:', insertError);
        return {
          ok: false,
          count: i,
          storage: 'supabase',
          error: insertError.message,
        };
      }
    }

    if (mode === 'replace') {
      writeLocalStore(sanitized);
    }
    console.log(`[Database Engine] Sincronizados ${sanitized.length} lotes (${mode}) com sucesso no Supabase!`);
    return { ok: true, count: sanitized.length, storage: 'supabase' };
  }

  const nextLots = mode === 'append' ? [...readLocalStore(), ...sanitized] : sanitized;
  const localStorageMode = writeLocalStore(nextLots);
  console.log(`[Local Store] Salvos ${nextLots.length} lotes (${mode}, ${localStorageMode})`);
  return { ok: true, count: sanitized.length, storage: localStorageMode };
}
