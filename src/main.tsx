import React from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  // Recover cleanly once if a dynamic chunk fails to preload after a new deployment
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      const key = 'us_vite_preload_reloaded';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });

  if ('serviceWorker' in navigator) {
    try {
      registerSW({
        immediate: true,
        onRegisterError(error) {
          console.warn('[PWA] Service Worker registration skipped:', error);
        },
      });
    } catch (err) {
      console.warn('[PWA] Service Worker unavailable:', err);
    }
  }
}

interface RootErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class RootErrorBoundary extends React.Component<
  {children: React.ReactNode},
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = {hasError: false, message: ''};

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Erro inesperado ao renderizar a página.',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[App Render Error]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0b0f17] text-slate-100 p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center space-y-4">
            <h1 className="text-lg font-bold text-amber-400">USAFAST LEILÕES HUB</h1>
            <p className="text-sm text-slate-300">
              Ocorreu uma falha ao carregar a interface. Tente atualizar a página.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
