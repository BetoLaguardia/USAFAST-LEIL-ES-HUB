import type { AuctionLot, DeviceItem, GradeType } from '../types/auction';
import { getDeviceImageUrl } from './deviceImages';
import { getEstimatedWholesalePrice } from './assurantUtils';

export const TMOBILE_COLOR_COLUMNS = [
  'Black',
  'Blue',
  'Bronze',
  'Brown',
  'Gold',
  'Gray',
  'Green',
  'Navy',
  'Orange',
  'Pink',
  'Purple',
  'Red',
  'Rose Gold',
  'Silver',
  'White',
  'Yellow',
  'Other',
] as const;

export interface TMobileGroupedLot {
  lotNumber: string;
  ivaluaLotId: string;
  groupName: string;
  sheetNames: string[];
  title: string;
  oem: string;
  primaryModel: string;
  primaryStorage: string;
  gradeRaw: string;
  mappedGrade: GradeType;
  carrier: string;
  warehouse: string;
  lockStatus: string;
  condition: string;
  totalQty: number;
  unitPriceUsd: number;
  totalStartPriceUsd: number;
  uniqueModels: string[];
  uniqueCapacities: string[];
  uniqueColors: string[];
  uniqueGrades: string[];
  manifest: DeviceItem[];
}

const normalizeKey = (k: string): string =>
  String(k || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const getTMobileField = (row: Record<string, any>, ...candidates: string[]): string => {
  for (const cand of candidates) {
    if (row[cand] !== undefined && row[cand] !== null && String(row[cand]).trim() !== '') {
      return String(row[cand]).trim();
    }
  }
  const rowKeys = Object.keys(row);
  for (const cand of candidates) {
    const cleanCand = normalizeKey(cand);
    const matchedKey = rowKeys.find(rk => normalizeKey(rk) === cleanCand);
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') {
      return String(row[matchedKey]).trim();
    }
  }
  return '';
};

export const getTMobileNumericField = (row: Record<string, any>, ...candidates: string[]): number => {
  const raw = getTMobileField(row, ...candidates);
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.,-]/g, '').trim();
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    const normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
    const num = parseFloat(normalized);
    return Number.isFinite(num) ? num : 0;
  }
  if (hasComma) {
    const normalized = /^\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');
    const num = parseFloat(normalized);
    return Number.isFinite(num) ? num : 0;
  }
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

export const isTMobileHeaders = (headers: string[], fileName = ''): boolean => {
  if (/t-?mobile/i.test(fileName)) return true;
  const norm = headers.map(h => String(h || '').replace(/\s+/g, ' ').trim().toLowerCase());
  const hasLotId = norm.some(h => h === 'lot id' || h.startsWith('lot id'));
  const hasTMobileCols =
    norm.some(h => h.includes('cosmetic grade')) ||
    norm.some(h => h.includes('unit start price')) ||
    norm.some(h => h.includes('ivalua')) ||
    norm.some(h => h.includes('fmip')) ||
    (norm.some(h => h === 'model name') && norm.some(h => h.includes('quantity total')));
  return hasLotId && hasTMobileCols;
};

export const mapTMobileGrade = (raw: string): GradeType => {
  const g = String(raw || '').trim().toUpperCase();
  if (!g) return 'Grade C';
  if (/^A\+|MINT|NEW/i.test(g)) return 'Grade A+';
  if (/^(?:GRADE\s*)?A$/i.test(g) || /^A\b/i.test(g)) return 'Grade A';
  if (/^(?:GRADE\s*)?B\b|A\/B/i.test(g)) return 'Grade B';
  if (/^(?:GRADE\s*)?D\b/i.test(g)) return 'Grade D';
  return 'Grade C';
};

const formatModelTitleCase = (raw: string): string => {
  const words = raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  return words
    .map(w => {
      const upper = w.toUpperCase();
      if (upper === 'IPHONE') return 'iPhone';
      if (upper === 'IPAD') return 'iPad';
      if (upper === 'MACBOOK') return 'MacBook';
      if (upper === 'SE' || upper === 'XS' || upper === 'XR' || upper === '5G' || upper === 'LTE' || upper === 'FE' || upper === 'XL') {
        return upper;
      }
      if (/^\d+(?:GB|TB)$/i.test(w)) return upper;
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    })
    .join(' ');
};

