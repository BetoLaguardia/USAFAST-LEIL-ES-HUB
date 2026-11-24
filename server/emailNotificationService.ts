import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedProfile } from './authService.ts';

const ROOT_CONFIG_PATH = path.resolve(process.cwd(), 'notification_emails_store.json');
const TMP_CONFIG_PATH = '/tmp/notification_emails_store.json';
const DEFAULT_EMAILS = ['roblagua@gmail.com'];

export interface OfferEmailPayload {
  lotId?: string;
  lotNumber: string;
  lotTitle: string;
  auctionHouse?: string;
  quantity: number;
  unitPriceUsd?: number;
  amountUsd: number;
  amountBrl: number;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  isDirectPurchase?: boolean;
  timestamp?: string;
}

export type MailProviderType = 'resend' | 'smtp' | 'gmail' | 'none';

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function sanitizeEmailList(emails: unknown): string[] {
  if (!Array.isArray(emails)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const clean = String(raw || '').trim().toLowerCase();
    if (clean && isValidEmail(clean) && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function getEnvFallbackEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAILS || '';
  if (!raw.trim()) return [];
  return sanitizeEmailList(raw.split(','));
}

function readLocalEmailConfig(): { emails: string[]; initialized: boolean } {
  for (const filePath of [TMP_CONFIG_PATH, ROOT_CONFIG_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(parsed)) {
          return { emails: sanitizeEmailList(parsed), initialized: true };
        }
        if (parsed && Array.isArray(parsed.emails)) {
          return { emails: sanitizeEmailList(parsed.emails), initialized: true };
        }
      }
    } catch {
      // ignore malformed local cache
    }
  }
  return { emails: [], initialized: false };
}

function writeLocalEmailConfig(emails: string[]): void {
  const payload = JSON.stringify({ emails, updatedAt: new Date().toISOString() }, null, 2);
  try {
    fs.writeFileSync(ROOT_CONFIG_PATH, payload, 'utf-8');
  } catch {
    // ignore read-only root FS in serverless
  }
  try {
    fs.writeFileSync(TMP_CONFIG_PATH, payload, 'utf-8');
  } catch {
    // ignore /tmp write failure
  }
}

export async function getConfiguredNotificationEmails(): Promise<{
  emails: string[];
  initialized: boolean;
}> {
  const envEmails = getEnvFallbackEmails();
  const sb = getSupabaseAdmin();

  if (sb) {
    try {
      const { data, error } = await sb
        .from('app_settings')
        .select('value')
        .eq('key', 'notification_emails')
        .maybeSingle();

      if (!error && data && Array.isArray(data.value)) {
        const stored = sanitizeEmailList(data.value);
        const merged = sanitizeEmailList([...stored, ...envEmails]);
        return { emails: merged.length > 0 ? merged : DEFAULT_EMAILS, initialized: true };
      }
    } catch {
      // app_settings table may not exist yet; fall back to local store
    }
  }

  const local = readLocalEmailConfig();
  if (local.initialized) {
    const merged = sanitizeEmailList([...local.emails, ...envEmails]);
    return { emails: merged, initialized: true };
  }

  const seeded = sanitizeEmailList([...DEFAULT_EMAILS, ...envEmails]);
  return { emails: seeded, initialized: false };
}

export async function saveConfiguredNotificationEmails(emails: unknown): Promise<{
  ok: boolean;
  emails: string[];
}> {
  const cleaned = sanitizeEmailList(emails);
  writeLocalEmailConfig(cleaned);

  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      await sb
        .from('app_settings')
        .upsert(
          {
            key: 'notification_emails',
            value: cleaned,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );
    } catch {
      // graceful fallback if app_settings table doesn't exist
    }
  }

  return { ok: true, emails: cleaned };
}

