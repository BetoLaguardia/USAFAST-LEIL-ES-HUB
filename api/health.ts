import { isSupabaseConfigured } from '../server/auctionsStore.ts';

export default function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({
    ok: true,
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    supabaseConfigured: isSupabaseConfigured(),
    timestamp: new Date().toISOString(),
  });
}
