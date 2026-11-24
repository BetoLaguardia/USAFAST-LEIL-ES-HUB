import XLSX from 'xlsx-js-style';
import { AdminOffer, AuctionLot, SystemUser } from '../types/auction';
import { stripLotPrefix } from './deviceImages';
import {
  getLotTotalPriceUsd,
  getLotUnitPriceUsd,
  isAssurantLot
} from './assurantUtils';
import {
  getMarketplaceNumber,
  isTMobileLot,
  isVerizonLot,
  mapVerizonGradeStrict
} from './verizonUtils';
import { escapeHtml, printHtmlToPdf } from './pdfPrint';

export interface ClientBidExportItem {
  lotId: string;
  lotTitle: string;
  amountUsd: number;
  timestamp: string;
  status: 'vencendo' | 'superado';
}

const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } }
};

const BORDER_HEADER = {
  ...BORDER_THIN,
  bottom: { style: 'medium', color: { rgb: 'F59E0B' } }
};

function applyStyle(ws: XLSX.WorkSheet, r: number, c: number, style: any) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ws[addr]) ws[addr] = { t: 's', v: '' };
  ws[addr].s = style;
}

function styleBannerRow(ws: XLSX.WorkSheet, r: number, cols: number, isTitle = true) {
  for (let c = 0; c < cols; c++) {
    applyStyle(ws, r, c, {
      fill: { fgColor: { rgb: isTitle ? '0F172A' : '1E293B' } },
      font: {
        name: 'Calibri',
        sz: isTitle ? 14 : 10,
        bold: true,
        color: { rgb: isTitle ? 'F59E0B' : 'E2E8F0' }
      },
      alignment: { horizontal: 'center', vertical: 'center' },
      ...(isTitle ? {} : { border: { bottom: { style: 'medium', color: { rgb: 'F59E0B' } } } })
    });
  }
}

