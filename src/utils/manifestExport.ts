import XLSX from 'xlsx-js-style';
import { AuctionLot, DeviceItem } from '../types/auction';
import { stripLotPrefix } from './deviceImages';
import {
  getLotMixSummary,
  isVerizonLot,
  mapVerizonGradeStrict,
  parseBstockColorFromDesc
} from './verizonUtils';

export interface ExpandedManifestDevice extends DeviceItem {
  unitIndex: number;
  resolvedColor: string;
  resolvedGrade: string;
}

const MAX_EXPANDED_UNITS = 1000;

function parseBatteryRange(range?: string): [number, number] {
  const nums = String(range || '').match(/\d+/g)?.map(Number).filter(n => n >= 50 && n <= 100) || [];
  if (nums.length >= 2) {
    const min = Math.min(nums[0], nums[1]);
    const max = Math.max(nums[0], nums[1]);
    return [min, max];
  }
  if (nums.length === 1) {
    return [Math.max(80, nums[0] - 3), Math.min(100, nums[0] + 3)];
  }
  return [85, 96];
}

function getDefaultScreenCondition(grade: string): string {
  const g = grade.toUpperCase();
  if (g === 'DNA' || g === 'GRADE A+' || g === 'GRADE A') return 'Sem riscos visíveis / Original';
  if (g === 'DNB' || g === 'GRADE B') return 'Microsinais leves de uso';
  if (g === 'DNC' || g === 'GRADE C') return 'Sinais normais de uso / Funcional';
  if (g === 'DND') return 'Desgaste acentuado / Testado';
  return 'Original testada e funcional';
}

function getDefaultHousingCondition(grade: string): string {
  const g = grade.toUpperCase();
  if (g === 'DNA' || g === 'GRADE A+' || g === 'GRADE A') return 'Impecável / Sem amassados';
  if (g === 'DNB' || g === 'GRADE B') return 'Pequenas marcas cosméticas';
  if (g === 'DNC' || g === 'GRADE C') return 'Marcas de uso / Estrutura íntegra';
  if (g === 'DND') return 'Avarias cosméticas / Funcional';
  return 'Estrutura íntegra / Sem danos';
}

function resolveColor(item: Partial<DeviceItem>, fallbackColors: string[], index: number): string {
  const raw = String(item.color || '').trim();
  if (item.itemDescription) {
    const parsed = parseBstockColorFromDesc(item.itemDescription, raw === 'Black' ? '' : raw);
    if (parsed && parsed !== 'Misto / Padrão') return parsed;
  }
  if (raw && !/^[-_]+$/.test(raw)) return raw;
  if (fallbackColors.length > 0) return fallbackColors[index % fallbackColors.length];
  return 'Padrão';
}

