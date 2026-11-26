import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gavel, ShieldCheck, DollarSign, Layers, Users, Lock, Menu, X, UserCheck, Globe, Radio, Sun, Moon } from 'lucide-react';
import { Language, TRANSLATIONS } from '../utils/i18n';
import { PWAInstallButton } from './PWAInstallButton';
import { ThemeSelectorPanel, AppTheme } from './ThemeSelectorPanel';

export type AppPage = 'home' | 'leiloes' | 'live' | 'gradeamento' | 'quem-somos' | 'cliente' | 'admin';

interface HeaderProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenSystem: (tab?: 'terminal' | 'register') => void;
  currency: 'USD' | 'BRL';
  onToggleCurrency: () => void;
  usdRate: number;
  isClientAuthenticated?: boolean;
  isAdminAuthenticated?: boolean;
  onClientLogout?: () => void;
  onAdminLogout?: () => void;
  clientName?: string;
  language: Language;
  onSelectLanguage: (lang: Language) => void;
  theme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  isPtaxOnline?: boolean;
  ptaxSource?: string;
  ptaxLastUpdated?: string;
  onRefreshPtax?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  onOpenSystem,
  currency,
  onToggleCurrency,
  usdRate,
  isClientAuthenticated,
  isAdminAuthenticated,
  onClientLogout,
  onAdminLogout,
  clientName,
  language,
  onSelectLanguage,
  theme,
  onSelectTheme,
  isPtaxOnline = true,
  ptaxSource = 'Banco Central do Brasil (PTAX)',
  ptaxLastUpdated,
  onRefreshPtax
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [langMenuPos, setLangMenuPos] = useState<{ top: number; right: number }>({ top: 88, right: 16 });
  const langButtonRef = useRef<HTMLButtonElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    if (!langMenuOpen) return;

    const updatePosition = () => {
      const btn = langButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setLangMenuPos({
        top: Math.round(rect.bottom + 6),
        right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      });
    };

    updatePosition();

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        langButtonRef.current &&
        !langButtonRef.current.contains(target) &&
        langMenuRef.current &&
        !langMenuRef.current.contains(target)
      ) {
        setLangMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLangMenuOpen(false);
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [langMenuOpen]);

  const handleNavClick = (page: AppPage) => {
    if (page === 'leiloes' && !isClientAuthenticated && !isAdminAuthenticated) {
      onNavigate('cliente');
      setMobileMenuOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    onNavigate(page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0b0f17]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Top System Bar: EXPLICIT PROMINENT LINKS TO 'NOSSO SISTEMA DE LEILÕES' */}
      <div className="bg-gradient-to-r from-amber-50 via-slate-100 to-amber-50 dark:from-amber-950/70 dark:via-slate-900 dark:to-amber-950/70 border-b border-amber-200 dark:border-amber-500/20 px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400 text-[10px] sm:text-xs">
              <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              USAFAST HUB
            </span>
            <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">|</span>
            <div 
              onClick={onRefreshPtax}
              className="inline-flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-sm"
              title={`${ptaxSource} ${ptaxLastUpdated ? `· Atualizado às ${ptaxLastUpdated}` : ''} (Clique para atualizar)`}
            >
              <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-emerald-500"></span>
              </span>
              <span>PTAX: R$ {usdRate.toFixed(2)}</span>
            </div>
          </div>

          {/* TWO PROMINENT LINKS TO "NOSSO SISTEMA DE LEILÕES" */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {isClientAuthenticated ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => handleNavClick('cliente')}
                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 rounded font-bold text-[10px] sm:text-xs transition-colors"
                >
                  <UserCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Olá, {clientName?.split(' ')[0] || 'Arrematante'}</span>
                </button>
                {onClientLogout && (
                  <button
                    onClick={onClientLogout}
                    className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors px-1 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
                    title="Encerrar sessão do cliente"
                  >
                    Sair
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => handleNavClick('cliente')}
                className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 border border-amber-500/30 rounded font-bold text-[10px] sm:text-xs transition-colors shadow-sm"
                title="Acesse o Sistema de Lances e Arrematação de Leilões Americanos"
              >
                <Gavel className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Sistema de Leilões</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-2 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div 
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2 sm:gap-3 shrink-0 cursor-pointer group"
        >
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-300 flex items-center justify-center text-slate-950 font-black shadow-inner shadow-black/20 group-hover:scale-105 transition-transform">
            <Gavel className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950" />
          </div>
          <div>
            <span className="text-xs sm:text-lg font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap block group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">
              USAFAST LEILÕES
            </span>
            <span className="text-[9px] sm:text-[11px] text-amber-700 dark:text-amber-400/90 font-semibold block -mt-0.5">
              Leilões EUA
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <button
            onClick={() => handleNavClick('home')}
            className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              currentPage === 'home'
                ? 'bg-slate-200/80 dark:bg-slate-800 text-amber-700 dark:text-amber-400 font-bold'
                : 'hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            {t.home}
          </button>

          <button
            onClick={() => handleNavClick('leiloes')}
            className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              currentPage === 'leiloes'
                ? 'bg-slate-200/80 dark:bg-slate-800 text-amber-700 dark:text-amber-400 font-bold'
                : 'hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            <span>{t.auctions}</span>
            {!isClientAuthenticated && !isAdminAuthenticated && (
              <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 opacity-80" />
            )}
          </button>

          <button
            onClick={() => handleNavClick('gradeamento')}
            className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              currentPage === 'gradeamento'
                ? 'bg-slate-200/80 dark:bg-slate-800 text-amber-700 dark:text-amber-400 font-bold'
                : 'hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>{t.grading}</span>
          </button>

          <button
            onClick={() => handleNavClick('quem-somos')}
            className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              currentPage === 'quem-somos'
                ? 'bg-slate-200/80 dark:bg-slate-800 text-amber-700 dark:text-amber-400 font-bold'
                : 'hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>{t.aboutUs}</span>
          </button>

          <button
            onClick={() => handleNavClick('live')}
            className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 border ${
              currentPage === 'live'
                ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 font-bold'
                : 'text-rose-700 dark:text-rose-300 border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{t.liveAuctions}</span>
          </button>

          {/* Dedicated Portal do Cliente / Arrematante tab */}
          <button
            onClick={() => handleNavClick('cliente')}
            className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 border ${
              currentPage === 'cliente'
                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-bold'
                : 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>{t.clientPanel}</span>
          </button>

          {/* Admin panel */}
          <button
            onClick={() => handleNavClick('admin')}
            className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 border ${
              currentPage === 'admin'
                ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                : 'text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>{t.adminPanel}</span>
          </button>
        </nav>

        {/* Zone 3: Theme Panel, Language Selector, Currency Switch & Quick Bids Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ThemeSelectorPanel theme={theme} onSelectTheme={onSelectTheme} />

          {/* Language Selector Dropdown */}
          <div className="relative">
            <button
              ref={langButtonRef}
              type="button"
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              aria-expanded={langMenuOpen}
              className="flex items-center gap-1 px-1.5 py-1 sm:px-2.5 sm:py-1.5 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700/90 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md text-[10px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              title="Selecionar Idioma / Select Language / Seleccionar Idioma"
            >
              <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{language === 'pt' ? '🇧🇷 PT' : language === 'es' ? '🇪🇸 ES' : '🇺🇸 EN'}</span>
            </button>

            {langMenuOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={langMenuRef}
                  style={{ top: `${langMenuPos.top}px`, right: `${langMenuPos.right}px` }}
                  className="fixed w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl py-1 z-[9999] text-xs font-semibold"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLanguage('pt');
                      setLangMenuOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${language === 'pt' ? 'text-amber-600 dark:text-amber-400 font-bold bg-amber-50/70 dark:bg-slate-800/50' : 'text-slate-800 dark:text-slate-200'}`}
                  >
                    <span>🇧🇷</span> Português
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLanguage('es');
                      setLangMenuOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${language === 'es' ? 'text-amber-600 dark:text-amber-400 font-bold bg-amber-50/70 dark:bg-slate-800/50' : 'text-slate-800 dark:text-slate-200'}`}
                  >
                    <span>🇪🇸</span> Español
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLanguage('en');
                      setLangMenuOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${language === 'en' ? 'text-amber-600 dark:text-amber-400 font-bold bg-amber-50/70 dark:bg-slate-800/50' : 'text-slate-800 dark:text-slate-200'}`}
                  >
                    <span>🇺🇸</span> English
                  </button>
                </div>,
                document.body
              )}
          </div>

          <button
            onClick={onToggleCurrency}
            className="flex items-center gap-1 px-1.5 py-1 sm:px-2.5 sm:py-1.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-md text-[10px] sm:text-xs font-mono transition-colors whitespace-nowrap shrink-0"
            title="Alternar moeda entre USD e BRL"
          >
            <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold">{currency === 'USD' ? '$' : 'R$'}</span>
          </button>

          <PWAInstallButton compact />

          <button
            onClick={() => handleNavClick('cliente')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shadow-sm shadow-amber-500/10"
          >
            <Gavel className="w-3.5 h-3.5" />
            <span>{t.placeBids}</span>
          </button>

          {/* Mobile hamburger menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1 lg:hidden text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4 space-y-2 text-xs">
          {/* Mobile Theme Selector Panel */}
          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 mb-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">Tema do Painel:</span>
            <div className="flex items-center gap-1 bg-white dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => onSelectTheme('light')}
                aria-label="Tema claro"
                title="Tema claro"
                className={`p-1.5 rounded-md inline-flex items-center justify-center transition-colors ${
                  theme === 'light'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSelectTheme('dark')}
                aria-label="Tema escuro"
                title="Tema escuro"
                className={`p-1.5 rounded-md inline-flex items-center justify-center transition-colors ${
                  theme === 'dark'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            onClick={() => handleNavClick('home')}
            className={`w-full text-left px-3 py-2 rounded-lg font-semibold ${currentPage === 'home' ? 'bg-slate-200 dark:bg-slate-800 text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}
          >
            Início
          </button>
          <button
            onClick={() => handleNavClick('leiloes')}
            className={`w-full text-left px-3 py-2 rounded-lg font-semibold ${currentPage === 'leiloes' ? 'bg-slate-200 dark:bg-slate-800 text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}
          >
            Leilões Ativos
          </button>
          <button
            onClick={() => handleNavClick('gradeamento')}
            className={`w-full text-left px-3 py-2 rounded-lg font-semibold ${currentPage === 'gradeamento' ? 'bg-slate-200 dark:bg-slate-800 text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}
          >
            Gradeamento (A+, A, B, C, DNA...)
          </button>
          <button
            onClick={() => handleNavClick('quem-somos')}
            className={`w-full text-left px-3 py-2 rounded-lg font-semibold ${currentPage === 'quem-somos' ? 'bg-slate-200 dark:bg-slate-800 text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}
          >
            Quem Somos & Assessoria Miami
          </button>
          <button
            onClick={() => handleNavClick('live')}
            className={`w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 ${currentPage === 'live' ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'}`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live de Leilões ao Vivo</span>
          </button>
          <button
            onClick={() => handleNavClick('cliente')}
            className={`w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 ${currentPage === 'cliente' ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'}`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Painel do Cliente (Lances & Modelos)</span>
          </button>
          <button
            onClick={() => handleNavClick('admin')}
            className={`w-full text-left px-3 py-2 rounded-lg font-bold flex items-center gap-2 ${currentPage === 'admin' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30'}`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t.adminPanel}</span>
          </button>
          <div className="pt-1">
            <PWAInstallButton fullWidth />
          </div>
        </div>
      )}
    </header>
  );
};