export function detectMailProvider(): {
  provider: MailProviderType;
  configured: boolean;
  summary: string;
} {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
    return {
      provider: 'resend',
      configured: true,
      summary: 'Resend API configurado',
    };
  }

  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    return {
      provider: 'smtp',
      configured: true,
      summary: `SMTP configurado (${process.env.SMTP_HOST})`,
    };
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      provider: 'gmail',
      configured: true,
      summary: 'Gmail SMTP configurado',
    };
  }

  return {
    provider: 'none',
    configured: false,
    summary: 'Nenhum provedor de e-mail (RESEND_API_KEY ou SMTP_HOST/SMTP_USER/SMTP_PASS) configurado no servidor.',
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function deliverEmail(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; provider: MailProviderType; error?: string }> {
  const status = detectMailProvider();

  if (!status.configured) {
    return {
      ok: false,
      provider: 'none',
      error:
        'Provedor de e-mail não configurado no servidor. Defina RESEND_API_KEY ou SMTP_HOST / SMTP_USER / SMTP_PASS (ou GMAIL_USER / GMAIL_APP_PASSWORD) nas variáveis de ambiente.',
    };
  }

  if (params.to.length === 0) {
    return {
      ok: false,
      provider: status.provider,
      error: 'Nenhum e-mail de destino cadastrado no painel administrativo.',
    };
  }

  if (status.provider === 'resend') {
    const fromEmail =
      process.env.RESEND_FROM_EMAIL?.trim() ||
      'USAFAST Leilões <onboarding@resend.dev>';

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!resp.ok) {
        const bodyText = await resp.text().catch(() => '');
        return {
          ok: false,
          provider: 'resend',
          error: `Resend API retornou erro (${resp.status}): ${bodyText.slice(0, 220)}`,
        };
      }
      return { ok: true, provider: 'resend' };
    } catch (err: any) {
      return {
        ok: false,
        provider: 'resend',
        error: err?.message || 'Falha de rede ao enviar via Resend API.',
      };
    }
  }

  try {
    const transporter =
      status.provider === 'gmail'
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.GMAIL_USER!.trim(),
              pass: process.env.GMAIL_APP_PASSWORD!.trim(),
            },
          })
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST!.trim(),
            port: Number(process.env.SMTP_PORT || 587),
            secure:
              String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
              Number(process.env.SMTP_PORT) === 465,
            auth: {
              user: process.env.SMTP_USER!.trim(),
              pass: process.env.SMTP_PASS!.trim(),
            },
          });

    const fromAddress =
      process.env.SMTP_FROM?.trim() ||
      process.env.SMTP_USER?.trim() ||
      process.env.GMAIL_USER?.trim() ||
      'no-reply@usafastleiloes.com';

    await transporter.sendMail({
      from: `USAFAST Leilões <${fromAddress}>`,
      to: params.to.join(', '),
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    return { ok: true, provider: status.provider };
  } catch (err: any) {
    return {
      ok: false,
      provider: status.provider,
      error: err?.message || 'Falha ao enviar e-mail via SMTP.',
    };
  }
}

export async function requireAdminForEmailConfig(authHeader?: string): Promise<{
  ok: boolean;
  status: number;
  error?: string;
}> {
  const sbConfigured = Boolean(
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );

  if (!sbConfigured) {
    return { ok: true, status: 200 };
  }

  const profile = await getAuthenticatedProfile(authHeader);
  if (!profile.ok) {
    return { ok: false, status: profile.status, error: profile.error || 'Não autorizado.' };
  }
  if (profile.role !== 'admin') {
    return { ok: false, status: 403, error: 'Acesso restrito a administradores.' };
  }
  return { ok: true, status: 200 };
}

