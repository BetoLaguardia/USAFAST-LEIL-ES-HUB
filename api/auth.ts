import {
  deleteClientAccount,
  getAuthenticatedProfile,
  listClientsForAdmin,
  registerClientInSupabase,
  resolveClientIdentifier,
  updateClientAccessType,
  updateClientApprovalStatus,
} from '../server/authService.ts';

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

  const authHeader = req.headers?.authorization as string | undefined;

  if (req.method === 'GET') {
    const action = String(req.query?.action || 'me');
    if (action === 'clients') {
      const result = await listClientsForAdmin(authHeader);
      return res.status(result.status).json(result);
    }
    const result = await getAuthenticatedProfile(authHeader);
    return res.status(result.status).json(result);
  }

  if (req.method === 'POST') {
    const body = parseBody(req.body);
    const action = String(body?.action || '');

    if (action === 'resolve-identifier') {
      const result = await resolveClientIdentifier(body?.identifier);
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
  }

  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
