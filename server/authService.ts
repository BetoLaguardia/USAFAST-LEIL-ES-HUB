import { createClient, SupabaseClient, type User } from '@supabase/supabase-js';

function getSupabaseAdminClient(): SupabaseClient | null {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeDigits(val: string): string {
  return String(val || '').replace(/\D/g, '');
}

function mapClientRowToUser(row: any) {
  return {
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    cpfCnpj: row.cpf_cnpj || '',
    phone: row.phone || '',
    whatsapp: row.phone || '',
    whatsappNotificationEnabled: true,
    biddingLimitUsd: Number(row.bidding_limit_usd ?? 25000),
    verifiedStatus: Boolean(row.verified_status),
    approvalStatus: (row.approval_status || (row.verified_status ? 'APPROVED' : 'PENDING')) as
      | 'APPROVED'
      | 'PENDING'
      | 'REJECTED',
    registeredDate: row.registered_date || '',
    role: 'client' as const,
  };
}

function mapSystemUserToUser(row: any, fallbackAuthUser?: User) {
  return {
    id: row?.id || fallbackAuthUser?.id,
    name: row?.full_name || fallbackAuthUser?.user_metadata?.full_name || 'Administrador',
    email: row?.email || fallbackAuthUser?.email || '',
    cpfCnpj: '',
    phone: row?.phone || '',
    whatsapp: row?.phone || '',
    whatsappNotificationEnabled: true,
    biddingLimitUsd: 100000,
    verifiedStatus: true,
    approvalStatus: 'APPROVED' as const,
    registeredDate: '',
    role: 'admin' as const,
  };
}

async function authenticateBearerToken(
  sb: SupabaseClient,
  authHeader?: string
): Promise<{ user: User | null; error?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Token de autenticação ausente.' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { user: null, error: 'Token de autenticação inválido.' };
  }

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, error: 'Sessão expirada ou inválida.' };
  }
  return { user: data.user };
}

async function resolveAdminRecord(sb: SupabaseClient, authUser: User) {
  const emailLower = (authUser.email || '').toLowerCase();

  const { data: byId } = await sb
    .from('system_users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (byId && String(byId.role).toLowerCase() === 'admin') {
    return byId;
  }

  if (emailLower) {
    const { data: byEmail } = await sb
      .from('system_users')
      .select('*')
      .ilike('email', emailLower)
      .maybeSingle();

    if (byEmail && String(byEmail.role).toLowerCase() === 'admin') {
      return byEmail;
    }
  }

  if (authUser.app_metadata?.role === 'admin') {
    return {
      id: authUser.id,
      email: authUser.email,
      full_name: authUser.user_metadata?.full_name || 'Administrador',
      role: 'admin',
      phone: authUser.user_metadata?.phone || '',
    };
  }

  return null;
}

export async function resolveClientIdentifier(identifier: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    return { ok: false, status: 500, error: 'Serviço de banco de dados não configurado.' };
  }

  const clean = String(identifier || '').trim();
  if (!clean) {
    return { ok: false, status: 400, error: 'Informe seu e-mail ou CPF/CNPJ.' };
  }

  if (clean.includes('@')) {
    return { ok: true, status: 200, email: clean.toLowerCase() };
  }

  const digits = normalizeDigits(clean);
  if (!digits) {
    return { ok: false, status: 404, error: 'Cadastro não encontrado.' };
  }

  const { data: clients, error } = await sb
    .from('clients')
    .select('email, cpf_cnpj');

  if (error) {
    return { ok: false, status: 500, error: 'Falha ao consultar cadastro.' };
  }

  const matched = (clients || []).find((c: any) => normalizeDigits(c.cpf_cnpj) === digits);
  if (!matched?.email) {
    return { ok: false, status: 404, error: 'E-mail ou CPF/CNPJ não encontrado.' };
  }

  return { ok: true, status: 200, email: String(matched.email).toLowerCase() };
}

export async function getAuthenticatedProfile(authHeader?: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    return { ok: false, status: 500, error: 'Serviço de banco de dados não configurado.' };
  }

  const { user: authUser, error: authErr } = await authenticateBearerToken(sb, authHeader);
  if (!authUser) {
    return { ok: false, status: 401, error: authErr || 'Não autenticado.' };
  }

  const adminRecord = await resolveAdminRecord(sb, authUser);
  if (adminRecord) {
    return {
      ok: true,
      status: 200,
      role: 'admin' as const,
      user: mapSystemUserToUser(adminRecord, authUser),
    };
  }

  const emailLower = (authUser.email || '').toLowerCase();
  const { data: clientById } = await sb
    .from('clients')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  let clientRow = clientById;
  if (!clientRow && emailLower) {
    const { data: clientByEmail } = await sb
      .from('clients')
      .select('*')
      .ilike('email', emailLower)
      .maybeSingle();
    clientRow = clientByEmail;
  }

  if (clientRow) {
    return {
      ok: true,
      status: 200,
      role: 'client' as const,
      user: mapClientRowToUser(clientRow),
    };
  }

  return {
    ok: false,
    status: 404,
    error: 'Perfil de usuário não encontrado no banco de dados.',
  };
}

