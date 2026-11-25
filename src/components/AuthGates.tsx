import React, { useState } from 'react';
import {
  Lock,
  UserCheck,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  User,
  Mail,
  Phone,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Clock
} from 'lucide-react';
import { SystemUser, UserAccessType } from '../types/auction';
import {
  registerClientWithSupabase,
  signInAdminWithSupabase,
  signInClientWithSupabase
} from '../services/authService';

// ----------------------------------------------------
// ADMIN LOGIN GATE COMPONENT
// ----------------------------------------------------
interface AdminLoginGateProps {
  onLoginSuccess: (user: SystemUser) => void;
  onCancel: () => void;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({
  onLoginSuccess,
  onCancel
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await signInAdminWithSupabase(email, password);
    if (result.ok && result.user) {
      onLoginSuccess(result.user);
    } else {
      setErrorMessage(result.error || 'Credenciais inválidas. Verifique o e-mail e a senha informados.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Top Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500" />

        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
                Acesso Restrito
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-2">
                Painel Administrativo
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Controle de ofertas e gestão de leilões.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-slate-300 text-xs font-semibold block mb-1.5">
                E-mail do Administrador:
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Digite seu e-mail"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 text-xs font-semibold block mb-1.5">
                Senha de Acesso:
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 disabled:opacity-50 mt-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Entrar no Painel Administrativo</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Back Button */}
          <div className="pt-4 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para a página inicial</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// CLIENT LOGIN & REGISTRATION GATE COMPONENT
// ----------------------------------------------------
interface ClientLoginGateProps {
  currentUser: SystemUser;
  onLoginSuccess: (user: SystemUser) => void;
  onCancel: () => void;
  context?: 'client' | 'live';
}

export const ClientLoginGate: React.FC<ClientLoginGateProps> = ({
  onLoginSuccess,
  onCancel,
  context = 'client'
}) => {
  const isLiveContext = context === 'live';
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPendingSuccessModal, setShowPendingSuccessModal] = useState(false);
  const [pendingUserRegisteredName, setPendingUserRegisteredName] = useState('');

  // Login form state
  const [loginEmailOrDoc, setLoginEmailOrDoc] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDoc, setRegDoc] = useState('');
  const [regConsultant, setRegConsultant] = useState('');
  const [regUserType, setRegUserType] = useState<UserAccessType>('client');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regAcceptTerms, setRegAcceptTerms] = useState(false);
  const [regWhatsappNotify, setRegWhatsappNotify] = useState(true);

  // Handle Client Login
  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await signInClientWithSupabase(loginEmailOrDoc, loginPassword);
    if (result.ok && result.user) {
      onLoginSuccess(result.user);
    } else {
      setErrorMessage(
        result.error || 'E-mail/Documento ID ou senha incorretos. Verifique seus dados ou realize seu cadastro.'
      );
      setIsSubmitting(false);
    }
  };

  // Handle Client Registration
  const handleClientRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    if (!regName.trim() || !regEmail.trim() || !regDoc.trim() || !regPhone.trim() || !regConsultant.trim()) {
      setErrorMessage('Preencha todos os campos obrigatórios para concluir seu cadastro.');
      setIsSubmitting(false);
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage('A senha deve conter pelo menos 6 caracteres.');
      setIsSubmitting(false);
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('As senhas informadas não conferem.');
      setIsSubmitting(false);
      return;
    }

    if (!regAcceptTerms) {
      setErrorMessage('É necessário concordar com as regras operacionais para se habilitar.');
      setIsSubmitting(false);
      return;
    }

    const result = await registerClientWithSupabase({
      name: regName.trim(),
      email: regEmail.trim(),
      phone: regPhone.trim(),
      cpfCnpj: regDoc.trim(),
      consultantName: regConsultant.trim(),
      requestedUserType: regUserType,
      whatsappNotificationEnabled: regWhatsappNotify,
      password: regPassword
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.error || 'Não foi possível concluir o cadastro.');
      return;
    }