export const parseTMobileModelAndStorage = (
  rawModelName: string,
  explicitCapacity = '',
  explicitOem = ''
): { model: string; storage: string; oem: string } => {
  let clean = String(rawModelName || '').replace(/\s+/g, ' ').trim();
  const capMatch = clean.match(/\b(\d+\s*(?:GB|TB))\b/i);
  const storage = (explicitCapacity || (capMatch ? capMatch[1] : '') || '128GB')
    .replace(/\s+/g, '')
    .toUpperCase();

  if (capMatch) {
    clean = clean.replace(capMatch[0], ' ').replace(/\s+/g, ' ').trim();
  }

  let oem = String(explicitOem || '').trim();
  if (!oem) {
    if (/iphone|ipad|apple|watch|macbook/i.test(clean)) oem = 'Apple';
    else if (/samsung|galaxy|fold|flip/i.test(clean)) oem = 'Samsung';
    else if (/pixel|google/i.test(clean)) oem = 'Google';
    else if (/motorola|moto/i.test(clean)) oem = 'Motorola';
    else oem = 'Apple';
  } else {
    oem = formatModelTitleCase(oem);
  }

  // Strip redundant OEM prefix from model display if duplicated (e.g. "APPLE IPHONE 13" -> "iPhone 13")
  clean = clean.replace(/^(?:APPLE|SAMSUNG|GOOGLE|MOTOROLA)\s+/i, '').trim();
  const model = formatModelTitleCase(clean || 'Smartphone');

  return { model, storage, oem };
};

