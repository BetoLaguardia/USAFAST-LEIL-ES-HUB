import { SystemUser } from '../types/auction';
import { escapeHtml, printHtmlToPdf } from './pdfPrint';

export interface InvoiceLineItem {
  lotNumber: string;
  lotTitle: string;
  grade: string;
  quantity: number;
  unitUsd?: number;
  totalUsd: number;
  status?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  lotNumber: string;
  lotTitle: string;
  quantity: number;
  grade: string;
  totalUsd: number;
  usdRate: number;
  user: SystemUser;
  warehouseStatus: string;
}

export interface ClientInvoiceData {
  invoiceNumber: string;
  date: string;
  usdRate: number;
  user: Partial<SystemUser> & { name: string; email: string };
  warehouseStatus: string;
  items: InvoiceLineItem[];
  notes?: string;
}

function sanitizeFileSlug(value: string, maxLen = 48): string {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return 'Cliente';
  return cleaned.slice(0, maxLen).replace(/_+$/g, '') || 'Cliente';
}

export const downloadClientInvoicePdf = (data: ClientInvoiceData) => {
  const safeRate = data.usdRate > 0 ? data.usdRate : 5.75;
  const items = data.items.length > 0 ? data.items : [];
  const totalUsd = items.reduce((acc, item) => acc + (Number(item.totalUsd) || 0), 0);
  const totalUnits = items.reduce((acc, item) => acc + Math.max(1, Number(item.quantity) || 1), 0);
  const totalBrl = totalUsd * safeRate;
  const clientSlug = sanitizeFileSlug(data.user.name || data.user.email || 'Cliente');
  const safeInvoiceNum = sanitizeFileSlug(data.invoiceNumber, 36);
  const pdfInvoiceTitle = `Invoice_${clientSlug}_${safeInvoiceNum}`;

  const authCode = `${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now()}`;

  const itemRowsHtml = items
    .map(item => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const itemTotalUsd = Number(item.totalUsd) || 0;
      const itemUnitUsd = item.unitUsd !== undefined ? item.unitUsd : itemTotalUsd / qty;
      return `
        <tr>
          <td style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #b45309; white-space: nowrap;">${escapeHtml(item.lotNumber)}</td>
          <td>
            <strong style="color: #0f172a;">${escapeHtml(item.lotTitle)}</strong><br/>
            <small style="color: #64748b;">Processado via Leilão Oficial USAFAST${item.status ? ` · Status: ${escapeHtml(item.status)}` : ''}</small>
          </td>
          <td style="font-weight: 700; text-align: center; white-space: nowrap;">${escapeHtml(item.grade || 'Grade A')}</td>
          <td style="font-weight: 700; text-align: center; font-family: ui-monospace, monospace;">${qty.toLocaleString('pt-BR')}</td>
          <td style="font-family: ui-monospace, monospace; text-align: right; white-space: nowrap;">$${itemUnitUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="font-family: ui-monospace, monospace; font-weight: 700; text-align: right; color: #047857; white-space: nowrap;">$${itemTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(pdfInvoiceTitle)}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
          .invoice-box { box-shadow: none !important; border: 1px solid #cbd5e1 !important; padding: 24px !important; }
          .no-print { display: none !important; }
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 24px;
          background-color: #f8fafc;
          color: #0f172a;
        }
        .invoice-box {
          max-width: 850px;
          margin: auto;
          padding: 34px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
          border-radius: 12px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 3px solid #0f172a;
          padding-bottom: 18px;
          margin-bottom: 24px;
        }
        .logo-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-icon {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0f172a;
          font-weight: 900;
          font-size: 20px;
        }
        .brand-title {
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.5px;
          color: #0b0f17;
          line-height: 1.1;
        }
        .brand-subtitle {
          font-size: 10px;
          color: #d97706;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          margin-top: 2px;
        }
        .invoice-title {
          text-align: right;
        }
        .invoice-title h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 900;
          color: #0b0f17;
        }
        .invoice-title p {
          margin: 3px 0 0 0;
          font-size: 11px;
          font-family: ui-monospace, monospace;
          color: #475569;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .info-card {
          background: #f8fafc;
          padding: 14px 16px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
        }
        .info-card h3 {
          margin: 0 0 8px 0;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 0.6px;
        }
        .info-card p {
          margin: 3px 0;
          font-size: 12px;
          color: #1e293b;
        }
        .info-card strong {
          color: #0f172a;
        }
        .status-badge {
          display: inline-block;
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #86efac;
          padding: 3px 9px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
          margin-top: 6px;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        .items-table thead { display: table-header-group; }
        .items-table tr { break-inside: avoid; }
        .items-table th {
          background: #0f172a;
          color: #ffffff;
          padding: 10px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: left;
          border-bottom: 2px solid #f59e0b;
        }
        .items-table td {
          padding: 11px 10px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
          vertical-align: top;
        }
        .total-box {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 24px;
        }
        .notes-box {
          flex: 1;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 12px;
          font-size: 11px;
          color: #78350f;
        }
        .total-table {
          width: 330px;
          border-collapse: collapse;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
        }
        .total-table td {
          padding: 7px 12px;
          font-size: 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        .total-table .grand-total {
          background: #0f172a;
          color: #fbbf24;
          font-weight: 900;
          font-size: 15px;
          font-family: ui-monospace, monospace;
        }
        .footer-stamp {
          border-top: 2px dashed #cbd5e1;
          padding-top: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="header">
          <div class="logo-container">
            <div class="logo-icon">UF</div>
            <div>
              <div class="brand-title">USAFAST LEILÕES HUB</div>
              <div class="brand-subtitle">PORTAL DO IMPORTADOR BRASIL &amp; USA LOGISTICS</div>
            </div>
          </div>
          <div class="invoice-title">
            <h1>INVOICE OFICIAL</h1>
            <p>Nº: ${escapeHtml(data.invoiceNumber)}</p>
            <p>Emissão: ${escapeHtml(data.date)}</p>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-card">
            <h3>Dados do Arrematante (Comprador)</h3>
            <p><strong>Nome / Razão:</strong> ${escapeHtml(data.user.name || 'Cliente USAFAST')}</p>
            <p><strong>Documento ID:</strong> ${escapeHtml(data.user.cpfCnpj || 'Não informado')}</p>
            <p><strong>E-mail:</strong> ${escapeHtml(data.user.email || '-')}</p>
            <p><strong>WhatsApp / Tel:</strong> ${escapeHtml(data.user.whatsapp || data.user.phone || '-')}</p>
            ${data.user.consultantName ? `<p><strong>Consultor:</strong> ${escapeHtml(data.user.consultantName)}</p>` : ''}
          </div>

          <div class="info-card">
            <h3>Galpão de Recebimento em Miami</h3>
            <p><strong>Armazém Oficial:</strong> USAFAST DORAL HUB</p>
            <p><strong>Endereço:</strong> 8400 NW 36th St, Suite 450 - Doral, FL 33166 - USA</p>
            <p><strong>Status Operacional:</strong> ${escapeHtml(data.warehouseStatus)}</p>
            <div class="status-badge">● HOMOLOGADO &amp; FATURADO</div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Cód. Lote</th>
              <th>Descrição do Produto / Lote Master</th>
              <th style="text-align: center;">Grade</th>
              <th style="text-align: center;">Qtd</th>
              <th style="text-align: right;">Unit. (USD)</th>
              <th style="text-align: right;">Total (USD)</th>
            </tr>
          </thead>
          <tbody>
            ${itemRowsHtml}
          </tbody>
        </table>

        <div class="total-box">
          <div class="notes-box">
            <strong>Resumo da Fatura (${items.length} ${items.length === 1 ? 'lote' : 'lotes'} · ${totalUnits.toLocaleString('pt-BR')} un.):</strong><br/>
            ${escapeHtml(data.notes || 'Documento emitido pelo Portal Administrativo USAFAST LEILÕES HUB para conferência financeira, pagamento e expedição no Hub Doral/Miami.')}
          </div>
          <table class="total-table">
            <tr>
              <td>Subtotal (USD):</td>
              <td style="text-align: right; font-family: ui-monospace, monospace;">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td>Taxa PTAX Utilizada:</td>
              <td style="text-align: right; font-family: ui-monospace, monospace;">R$ ${safeRate.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Equivalente Aprox. (BRL):</td>
              <td style="text-align: right; font-family: ui-monospace, monospace;">aprox. R$ ${totalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr class="grand-total">
              <td style="padding: 11px 12px;">TOTAL INVOICE:</td>
              <td style="text-align: right; padding: 11px 12px;">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
            </tr>
          </table>
        </div>

        <div class="footer-stamp">
          <div>
            <strong>USAFAST LEILÕES HUB MIAMI LLC</strong><br/>
            Laudo de Autenticidade &amp; Clean ESN Auditado em Doral, FL.
          </div>
          <div style="font-family: ui-monospace, monospace; text-align: right; color: #94a3b8;">
            AUTENTICAÇÃO: ${escapeHtml(authCode)}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  printHtmlToPdf(htmlContent, pdfInvoiceTitle);
};

export const downloadOfficialInvoicePdf = (data: InvoiceData) => {
  downloadClientInvoicePdf({
    invoiceNumber: data.invoiceNumber,
    date: data.date,
    usdRate: data.usdRate,
    user: data.user,
    warehouseStatus: data.warehouseStatus,
    items: [
      {
        lotNumber: data.lotNumber,
        lotTitle: data.lotTitle,
        grade: data.grade,
        quantity: data.quantity,
        totalUsd: data.totalUsd
      }
    ]
  });
};