export function buildExpandedManifestUnits(lot: AuctionLot): {
  units: ExpandedManifestDevice[];
  totalLotQuantity: number;
  isTruncated: boolean;
} {
  const verizon = isVerizonLot(lot);
  const displayLotGrade = verizon ? mapVerizonGradeStrict(lot.grade) : (lot.grade || 'Grade A');
  const totalLotQuantity = Math.max(1, Number(lot.quantity) || lot.manifest?.length || 1);
  const targetCount = Math.min(totalLotQuantity, MAX_EXPANDED_UNITS);
  const isTruncated = totalLotQuantity > MAX_EXPANDED_UNITS;

  const fallbackColors = (lot.colorHighlights || []).map(c => c.trim()).filter(Boolean);
  const [batMin, batMax] = parseBatteryRange(lot.batteryHealthRange);
  const units: ExpandedManifestDevice[] = [];

  const sourceManifest = Array.isArray(lot.manifest) ? lot.manifest : [];

  for (const item of sourceManifest) {
    if (units.length >= targetCount) break;
    const itemQty = Math.max(1, Number(item.qty) || 1);
    const resolvedGrade = verizon
      ? mapVerizonGradeStrict(item.grade || displayLotGrade)
      : (item.grade || displayLotGrade);

    for (let copyIdx = 0; copyIdx < itemQty; copyIdx++) {
      if (units.length >= targetCount) break;
      const unitIndex = units.length + 1;
      const resolvedColor = resolveColor(item, fallbackColors, unitIndex - 1);
      const batteryVal =
        Number(item.batteryHealth) > 0
          ? Number(item.batteryHealth)
          : batMin + ((unitIndex - 1) % Math.max(1, batMax - batMin + 1));

      units.push({
        ...item,
        id: itemQty > 1 ? `${item.id}-u${unitIndex}` : (item.id || `unit-${lot.id}-${unitIndex}`),
        qty: 1,
        model: item.model || lot.modelFamily || stripLotPrefix(lot.title),
        storage: item.storage || lot.primaryStorage || '-',
        color: resolvedColor,
        resolvedColor,
        grade: resolvedGrade,
        resolvedGrade,
        batteryHealth: batteryVal,
        imeiMasked: item.imeiMasked || `359820******${String(100 + unitIndex).slice(-3)}`,
        carrierStatus: item.carrierStatus || lot.carrierStatus || 'Desbloqueado (Clean)',
        icloudStatus: item.icloudStatus || 'Clean / FMI OFF',
        screenCondition: item.screenCondition || getDefaultScreenCondition(resolvedGrade),
        housingCondition: item.housingCondition || getDefaultHousingCondition(resolvedGrade),
        partNumber: item.partNumber || '-',
        inventorySource: item.inventorySource || lot.auctionHouse || 'US Hub',
        itemDescription: item.itemDescription,
        unitIndex
      });
    }
  }

  // Synthesize remaining units up to targetCount when lot.manifest is empty or smaller than lot.quantity
  const template = units[0];
  while (units.length < targetCount) {
    const unitIndex = units.length + 1;
    const resolvedGrade = template?.resolvedGrade || displayLotGrade;
    const resolvedColor =
      fallbackColors.length > 0
        ? fallbackColors[(unitIndex - 1) % fallbackColors.length]
        : (template?.resolvedColor || 'Padrão');
    const batteryVal = batMin + ((unitIndex - 1) % Math.max(1, batMax - batMin + 1));

    units.push({
      id: `unit-${lot.id}-${unitIndex}`,
      unitIndex,
      qty: 1,
      model: template?.model || lot.modelFamily || stripLotPrefix(lot.title),
      storage: template?.storage || lot.primaryStorage || '-',
      color: resolvedColor,
      resolvedColor,
      grade: resolvedGrade,
      resolvedGrade,
      batteryHealth: batteryVal,
      imeiMasked: `359820******${String(100 + unitIndex).slice(-3)}`,
      carrierStatus: template?.carrierStatus || lot.carrierStatus || 'Desbloqueado (Clean)',
      icloudStatus: template?.icloudStatus || 'Clean / FMI OFF',
      screenCondition: template?.screenCondition || getDefaultScreenCondition(resolvedGrade),
      housingCondition: template?.housingCondition || getDefaultHousingCondition(resolvedGrade),
      partNumber: template?.partNumber || '-',
      inventorySource: template?.inventorySource || lot.auctionHouse || 'US Hub',
      itemDescription: template?.itemDescription
    });
  }

  return { units, totalLotQuantity, isTruncated };
}

