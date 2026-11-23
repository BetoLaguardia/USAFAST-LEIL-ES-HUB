import { createClient, SupabaseClient, type User } from '@supabase/supabase-js';

export type UserAccessType = 'client' | 'admin_geral' | 'admin_credenciado';

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

function normalizeDocId(val: string): string {
  return String(val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function normalizeUserType(val: unknown): UserAccessType {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'admin_geral' || s === 'admin') return 'admin_geral';
  if (s === 'admin_credenciado') return 'admin_credenciado';
  return 'client';
}

function mapClientRowToUser(row: any, authUser?: User) {
  const isApproved =
    row.approval_status === 'APPROVED' || Boolean(row.verified_status);
  const requestedUserType = normalizeUserType(
    authUser?.user_metadata?.requested_user_type ||
      authUser?.user_metadata?.user_type ||
      row.requested_user_type ||
      'client'
  );
  const storedUserType = normalizeUserType(
    authUser?.app_metadata?.user_type ||
      authUser?.user_metadata?.user_type ||
      (authUser?.app_metadata?.role === 'admin' ? 'admin_geral' : 'client')
  );
  const effectiveUserType: UserAccessType = isApproved
    ? storedUserType
    : 'client';
  const effectiveRole: 'admin' | 'client' =
    isApproved && effectiveUserType !== 'client' ? 'admin' : 'client';

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
    approvalStatus: (row.approval_status ||
      (row.verified_status ? 'APPROVED' : 'PENDING')) as
      | 'APPROVED'
      | 'PENDING'
      | 'REJECTED',
    registeredDate: row.registered_date || '',
    consultantName:
      row.consultant_name ||
      authUser?.user_metadata?.consultant_name ||
      '',
    role: effectiveRole,
    userType: effectiveUserType,
    requestedUserType,
  };
}

