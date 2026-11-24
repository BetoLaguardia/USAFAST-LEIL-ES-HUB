/**
 * Utility helpers for safe HTML escaping and hidden-iframe print-to-PDF export.
 * Avoids window.open() so PDF generation works inside sandboxed/iFrame environments.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printHtmlToPdf(htmlContent: string, suggestedTitle?: string): void {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('usafast-pdf-print-frame');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'usafast-pdf-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  const previousTitle = document.title;
  if (suggestedTitle) {
    document.title = suggestedTitle;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  const cleanup = () => {
    if (suggestedTitle) {
      document.title = previousTitle;
    }
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1000);
  };

  const triggerPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    try {
      win.onafterprint = cleanup;
      win.focus();
      win.print();
      // Fallback cleanup in case onafterprint does not fire in sandboxed browser
      setTimeout(cleanup, 30000);
    } catch {
      cleanup();
    }
  };

  setTimeout(triggerPrint, 300);
}
