import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Check, Palette } from 'lucide-react';

export type AppTheme = 'dark' | 'light';

interface ThemeSelectorPanelProps {
  theme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  compact?: boolean;
}

export const ThemeSelectorPanel: React.FC<ThemeSelectorPanelProps> = ({
  theme,
  onSelectTheme,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Selecionar tema claro ou escuro"
        className="flex items-center justify-center p-1.5 sm:px-2 sm:py-1.5 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700/90 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md transition-colors shrink-0"
        title="Selecionar Tema (Claro / Escuro)"
      >
        {theme === 'dark' ? (
          <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        ) : (
          <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Painel de Seleção de Tema"
          className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 z-50 space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Selecionar Tema
              </span>
            </div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {theme === 'dark' ? 'Escuro ativo' : 'Claro ativo'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Light Theme Card */}
            <button
              type="button"
              onClick={() => {
                onSelectTheme('light');
                setIsOpen(false);
              }}
              className={`group text-left rounded-xl border p-2.5 transition-all space-y-2 ${
                theme === 'light'
                  ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-500/10 ring-2 ring-amber-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Mini Light UI Preview */}
              <div className="h-14 rounded-lg bg-slate-100 border border-slate-200 p-1.5 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="h-1.5 w-8 rounded bg-slate-800" />
                  <div className="h-1.5 w-3 rounded bg-amber-500" />
                </div>
                <div className="bg-white border border-slate-200 rounded p-1 space-y-1">
                  <div className="h-1.5 w-12 rounded bg-slate-700" />
                  <div className="h-1 w-9 rounded bg-slate-300" />
                </div>
              </div>

              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sun className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    Claro
                  </span>
                </div>
                {theme === 'light' && (
                  <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                Fundo claro de alta leitura
              </p>
            </button>

            {/* Dark Theme Card */}
            <button
              type="button"
              onClick={() => {
                onSelectTheme('dark');
                setIsOpen(false);
              }}
              className={`group text-left rounded-xl border p-2.5 transition-all space-y-2 ${
                theme === 'dark'
                  ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-500/15 ring-2 ring-amber-400/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Mini Dark UI Preview */}
              <div className="h-14 rounded-lg bg-[#0b0f17] border border-slate-800 p-1.5 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="h-1.5 w-8 rounded bg-slate-100" />
                  <div className="h-1.5 w-3 rounded bg-amber-400" />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded p-1 space-y-1">
                  <div className="h-1.5 w-12 rounded bg-slate-200" />
                  <div className="h-1 w-9 rounded bg-slate-600" />
                </div>
              </div>

              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Moon className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    Escuro
                  </span>
                </div>
                {theme === 'dark' && (
                  <Check className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                Tema escuro original
              </p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