    setPendingUserRegisteredName(regName.trim());
    setShowPendingSuccessModal(true);
  };

  if (showPendingSuccessModal) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/10">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              CADASTRO ENVIADO PARA ANÁLISE
            </span>
            <h3 className="text-xl font-black text-white tracking-tight pt-2">
              Seu Cadastro foi Recebido com Sucesso!
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
              Olá <strong className="text-white">{pendingUserRegisteredName}</strong>, recebemos os seus dados de credenciamento.
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-left text-xs space-y-2">
            <div className="flex items-start gap-2 text-amber-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>O que acontece agora?</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Seus dados foram encaminhados para análise cadastral da nossa equipe. Assim que o Administrador aprovar o seu cadastro no painel, o seu acesso completo aos leilões e lances será liberado.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowPendingSuccessModal(false);
              setTab('login');
              setLoginEmailOrDoc('');
              setLoginPassword('');
            }}
            className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-400/20"
          >
            Entendido, Ir para Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Top Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500" />

        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <UserCheck className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">
                {isLiveContext ? 'Transmissão ao Vivo' : 'Portal do Arrematante'}
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-2">
                {isLiveContext ? 'Live de Leilões ao Vivo' : 'Sistema de Leilões dos EUA'}
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {isLiveContext
                  ? 'Entre com as mesmas credenciais do Painel do Cliente para assistir à transmissão ao vivo e participar do bate-papo.'
                  : 'Acesse sua conta para consultar laudos detalhados de IMEI, verificar lotes e enviar lances em tempo real.'}
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => { setTab('login'); setErrorMessage(null); }}
              className={`py-2 rounded-lg transition-all ${
                tab === 'login'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Já Possuo Cadastro (Entrar)
            </button>
            <button
              type="button"
              onClick={() => { setTab('register'); setErrorMessage(null); }}
              className={`py-2 rounded-lg transition-all ${
                tab === 'register'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Criar Nova Conta (Grátis)
            </button>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 1: LOGIN FORM */}
          {/* ======================================================== */}
          {tab === 'login' && (
            <form onSubmit={handleClientLogin} className="space-y-4">
              <div>
                <label className="text-slate-300 text-xs font-semibold block mb-1.5">
                  E-mail ou Documento ID do Arrematante:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={loginEmailOrDoc}
                    onChange={e => setLoginEmailOrDoc(e.target.value)}
                    placeholder="Digite seu e-mail ou Documento ID"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 text-xs font-semibold block mb-1.5">
                  Senha:
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end text-xs text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={() => setTab('register')}
                  className="text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Não tem conta? Cadastre-se
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>{isLiveContext ? 'Entrar na Live ao Vivo' : 'Acessar Painel do Cliente'}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB 2: REGISTRATION FORM */}
          {/* ======================================================== */}
          {tab === 'register' && (
            <form onSubmit={handleClientRegister} className="space-y-3.5">
              <div>
                <label className="text-slate-300 text-xs font-semibold block mb-1">
                  Nome Completo ou Razão Social: *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="Nome completo ou razão social"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 text-xs font-semibold block mb-1">
                    E-mail Comercial: *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      placeholder="Digite seu e-mail"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 text-xs font-semibold block mb-1">
                    Documento ID: *
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={regDoc}
                      onChange={e => setRegDoc(e.target.value)}
                      placeholder="Digite seu Documento ID"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 text-xs font-semibold block mb-1">
                    WhatsApp com DDD: *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                      placeholder="Digite seu WhatsApp com DDD"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 text-xs font-semibold block mb-1">
                    Consultor Responsável: *
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={regConsultant}
                      onChange={e => setRegConsultant(e.target.value)}
                      placeholder="Nome do consultor responsável"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-slate-300 text-xs font-semibold block mb-1">
                  Tipo de Cadastro / Acesso Solicitado: *
                </label>
                <select
                  required
                  value={regUserType}
                  onChange={e => setRegUserType(e.target.value as UserAccessType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400 transition-colors"
                >
                  <option value="client">Cliente Normal (Painel do Cliente)</option>
                  <option value="admin_credenciado">Admin Credenciado (Dashboard Geral e Ofertas Computadas)</option>
                  <option value="admin_geral">Admin Geral (Acesso Administrativo Completo)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  O nível final de acesso será liberado após aprovação do Admin Geral.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-emerald-400 select-none font-medium">
                  <input
                    type="checkbox"
                    checked={regWhatsappNotify}
                    onChange={e => setRegWhatsappNotify(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-950"
                  />
                  <span>Receber avisos imediatos de ofertas no WhatsApp (aceitas, recusadas e contra-ofertas)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 text-xs font-semibold block mb-1">
                    Criar Senha: *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-slate-300 text-xs font-semibold block mb-1">
                    Confirmar Senha: *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={regConfirmPassword}
                    onChange={e => setRegConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-400 select-none">
                  <input
                    type="checkbox"
                    required
                    checked={regAcceptTerms}
                    onChange={e => setRegAcceptTerms(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-950 mt-0.5"
                  />
                  <span>
                    Concordo com a política de arrematação oficial e laudo de conferência de 30 pontos. *
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Concluir Cadastro & Entrar</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Back Button */}
          <div className="pt-4 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para a página inicial</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