function styleSectionRow(ws: XLSX.WorkSheet, r: number, cols: number) {
  for (let c = 0; c < cols; c++) {
    applyStyle(ws, r, c, {
      fill: { fgColor: { rgb: 'F59E0B' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0F172A' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: BORDER_THIN
    });
  }
}

function styleFooterRow(ws: XLSX.WorkSheet, r: number, cols: number) {
  for (let c = 0; c < cols; c++) {
    applyStyle(ws, r, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 9, italic: true, color: { rgb: '94A3B8' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
  }
}

function resolveAuctionOriginLabel(lot: AuctionLot): string {
  if (isVerizonLot(lot)) return 'VERIZON';
  if (isTMobileLot(lot)) return 'T-MOBILE';
  if (isAssurantLot(lot)) return 'ASSURANT';
  const mkt = getMarketplaceNumber(lot);
  if (mkt) return `MARKETPLACE ${mkt}`;
  if (lot.sourceType === 'MACBOOKS' || /macbook/i.test(lot.auctionHouse || '')) return 'MACBOOKS';
  if (lot.sourceType === 'STOCK_APPLE') return 'ESTOQUE APPLE';
  return lot.auctionHouse || 'US HUB';
}

function getOfferStatusPillStyle(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('aceita') || s.includes('vencendo') || s.includes('homologada') || s.includes('arrematado')) {
    return 'background:#dcfce7;color:#15803d;border:1px solid #86efac;';
  }
  if (s.includes('contra')) {
    return 'background:#e0e7ff;color:#4338ca;border:1px solid #a5b4fc;';
  }
  if (s.includes('análise') || s.includes('analise')) {
    return 'background:#fef3c7;color:#b45309;border:1px solid #fcd34d;';
  }
  if (s.includes('recusada') || s.includes('superad')) {
    return 'background:#ffe4e6;color:#be123c;border:1px solid #fda4af;';
  }
  return 'background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;';
}

// ============================================================================
// 1. EXPORTAÇÃO DE TODOS OS LEILÕES IMPORTADOS (EXCEL & PDF)
// ============================================================================
export function exportAuctionsCatalogXlsx(
  lots: AuctionLot[],
  usdRate: number,
  options?: { filterLabel?: string; filename?: string }
) {
  const safeRate = usdRate > 0 ? usdRate : 5.75;
  const totalLots = lots.length;
  const totalUnits = lots.reduce((acc, l) => acc + Math.max(1, Number(l.quantity) || 1), 0);
  const totalUsd = lots.reduce((acc, l) => acc + getLotTotalPriceUsd(l), 0);
  const totalBrl = totalUsd * safeRate;
  const exportedAt = new Date().toLocaleString('pt-BR');
  const filterText = options?.filterLabel || 'Catálogo Completo Importado';

  const COLS = 13;
  const emptyRow = () => Array(COLS).fill('');

  const headers = [
    'Lote',
    'Origem / Casa',
    'Título do Lote',
    'Modelo / Família',
    'Grade',
    'Qtd (Un.)',
    'Capacidade',
    'Bateria',
    'Operadora / IMEI',
    'Unit. (USD)',
    'Total Lote (USD)',
    'Total Aprox. (BRL)',
    'Localização'
  ];

  const dataRows = lots.map(lot => {
    const verizon = isVerizonLot(lot);
    const gradeLabel = verizon ? mapVerizonGradeStrict(lot.grade) : (lot.grade || 'Grade A');
    const qty = Math.max(1, Number(lot.quantity) || 1);
    const unitUsd = getLotUnitPriceUsd(lot);
    const lotTotalUsd = getLotTotalPriceUsd(lot);
    const lotTotalBrl = lotTotalUsd * safeRate;
    const isFreePrice = verizon && lot.currentBidUsd === 0;

    return [
      lot.lotNumber,
      resolveAuctionOriginLabel(lot),
      stripLotPrefix(lot.title),
      lot.modelFamily || stripLotPrefix(lot.title),
      gradeLabel,
      qty,
      lot.primaryStorage || 'Misto',
      lot.batteryHealthRange || '85%+',
      `${lot.carrierStatus || 'Desbloqueado'} · ${lot.imeiStatus || 'Clean'}`,
      isFreePrice ? 'Livre USD' : Number(unitUsd.toFixed(2)),
      isFreePrice ? 'Livre USD' : Number(lotTotalUsd.toFixed(2)),
      isFreePrice ? 'Livre BRL' : Number(lotTotalBrl.toFixed(2)),
      lot.location || 'Miami, FL'
    ];
  });

  const sheetRows: (string | number)[][] = [
    ['USAFAST LEILÕES HUB — CATÁLOGO OFICIAL DE LEILÕES IMPORTADOS', ...Array(COLS - 1).fill('')],
    [`Filtro: ${filterText}  |  Exportado em: ${exportedAt}  |  PTAX: R$ ${safeRate.toFixed(2)}`, ...Array(COLS - 1).fill('')],
    emptyRow(),
    [
      'Total de Lotes:', `${totalLots.toLocaleString('pt-BR')} lotes`, '',
      'Total Aparelhos:', `${totalUnits.toLocaleString('pt-BR')} un.`, '',
      'Volume USD:', `$ ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '',
      'Equiv. BRL (PTAX):', `R$ ${totalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '', ''
    ],
    emptyRow(),
    [`RELAÇÃO COMPLETA DOS LOTES IMPORTADOS (${totalLots.toLocaleString('pt-BR')} REGISTROS)`, ...Array(COLS - 1).fill('')],
    headers,
    ...dataRows,
    [
      'TOTAIS CONSOLIDADOS',
      `${totalLots} lotes`,
      '',
      '',
      '',
      totalUnits,
      '',
      '',
      '',
      '',
      Number(totalUsd.toFixed(2)),
      Number(totalBrl.toFixed(2)),
      ''
    ],
    emptyRow(),
    ['USAFAST LEILÕES HUB MIAMI LLC · Portal Oficial do Importador · Doral, FL', ...Array(COLS - 1).fill('')]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  const totalsRowIdx = 7 + dataRows.length;
  const lastRowIdx = sheetRows.length - 1;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
    { s: { r: 3, c: 7 }, e: { r: 3, c: 8 } },
    { s: { r: 3, c: 10 }, e: { r: 3, c: 12 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: COLS - 1 } },
    { s: { r: totalsRowIdx, c: 2 }, e: { r: totalsRowIdx, c: 4 } },
    { s: { r: lastRowIdx, c: 0 }, e: { r: lastRowIdx, c: COLS - 1 } }
  ];

  styleBannerRow(ws, 0, COLS, true);
  styleBannerRow(ws, 1, COLS, false);

  const summaryLabelCols = new Set([0, 3, 6, 9]);
  for (let c = 0; c < COLS; c++) {
    const isLbl = summaryLabelCols.has(c);
    applyStyle(ws, 3, c, {
      fill: { fgColor: { rgb: isLbl ? 'E2E8F0' : 'F8FAFC' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: isLbl ? '334155' : '0F172A' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: BORDER_THIN
    });
  }

  styleSectionRow(ws, 5, COLS);

  for (let c = 0; c < COLS; c++) {
    const center = c === 4 || c === 5 || c === 6 || c === 7;
    const right = c === 9 || c === 10 || c === 11;
    applyStyle(ws, 6, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: center ? 'center' : right ? 'right' : 'left', vertical: 'center' },
      border: BORDER_HEADER
    });
  }

  for (let i = 0; i < dataRows.length; i++) {
    const r = 7 + i;
    const bg = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    for (let c = 0; c < COLS; c++) {
      const center = c === 4 || c === 5 || c === 6 || c === 7;
      const right = c === 9 || c === 10 || c === 11;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      const isNum = cell && typeof cell.v === 'number';
      applyStyle(ws, r, c, {
        fill: { fgColor: { rgb: c === 4 ? 'FFFBEB' : bg } },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: c === 0 || c === 4 || c === 10,
          color: { rgb: c === 0 || c === 4 ? 'B45309' : c === 10 || c === 11 ? '047857' : '1E293B' }
        },
        alignment: { horizontal: center ? 'center' : right ? 'right' : 'left', vertical: 'center' },
        border: BORDER_THIN,
        ...(isNum && (c === 9 || c === 10) ? { numFmt: '"$"#,##0.00' } : {}),
        ...(isNum && c === 11 ? { numFmt: '"R$ "#,##0.00' } : {})
      });
    }
  }

  // Totals row
  for (let c = 0; c < COLS; c++) {
    const center = c === 5;
    const right = c === 10 || c === 11;
    applyStyle(ws, totalsRowIdx, c, {
      fill: { fgColor: { rgb: '1E293B' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FBBF24' } },
      alignment: { horizontal: center ? 'center' : right ? 'right' : 'left', vertical: 'center' },
      border: BORDER_HEADER,
      ...(c === 10 ? { numFmt: '"$"#,##0.00' } : {}),
      ...(c === 11 ? { numFmt: '"R$ "#,##0.00' } : {})
    });
  }

  styleFooterRow(ws, lastRowIdx, COLS);

  ws['!cols'] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 36 },
    { wch: 24 },
    { wch: 11 },
    { wch: 10 },
    { wch: 13 },
    { wch: 13 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 }
  ];
  ws['!rows'] = [
    { hpt: 28 },
    { hpt: 20 },
    { hpt: 10 },
    { hpt: 22 },
    { hpt: 10 },
    { hpt: 22 },
    { hpt: 24 }
  ];

  // Sheet 2: Breakdown by Origin / Auction House
  const originMap = new Map<string, { lots: number; units: number; usd: number }>();
  for (const lot of lots) {
    const key = resolveAuctionOriginLabel(lot);
    const curr = originMap.get(key) || { lots: 0, units: 0, usd: 0 };
    curr.lots += 1;
    curr.units += Math.max(1, Number(lot.quantity) || 1);
    curr.usd += getLotTotalPriceUsd(lot);
    originMap.set(key, curr);
  }
  const originEntries = Array.from(originMap.entries()).sort((a, b) => b[1].units - a[1].units);
  const originRows: (string | number)[][] = [
    ['USAFAST LEILÕES HUB — RESUMO POR ORIGEM / CASA DE LEILÃO', '', '', '', ''],
    [`Total: ${totalLots} lotes · ${totalUnits.toLocaleString('pt-BR')} aparelhos`, '', '', '', ''],
    ['', '', '', '', ''],
    ['Casa / Origem', 'Qtd de Lotes', 'Total Aparelhos', 'Total (USD)', 'Equiv. (BRL PTAX)'],
    ...originEntries.map(([origin, stat]) => [
      origin,
      stat.lots,
      stat.units,
      Number(stat.usd.toFixed(2)),
      Number((stat.usd * safeRate).toFixed(2))
    ])
  ];
  const wsOrigin = XLSX.utils.aoa_to_sheet(originRows);
  wsOrigin['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }
  ];
  styleBannerRow(wsOrigin, 0, 5, true);
  styleBannerRow(wsOrigin, 1, 5, false);
  for (let c = 0; c < 5; c++) {
    applyStyle(wsOrigin, 3, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: c >= 3 ? 'right' : c >= 1 ? 'center' : 'left', vertical: 'center' },
      border: BORDER_HEADER
    });
  }
  for (let r = 4; r < originRows.length; r++) {
    for (let c = 0; c < 5; c++) {
      applyStyle(wsOrigin, r, c, {
        fill: { fgColor: { rgb: r % 2 === 0 ? 'FFFFFF' : 'F8FAFC' } },
        font: { name: 'Calibri', sz: 10, bold: c === 0 || c === 3, color: { rgb: c >= 3 ? '047857' : '1E293B' } },
        alignment: { horizontal: c >= 3 ? 'right' : c >= 1 ? 'center' : 'left', vertical: 'center' },
        border: BORDER_THIN,
        ...(c === 3 ? { numFmt: '"$"#,##0.00' } : {}),
        ...(c === 4 ? { numFmt: '"R$ "#,##0.00' } : {})
      });
    }
  }
  wsOrigin['!cols'] = [{ wch: 24 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];
  wsOrigin['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 10 }, { hpt: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo Leilões');
  XLSX.utils.book_append_sheet(wb, wsOrigin, 'Resumo por Origem');

  const dateSlug = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, options?.filename || `USAFAST_Catalogo_Leiloes_${dateSlug}.xlsx`);
}

export function exportAuctionsCatalogPdf(
  lots: AuctionLot[],
  usdRate: number,
  options?: { filterLabel?: string }
) {
  const safeRate = usdRate > 0 ? usdRate : 5.75;
  const totalLots = lots.length;
  const totalUnits = lots.reduce((acc, l) => acc + Math.max(1, Number(l.quantity) || 1), 0);
  const totalUsd = lots.reduce((acc, l) => acc + getLotTotalPriceUsd(l), 0);
  const totalBrl = totalUsd * safeRate;
  const exportedAt = new Date().toLocaleString('pt-BR');
  const filterText = options?.filterLabel || 'Catálogo Completo Importado';

  const originMap = new Map<string, { lots: number; units: number }>();
  for (const lot of lots) {
    const key = resolveAuctionOriginLabel(lot);
    const curr = originMap.get(key) || { lots: 0, units: 0 };
    curr.lots += 1;
    curr.units += Math.max(1, Number(lot.quantity) || 1);
    originMap.set(key, curr);
  }
  const originBadgesHtml = Array.from(originMap.entries())
    .sort((a, b) => b[1].units - a[1].units)
    .map(
      ([orig, st]) =>
        `<span class="origin-pill"><strong>${escapeHtml(orig)}</strong>: ${st.lots} lote(s) · ${st.units.toLocaleString('pt-BR')} un.</span>`
    )
    .join('');

  const rowsHtml = lots
    .map((lot, idx) => {
      const verizon = isVerizonLot(lot);
      const gradeLabel = verizon ? mapVerizonGradeStrict(lot.grade) : (lot.grade || 'Grade A');
      const qty = Math.max(1, Number(lot.quantity) || 1);
      const unitUsd = getLotUnitPriceUsd(lot);
      const lotTotalUsd = getLotTotalPriceUsd(lot);
      const lotTotalBrl = lotTotalUsd * safeRate;
      const isFreePrice = verizon && lot.currentBidUsd === 0;

      return `
        <tr class="${idx % 2 === 1 ? 'alt' : ''}">
          <td class="mono bold amber-text">${escapeHtml(lot.lotNumber)}</td>
          <td><span class="origin-tag">${escapeHtml(resolveAuctionOriginLabel(lot))}</span></td>
          <td>
            <div class="bold">${escapeHtml(stripLotPrefix(lot.title))}</div>
            <div class="sub">${escapeHtml(lot.modelFamily || '')} · ${escapeHtml(lot.location || 'Miami, FL')}</div>
          </td>
          <td class="center"><span class="grade-pill">${escapeHtml(gradeLabel)}</span></td>
          <td class="center mono bold">${qty.toLocaleString('pt-BR')}</td>
          <td class="center mono">${escapeHtml(lot.primaryStorage || 'Misto')}</td>
          <td class="right mono">${isFreePrice ? 'Livre USD' : `$${unitUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
          <td class="right mono bold green-text">${isFreePrice ? 'Livre USD' : `$${lotTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
          <td class="right mono">${isFreePrice ? '-' : `R$ ${lotTotalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Catálogo Oficial de Leilões USAFAST</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { margin: 0; padding: 0; background: #fff !important; }
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 16px;
          color: #0f172a;
          background: #ffffff;
          font-size: 9.5px;
        }
        .banner {
          background: #0f172a;
          color: #fff;
          padding: 15px 18px;
          border-radius: 10px;
          border-bottom: 4px solid #f59e0b;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .badge { display: inline-block; background: #f59e0b; color: #0f172a; font-weight: 900; font-size: 8.5px; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 4px; }
        .banner h1 { margin: 0; font-size: 16px; font-weight: 900; }
        .banner p { margin: 3px 0 0; font-size: 9.5px; color: #cbd5e1; }
        .banner-right { text-align: right; font-family: ui-monospace, monospace; font-size: 9.5px; color: #e2e8f0; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
        .kpi { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; }
        .kpi-lbl { font-size: 8px; text-transform: uppercase; font-weight: 800; color: #64748b; }
        .kpi-val { font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 2px; font-family: ui-monospace, monospace; }
        .origins-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .origin-pill { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 5px; padding: 3px 8px; font-size: 8.5px; color: #1e293b; }
        .section-bar { background: #f59e0b; color: #0f172a; font-weight: 900; font-size: 9.5px; padding: 6px 10px; border-radius: 6px 6px 0 0; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        th { background: #0f172a; color: #fff; padding: 7px 6px; font-size: 8.5px; text-transform: uppercase; text-align: left; border-bottom: 2px solid #f59e0b; white-space: nowrap; }
        td { padding: 5.5px 6px; border-bottom: 1px solid #e2e8f0; font-size: 8.8px; vertical-align: top; }
        tr.alt td { background: #f8fafc; }
        tfoot td { background: #1e293b; color: #fbbf24; font-weight: 900; padding: 7px 6px; font-size: 9.5px; }
        .center { text-align: center !important; }
        .right { text-align: right !important; }
        .bold { font-weight: 700; color: #0f172a; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .amber-text { color: #b45309 !important; }
        .green-text { color: #047857 !important; }
        .sub { font-size: 7.8px; color: #64748b; margin-top: 1px; }
        .grade-pill { display: inline-block; background: #fffbeb; border: 1px solid #fcd34d; color: #b45309; padding: 1px 5px; border-radius: 4px; font-weight: 800; font-size: 8px; }
        .origin-tag { display: inline-block; background: #e2e8f0; color: #0f172a; padding: 1px 5px; border-radius: 4px; font-weight: 800; font-size: 7.8px; white-space: nowrap; }
        .footer { margin-top: 10px; padding: 7px 10px; background: #0f172a; color: #94a3b8; border-radius: 6px; display: flex; justify-content: space-between; font-size: 8px; }
      </style>
    </head>
    <body>
      <div class="banner">
        <div>
          <div class="badge">USAFAST LEILÕES HUB · CATÁLOGO DE LEILÕES</div>
          <h1>Relação Oficial de Leilões Importados</h1>
          <p>Escopo: ${escapeHtml(filterText)}</p>
        </div>
        <div class="banner-right">
          <div>Emitido em ${escapeHtml(exportedAt)}</div>
          <div>PTAX: R$ ${safeRate.toFixed(2)}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-lbl">Lotes no Catálogo</div><div class="kpi-val">${totalLots.toLocaleString('pt-BR')}</div></div>
        <div class="kpi"><div class="kpi-lbl">Total de Aparelhos</div><div class="kpi-val">${totalUnits.toLocaleString('pt-BR')} un.</div></div>
        <div class="kpi"><div class="kpi-lbl">Volume Estimado (USD)</div><div class="kpi-val" style="color:#047857;">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
        <div class="kpi"><div class="kpi-lbl">Equivalente BRL (PTAX)</div><div class="kpi-val">R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div></div>
      </div>

      <div class="origins-bar">${originBadgesHtml}</div>

      <div class="section-bar">LISTAGEM COMPLETA DE LOTES (${totalLots.toLocaleString('pt-BR')} LOTES)</div>
      <table>
        <thead>
          <tr>
            <th>Lote</th>
            <th>Origem</th>
            <th>Título / Modelo / Local</th>
            <th class="center">Grade</th>
            <th class="center">Qtd</th>
            <th class="center">Cap.</th>
            <th class="right">Unit. USD</th>
            <th class="right">Total USD</th>
            <th class="right">Aprox. BRL</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">TOTAIS CONSOLIDADOS</td>
            <td class="center mono">${totalUnits.toLocaleString('pt-BR')}</td>
            <td></td>
            <td></td>
            <td class="right mono">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="right mono">R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
          </tr>
        </tfoot>
      </table>

      <div class="footer">
        <span>USAFAST LEILÕES HUB MIAMI LLC · Hub Doral FL</span>
        <span>Documento gerado para análise comercial e importação EUA → Brasil</span>
      </div>
    </body>
    </html>
  `;

  printHtmlToPdf(html, `USAFAST_Catalogo_Leiloes_${new Date().toISOString().slice(0, 10)}`);
}

// ============================================================================
// 2. EXPORTAÇÃO DOS LANCES ATIVOS DO CLIENTE (EXCEL & PDF)
// ============================================================================
function resolveClientBidRows(params: {
  bids: ClientBidExportItem[];
  auctions: AuctionLot[];
  adminOffers: AdminOffer[];
  currentUser: SystemUser;
  usdRate: number;
}) {
  const safeRate = params.usdRate > 0 ? params.usdRate : 5.75;
  return params.bids.map(b => {
    const lot = params.auctions.find(a => a.id === b.lotId || a.lotNumber === b.lotId);
    const offer = params.adminOffers.find(
      o =>
        (o.lotId === b.lotId || o.lotNumber === b.lotId || (lot && o.lotId === lot.id)) &&
        ((o.clientEmail || '').toLowerCase() === (params.currentUser.email || '').toLowerCase() ||
          o.clientName === params.currentUser.name)
    );

    const isExpired = lot ? new Date(lot.endTime).getTime() <= Date.now() : false;
    const isOutbid = lot ? lot.currentBidUsd > b.amountUsd : false;

    let statusText = 'Maior Lance (Vencendo)';
    if (offer) {
      statusText = offer.status;
    } else if (isExpired) {
      statusText = isOutbid ? 'Encerrado (Superado)' : 'Encerrado (Arrematado)';
    } else if (isOutbid) {
      statusText = `Lance Superado ($${lot?.currentBidUsd.toLocaleString()} USD)`;
    }

    const grade = lot
      ? (isVerizonLot(lot) ? mapVerizonGradeStrict(lot.grade) : lot.grade)
      : 'Grade A';

    return {
      lotNumber: lot?.lotNumber || b.lotId,
      lotTitle: stripLotPrefix(b.lotTitle || lot?.title || b.lotId),
      modelFamily: lot?.modelFamily || stripLotPrefix(b.lotTitle),
      quantity: lot?.quantity || 1,
      grade,
      amountUsd: b.amountUsd,
      amountBrl: b.amountUsd * safeRate,
      timestamp: b.timestamp,
      statusText,
      counterOfferUsd: offer?.counterOfferUsd,
      adminNote: offer?.adminNote || ''
    };
  });
}

export function exportClientBidsXlsx(params: {
  bids: ClientBidExportItem[];
  auctions: AuctionLot[];
  adminOffers: AdminOffer[];
  currentUser: SystemUser;
  usdRate: number;
}) {
  const safeRate = params.usdRate > 0 ? params.usdRate : 5.75;
  const rows = resolveClientBidRows(params);
  const totalUsd = rows.reduce((acc, r) => acc + r.amountUsd, 0);
  const totalBrl = totalUsd * safeRate;
  const COLS = 10;

  const headers = [
    'Cód. Lote',
    'Título / Modelo',
    'Qtd',
    'Grade',
    'Seu Lance (USD)',
    'Equiv. BRL (PTAX)',
    'Data / Hora',
    'Situação Atual',
    'Contra-Oferta (USD)',
    'Observações'
  ];

  const sheetRows: (string | number)[][] = [
    ['USAFAST LEILÕES HUB — RELATÓRIO DE LANCES ATIVOS DO ARREMATANTE', ...Array(COLS - 1).fill('')],
    [`Cliente: ${params.currentUser.name} (${params.currentUser.email})  |  PTAX: R$ ${safeRate.toFixed(2)}  |  Exportado em: ${new Date().toLocaleString('pt-BR')}`, ...Array(COLS - 1).fill('')],
    Array(COLS).fill(''),
    [
      'Documento ID:', params.currentUser.cpfCnpj || '-',
      'Telefone:', params.currentUser.whatsapp || params.currentUser.phone || '-',
      'Total Lances:', `${rows.length} lance(s)`,
      'Volume USD:', `$ ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      'Equiv. BRL:', `R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
    ],
    Array(COLS).fill(''),
    [`LANCES COMPUTADOS (${rows.length})`, ...Array(COLS - 1).fill('')],
    headers,
    ...rows.map(r => [
      r.lotNumber,
      r.lotTitle,
      r.quantity,
      r.grade,
      Number(r.amountUsd.toFixed(2)),
      Number(r.amountBrl.toFixed(2)),
      r.timestamp,
      r.statusText,
      r.counterOfferUsd ? Number(r.counterOfferUsd.toFixed(2)) : '-',
      r.adminNote || '-'
    ]),
    [
      'TOTAIS',
      `${rows.length} lance(s)`,
      rows.reduce((acc, r) => acc + r.quantity, 0),
      '',
      Number(totalUsd.toFixed(2)),
      Number(totalBrl.toFixed(2)),
      '',
      '',
      '',
      ''
    ],
    Array(COLS).fill(''),
    ['USAFAST LEILÕES HUB · Histórico Oficial de Disputa e Lances do Cliente', ...Array(COLS - 1).fill('')]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  const totalsIdx = 7 + rows.length;
  const lastIdx = sheetRows.length - 1;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: COLS - 1 } },
    { s: { r: lastIdx, c: 0 }, e: { r: lastIdx, c: COLS - 1 } }
  ];

  styleBannerRow(ws, 0, COLS, true);
  styleBannerRow(ws, 1, COLS, false);

  for (let c = 0; c < COLS; c++) {
    const isLbl = c % 2 === 0;
    applyStyle(ws, 3, c, {
      fill: { fgColor: { rgb: isLbl ? 'E2E8F0' : 'F8FAFC' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: isLbl ? '334155' : '0F172A' } },
      border: BORDER_THIN
    });
  }

  styleSectionRow(ws, 5, COLS);

  for (let c = 0; c < COLS; c++) {
    applyStyle(ws, 6, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: c === 2 || c === 3 ? 'center' : c === 4 || c === 5 || c === 8 ? 'right' : 'left', vertical: 'center' },
      border: BORDER_HEADER
    });
  }

  for (let i = 0; i < rows.length; i++) {
    const r = 7 + i;
    const bg = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    for (let c = 0; c < COLS; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const isNum = ws[addr] && typeof ws[addr].v === 'number';
      applyStyle(ws, r, c, {
        fill: { fgColor: { rgb: c === 7 ? 'FFFBEB' : bg } },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: c === 0 || c === 4 || c === 7,
          color: { rgb: c === 0 ? 'B45309' : c === 4 || c === 5 ? '047857' : '1E293B' }
        },
        alignment: { horizontal: c === 2 || c === 3 ? 'center' : c === 4 || c === 5 || c === 8 ? 'right' : 'left', vertical: 'center' },
        border: BORDER_THIN,
        ...(isNum && (c === 4 || c === 8) ? { numFmt: '"$"#,##0.00' } : {}),
        ...(isNum && c === 5 ? { numFmt: '"R$ "#,##0.00' } : {})
      });
    }
  }

  for (let c = 0; c < COLS; c++) {
    applyStyle(ws, totalsIdx, c, {
      fill: { fgColor: { rgb: '1E293B' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FBBF24' } },
      alignment: { horizontal: c === 2 ? 'center' : c === 4 || c === 5 ? 'right' : 'left', vertical: 'center' },
      border: BORDER_HEADER,
      ...(c === 4 ? { numFmt: '"$"#,##0.00' } : {}),
      ...(c === 5 ? { numFmt: '"R$ "#,##0.00' } : {})
    });
  }

  styleFooterRow(ws, lastIdx, COLS);

  ws['!cols'] = [
    { wch: 15 },
    { wch: 36 },
    { wch: 9 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
    { wch: 16 },
    { wch: 28 }
  ];
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 10 }, { hpt: 22 }, { hpt: 10 }, { hpt: 22 }, { hpt: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Meus Lances Ativos');
  const safeClient = (params.currentUser.name || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `USAFAST_Lances_Ativos_${safeClient}.xlsx`);
}

export function exportClientBidsPdf(params: {
  bids: ClientBidExportItem[];
  auctions: AuctionLot[];
  adminOffers: AdminOffer[];
  currentUser: SystemUser;
  usdRate: number;
}) {
  const safeRate = params.usdRate > 0 ? params.usdRate : 5.75;
  const rows = resolveClientBidRows(params);
  const totalUsd = rows.reduce((acc, r) => acc + r.amountUsd, 0);
  const totalBrl = totalUsd * safeRate;
  const winningCount = rows.filter(r => /vencendo|aceita|homologada|arrematado/i.test(r.statusText)).length;

  const rowsHtml = rows
    .map(
      (r, idx) => `
      <tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="mono bold amber-text">${escapeHtml(r.lotNumber)}</td>
        <td><div class="bold">${escapeHtml(r.lotTitle)}</div><div class="sub">${escapeHtml(r.modelFamily)}</div></td>
        <td class="center mono">${r.quantity}</td>
        <td class="center"><span class="grade-pill">${escapeHtml(r.grade)}</span></td>
        <td class="right mono bold green-text">$${r.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="right mono">R$ ${r.amountBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
        <td>${escapeHtml(r.timestamp)}</td>
        <td><span class="status-pill" style="${getOfferStatusPillStyle(r.statusText)}">${escapeHtml(r.statusText)}</span></td>
        <td class="right mono">${r.counterOfferUsd ? `$${r.counterOfferUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}</td>
      </tr>`
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Meus Lances Ativos - ${escapeHtml(params.currentUser.name)}</title>
      <style>
        @page { size: A4 landscape; margin: 11mm; }
        @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } body { margin: 0; padding: 0; background: #fff !important; } }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 16px; color: #0f172a; font-size: 9.5px; }
        .banner { background: #0f172a; color: #fff; padding: 15px 18px; border-radius: 10px; border-bottom: 4px solid #f59e0b; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .badge { display: inline-block; background: #f59e0b; color: #0f172a; font-weight: 900; font-size: 8.5px; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 4px; }
        .banner h1 { margin: 0; font-size: 16px; font-weight: 900; }
        .banner p { margin: 3px 0 0; font-size: 9.5px; color: #cbd5e1; }
        .banner-right { text-align: right; font-family: ui-monospace, monospace; font-size: 9.5px; color: #e2e8f0; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
        .kpi { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; }
        .kpi-lbl { font-size: 8px; text-transform: uppercase; font-weight: 800; color: #64748b; }
        .kpi-val { font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 2px; font-family: ui-monospace, monospace; }
        .section-bar { background: #f59e0b; color: #0f172a; font-weight: 900; font-size: 9.5px; padding: 6px 10px; border-radius: 6px 6px 0 0; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        th { background: #0f172a; color: #fff; padding: 7px 6px; font-size: 8.5px; text-transform: uppercase; text-align: left; border-bottom: 2px solid #f59e0b; }
        td { padding: 6px; border-bottom: 1px solid #e2e8f0; font-size: 8.8px; vertical-align: middle; }
        tr.alt td { background: #f8fafc; }
        tfoot td { background: #1e293b; color: #fbbf24; font-weight: 900; padding: 7px 6px; }
        .center { text-align: center !important; }
        .right { text-align: right !important; }
        .bold { font-weight: 700; color: #0f172a; }
        .mono { font-family: ui-monospace, monospace; }
        .amber-text { color: #b45309 !important; }
        .green-text { color: #047857 !important; }
        .sub { font-size: 7.8px; color: #64748b; }
        .grade-pill { display: inline-block; background: #fffbeb; border: 1px solid #fcd34d; color: #b45309; padding: 1px 5px; border-radius: 4px; font-weight: 800; font-size: 8px; }
        .status-pill { display: inline-block; padding: 2px 6px; border-radius: 5px; font-weight: 800; font-size: 8px; white-space: nowrap; }
        .footer { margin-top: 10px; padding: 7px 10px; background: #0f172a; color: #94a3b8; border-radius: 6px; display: flex; justify-content: space-between; font-size: 8px; }
      </style>
    </head>
    <body>
      <div class="banner">
        <div>
          <div class="badge">USAFAST LEILÕES HUB · LANCES ATIVOS DO ARREMATANTE</div>
          <h1>${escapeHtml(params.currentUser.name || 'Arrematante Autorizado')}</h1>
          <p>E-mail: ${escapeHtml(params.currentUser.email)} · Doc: ${escapeHtml(params.currentUser.cpfCnpj || '-')} · Tel: ${escapeHtml(params.currentUser.whatsapp || params.currentUser.phone || '-')}</p>
        </div>
        <div class="banner-right">
          <div>Emitido em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
          <div>PTAX: R$ ${safeRate.toFixed(2)}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-lbl">Lances Computados</div><div class="kpi-val">${rows.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Vencendo / Aceitos</div><div class="kpi-val" style="color:#047857;">${winningCount}</div></div>
        <div class="kpi"><div class="kpi-lbl">Total Ofertado (USD)</div><div class="kpi-val">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
        <div class="kpi"><div class="kpi-lbl">Equiv. BRL (PTAX)</div><div class="kpi-val">R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div></div>
      </div>

      <div class="section-bar">HISTÓRICO DE LANCES ATIVOS NO PREGÃO</div>
      <table>
        <thead>
          <tr>
            <th>Lote</th>
            <th>Título / Modelo</th>
            <th class="center">Qtd</th>
            <th class="center">Grade</th>
            <th class="right">Seu Lance (USD)</th>
            <th class="right">Aprox. BRL</th>
            <th>Momento</th>
            <th>Situação</th>
            <th class="right">Contra-Oferta</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">TOTAL DE LANCES ATIVOS (${rows.length})</td>
            <td class="right mono">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="right mono">R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>

      <div class="footer">
        <span>USAFAST LEILÕES HUB MIAMI LLC · Painel Oficial do Arrematante</span>
        <span>Valores em BRL calculados pela PTAX vigente de R$ ${safeRate.toFixed(2)}</span>
      </div>
    </body>
    </html>
  `;

  printHtmlToPdf(html, `USAFAST_Lances_Ativos_${(params.currentUser.name || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_')}`);
}

// ============================================================================
// 3. EXPORTAÇÃO DE OFERTAS COMPUTADAS (TODAS OU POR CLIENTE - EXCEL & PDF)
// ============================================================================
function resolveAdminOffersData(params: {
  offers: AdminOffer[];
  auctions: AuctionLot[];
  clients: SystemUser[];
  usdRate: number;
  selectedClientEmail?: string;
}) {
  const safeRate = params.usdRate > 0 ? params.usdRate : 5.75;
  const filterKey = (params.selectedClientEmail || 'all').trim().toLowerCase();

  const filteredOffers =
    filterKey === 'all' || !filterKey
      ? params.offers
      : params.offers.filter(o => {
          const email = (o.clientEmail || '').trim().toLowerCase();
          const name = (o.clientName || '').trim().toLowerCase();
          return email === filterKey || name === filterKey;
        });

  const enriched = filteredOffers.map(offer => {
    const lot = params.auctions.find(a => a.lotNumber === offer.lotNumber || a.id === offer.lotId);
    const client = params.clients.find(
      c =>
        (c.email && offer.clientEmail && c.email.toLowerCase() === offer.clientEmail.toLowerCase()) ||
        (c.name && offer.clientName && c.name.toLowerCase() === offer.clientName.toLowerCase())
    );
    const qty = lot?.quantity || 1;
    const grade = lot ? (isVerizonLot(lot) ? mapVerizonGradeStrict(lot.grade) : lot.grade) : 'Grade A';
    const amountBrl = offer.amountBrl > 0 ? offer.amountBrl : offer.amountUsd * safeRate;

    return {
      ...offer,
      modelFamily: lot?.modelFamily || stripLotPrefix(offer.lotTitle),
      quantity: qty,
      grade,
      amountBrl,
      whatsapp: offer.clientWhatsapp || client?.whatsapp || client?.phone || offer.clientPhone || '-',
      cpfCnpj: client?.cpfCnpj || '-',
      consultantName: client?.consultantName || '-'
    };
  });

  // Group summary by client
  const clientSummaryMap = new Map<
    string,
    {
      clientName: string;
      clientEmail: string;
      whatsapp: string;
      totalOffers: number;
      acceptedCount: number;
      pendingCount: number;
      totalUsd: number;
      acceptedUsd: number;
    }
  >();

  for (const o of enriched) {
    const key = (o.clientEmail || o.clientName || 'Desconhecido').toLowerCase();
    const cur = clientSummaryMap.get(key) || {
      clientName: o.clientName || 'Cliente',
      clientEmail: o.clientEmail || '-',
      whatsapp: o.whatsapp,
      totalOffers: 0,
      acceptedCount: 0,
      pendingCount: 0,
      totalUsd: 0,
      acceptedUsd: 0
    };
    cur.totalOffers += 1;
    cur.totalUsd += Number(o.amountUsd) || 0;
    const isAcc = o.status === 'Aceita' || o.status === 'Homologada / Arrematada' || o.status === 'Vencendo';
    if (isAcc) {
      cur.acceptedCount += 1;
      cur.acceptedUsd += Number(o.amountUsd) || 0;
    } else if (o.status === 'Em Análise' || o.status === 'Contra-Oferta') {
      cur.pendingCount += 1;
    }
    clientSummaryMap.set(key, cur);
  }

  const clientSummaries = Array.from(clientSummaryMap.values()).sort((a, b) => b.totalUsd - a.totalUsd);
  const selectedClientObj =
    filterKey !== 'all'
      ? params.clients.find(
          c => (c.email || '').toLowerCase() === filterKey || (c.name || '').toLowerCase() === filterKey
        )
      : undefined;

  return { enriched, clientSummaries, selectedClientObj, safeRate, filterKey };
}

export function exportAdminOffersXlsx(params: {
  offers: AdminOffer[];
  auctions: AuctionLot[];
  clients: SystemUser[];
  usdRate: number;
  selectedClientEmail?: string;
}) {
  const { enriched, clientSummaries, selectedClientObj, safeRate, filterKey } = resolveAdminOffersData(params);
  const totalUsd = enriched.reduce((acc, o) => acc + (Number(o.amountUsd) || 0), 0);
  const totalBrl = enriched.reduce((acc, o) => acc + (Number(o.amountBrl) || 0), 0);
  const acceptedCount = enriched.filter(
    o => o.status === 'Aceita' || o.status === 'Homologada / Arrematada' || o.status === 'Vencendo'
  ).length;

  const scopeLabel =
    filterKey === 'all'
      ? `Todos os Clientes (${clientSummaries.length} arrematantes)`
      : `Cliente: ${selectedClientObj?.name || enriched[0]?.clientName || params.selectedClientEmail}`;

  const COLS = 13;
  const headers = [
    'Data / Hora',
    'Lote',
    'Título / Modelo',
    'Qtd',
    'Grade',
    'Cliente / Arrematante',
    'E-mail',
    'WhatsApp',
    'Oferta (USD)',
    'Equiv. BRL (PTAX)',
    'Status',
    'Contra-Oferta (USD)',
    'Observação Admin'
  ];

  const sheetRows: (string | number)[][] = [
    ['USAFAST LEILÕES HUB — RELATÓRIO OFICIAL DE OFERTAS COMPUTADAS', ...Array(COLS - 1).fill('')],
    [`Escopo: ${scopeLabel}  |  PTAX: R$ ${safeRate.toFixed(2)}  |  Exportado em: ${new Date().toLocaleString('pt-BR')}`, ...Array(COLS - 1).fill('')],
    Array(COLS).fill(''),
    [
      'Total Ofertas:', `${enriched.length}`, '',
      'Aceitas/Vencendo:', `${acceptedCount}`, '',
      'Volume USD:', `$ ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, '',
      'Volume BRL (PTAX):', `R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, '', ''
    ],
    Array(COLS).fill(''),
    [`OFERTAS COMPUTADAS POR CLIENTE (${enriched.length} REGISTROS)`, ...Array(COLS - 1).fill('')],
    headers,
    ...enriched.map(o => [
      o.timestamp,
      o.lotNumber,
      `${stripLotPrefix(o.lotTitle)}${o.modelFamily && o.modelFamily !== stripLotPrefix(o.lotTitle) ? ` (${o.modelFamily})` : ''}`,
      o.quantity,
      o.grade,
      o.clientName,
      o.clientEmail,
      o.whatsapp,
      Number((Number(o.amountUsd) || 0).toFixed(2)),
      Number((Number(o.amountBrl) || 0).toFixed(2)),
      o.status,
      o.counterOfferUsd ? Number(o.counterOfferUsd.toFixed(2)) : '-',
      o.adminNote || '-'
    ]),
    [
      'TOTAIS CONSOLIDADOS',
      `${enriched.length} ofertas`,
      '',
      enriched.reduce((acc, o) => acc + o.quantity, 0),
      '',
      `${clientSummaries.length} cliente(s)`,
      '',
      '',
      Number(totalUsd.toFixed(2)),
      Number(totalBrl.toFixed(2)),
      '',
      '',
      ''
    ],
    Array(COLS).fill(''),
    ['USAFAST LEILÕES HUB MIAMI LLC · Central Administrativa de Ofertas', ...Array(COLS - 1).fill('')]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  const totalsIdx = 7 + enriched.length;
  const lastIdx = sheetRows.length - 1;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
    { s: { r: 3, c: 7 }, e: { r: 3, c: 8 } },
    { s: { r: 3, c: 10 }, e: { r: 3, c: COLS - 1 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: COLS - 1 } },
    { s: { r: lastIdx, c: 0 }, e: { r: lastIdx, c: COLS - 1 } }
  ];

  styleBannerRow(ws, 0, COLS, true);
  styleBannerRow(ws, 1, COLS, false);

  const labelCols = new Set([0, 3, 6, 9]);
  for (let c = 0; c < COLS; c++) {
    const isLbl = labelCols.has(c);
    applyStyle(ws, 3, c, {
      fill: { fgColor: { rgb: isLbl ? 'E2E8F0' : 'F8FAFC' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: isLbl ? '334155' : '0F172A' } },
      border: BORDER_THIN
    });
  }

  styleSectionRow(ws, 5, COLS);

  for (let c = 0; c < COLS; c++) {
    const center = c === 3 || c === 4;
    const right = c === 8 || c === 9 || c === 11;
    applyStyle(ws, 6, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: center ? 'center' : right ? 'right' : 'left', vertical: 'center' },
      border: BORDER_HEADER
    });
  }

  for (let i = 0; i < enriched.length; i++) {
    const r = 7 + i;
    const bg = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    for (let c = 0; c < COLS; c++) {
      const center = c === 3 || c === 4;
      const right = c === 8 || c === 9 || c === 11;
      const addr = XLSX.utils.encode_cell({ r, c });
      const isNum = ws[addr] && typeof ws[addr].v === 'number';
      applyStyle(ws, r, c, {
        fill: { fgColor: { rgb: c === 10 ? 'FFFBEB' : bg } },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: c === 1 || c === 5 || c === 8 || c === 10,
          color: { rgb: c === 1 ? 'B45309' : c === 8 || c === 9 ? '047857' : '1E293B' }
        },
        alignment: { horizontal: center ? 'center' : right ? 'right' : 'left', vertical: 'center' },
        border: BORDER_THIN,
        ...(isNum && (c === 8 || c === 11) ? { numFmt: '"$"#,##0.00' } : {}),
        ...(isNum && c === 9 ? { numFmt: '"R$ "#,##0.00' } : {})
      });
    }
  }

  for (let c = 0; c < COLS; c++) {
    applyStyle(ws, totalsIdx, c, {
      fill: { fgColor: { rgb: '1E293B' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FBBF24' } },
      alignment: { horizontal: c === 3 ? 'center' : c === 8 || c === 9 ? 'right' : 'left', vertical: 'center' },
      border: BORDER_HEADER,
      ...(c === 8 ? { numFmt: '"$"#,##0.00' } : {}),
      ...(c === 9 ? { numFmt: '"R$ "#,##0.00' } : {})
    });
  }

  styleFooterRow(ws, lastIdx, COLS);

  ws['!cols'] = [
    { wch: 18 },
    { wch: 15 },
    { wch: 34 },
    { wch: 8 },
    { wch: 11 },
    { wch: 24 },
    { wch: 26 },
    { wch: 16 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 26 }
  ];
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 10 }, { hpt: 22 }, { hpt: 10 }, { hpt: 22 }, { hpt: 24 }];

  // Sheet 2: Resumo por Cliente
  const S2_COLS = 9;
  const s2Rows: (string | number)[][] = [
    ['USAFAST LEILÕES HUB — CONSOLIDAÇÃO DE OFERTAS POR CLIENTE', ...Array(S2_COLS - 1).fill('')],
    [`Escopo: ${scopeLabel} · PTAX R$ ${safeRate.toFixed(2)}`, ...Array(S2_COLS - 1).fill('')],
    Array(S2_COLS).fill(''),
    [
      'Cliente / Razão Social',
      'E-mail',
      'WhatsApp',
      'Total Ofertas',
      'Aceitas / Vencendo',
      'Em Análise / Contra',
      'Volume Total (USD)',
      'Volume Aceito (USD)',
      'Equivalente Total (BRL)'
    ],
    ...clientSummaries.map(cs => [
      cs.clientName,
      cs.clientEmail,
      cs.whatsapp,
      cs.totalOffers,
      cs.acceptedCount,
      cs.pendingCount,
      Number(cs.totalUsd.toFixed(2)),
      Number(cs.acceptedUsd.toFixed(2)),
      Number((cs.totalUsd * safeRate).toFixed(2))
    ])
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(s2Rows);
  wsSummary['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: S2_COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: S2_COLS - 1 } }
  ];
  styleBannerRow(wsSummary, 0, S2_COLS, true);
  styleBannerRow(wsSummary, 1, S2_COLS, false);
  for (let c = 0; c < S2_COLS; c++) {
    applyStyle(wsSummary, 3, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: c >= 6 ? 'right' : c >= 3 ? 'center' : 'left', vertical: 'center' },
      border: BORDER_HEADER
    });
  }
  for (let r = 4; r < s2Rows.length; r++) {
    for (let c = 0; c < S2_COLS; c++) {
      applyStyle(wsSummary, r, c, {
        fill: { fgColor: { rgb: r % 2 === 0 ? 'FFFFFF' : 'F8FAFC' } },
        font: { name: 'Calibri', sz: 10, bold: c === 0 || c === 6 || c === 7, color: { rgb: c >= 6 ? '047857' : '1E293B' } },
        alignment: { horizontal: c >= 6 ? 'right' : c >= 3 ? 'center' : 'left', vertical: 'center' },
        border: BORDER_THIN,
        ...(c === 6 || c === 7 ? { numFmt: '"$"#,##0.00' } : {}),
        ...(c === 8 ? { numFmt: '"R$ "#,##0.00' } : {})
      });
    }
  }
  wsSummary['!cols'] = [
    { wch: 26 },
    { wch: 28 },
    { wch: 16 },
    { wch: 13 },
    { wch: 17 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 }
  ];
  wsSummary['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 10 }, { hpt: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ofertas Computadas');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo por Cliente');

  const fileSlug =
    filterKey === 'all'
      ? 'Todos_Clientes'
      : (selectedClientObj?.name || enriched[0]?.clientName || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `USAFAST_Ofertas_${fileSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportAdminOffersPdf(params: {
  offers: AdminOffer[];
  auctions: AuctionLot[];
  clients: SystemUser[];
  usdRate: number;
  selectedClientEmail?: string;
}) {
  const { enriched, clientSummaries, selectedClientObj, safeRate, filterKey } = resolveAdminOffersData(params);
  const totalUsd = enriched.reduce((acc, o) => acc + (Number(o.amountUsd) || 0), 0);
  const totalBrl = enriched.reduce((acc, o) => acc + (Number(o.amountBrl) || 0), 0);
  const acceptedCount = enriched.filter(
    o => o.status === 'Aceita' || o.status === 'Homologada / Arrematada' || o.status === 'Vencendo'
  ).length;

  const isSingleClient = filterKey !== 'all';
  const clientInfoCardHtml =
    isSingleClient
      ? `
      <div class="client-card">
        <div><strong>Cliente / Razão Social:</strong> ${escapeHtml(selectedClientObj?.name || enriched[0]?.clientName || '-')}</div>
        <div><strong>E-mail:</strong> ${escapeHtml(selectedClientObj?.email || enriched[0]?.clientEmail || '-')}</div>
        <div><strong>Documento ID:</strong> ${escapeHtml(selectedClientObj?.cpfCnpj || enriched[0]?.cpfCnpj || '-')}</div>
        <div><strong>WhatsApp:</strong> ${escapeHtml(selectedClientObj?.whatsapp || selectedClientObj?.phone || enriched[0]?.whatsapp || '-')}</div>
        <div><strong>Consultor:</strong> ${escapeHtml(selectedClientObj?.consultantName || enriched[0]?.consultantName || '-')}</div>
      </div>`
      : `
      <div class="section-block">
        <div class="section-bar">RESUMO CONSOLIDADO POR CLIENTE (${clientSummaries.length} ARREMATANTES)</div>
        <table>
          <thead>
            <tr>
              <th>Cliente / Arrematante</th>
              <th>E-mail</th>
              <th>WhatsApp</th>
              <th class="center">Ofertas</th>
              <th class="center">Aceitas / Venc.</th>
              <th class="right">Volume Total (USD)</th>
              <th class="right">Volume Aceito (USD)</th>
              <th class="right">Equiv. Total (BRL)</th>
            </tr>
          </thead>
          <tbody>
            ${clientSummaries
              .map(
                (cs, idx) => `
              <tr class="${idx % 2 === 1 ? 'alt' : ''}">
                <td class="bold">${escapeHtml(cs.clientName)}</td>
                <td class="mono">${escapeHtml(cs.clientEmail)}</td>
                <td class="mono">${escapeHtml(cs.whatsapp)}</td>
                <td class="center mono bold">${cs.totalOffers}</td>
                <td class="center mono green-text bold">${cs.acceptedCount}</td>
                <td class="right mono bold">$${cs.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="right mono bold green-text">$${cs.acceptedUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="right mono">R$ ${(cs.totalUsd * safeRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

  const rowsHtml = enriched
    .map(
      (o, idx) => `
      <tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="muted">${escapeHtml(o.timestamp)}</td>
        <td class="mono bold amber-text">${escapeHtml(o.lotNumber)}</td>
        <td><div class="bold">${escapeHtml(stripLotPrefix(o.lotTitle))}</div><div class="sub">${escapeHtml(o.modelFamily)}</div></td>
        <td class="center mono">${o.quantity}</td>
        <td class="center"><span class="grade-pill">${escapeHtml(o.grade)}</span></td>
        <td><div class="bold">${escapeHtml(o.clientName)}</div><div class="sub">${escapeHtml(o.clientEmail)}</div></td>
        <td class="right mono bold green-text">$${Number(o.amountUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="right mono">R$ ${Number(o.amountBrl).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
        <td><span class="status-pill" style="${getOfferStatusPillStyle(o.status)}">${escapeHtml(o.status)}</span></td>
        <td class="right mono">${o.counterOfferUsd ? `$${o.counterOfferUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}</td>
      </tr>`
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Ofertas Computadas USAFAST</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } body { margin: 0; padding: 0; background: #fff !important; } }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 16px; color: #0f172a; font-size: 9.5px; }
        .banner { background: #0f172a; color: #fff; padding: 15px 18px; border-radius: 10px; border-bottom: 4px solid #f59e0b; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .badge { display: inline-block; background: #f59e0b; color: #0f172a; font-weight: 900; font-size: 8.5px; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 4px; }
        .banner h1 { margin: 0; font-size: 16px; font-weight: 900; }
        .banner p { margin: 3px 0 0; font-size: 9.5px; color: #cbd5e1; }
        .banner-right { text-align: right; font-family: ui-monospace, monospace; font-size: 9.5px; color: #e2e8f0; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
        .kpi { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; }
        .kpi-lbl { font-size: 8px; text-transform: uppercase; font-weight: 800; color: #64748b; }
        .kpi-val { font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 2px; font-family: ui-monospace, monospace; }
        .client-card { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 9.5px; }
        .section-block { margin-bottom: 14px; }
        .section-bar { background: #f59e0b; color: #0f172a; font-weight: 900; font-size: 9.5px; padding: 6px 10px; border-radius: 6px 6px 0 0; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        th { background: #0f172a; color: #fff; padding: 7px 6px; font-size: 8.5px; text-transform: uppercase; text-align: left; border-bottom: 2px solid #f59e0b; white-space: nowrap; }
        td { padding: 5.5px 6px; border-bottom: 1px solid #e2e8f0; font-size: 8.8px; vertical-align: middle; }
        tr.alt td { background: #f8fafc; }
        tfoot td { background: #1e293b; color: #fbbf24; font-weight: 900; padding: 7px 6px; }
        .center { text-align: center !important; }
        .right { text-align: right !important; }
        .bold { font-weight: 700; color: #0f172a; }
        .mono { font-family: ui-monospace, monospace; }
        .muted { color: #64748b; }
        .amber-text { color: #b45309 !important; }
        .green-text { color: #047857 !important; }
        .sub { font-size: 7.8px; color: #64748b; }
        .grade-pill { display: inline-block; background: #fffbeb; border: 1px solid #fcd34d; color: #b45309; padding: 1px 5px; border-radius: 4px; font-weight: 800; font-size: 8px; }
        .status-pill { display: inline-block; padding: 2px 6px; border-radius: 5px; font-weight: 800; font-size: 8px; white-space: nowrap; }
        .footer { margin-top: 10px; padding: 7px 10px; background: #0f172a; color: #94a3b8; border-radius: 6px; display: flex; justify-content: space-between; font-size: 8px; }
      </style>
    </head>
    <body>
      <div class="banner">
        <div>
          <div class="badge">USAFAST LEILÕES HUB · CENTRAL DE OFERTAS COMPUTADAS</div>
          <h1>${isSingleClient ? `Ofertas Computadas — ${escapeHtml(selectedClientObj?.name || enriched[0]?.clientName || params.selectedClientEmail)}` : 'Relatório Geral de Ofertas Computadas por Cliente'}</h1>
          <p>${isSingleClient ? 'Relatório individual do arrematante' : `Consolidado de ${clientSummaries.length} arrematante(s)`}</p>
        </div>
        <div class="banner-right">
          <div>Emitido em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
          <div>PTAX: R$ ${safeRate.toFixed(2)}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-lbl">Total de Ofertas</div><div class="kpi-val">${enriched.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Aceitas / Vencendo</div><div class="kpi-val" style="color:#047857;">${acceptedCount}</div></div>
        <div class="kpi"><div class="kpi-lbl">Volume Total (USD)</div><div class="kpi-val">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
        <div class="kpi"><div class="kpi-lbl">Equiv. BRL (PTAX)</div><div class="kpi-val">R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div></div>
      </div>

      ${clientInfoCardHtml}

      <div class="section-block">
        <div class="section-bar">DETALHAMENTO DAS OFERTAS COMPUTADAS (${enriched.length})</div>
        <table>
          <thead>
            <tr>
              <th>Data / Hora</th>
              <th>Lote</th>
              <th>Título / Modelo</th>
              <th class="center">Qtd</th>
              <th class="center">Grade</th>
              <th>Cliente / Arrematante</th>
              <th class="right">Oferta USD</th>
              <th class="right">Equiv. BRL</th>
              <th>Status</th>
              <th class="right">Contra-Oferta</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="6">TOTAIS CONSOLIDADOS (${enriched.length} ofertas)</td>
              <td class="right mono">$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="right mono">R$ ${totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="footer">
        <span>USAFAST LEILÕES HUB MIAMI LLC · Gestão Administrativa de Lances e Faturamento</span>
        <span>Documento oficial emitido pelo painel administrativo</span>
      </div>
    </body>
    </html>
  `;

  const fileSlug = isSingleClient
    ? (selectedClientObj?.name || enriched[0]?.clientName || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_')
    : 'Todos_Clientes';
  printHtmlToPdf(html, `USAFAST_Ofertas_${fileSlug}`);
}

// ============================================================================
// 4. PLANILHA MODELO ESTILIZADA (MANTÉM AUTO-DETECÇÃO DE CABEÇALHO NA LINHA 4)
// ============================================================================
export function exportAuctionTemplateXlsx() {
  const COLS = 12;
  const headers = [
    'Lote',
    'Titulo',
    'Modelo',
    'Quantidade',
    'Grade',
    'Armazenamento',
    'Saude Bateria',
    'Lance Inicial USD',
    'Lance Atual USD',
    'Revenda Brasil BRL',
    'Casa de Leilao',
    'Localizacao'
  ];

  const rows: (string | number)[][] = [
    ['USAFAST LEILÕES HUB — PLANILHA MODELO PARA IMPORTAÇÃO', ...Array(COLS - 1).fill('')],
    ['Preencha os registros abaixo da linha de cabeçalho (não renomeie as colunas padrão)', ...Array(COLS - 1).fill('')],
    Array(COLS).fill(''),
    headers,
    [
      'US-99100-MIA',
      'Palete 10x iPhone 16 Pro Max 256GB DNA Desbloqueados',
      'iPhone 16 Pro Max',
      10,
      'DNA',
      '256GB',
      '95% - 100%',
      0,
      0,
      0,
      'Verizon Direct US Liquidation',
      'Miami, FL'
    ],
    [
      'US-99101-DAL',
      '5x iPhone 15 Pro 128GB DNB Natural Titanium',
      'iPhone 15 Pro',
      5,
      'DNB',
      '128GB',
      '88% - 94%',
      0,
      0,
      0,
      'Verizon Direct US Liquidation',
      'Dallas, TX'
    ],
    [
      'US-99102-MIA',
      '1x iPhone 16 Pro Max 512GB Desert Titanium (Unidade Avulsa)',
      'iPhone 16 Pro Max',
      1,
      'Grade A+',
      '512GB',
      '100%',
      650,
      890,
      9200,
      'Assurant Liquidation Hub',
      'Miami, FL'
    ]
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } }
  ];

  styleBannerRow(ws, 0, COLS, true);
  styleBannerRow(ws, 1, COLS, false);

  for (let c = 0; c < COLS; c++) {
    applyStyle(ws, 3, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: c === 3 || c === 4 || c === 5 ? 'center' : c >= 7 && c <= 9 ? 'right' : 'left', vertical: 'center' },
      border: BORDER_HEADER
    });
  }

  for (let r = 4; r < rows.length; r++) {
    const bg = r % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    for (let c = 0; c < COLS; c++) {
      applyStyle(ws, r, c, {
        fill: { fgColor: { rgb: c === 4 ? 'FFFBEB' : bg } },
        font: { name: 'Calibri', sz: 10, bold: c === 0 || c === 4, color: { rgb: c === 0 || c === 4 ? 'B45309' : '1E293B' } },
        alignment: { horizontal: c === 3 || c === 4 || c === 5 ? 'center' : c >= 7 && c <= 9 ? 'right' : 'left', vertical: 'center' },
        border: BORDER_THIN
      });
    }
  }

  ws['!cols'] = [
    { wch: 16 },
    { wch: 46 },
    { wch: 22 },
    { wch: 12 },
    { wch: 11 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 28 },
    { wch: 15 }
  ];
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 10 }, { hpt: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo Leiloes');
  XLSX.writeFile(wb, 'planilha_modelo_leiloes_iphones.xlsx');
}