export const groupTMobileRows = (rawRows: Record<string, any>[]): TMobileGroupedLot[] => {
  interface MutableGroup {
    lotNumber: string;
    ivaluaLotId: string;
    groupName: string;
    sheetNames: Set<string>;
    oem: string;
    primaryModel: string;
    primaryStorage: string;
    gradeRaw: string;
    carrier: string;
    warehouse: string;
    lockStatus: string;
    condition: string;
    totalQty: number;
    totalStartPriceUsd: number;
    hasExplicitRowPrice: boolean;
    models: Set<string>;
    capacities: Set<string>;
    colors: Set<string>;
    grades: Set<string>;
    items: DeviceItem[];
  }

  const groups = new Map<string, MutableGroup>();

  rawRows.forEach((row, idx) => {
    const rawLotId = getTMobileField(row, 'Lot ID', 'Lot #', 'Lot#', 'Lot', 'lotNumber');
    const rawIvalua = getTMobileField(row, 'Lot ID (In Ivalua)', 'Lot ID \n(In Ivalua)', 'In Ivalua');
    const rawModelName = getTMobileField(row, 'Model Name', 'Model', 'Item Name', 'Description');
    const rawQty = Math.round(getTMobileNumericField(row, 'Quantity Total', 'Total Qty', 'Qty', 'Quantity'));

    // Skip banner / empty rows
    const lotKey = rawLotId || rawIvalua;
    if (!lotKey || /lot id|t-mobile live auction|qty by color|note:/i.test(lotKey)) return;
    if (!rawModelName && rawQty <= 0) return;

    const rawGroupName = getTMobileField(row, 'Group', 'Lot Group') || 'Buyer Lots';
    const rawCapacity = getTMobileField(row, 'Capacity', 'Storage', 'Memory');
    const rawOem = getTMobileField(row, 'OEM', 'Make', 'Brand');
    const { model, storage, oem } = parseTMobileModelAndStorage(rawModelName || 'Smartphone', rawCapacity, rawOem);
    const gradeRaw = getTMobileField(row, 'Cosmetic Grade', 'Grade') || 'C';
    const mappedGrade = mapTMobileGrade(gradeRaw);
    const carrier = getTMobileField(row, 'Carrier') || 'T-MOBILE';
    const warehouse = getTMobileField(row, 'Warehouse', 'Inventory Source') || 'DC90';
    const dataClear = getTMobileField(row, 'Data Clear') || 'Yes';
    const rawLockField = getTMobileField(row, 'FMIP/Google Lock Status', 'Lock Status');
    const combinedLockText = `${rawLockField} ${rawModelName} ${getTMobileField(row, 'Condition')}`;
    if (
      (/\blocked\b|sim[\s-]*lock|carrier[\s-]*lock|fmip\s*on|fmi\s*on|bad\s*esn|blacklisted/i.test(combinedLockText) && !/\bunlocked\b/i.test(combinedLockText)) ||
      (rawLockField && !/unlocked|clean|off|desbloqueado/i.test(rawLockField))
    ) {
      return;
    }
    const lockStatus = rawLockField || 'Unlocked';
    const itemDescription = getTMobileField(row, 'Item Description', 'Item Type') || 'Phone';
    const condition = getTMobileField(row, 'Condition') || 'used';
    const unitStartPrice = getTMobileNumericField(row, 'Unit Start Price', 'Start Price', 'Unit Price', 'List Price', 'Price');
    const sheetName = String(row._sheetName || '').trim();

    if (!groups.has(lotKey)) {
      groups.set(lotKey, {
        lotNumber: lotKey,
        ivaluaLotId: rawIvalua || lotKey,
        groupName: rawGroupName,
        sheetNames: new Set<string>(),
        oem,
        primaryModel: model,
        primaryStorage: storage,
        gradeRaw,
        carrier,
        warehouse,
        lockStatus,
        condition,
        totalQty: 0,
        totalStartPriceUsd: 0,
        hasExplicitRowPrice: unitStartPrice > 0,
        models: new Set<string>(),
        capacities: new Set<string>(),
        colors: new Set<string>(),
        grades: new Set<string>(),
        items: [],
      });
    }

    const g = groups.get(lotKey)!;
    if (sheetName) g.sheetNames.add(sheetName);
    if (model) g.models.add(model);
    if (storage) g.capacities.add(storage);
    g.grades.add(mappedGrade);

    // Collect color breakdown from per-color columns (Sheet 1 "BUYER LOTS w/ COLOR" and any MIXED color columns)
    const colorEntries: { color: string; qty: number }[] = [];
    for (const colorCol of TMOBILE_COLOR_COLUMNS) {
      const colQty = Math.round(getTMobileNumericField(row, colorCol));
      if (colQty > 0) {
        colorEntries.push({ color: colorCol, qty: colQty });
      }
    }

    const colorSum = colorEntries.reduce((acc, c) => acc + c.qty, 0);
    const effectiveRowQty = rawQty > 0 ? rawQty : colorSum > 0 ? colorSum : 1;

    // Fallback to single "Color" column if no per-color quantity columns are populated (typical in Sheet 2 MIXED)
    if (colorEntries.length === 0) {
      const singleColor = getTMobileField(row, 'Color', 'Colors') || 'Misto / Padrão';
      colorEntries.push({ color: singleColor, qty: effectiveRowQty });
    } else if (rawQty > colorSum) {
      colorEntries.push({ color: 'Other', qty: rawQty - colorSum });
    }

    g.totalQty += effectiveRowQty;
    const rowUnitPrice = unitStartPrice > 0 ? unitStartPrice : getEstimatedWholesalePrice(model, storage, mappedGrade);
    if (unitStartPrice > 0) g.hasExplicitRowPrice = true;
    g.totalStartPriceUsd += rowUnitPrice * effectiveRowQty;

    const cleanImeiSuffix = (n: number) => String(100 + ((idx * 31 + n * 17) % 899));
    const icloudStr = /unlocked|clean|off/i.test(lockStatus) ? 'Clean / FMI OFF' : lockStatus;
    const carrierStr = /t-mobile/i.test(carrier)
      ? `${carrier} / ${lockStatus}`
      : `${carrier} (${lockStatus})`;

    colorEntries.forEach((ce, cIdx) => {
      if (ce.color && ce.color !== 'Misto / Padrão') {
        g.colors.add(ce.color);
      }
      g.items.push({
        id: `dev-tmo-${lotKey}-${idx}-${cIdx}`,
        model,
        storage,
        color: ce.color,
        grade: mappedGrade,
        batteryHealth: 85 + ((idx + cIdx) % 14),
        imeiMasked: `358410******${cleanImeiSuffix(cIdx)}`,
        carrierStatus: carrierStr,
        icloudStatus: `${icloudStr}${dataClear ? ` · Data Clear: ${dataClear}` : ''}`,
        screenCondition: `Cosmetic Grade ${gradeRaw} (${condition})`,
        housingCondition: `T-Mobile Coppell ${warehouse} · Grade ${gradeRaw}`,
        partNumber: rawIvalua || lotKey,
        inventorySource: `${warehouse} (${sheetName || rawGroupName})`,
        itemDescription,
        qty: ce.qty,
      });
    });
  });

  return Array.from(groups.values()).map(g => {
    const uniqueModels = Array.from(g.models);
    const uniqueCapacities = Array.from(g.capacities);
    const uniqueColors = Array.from(g.colors);
    const uniqueGrades = Array.from(g.grades);
    const totalQty = Math.max(1, g.totalQty);
    const totalStartPriceUsd = Math.round(g.totalStartPriceUsd);
    const unitPriceUsd = Math.round(totalStartPriceUsd / totalQty);
    const mappedGrade = uniqueGrades[0] || mapTMobileGrade(g.gradeRaw);

    const modelHeadline =
      uniqueModels.length > 1
        ? `Mix ${uniqueModels.slice(0, 2).join(' + ')}${uniqueModels.length > 2 ? ` (+${uniqueModels.length - 2})` : ''}`
        : g.primaryModel;
    const storageHeadline =
      uniqueCapacities.length > 1
        ? uniqueCapacities.slice(0, 3).join('/') + (uniqueCapacities.length > 3 ? ` +${uniqueCapacities.length - 3}` : '')
        : g.primaryStorage;

    const title = `T-Mobile Coppell · ${modelHeadline} ${storageHeadline} (${mappedGrade}) — ${totalQty} un.`;

    return {
      lotNumber: g.lotNumber,
      ivaluaLotId: g.ivaluaLotId,
      groupName: g.groupName,
      sheetNames: Array.from(g.sheetNames),
      title,
      oem: g.oem,
      primaryModel: g.primaryModel,
      primaryStorage: g.primaryStorage,
      gradeRaw: g.gradeRaw,
      mappedGrade,
      carrier: g.carrier,
      warehouse: g.warehouse,
      lockStatus: g.lockStatus,
      condition: g.condition,
      totalQty,
      unitPriceUsd,
      totalStartPriceUsd,
      uniqueModels,
      uniqueCapacities,
      uniqueColors,
      uniqueGrades,
      manifest: g.items,
    };
  });
};