export async function registerClientInSupabase(payload: {
  name?: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
  whatsappNotificationEnabled?: boolean;
  password?: string;
}) {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    return { ok: false, status: 500, error: 'Serviço de banco de dados não configurado.' };
  }

  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const cpfCnpj = String(payload.cpfCnpj || '').trim();
  const phone = String(payload.phone || '').trim();
  const password = String(payload.password || '');

  if (!name || !email || !cpfCnpj || !phone) {
    return { ok: false, status: 400, error: 'Preencha todos os campos obrigatórios do cadastro.' };
  }

  if (password.length < 6) {
    return { ok: false, status: 400, error: 'A senha deve conter pelo menos 6 caracteres.' };
  }

  // Check duplicate email or CPF/CNPJ in clients table
  const { data: existingClients, error: existingErr } = await sb
    .from('clients')
    .select('id, email, cpf_cnpj');

  if (existingErr) {
    return { ok: false, status: 500, error: 'Erro ao verificar cadastros existentes.' };
  }

  const normalizedDoc = normalizeDigits(cpfCnpj);
  const duplicate = (existingClients || []).find(
    (c: any) =>
      String(c.email || '').toLowerCase() === email ||
      (normalizedDoc && normalizeDigits(c.cpf_cnpj) === normalizedDoc)
  );

  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: 'Já existe um cadastro registrado com este e-mail ou CPF/CNPJ.',
    };
  }

  // Create user in Supabase Auth
  const { data: createdAuth, error: createAuthErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'client' },
    user_metadata: {
      name,
      cpf_cnpj: cpfCnpj,
      phone,
      whatsappNotificationEnabled: Boolean(payload.whatsappNotificationEnabled ?? true),
    },
  });

  if (createAuthErr || !createdAuth?.user) {
    const msg = createAuthErr?.message || '';
    if (/already|registered|exists/i.test(msg)) {
      return { ok: false, status: 409, error: 'Este e-mail já está registrado no sistema.' };
    }
    return {
      ok: false,
      status: 400,
      error: createAuthErr?.message || 'Não foi possível criar sua conta.',
    };
  }

  const registeredDate = new Date().toLocaleDateString('pt-BR');
  const { data: insertedClient, error: insertErr } = await sb
    .from('clients')
    .insert({
      id: createdAuth.user.id,
      name,
      email,
      cpf_cnpj: cpfCnpj,
      phone,
      bidding_limit_usd: 25000,
      verified_status: false,
      approval_status: 'PENDING',
      registered_date: registeredDate,
    })
    .select('*')
    .single();

  if (insertErr) {
    // Rollback created auth user so no orphan remains
    await sb.auth.admin.deleteUser(createdAuth.user.id).catch(() => {});
    return {
      ok: false,
      status: 500,
      error: 'Erro ao salvar os dados cadastrais no banco de dados.',
    };
  }

  return {
    ok: true,
    status: 201,
    user: mapClientRowToUser(insertedClient),
  };
}

export async function listClientsForAdmin(authHeader?: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    return { ok: false, status: 500, error: 'Serviço de banco de dados não configurado.' };
  }

  const { user: authUser, error: authErr } = await authenticateBearerToken(sb, authHeader);
  if (!authUser) {
    return { ok: false, status: 401, error: authErr || 'Não autenticado.' };
  }

  const adminRecord = await resolveAdminRecord(sb, authUser);
  if (!adminRecord) {
    return { ok: false, status: 403, error: 'Acesso restrito a administradores.' };
  }

  const { data: rows, error } = await sb
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, status: 500, error: 'Erro ao buscar lista de clientes.' };
  }

  return {
    ok: true,
    status: 200,
    clients: (rows || []).map(mapClientRowToUser),
  };
}

export async function updateClientApprovalStatus(
  authHeader: string | undefined,
  payload: {
    clientId?: string;
    email?: string;
    approvalStatus?: 'APPROVED' | 'REJECTED' | 'PENDING';
  }
) {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    return { ok: false, status: 500, error: 'Serviço de banco de dados não configurado.' };
  }

  const { user: authUser, error: authErr } = await authenticateBearerToken(sb, authHeader);
  if (!authUser) {
    return { ok: false, status: 401, error: authErr || 'Não autenticado.' };
  }

  const adminRecord = await resolveAdminRecord(sb, authUser);
  if (!adminRecord) {
    return { ok: false, status: 403, error: 'Acesso restrito a administradores.' };
  }

  const nextStatus = payload.approvalStatus;
  if (nextStatus !== 'APPROVED' && nextStatus !== 'REJECTED' && nextStatus !== 'PENDING') {
    return { ok: false, status: 400, error: 'Status de aprovação inválido.' };
  }

  const verifiedStatus = nextStatus === 'APPROVED';
  let query = sb
    .from('clients')
    .update({
      approval_status: nextStatus,
      verified_status: verifiedStatus,
    });

  if (payload.clientId) {
    query = query.eq('id', payload.clientId);
  } else if (payload.email) {
    query = query.ilike('email', payload.email.trim());
  } else {
    return { ok: false, status: 400, error: 'Identificador do cliente não informado.' };
  }

  const { data: updated, error } = await query.select('*').maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: 'Erro ao atualizar status do cliente.' };
  }
  if (!updated) {
    return { ok: false, status: 404, error: 'Cliente não encontrado.' };
  }

  return {
    ok: true,
    status: 200,
    client: mapClientRowToUser(updated),
  };
}