function mapSystemUserToUser(row: any, fallbackAuthUser?: User) {
  const sysRole = String(row?.role || '').toLowerCase();
  const userType: UserAccessType =
    sysRole === 'admin_credenciado' ? 'admin_credenciado' : 'admin_geral';

  return {
    id: row?.id || fallbackAuthUser?.id,
    name:
      row?.full_name ||
      fallbackAuthUser?.user_metadata?.full_name ||
      'Administrador',
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
    userType,
    requestedUserType: userType,
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

async function resolveSystemAdminRecord(sb: SupabaseClient, authUser: User) {
  const emailLower = (authUser.email || '').toLowerCase();

  const { data: byId } = await sb
    .from('system_users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (
    byId &&
    ['admin', 'admin_geral', 'admin_credenciado'].includes(
      String(byId.role).toLowerCase()
    )
  ) {
    return byId;
  }

  if (emailLower) {
    const { data: byEmail } = await sb
      .from('system_users')
      .select('*')
      .ilike('email', emailLower)
      .maybeSingle();

    if (
      byEmail &&
      ['admin', 'admin_geral', 'admin_credenciado'].includes(
        String(byEmail.role).toLowerCase()
      )
    ) {
      return byEmail;
    }
  }

  return null;
}

async function findClientRowForAuthUser(sb: SupabaseClient, authUser: User) {
  const { data: clientById } = await sb
    .from('clients')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (clientById) return clientById;

  const emailLower = (authUser.email || '').toLowerCase();
  if (emailLower) {
    const { data: clientByEmail } = await sb
      .from('clients')
      .select('*')
      .ilike('email', emailLower)
      .maybeSingle();
    if (clientByEmail) return clientByEmail;
  }

  return null;
}

async function isCallerAdminGeral(sb: SupabaseClient, authUser: User): Promise<boolean> {
  const sysAdmin = await resolveSystemAdminRecord(sb, authUser);
  if (sysAdmin) {
    return String(sysAdmin.role).toLowerCase() !== 'admin_credenciado';
  }

  const clientRow = await findClientRowForAuthUser(sb, authUser);
  if (!clientRow) return false;
  const mapped = mapClientRowToUser(clientRow, authUser);
  return mapped.role === 'admin' && mapped.userType === 'admin_geral';
}

export async function resolveClientIdentifier(identifier: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    return { ok: false, status: 500, error: 'Serviço de banco de dados não configurado.' };
  }

  const clean = String(identifier || '').trim();
  if (!clean) {
    return { ok: false, status: 400, error: 'Informe seu e-mail ou Documento ID.' };
  }

  if (clean.includes('@')) {
    return { ok: true, status: 200, email: clean.toLowerCase() };
  }

  const normalized = normalizeDocId(clean);
  if (!normalized) {
    return { ok: false, status: 404, error: 'Cadastro não encontrado.' };
  }

  const { data: clients, error } = await sb
    .from('clients')
    .select('email, cpf_cnpj');

  if (error) {
    return { ok: false, status: 500, error: 'Falha ao consultar cadastro.' };
  }

  const matched = (clients || []).find((c: any) => normalizeDocId(c.cpf_cnpj) === normalized);
  if (!matched?.email) {
    return { ok: false, status: 404, error: 'E-mail ou Documento ID não encontrado.' };
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

  const adminRecord = await resolveSystemAdminRecord(sb, authUser);
  if (adminRecord) {
    const mappedAdmin = mapSystemUserToUser(adminRecord, authUser);
    return {
      ok: true,
      status: 200,
      role: 'admin' as const,
      userType: mappedAdmin.userType,
      user: mappedAdmin,
    };
  }

  const clientRow = await findClientRowForAuthUser(sb, authUser);
  if (clientRow) {
    const mapped = mapClientRowToUser(clientRow, authUser);
    return {
      ok: true,
      status: 200,
      role: mapped.role,
      userType: mapped.userType,
      user: mapped,
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
  consultantName?: string;
  requestedUserType?: UserAccessType;
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
  const consultantName = String(payload.consultantName || '').trim();
  const requestedUserType = normalizeUserType(payload.requestedUserType);
  const password = String(payload.password || '');

  if (!name || !email || !cpfCnpj || !phone || !consultantName) {
    return { ok: false, status: 400, error: 'Preencha todos os campos obrigatórios do cadastro.' };
  }

  if (password.length < 6) {
    return { ok: false, status: 400, error: 'A senha deve conter pelo menos 6 caracteres.' };
  }

  // Check duplicate email or Documento ID in clients table
  const { data: existingClients, error: existingErr } = await sb
    .from('clients')
    .select('id, email, cpf_cnpj');

  if (existingErr) {
    return { ok: false, status: 500, error: 'Erro ao verificar cadastros existentes.' };
  }

  const normalizedDoc = normalizeDocId(cpfCnpj);
  const duplicate = (existingClients || []).find(
    (c: any) =>
      String(c.email || '').toLowerCase() === email ||
      (normalizedDoc && normalizeDocId(c.cpf_cnpj) === normalizedDoc)
  );

  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: 'Já existe um cadastro registrado com este e-mail ou Documento ID.',
    };
  }

  // Create user in Supabase Auth (always starts pending as 'client' until Admin Geral approves)
  const { data: createdAuth, error: createAuthErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'client', user_type: 'client' },
    user_metadata: {
      name,
      cpf_cnpj: cpfCnpj,
      phone,
      consultant_name: consultantName,
      requested_user_type: requestedUserType,
      user_type: 'client',
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
    user: mapClientRowToUser(insertedClient, createdAuth.user),
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

  const allowed = await isCallerAdminGeral(sb, authUser);
  if (!allowed) {
    return { ok: false, status: 403, error: 'Acesso restrito ao Usuário Admin Geral.' };
  }

  const { data: rows, error } = await sb
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, status: 500, error: 'Erro ao buscar lista de clientes.' };
  }

  const authById = new Map<string, User>();
  try {
    const { data: authList } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of authList?.users || []) {
      authById.set(u.id, u);
    }
  } catch {}

  return {
    ok: true,
    status: 200,
    clients: (rows || []).map((row: any) => mapClientRowToUser(row, authById.get(row.id))),
  };
}