export async function sendOfferNotificationEmail(payload: OfferEmailPayload): Promise<{
  ok: boolean;
  sentTo: string[];
  provider: MailProviderType;
  configured: boolean;
  error?: string;
}> {
  const lotNumber = String(payload.lotNumber || '').trim().slice(0, 64);
  const lotTitle = String(payload.lotTitle || '').trim().slice(0, 220);
  const auctionHouse = String(payload.auctionHouse || 'USAFAST Hub').trim().slice(0, 120);
  const clientName = String(payload.clientName || 'Cliente').trim().slice(0, 120);
  const clientEmail = String(payload.clientEmail || 'Não informado').trim().slice(0, 160);
  const clientPhone = String(payload.clientPhone || '').trim().slice(0, 60);
  const quantity = Math.max(1, Math.min(100000, Math.round(Number(payload.quantity) || 1)));
  const amountUsd = Number(payload.amountUsd);
  const amountBrl = Number(payload.amountBrl) || 0;
  const unitPriceUsd =
    Number(payload.unitPriceUsd) > 0
      ? Number(payload.unitPriceUsd)
      : Math.round((amountUsd / quantity) * 100) / 100;
  const isDirectPurchase = Boolean(payload.isDirectPurchase);
  const timestamp = String(payload.timestamp || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })).slice(0, 80);

  if (!lotNumber || !lotTitle || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    return {
      ok: false,
      sentTo: [],
      provider: detectMailProvider().provider,
      configured: detectMailProvider().configured,
      error: 'Dados inválidos da oferta para envio de notificação.',
    };
  }

  const { emails } = await getConfiguredNotificationEmails();
  const providerInfo = detectMailProvider();

  const kindLabel = isDirectPurchase ? 'COMPRA DIRETA (PRONTA ENTREGA)' : 'NOVA OFERTA / LANCE COMPUTADO';
  const accentColor = isDirectPurchase ? '#10b981' : '#f59e0b';
  const subject = isDirectPurchase
    ? `[Compra Direta] ${lotNumber} · ${quantity} un. · $${amountUsd.toLocaleString('en-US')} USD (${clientName})`
    : `[Nova Oferta] ${lotNumber} · $${amountUsd.toLocaleString('en-US')} USD (${clientName})`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#0f172a; color:#f8fafc; padding:24px; border-radius:12px; max-width:640px; margin:0 auto;">
      <div style="border-bottom:2px solid ${accentColor}; padding-bottom:12px; margin-bottom:18px;">
        <div style="font-size:11px; font-weight:700; letter-spacing:1px; color:${accentColor}; text-transform:uppercase;">
          ${escapeHtml(kindLabel)}
        </div>
        <h2 style="margin:6px 0 0; font-size:20px; color:#ffffff;">
          Lote ${escapeHtml(lotNumber)} — ${escapeHtml(lotTitle)}
        </h2>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:13px; background:#1e293b; border-radius:8px; overflow:hidden;">
        <tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">Origem / Casa</td><td style="padding:10px 14px; font-weight:700; color:#ffffff; border-bottom:1px solid #334155;">${escapeHtml(auctionHouse)}</td></tr>
        <tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">Cliente</td><td style="padding:10px 14px; font-weight:700; color:#ffffff; border-bottom:1px solid #334155;">${escapeHtml(clientName)}</td></tr>
        <tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">E-mail do Cliente</td><td style="padding:10px 14px; color:#e2e8f0; border-bottom:1px solid #334155;">${escapeHtml(clientEmail)}</td></tr>
        ${clientPhone ? `<tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">Telefone / WhatsApp</td><td style="padding:10px 14px; color:#e2e8f0; border-bottom:1px solid #334155;">${escapeHtml(clientPhone)}</td></tr>` : ''}
        <tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">Quantidade</td><td style="padding:10px 14px; font-weight:700; color:#ffffff; border-bottom:1px solid #334155;">${quantity} unidade(s)</td></tr>
        <tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">Valor Unitário</td><td style="padding:10px 14px; font-family:monospace; color:#e2e8f0; border-bottom:1px solid #334155;">$${unitPriceUsd.toLocaleString('en-US')} USD</td></tr>
        <tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">Total (USD)</td><td style="padding:10px 14px; font-family:monospace; font-size:16px; font-weight:800; color:${accentColor}; border-bottom:1px solid #334155;">$${amountUsd.toLocaleString('en-US')} USD</td></tr>
        <tr><td style="padding:10px 14px; color:#94a3b8; border-bottom:1px solid #334155;">Total Aprox. (BRL)</td><td style="padding:10px 14px; font-family:monospace; color:#cbd5e1; border-bottom:1px solid #334155;">R$ ${Math.round(amountBrl).toLocaleString('pt-BR')}</td></tr>
        <tr><td style="padding:10px 14px; color:#94a3b8;">Data / Hora</td><td style="padding:10px 14px; color:#cbd5e1;">${escapeHtml(timestamp)}</td></tr>
      </table>
      <p style="margin-top:16px; font-size:12px; color:#94a3b8;">
        Acesse o Painel Admin na aba "Ofertas / Compras Computadas" para gerenciar ou emitir o invoice deste pedido.
      </p>
    </div>
  `;

  const text = [
    kindLabel,
    `Lote: ${lotNumber} - ${lotTitle}`,
    `Origem: ${auctionHouse}`,
    `Cliente: ${clientName} (${clientEmail})${clientPhone ? ` | Tel: ${clientPhone}` : ''}`,
    `Quantidade: ${quantity} un.`,
    `Valor Unitario: $${unitPriceUsd.toLocaleString('en-US')} USD`,
    `Total: $${amountUsd.toLocaleString('en-US')} USD (aprox. R$ ${Math.round(amountBrl).toLocaleString('pt-BR')})`,
    `Data/Hora: ${timestamp}`,
  ].join('\n');

  const delivery = await deliverEmail({
    to: emails,
    subject,
    html,
    text,
  });

  return {
    ok: delivery.ok,
    sentTo: delivery.ok ? emails : [],
    provider: providerInfo.provider,
    configured: providerInfo.configured,
    error: delivery.error,
  };
}

export async function sendTestNotificationEmail(): Promise<{
  ok: boolean;
  sentTo: string[];
  provider: MailProviderType;
  configured: boolean;
  error?: string;
}> {
  const { emails } = await getConfiguredNotificationEmails();
  const providerInfo = detectMailProvider();

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const delivery = await deliverEmail({
    to: emails,
    subject: '[USAFAST] Teste de Notificação de Ofertas & Compras Diretas',
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background:#0f172a; color:#f8fafc; padding:24px; border-radius:12px; max-width:560px;">
        <h2 style="margin:0 0 10px; color:#10b981;">Teste de E-mail Concluído!</h2>
        <p style="font-size:13px; color:#cbd5e1; line-height:1.5;">
          Os alertas automáticos para novas ofertas e compras diretas (Pronta Entrega) estão ativos e configurados corretamente.
        </p>
        <p style="font-size:12px; color:#94a3b8; margin-top:14px;">
          Destinatários ativos: <strong>${escapeHtml(emails.join(', '))}</strong><br/>
          Horário do teste: ${escapeHtml(now)}
        </p>
      </div>
    `,
    text: `Teste de notificacao USAFAST concluido em ${now}. Destinatarios: ${emails.join(', ')}`,
  });

  return {
    ok: delivery.ok,
    sentTo: delivery.ok ? emails : [],
    provider: providerInfo.provider,
    configured: providerInfo.configured,
    error: delivery.error,
  };
}