export const buildTMobileAuctionLots = (
  groupedLots: TMobileGroupedLot[],
  usdRate: number,
  endTimeIso?: string
): AuctionLot[] => {
  const defaultEndTime = endTimeIso || new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString();

  return groupedLots.map((g, idx) => {
    const isSamsung = /samsung|galaxy|fold|flip/i.test(g.primaryModel) || /samsung/i.test(g.oem);
    const imageUrl = isSamsung
      ? '/images/samsung_galaxy_lot_1793851025604.jpg'
      : getDeviceImageUrl(g.oem, g.primaryModel, 'iPhone');

    const modelFamily =
      g.uniqueModels.length > 1
        ? `Mix: ${g.uniqueModels.slice(0, 2).join(' + ')}${g.uniqueModels.length > 2 ? ` (+${g.uniqueModels.length - 2})` : ''}`
        : g.primaryModel;

    const primaryStorage =
      g.uniqueCapacities.length > 0
        ? g.uniqueCapacities.length > 3
          ? `${g.uniqueCapacities.slice(0, 3).join(' / ')} +${g.uniqueCapacities.length - 3}`
          : g.uniqueCapacities.join(' / ')
        : '128GB';

    const estimatedBrazilRetailBrl = Math.round(g.totalStartPriceUsd * usdRate * 1.55);

    return {
      id: `tmo-lot-${g.lotNumber}-${idx}`,
      lotNumber: g.lotNumber,
      title: g.title,
      modelFamily,
      oemBrand: g.oem,
      quantity: g.totalQty,
      grade: g.mappedGrade,
      primaryStorage,
      colorHighlights: g.uniqueColors,
      batteryHealthRange: '85% - 99% (T-Mobile Coppell Tested)',
      carrierStatus: `T-Mobile ${g.lockStatus || 'Unlocked'} Global`,
      imeiStatus: 'Clean ESN / Data Clear / FMIP OFF',
      auctionHouse: 'T-Mobile Live Auction (Coppell)',
      location: `Coppell, TX (${g.warehouse || 'DC90'})`,
      startingBidUsd: g.totalStartPriceUsd,
      currentBidUsd: g.totalStartPriceUsd,
      reservePriceMet: true,
      estimatedBrazilRetailBrl,
      totalBidsCount: 0,
      endTime: defaultEndTime,
      imageUrl,
      galleryImages: [
        imageUrl,
        '/images/iphone_lot_wholesale_inspection_1793849011081.jpg',
        '/images/hero_auction_warehouse_iphones_1793849010124.jpg',
      ],
      description: `Lote oficial T-Mobile Live Auction Coppell (${g.ivaluaLotId}). ${
        g.uniqueModels.length > 1 ? `Mix de ${g.uniqueModels.length} modelos` : g.primaryModel
      } · Capacidades: ${g.uniqueCapacities.join(', ')} · Cores: ${
        g.uniqueColors.join(', ') || 'Variadas'
      } · Grade ${g.gradeRaw} (${g.mappedGrade}) · Data Clear: Yes · Lock: ${g.lockStatus}. Lance inicial unitário: $${g.unitPriceUsd} USD.`,
      diagnosticReport: {
        faceId: true,
        trueTone: true,
        camerasPassed: true,
        batteryTested: true,
        cleanEsn: true,
        mdmFree: true,
      },
      manifest: g.manifest,
      bidsHistory: [
        {
          id: `bid-tmo-init-${g.lotNumber}-${idx}`,
          bidderName: 'Unit Start Price (T-Mobile Coppell)',
          amountUsd: g.totalStartPriceUsd,
          timestamp: 'Abertura Oficial',
        },
      ],
      sourceType: 'CARRIER',
    };
  });
};
