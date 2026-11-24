import {
  detectMailProvider,
  getConfiguredNotificationEmails,
  requireAdminForEmailConfig,
  saveConfiguredNotificationEmails,
  sendOfferNotificationEmail,
  sendTestNotificationEmail,
} from '../server/emailNotificationService.ts';

function setHeaders(res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

  const authHeader = req.headers?.authorization as string | undefined;

  if (req.method === 'GET') {
    const authCheck = await requireAdminForEmailConfig(authHeader);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
    }
    const config = await getConfiguredNotificationEmails();
    const provider = detectMailProvider();
    return res.status(200).json({
      ok: true,
      emails: config.emails,
      initialized: config.initialized,
      provider: provider.provider,
      configured: provider.configured,
      providerSummary: provider.summary,
    });
  }

  if (req.method === 'POST') {
    const body = parseBody(req.body);
    const action = String(body?.action || 'notify-offer');

    if (action === 'save-config') {
      const authCheck = await requireAdminForEmailConfig(authHeader);
      if (!authCheck.ok) {
        return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
      }
      const saved = await saveConfiguredNotificationEmails(body?.emails);
      const provider = detectMailProvider();
      return res.status(200).json({
        ok: saved.ok,
        emails: saved.emails,
        provider: provider.provider,
        configured: provider.configured,
        providerSummary: provider.summary,
      });
    }

    if (action === 'send-test') {
      const authCheck = await requireAdminForEmailConfig(authHeader);
      if (!authCheck.ok) {
        return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
      }
      const result = await sendTestNotificationEmail();
      return res.status(200).json(result);
    }

    if (action === 'notify-offer') {
      const offer = body?.offer || body;
      const result = await sendOfferNotificationEmail({
        lotId: offer?.lotId,
        lotNumber: offer?.lotNumber,
        lotTitle: offer?.lotTitle,
        auctionHouse: offer?.auctionHouse,
        quantity: Number(offer?.quantity || 1),
        unitPriceUsd: offer?.unitPriceUsd !== undefined ? Number(offer.unitPriceUsd) : undefined,
        amountUsd: Number(offer?.amountUsd || 0),
        amountBrl: Number(offer?.amountBrl || 0),
        clientName: offer?.clientName,
        clientEmail: offer?.clientEmail,
        clientPhone: offer?.clientPhone,
        isDirectPurchase: Boolean(offer?.isDirectPurchase),
        timestamp: offer?.timestamp,
      });
      return res.status(200).json(result);
    }

    return res.status(400).json({ ok: false, error: 'Ação inválida.' });
  }

  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