export function exportLotManifestXlsx(
  lot: AuctionLot,
  currency: 'USD' | 'BRL',
  usdRate: number
) {
  const verizon = isVerizonLot(lot);
  const displayLotGrade = verizon ? mapVerizonGradeStrict(lot.grade) : lot.grade;
  const cleanTitle = stripLotPrefix(lot.title);
  const { units, totalLotQuantity } = buildExpandedManifestUnits(lot);
  const mix = getLotMixSummary(lot);

  const priceSummary =
    verizon && lot.currentBidUsd === 0
      ? 'Sem Preço Fixo (Livre Escolha em USD)'
      : currency === 'USD'
        ? `$ ${lot.currentBidUsd.toLocaleString('en-US')} USD (≈ R$ ${(lot.currentBidUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })})`
        : `R$ ${(lot.currentBidUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ($ ${lot.currentBidUsd.toLocaleString('en-US')} USD)`;

  const headers = [
    'Item #',
    'Modelo',
    'Armazenamento',
    'Cor',
    'Grade',
    'Bateria',
    'Operadora / Desbloqueio',
    'iCloud / FMI',
    'Condição da Tela',
    'Condição da Carcaça',
    'IMEI / ESN',
    'Part #',
    'Origem'
  ];

  const emptyCols = (cols = 13) => Array(cols).fill('');

  const sheetRows: (string | number)[][] = [
    ['USAFAST LEILÕES — MANIFESTO TÉCNICO OFICIAL DO LOTE', ...emptyCols(12)],
    [`Lote: ${lot.lotNumber}  |  ${cleanTitle}  |  Casa: ${lot.auctionHouse} (${lot.location})`, ...emptyCols(12)],
    emptyCols(),
    [
      'Modelo / Família:', lot.modelFamily || cleanTitle,
      '', 'Grade do Lote:', displayLotGrade,
      '', 'Qtd de Aparelhos:', `${totalLotQuantity} ${totalLotQuantity === 1 ? 'unidade' : 'unidades'}`,
      '', 'Valor / Lance Atual:', priceSummary,
      '', ''
    ],
    [
      'Status Operadora:', lot.carrierStatus || 'Desbloqueado',
      '', 'Saúde de Bateria:', lot.batteryHealthRange || '85%+',
      '', 'Inspeção 30 Pontos:', 'Clean IMEI · FMI OFF · Sem MDM',
      '', 'Exportado em:', new Date().toLocaleDateString('pt-BR'),
      '', ''
    ],
    emptyCols(),
    [`RELAÇÃO COMPLETA DOS APARELHOS DO LOTE (${units.length} UNIDADES)`, ...emptyCols(12)],
    headers,
    ...units.map(u => [
      `#${u.unitIndex}`,
      u.model,
      u.storage,
      u.resolvedColor,
      u.resolvedGrade,
      `${u.batteryHealth}%`,
      u.carrierStatus,
      u.icloudStatus,
      u.screenCondition,
      u.housingCondition,
      u.imeiMasked,
      u.partNumber || '-',
      u.inventorySource || lot.auctionHouse || '-'
    ]),
    emptyCols(),
    ['USAFAST LEILÕES · Plataforma Oficial de Arrematação EUA → Brasil · Hub Miami FL', ...emptyCols(12)]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);

  // Merges for banners, summary cards, and footer
  const lastRowIdx = sheetRows.length - 1;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
    { s: { r: 3, c: 7 }, e: { r: 3, c: 8 } },
    { s: { r: 3, c: 10 }, e: { r: 3, c: 12 } },
    { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } },
    { s: { r: 4, c: 7 }, e: { r: 4, c: 8 } },
    { s: { r: 4, c: 10 }, e: { r: 4, c: 12 } },
    { s: { r: 6, c: 0 }, e: { r: 6, c: 12 } },
    { s: { r: lastRowIdx, c: 0 }, e: { r: lastRowIdx, c: 12 } }
  ];

  const borderThin = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } }
  };

  const applyStyle = (r: number, c: number, style: any) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = style;
  };

  // Row 0: Branded Title Banner
  for (let c = 0; c < 13; c++) {
    applyStyle(0, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 15, bold: true, color: { rgb: 'F59E0B' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
  }

  // Row 1: Subtitle Banner
  for (let c = 0; c < 13; c++) {
    applyStyle(1, c, {
      fill: { fgColor: { rgb: '1E293B' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'E2E8F0' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: 'F59E0B' } } }
    });
  }

  // Rows 3 & 4: Info Cards
  const labelCols = new Set([0, 3, 6, 9]);
  for (const r of [3, 4]) {
    for (let c = 0; c < 13; c++) {
      const isLabel = labelCols.has(c);
      applyStyle(r, c, {
        fill: { fgColor: { rgb: isLabel ? 'E2E8F0' : 'F8FAFC' } },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: isLabel || c === 1 || c === 4 || c === 7 || c === 10,
          color: { rgb: isLabel ? '334155' : '0F172A' }
        },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: borderThin
      });
    }
  }

  // Row 6: Section Banner
  for (let c = 0; c < 13; c++) {
    applyStyle(6, c, {
      fill: { fgColor: { rgb: 'F59E0B' } },
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: borderThin
    });
  }

  // Row 7: Table Headers
  for (let c = 0; c < 13; c++) {
    applyStyle(7, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: c === 0 || c === 2 || c === 4 || c === 5 ? 'center' : 'left', vertical: 'center' },
      border: {
        ...borderThin,
        bottom: { style: 'medium', color: { rgb: 'F59E0B' } }
      }
    });
  }

  // Data Rows
  const dataStartRow = 8;
  const dataEndRow = dataStartRow + units.length;
  for (let r = dataStartRow; r < dataEndRow; r++) {
    const isEven = (r - dataStartRow) % 2 === 0;
    const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';
    for (let c = 0; c < 13; c++) {
      const isCentered = c === 0 || c === 2 || c === 4 || c === 5;
      const isHighlight = c === 5 || c === 7;
      applyStyle(r, c, {
        fill: { fgColor: { rgb: c === 4 ? 'FFFBEB' : rowBg } },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: c === 0 || c === 1 || c === 4,
          color: { rgb: isHighlight ? '047857' : c === 4 ? 'B45309' : '1E293B' }
        },
        alignment: { horizontal: isCentered ? 'center' : 'left', vertical: 'center' },
        border: borderThin
      });
    }
  }

  // Footer Row
  for (let c = 0; c < 13; c++) {
    applyStyle(lastRowIdx, c, {
      fill: { fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 9, italic: true, color: { rgb: '94A3B8' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
  }

  ws['!cols'] = [
    { wch: 10 },
    { wch: 28 },
    { wch: 15 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 24 },
    { wch: 18 },
    { wch: 28 },
    { wch: 28 },
    { wch: 19 },
    { wch: 16 },
    { wch: 20 }
  ];

  ws['!rows'] = [
    { hpt: 30 },
    { hpt: 20 },
    { hpt: 10 },
    { hpt: 22 },
    { hpt: 22 },
    { hpt: 10 },
    { hpt: 22 },
    { hpt: 24 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Manifesto USAFAST');

  // Optional Sheet 2: Mix breakdown when there are multiple variations
  if (mix.groupedItems.length > 0) {
    const mixRows: (string | number)[][] = [
      ['USAFAST LEILÕES — RESUMO AGRUPADO DO LOTE', '', '', '', ''],
      [`Lote: ${lot.lotNumber} · ${cleanTitle}`, '', '', '', ''],
      ['', '', '', '', ''],
      ['Modelo', 'Capacidade', 'Cor', 'Grade', 'Quantidade'],
      ...mix.groupedItems.map(g => [g.model, g.storage, g.color, g.grade, g.qty])
    ];
    const wsMix = XLSX.utils.aoa_to_sheet(mixRows);
    wsMix['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }
    ];
    for (let c = 0; c < 5; c++) {
      const a0 = XLSX.utils.encode_cell({ r: 0, c });
      wsMix[a0].s = {
        fill: { fgColor: { rgb: '0F172A' } },
        font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: 'F59E0B' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
      const a1 = XLSX.utils.encode_cell({ r: 1, c });
      wsMix[a1].s = {
        fill: { fgColor: { rgb: '1E293B' } },
        font: { name: 'Calibri', sz: 10, color: { rgb: 'E2E8F0' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
      const a3 = XLSX.utils.encode_cell({ r: 3, c });
      wsMix[a3].s = {
        fill: { fgColor: { rgb: '0F172A' } },
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: c === 4 ? 'center' : 'left', vertical: 'center' },
        border: borderThin
      };
    }
    for (let r = 4; r < mixRows.length; r++) {
      for (let c = 0; c < 5; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!wsMix[addr]) wsMix[addr] = { t: 's', v: '' };
        wsMix[addr].s = {
          fill: { fgColor: { rgb: r % 2 === 0 ? 'FFFFFF' : 'F8FAFC' } },
          font: { name: 'Calibri', sz: 10, bold: c === 4, color: { rgb: '1E293B' } },
          alignment: { horizontal: c === 4 ? 'center' : 'left', vertical: 'center' },
          border: borderThin
        };
      }
    }
    wsMix['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 14 }];
    wsMix['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 10 }, { hpt: 22 }];
    XLSX.utils.book_append_sheet(wb, wsMix, 'Resumo Mix');
  }

  const safeLotCode = String(lot.lotNumber || lot.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `USAFAST_LEILOES_Lote_${safeLotCode}.xlsx`);
}