export async function updateClientApprovalStatus(
  authHeader: string | undefined,
  payload: {
    clientId?: string;
    email?: string;
    approvalStatus?: 'APPROVED' | 'REJECTED' | 'PENDING';
    userType?: UserAccessType;
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

  const allowed = await isCallerAdminGeral(sb, authUser);
  if (!allowed) {
    return { ok: false, status: 403, error: 'Apenas o Admin Geral pode aprovar ou gerenciar cadastros.' };
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

  let matchedAuthUser: User | undefined;
  try {
    const { data: authData } = await sb.auth.admin.getUserById(updated.id);
    matchedAuthUser = authData?.user || undefined;

    if (matchedAuthUser) {
      const targetUserType: UserAccessType =
        nextStatus === 'APPROVED'
          ? normalizeUserType(
              payload.userType ??
                matchedAuthUser.app_metadata?.user_type ??
                matchedAuthUser.user_metadata?.user_type ??
                matchedAuthUser.user_metadata?.requested_user_type ??
                'client'
            )
          : 'client';

      const targetRole =
        nextStatus === 'APPROVED' && targetUserType !== 'client'
          ? 'admin'
          : 'client';

      const { data: updatedAuth } = await sb.auth.admin.updateUserById(updated.id, {
        app_metadata: {
          ...(matchedAuthUser.app_metadata || {}),
          role: targetRole,
          user_type: targetUserType,
        },
        user_metadata: {
          ...(matchedAuthUser.user_metadata || {}),
          user_type: targetUserType,
        },
      });
      if (updatedAuth?.user) {
        matchedAuthUser = updatedAuth.user;
      }
    }
  } catch {}

  return {
    ok: true,
    status: 200,
    client: mapClientRowToUser(updated, matchedAuthUser),
  };
}

export async function updateClientAccessType(
  authHeader: string | undefined,
  payload: {
    clientId?: string;
    email?: string;
    userType?: UserAccessType;
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

  const allowed = await isCallerAdminGeral(sb, authUser);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: 'Apenas o Admin Geral pode alterar o tipo de acesso dos usuários.',
    };
  }

  const nextUserType = normalizeUserType(payload.userType);
  if (!['client', 'admin_geral', 'admin_credenciado'].includes(String(payload.userType || '').toLowerCase())) {
    return { ok: false, status: 400, error: 'Tipo de acesso inválido.' };
  }

  let query = sb.from('clients').select('*');
  if (payload.clientId) {
    query = query.eq('id', payload.clientId);
  } else if (payload.email) {
    query = query.ilike('email', payload.email.trim());
  } else {
    return { ok: false, status: 400, error: 'Identificador do usuário não informado.' };
  }

  const { data: clientRow, error } = await query.maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: 'Erro ao consultar usuário.' };
  }
  if (!clientRow) {
    return { ok: false, status: 404, error: 'Usuário não encontrado.' };
  }

  const { data: authData, error: getUserErr } = await sb.auth.admin.getUserById(clientRow.id);
  if (getUserErr || !authData?.user) {
    return {
      ok: false,
      status: 400,
      error: 'Este cadastro legado não possui conta de autenticação vinculada.',
    };
  }

  const existingAuthUser = authData.user;
  const isApproved =
    clientRow.approval_status === 'APPROVED' || Boolean(clientRow.verified_status);
  const nextRole = isApproved && nextUserType !== 'client' ? 'admin' : 'client';

  const { data: updatedAuth, error: updateAuthErr } = await sb.auth.admin.updateUserById(
    clientRow.id,
    {
      app_metadata: {
        ...(existingAuthUser.app_metadata || {}),
        role: nextRole,
        user_type: nextUserType,
      },
      user_metadata: {
        ...(existingAuthUser.user_metadata || {}),
        user_type: nextUserType,
        requested_user_type: nextUserType,
      },
    }
  );

  if (updateAuthErr || !updatedAuth?.user) {
    return {
      ok: false,
      status: 500,
      error: updateAuthErr?.message || 'Erro ao atualizar permissões do usuário.',
    };
  }

  return {
    ok: true,
    status: 200,
    client: mapClientRowToUser(clientRow, updatedAuth.user),
  };
}

export async function deleteClientAccount(
  authHeader: string | undefined,
  payload: {
    clientId?: string;
    email?: string;
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

  const allowed = await isCallerAdminGeral(sb, authUser);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: 'Apenas o Admin Geral pode excluir usuários do sistema.',
    };
  }

  let query = sb.from('clients').select('*');
  if (payload.clientId) {
    query = query.eq('id', payload.clientId);
  } else if (payload.email) {
    query = query.ilike('email', payload.email.trim());
  } else {
    return { ok: false, status: 400, error: 'Identificador do usuário não informado.' };
  }

  const { data: clientRow, error: findErr } = await query.maybeSingle();
  if (findErr) {
    return { ok: false, status: 500, error: 'Erro ao consultar usuário para exclusão.' };
  }
  if (!clientRow) {
    return { ok: false, status: 404, error: 'Usuário não encontrado.' };
  }

  const isSelf =
    clientRow.id === authUser.id ||
    (clientRow.email &&
      authUser.email &&
      String(clientRow.email).toLowerCase() === String(authUser.email).toLowerCase());
  if (isSelf) {
    return {
      ok: false,
      status: 400,
      error: 'Você não pode excluir a própria conta administrativa atualmente conectada.',
    };
  }

  const { error: deleteRowErr } = await sb
    .from('clients')
    .delete()
    .eq('id', clientRow.id);

  if (deleteRowErr) {
    return {
      ok: false,
      status: 500,
      error: 'Erro ao excluir registro do usuário no banco de dados.',
    };
  }

  if (clientRow.id) {
    await sb.auth.admin.deleteUser(clientRow.id).catch(() => {});
  }

  return {
    ok: true,
    status: 200,
    deletedId: clientRow.id,
    deletedEmail: clientRow.email,
  };
}
