import { supabase } from './supabaseClient';
import { SystemUser } from '../types/auction';

export const EMPTY_SYSTEM_USER: SystemUser = {
  name: '',
  email: '',
  cpfCnpj: '',
  phone: '',
  biddingLimitUsd: 0,
  verifiedStatus: false,
  registeredDate: '',
  approvalStatus: 'PENDING',
  role: 'client',
};

export function clearLegacyAuthStorage() {
  try {
    localStorage.removeItem('us_admin_auth');
    localStorage.removeItem('us_client_auth');
    localStorage.removeItem('us_admin_custom_password');
    localStorage.removeItem('us_registered_clients');
    localStorage.removeItem('us_iphone_client_user');
  } catch {}
}

async function fetchProfileWithToken(accessToken: string): Promise<{
  ok: boolean;
  role?: 'admin' | 'client';
  user?: SystemUser;
  error?: string;
}> {
  const res = await fetch('/api/auth?action=me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data?.user) {
    return { ok: false, error: data?.error || 'Não foi possível carregar seu perfil.' };
  }
  return { ok: true, role: data.role, user: data.user as SystemUser };
}

export async function signInAdminWithSupabase(
  emailInput: string,
  passwordInput: string
): Promise<{ ok: boolean; user?: SystemUser; error?: string }> {
  if (!supabase) {
    return { ok: false, error: 'Serviço de autenticação indisponível.' };
  }

  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;

  if (!email || !password) {
    return { ok: false, error: 'Informe e-mail e senha para entrar.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    return {
      ok: false,
      error: 'Credenciais inválidas. Verifique o e-mail e a senha informados.',
    };
  }

  const profile = await fetchProfileWithToken(data.session.access_token);
  if (!profile.ok || profile.role !== 'admin' || !profile.user) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: 'Esta conta não possui permissão de administrador.',
    };
  }

  clearLegacyAuthStorage();
  return { ok: true, user: profile.user };
}

export async function signInClientWithSupabase(
  emailOrDocInput: string,
  passwordInput: string
): Promise<{ ok: boolean; user?: SystemUser; error?: string }> {
  if (!supabase) {
    return { ok: false, error: 'Serviço de autenticação indisponível.' };
  }

  const identifier = emailOrDocInput.trim();
  const password = passwordInput;

  if (!identifier || !password) {
    return { ok: false, error: 'Informe seu e-mail/CPF/CNPJ e senha.' };
  }

  let resolvedEmail = identifier.toLowerCase();
  if (!identifier.includes('@')) {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve-identifier', identifier }),
    });
    const resData = await res.json().catch(() => ({}));
    if (!res.ok || !resData?.ok || !resData?.email) {
      return {
        ok: false,
        error: 'E-mail/CPF ou senha incorretos. Verifique seus dados ou realize seu cadastro.',
      };
    }
    resolvedEmail = String(resData.email).toLowerCase();
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password,
  });

  if (error || !data?.session?.access_token) {
    return {
      ok: false,
      error: 'E-mail/CPF ou senha incorretos. Verifique seus dados ou realize seu cadastro.',
    };
  }

  const profile = await fetchProfileWithToken(data.session.access_token);
  if (!profile.ok || !profile.user) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: profile.error || 'Perfil não encontrado no banco de dados.',
    };
  }

  const user = profile.user;
  if (profile.role !== 'admin') {
    if (user.approvalStatus === 'PENDING' || (!user.verifiedStatus && user.approvalStatus !== 'APPROVED' && user.approvalStatus !== 'REJECTED')) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: '⏳ Seu cadastro foi recebido e está em análise pela nossa equipe de credenciamento. O acesso ao sistema de leilões será liberado assim que o Administrador aprovar.',
      };
    }

    if (user.approvalStatus === 'REJECTED') {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: '🚫 Seu cadastro foi suspenso ou recusado pela administração.',
      };
    }
  }

  clearLegacyAuthStorage();
  return { ok: true, user };
}

export async function registerClientWithSupabase(payload: {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  whatsappNotificationEnabled?: boolean;
  password: string;
}): Promise<{ ok: boolean; user?: SystemUser; error?: string }> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register-client',
      ...payload,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error || 'Não foi possível concluir o cadastro.',
    };
  }
  return { ok: true, user: data.user as SystemUser };
}

export async function restoreSupabaseSession(): Promise<{
  isAdmin: boolean;
  isClient: boolean;
  user: SystemUser;
}> {
  if (!supabase) {
    return { isAdmin: false, isClient: false, user: EMPTY_SYSTEM_USER };
  }

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    return { isAdmin: false, isClient: false, user: EMPTY_SYSTEM_USER };
  }

  const profile = await fetchProfileWithToken(token);
  if (!profile.ok || !profile.user) {
    await supabase.auth.signOut();
    return { isAdmin: false, isClient: false, user: EMPTY_SYSTEM_USER };
  }

  if (profile.role === 'admin') {
    return { isAdmin: true, isClient: true, user: profile.user };
  }

  if (profile.user.approvalStatus === 'APPROVED' || profile.user.verifiedStatus) {
    return { isAdmin: false, isClient: true, user: profile.user };
  }

  await supabase.auth.signOut();
  return { isAdmin: false, isClient: false, user: EMPTY_SYSTEM_USER };
}

export async function signOutFromSupabase() {
  clearLegacyAuthStorage();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export async function fetchAdminClients(): Promise<{
  ok: boolean;
  clients: SystemUser[];
  error?: string;
}> {
  if (!supabase) {
    return { ok: false, clients: [], error: 'Supabase não configurado.' };
  }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    return { ok: false, clients: [], error: 'Sessão administrativa expirada.' };
  }

  const res = await fetch('/api/auth?action=clients', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    return { ok: false, clients: [], error: json?.error || 'Falha ao carregar clientes.' };
  }
  return { ok: true, clients: json.clients || [] };
}

export async function updateAdminClientStatus(
  clientId: string | undefined,
  email: string,
  approvalStatus: 'APPROVED' | 'REJECTED'
): Promise<{ ok: boolean; client?: SystemUser; error?: string }> {
  if (!supabase) {
    return { ok: false, error: 'Supabase não configurado.' };
  }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    return { ok: false, error: 'Sessão administrativa expirada.' };
  }

  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'update-client-status',
      clientId,
      email,
      approvalStatus,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error || 'Falha ao atualizar cliente.' };
  }
  return { ok: true, client: json.client as SystemUser };
}
