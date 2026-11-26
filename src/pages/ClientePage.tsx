import React, { useState } from 'react';
import { 
  UserCheck, 
  Gavel, 
  ShieldCheck, 
  MapPin, 
  Clock, 
  DollarSign, 
  Smartphone, 
  Battery, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  SlidersHorizontal, 
  ArrowUpRight, 
  Download, 
  Copy, 
  Sparkles, 
  Layers,
  ChevronRight,
  TrendingUp,
  FileText,
  FileSpreadsheet,
  List,
  LayoutGrid,
  Lock,
  ShoppingBag
} from 'lucide-react';
import { AuctionLot, GradeType, SystemUser } from '../types/auction';
import { GRADE_EXPLANATIONS } from '../data/auctionsData';
import { downloadOfficialInvoicePdf } from '../utils/generatePdfInvoice';
import { exportAuctionsCatalogXlsx, exportAuctionsCatalogPdf, exportClientBidsXlsx, exportClientBidsPdf } from '../utils/styledExports';
import { isAssurantLot, isProntaEntregaLot, isDiscountBidAuction, getAssurantPreviousApprovedBid, getLotUnitPriceUsd, getLotTotalPriceUsd, getLotFixedTotalForQtyUsd, getLotIncrementSize, getLotEffectiveQuantityStep } from '../utils/assurantUtils';
import { stripLotPrefix } from '../utils/deviceImages';
import { isVerizonLot, isTMobileLot, getMarketplaceNumber, isLotUnlockedOnly, getLotMixSummary, VERIZON_GRADES, normalizeVerizonLot } from '../utils/verizonUtils';
import { LotMixBadgesAndTrigger, LotMixExpandablePanel } from '../components/LotMixExpandable';

interface ClientePageProps {
  currentUser: SystemUser;
  onUpdateCurrentUser: (user: SystemUser) => void;
  auctions: AuctionLot[];
  userBids: {
    lotId: string;
    lotTitle: string;
    amountUsd: number;
    timestamp: string;
    status: 'vencendo' | 'superado';
  }[];
  onPlaceBid: (lotId: string, amountUsd: number, selectedQuantity?: number) => void;
  onSelectLot: (lot: AuctionLot) => void;
  currency: 'USD' | 'BRL';
  usdRate: number;
  onLogout?: () => void;
}

export const ClientePage: React.FC<ClientePageProps> = ({
  currentUser,
  onUpdateCurrentUser,
  auctions,
  userBids,
  onPlaceBid,
  onSelectLot,
  currency,
  usdRate,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'modelos' | 'meus-lances' | 'arrematados' | 'perfil'>('modelos');
  
  // Multi-Options Filters for Vigorous Auctions
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedCapacityFilter, setSelectedCapacityFilter] = useState<string>('all');
  const [selectedAuctionHouseFilter, setSelectedAuctionHouseFilter] = useState<string>('all');
  const [selectedAuctionSystemFilter, setSelectedAuctionSystemFilter] = useState<'all' | 'VERIZON' | 'T_MOBILE' | 'ASSURANT' | 'STOCK_APPLE' | 'MARKETPLACE_1' | 'MARKETPLACE_2' | 'MARKETPLACE_3' | 'MARKETPLACE_4' | 'MACBOOKS'>('all');
  const [selectedLotTypeFilter, setSelectedLotTypeFilter] = useState<string>('all');
  const [clientSearch, setClientSearch] = useState('');
  const [clientPage, setClientPage] = useState<number>(1);
  const CLIENT_ITEMS_PER_PAGE = 15;

  const isVerizonFilterActive =
    selectedAuctionSystemFilter === 'VERIZON' ||
    selectedModelFilter === 'verizon' ||
    /verizon/i.test(selectedAuctionHouseFilter);

  React.useEffect(() => {
    setClientPage(1);
  }, [clientSearch, selectedModelFilter, selectedGradeFilter, selectedCategoryFilter, selectedCapacityFilter, selectedAuctionHouseFilter, selectedAuctionSystemFilter, selectedLotTypeFilter]);

  // WhatsApp notification preferences
  const [whatsappNumber, setWhatsappNumber] = useState<string>(currentUser.whatsapp || currentUser.phone || '');
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(currentUser.whatsappNotificationEnabled ?? true);

  // Sync Admin Offers for live status alerts
  const [adminOffers, setAdminOffers] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('us_admin_offers_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  React.useEffect(() => {
    const syncOffers = () => {
      try {
        const saved = localStorage.getItem('us_admin_offers_v1');
        if (saved) setAdminOffers(JSON.parse(saved));
      } catch (e) {}
    };
    window.addEventListener('offers_updated', syncOffers);
    window.addEventListener('storage', syncOffers);
    return () => {
      window.removeEventListener('offers_updated', syncOffers);
      window.removeEventListener('storage', syncOffers);
    };
  }, []);
  
  // View mode for client catalog: 'list' (default) or 'cards'
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  
  // Quick bid modal state inside client panel
  const [quickBidLot, setQuickBidLot] = useState<AuctionLot | null>(null);
  const [quickBidAmount, setQuickBidAmount] = useState<number>(0);
  const [quickBidUnits, setQuickBidUnits] = useState<number>(1);
  const [sniperEnabled, setSniperEnabled] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [expandedMixLotIds, setExpandedMixLotIds] = useState<Record<string, boolean>>({});

  const toggleMixExpand = (lotId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedMixLotIds(prev => ({ ...prev, [lotId]: !prev[lotId] }));
  };

  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 3500);
  };

  const copyMiamiAddress = () => {
    const text = `USAFAST LEILÕES HUB / ${currentUser.name}\n8350 NW 53rd Street, Suite 302\nDoral / Miami - FL 33166\nPhone: +1 (305) 555-0199`;
    navigator.clipboard.writeText(text);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2500);
  };

  const handleOpenBidModal = (lot: AuctionLot) => {
    setQuickBidLot(lot);
    setQuickBidUnits(lot.quantity);
    if (isProntaEntregaLot(lot)) {
      setQuickBidAmount(getLotTotalPriceUsd(lot));
      return;
    }
    const isVz = isVerizonLot(lot);
    const isDiscount = isDiscountBidAuction(lot);
    setQuickBidAmount(
      isVz || isDiscount
        ? (lot.currentBidUsd > 0 ? lot.currentBidUsd : 0)
        : (lot.currentBidUsd > 0 ? lot.currentBidUsd + 5 : 5)
    );
  };

  const handleConfirmBid = () => {
    if (!quickBidLot) return;
    if (isProntaEntregaLot(quickBidLot)) {
      const finalUnits = Math.max(1, Math.min(quickBidLot.quantity, quickBidUnits));
      const fixedTotal = getLotFixedTotalForQtyUsd(quickBidLot, finalUnits);
      onPlaceBid(quickBidLot.id, fixedTotal, finalUnits);
      showSuccess(`🛒 Compra Direta de $${fixedTotal.toLocaleString()} USD (${finalUnits} un.) computada com sucesso no item ${quickBidLot.lotNumber}!`);
      setQuickBidLot(null);
      return;
    }
    if (!quickBidAmount || quickBidAmount <= 0) {
      showSuccess('Informe um valor de lance maior que $0 USD.');
      return;
    }
    const isVerizon = isVerizonLot(quickBidLot);
    const finalUnits = isVerizon ? quickBidLot.quantity : Math.max(1, Math.min(quickBidLot.quantity, quickBidUnits));
    onPlaceBid(quickBidLot.id, quickBidAmount, finalUnits);
    showSuccess(`🎉 Oferta de $${quickBidAmount.toLocaleString()} USD (${finalUnits} un.) computada com sucesso no lote ${quickBidLot.lotNumber}!`);
    setQuickBidLot(null);
  };

  const normalizedAuctions = React.useMemo(
    () => auctions.filter(isLotUnlockedOnly).map(normalizeVerizonLot),
    [auctions]
  );

  const matchesClientAuctionFilter = (lot: AuctionLot) => {
    if (selectedAuctionHouseFilter !== 'all' && lot.auctionHouse !== selectedAuctionHouseFilter) return false;
    if (selectedAuctionSystemFilter === 'VERIZON' && !isVerizonLot(lot)) return false;
    if (selectedAuctionSystemFilter === 'T_MOBILE' && !isTMobileLot(lot)) return false;
    if (selectedAuctionSystemFilter === 'ASSURANT' && lot.sourceType !== 'ASSURANT' && !/assurant/i.test(lot.auctionHouse)) return false;
    if (selectedAuctionSystemFilter === 'STOCK_APPLE' && lot.sourceType !== 'STOCK_APPLE' && !/stock/i.test(lot.auctionHouse)) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_1' && getMarketplaceNumber(lot) !== 1) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_2' && getMarketplaceNumber(lot) !== 2) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_3' && getMarketplaceNumber(lot) !== 3) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_4' && getMarketplaceNumber(lot) !== 4) return false;
    if (selectedAuctionSystemFilter === 'MACBOOKS' && lot.sourceType !== 'MACBOOKS' && !/macbook/i.test(lot.auctionHouse)) return false;
    return true;
  };

  const lotsForClientAuction = normalizedAuctions.filter(matchesClientAuctionFilter);
  const lotsForClientGrades = lotsForClientAuction.filter(lot => {
    if (selectedModelFilter === 'verizon') {
      if (!isVerizonLot(lot)) return false;
    } else if (selectedModelFilter !== 'all') {
      const hasInManifest = (lot.manifest || []).some(m => m.model === selectedModelFilter);
      if (lot.modelFamily !== selectedModelFilter && !hasInManifest) return false;
    }
    return true;
  });

  // Dynamic list of models, grades and auction houses present in active catalog
  const availableModels = Array.from(new Set(lotsForClientAuction.map(a => a.modelFamily))).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const GRADE_ORDER = ['Grade A+', 'Grade A', 'Grade B', 'Grade C', 'Grade D', 'DNA', 'DNB', 'DNC', 'DND'];
  const availableGrades = Array.from(new Set(lotsForClientGrades.map(a => a.grade)))
    .filter(g => Boolean(g) && (!isVerizonFilterActive || VERIZON_GRADES.includes(g)))
    .sort((a, b) => {
      const idxA = GRADE_ORDER.indexOf(a);
      const idxB = GRADE_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  const availableAuctionHouses = Array.from(new Set(normalizedAuctions.map(a => a.auctionHouse))).filter(Boolean).sort((a, b) => a.localeCompare(b));

  React.useEffect(() => {
    if (selectedGradeFilter !== 'all' && !availableGrades.includes(selectedGradeFilter)) {
      setSelectedGradeFilter('all');
    }
  }, [availableGrades, selectedGradeFilter]);

  // Filtered devices for client
  const clientFilteredLots = normalizedAuctions.filter(lot => {
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      const matchTitle = lot.title.toLowerCase().includes(q);
      const matchLot = lot.lotNumber.toLowerCase().includes(q);
      const matchModel = lot.modelFamily.toLowerCase().includes(q);
      const matchStorage = lot.primaryStorage.toLowerCase().includes(q);
      const matchOem = (lot.oemBrand || '').toLowerCase().includes(q);
      const matchSource = (lot.sourceType || '').toLowerCase().includes(q);
      const matchManifest = (lot.manifest || []).some(
        m =>
          (m.model || '').toLowerCase().includes(q) ||
          (m.storage || '').toLowerCase().includes(q) ||
          (m.color || '').toLowerCase().includes(q)
      );
      if (!matchTitle && !matchLot && !matchModel && !matchStorage && !matchOem && !matchSource && !matchManifest) return false;
    }
    if (selectedModelFilter === 'verizon') {
      if (!isVerizonLot(lot)) return false;
    } else if (selectedModelFilter !== 'all') {
      const hasInManifest = (lot.manifest || []).some(m => m.model === selectedModelFilter);
      if (lot.modelFamily !== selectedModelFilter && !hasInManifest) return false;
    }
    if (selectedGradeFilter !== 'all' && lot.grade !== selectedGradeFilter) return false;
    if (selectedCategoryFilter !== 'all') {
      const text = `${lot.modelFamily} ${lot.title} ${lot.description}`.toLowerCase();
      if (selectedCategoryFilter === 'Tablets' && !/ipad|tablet|galaxy tab/i.test(text)) return false;
      if (selectedCategoryFilter === 'Smartwatch' && !/watch|wearable/i.test(text)) return false;
      if (selectedCategoryFilter === 'MacBooks' && !/macbook|laptop|notebook/i.test(text)) return false;
      if (selectedCategoryFilter === 'Phones' && (/ipad|tablet|galaxy tab|watch|wearable|macbook|laptop|notebook/i.test(text))) return false;
    }
    if (selectedCapacityFilter !== 'all') {
      const capQ = selectedCapacityFilter.toLowerCase();
      const matchCap =
        lot.primaryStorage.toLowerCase().includes(capQ) ||
        (lot.manifest || []).some(m => (m.storage || '').toLowerCase().includes(capQ));
      if (!matchCap) return false;
    }
    if (selectedAuctionHouseFilter !== 'all' && lot.auctionHouse !== selectedAuctionHouseFilter) return false;
    if (selectedAuctionSystemFilter === 'VERIZON' && !isVerizonLot(lot)) return false;
    if (selectedAuctionSystemFilter === 'T_MOBILE' && !isTMobileLot(lot)) return false;
    if (selectedAuctionSystemFilter === 'ASSURANT' && lot.sourceType !== 'ASSURANT' && !/assurant/i.test(lot.auctionHouse)) return false;
    if (selectedAuctionSystemFilter === 'STOCK_APPLE' && lot.sourceType !== 'STOCK_APPLE' && !/stock/i.test(lot.auctionHouse)) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_1' && getMarketplaceNumber(lot) !== 1) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_2' && getMarketplaceNumber(lot) !== 2) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_3' && getMarketplaceNumber(lot) !== 3) return false;
    if (selectedAuctionSystemFilter === 'MARKETPLACE_4' && getMarketplaceNumber(lot) !== 4) return false;
    if (selectedAuctionSystemFilter === 'MACBOOKS' && lot.sourceType !== 'MACBOOKS' && !/macbook/i.test(lot.auctionHouse)) return false;
    if (selectedLotTypeFilter === 'wholesale' && lot.quantity <= 1) return false;
    if (selectedLotTypeFilter === 'single' && lot.quantity > 1) return false;
    return true;
  });

  const totalClientPages = Math.ceil(clientFilteredLots.length / CLIENT_ITEMS_PER_PAGE) || 1;
  const currentClientPage = Math.min(clientPage, totalClientPages);
  const clientStartIndex = (currentClientPage - 1) * CLIENT_ITEMS_PER_PAGE;
  const paginatedClientLots = clientFilteredLots.slice(clientStartIndex, clientStartIndex + CLIENT_ITEMS_PER_PAGE);

  return (
    <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-slate-800 dark:text-slate-200 space-y-8">
      {/* Toast Notice */}
      {successNotice && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Client Identity & Credential Banner */}
      <div className="p-6 bg-gradient-to-r from-white dark:from-slate-900 via-white dark:via-slate-900 to-amber-50 dark:to-amber-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-xl shadow-inner">
              <UserCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Painel do Cliente Cadastrado
                </h1>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-mono font-bold">
                  ● HABILITADO
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {currentUser.name} · Documento ID: <span className="font-mono text-slate-700 dark:text-slate-300">{currentUser.cpfCnpj}</span> · {currentUser.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyMiamiAddress}
              className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium transition-colors flex items-center gap-2"
              title="Copiar endereço do galpão de Miami"
            >
              <Copy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{copiedAddress ? 'Endereço Copiado!' : 'Copiar Suíte Miami (Doral FL)'}</span>
            </button>
          </div>
        </div>

        {/* Financial & Logistics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80 text-xs">
          <div className="p-3 bg-slate-100/80 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Limite Disponível em Dólares</span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-400 font-mono">
              ${currentUser.biddingLimitUsd.toLocaleString()} USD
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">
              aprox. R$ {(currentUser.biddingLimitUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="p-3 bg-slate-100/80 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Lances em Disputa</span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {userBids.length} Lote(s)
            </span>
            <span className="text-[10px] text-slate-500 block">
              {userBids.filter(b => b.status === 'vencendo').length} com maior lance
            </span>
          </div>

          <div className="p-3 bg-slate-100/80 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Armazém de Recebimento EUA</span>
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Doral / Miami - Florida (FL 33166)
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">Despacho Aéreo Prioritário Seguro</span>
          </div>
        </div>
      </div>

      {/* Client Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('modelos')}
          className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${
            activeTab === 'modelos'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/10'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Todos os Modelos & Lances ({auctions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('meus-lances')}
          className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${
            activeTab === 'meus-lances'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/10'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
          }`}
        >
          <Gavel className="w-4 h-4" />
          <span>Meus Lances Ativos ({userBids.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('arrematados')}
          className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${
            activeTab === 'arrematados'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/10'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Lotes Arrematados (Invoices)</span>
        </button>

        <button
          onClick={() => setActiveTab('perfil')}
          className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${
            activeTab === 'perfil'
              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/10'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Dados do Arrematante & Suíte</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: TODOS OS MODELOS, FOTOS, DADOS & LANCES */}
      {/* ========================================================= */}
      {activeTab === 'modelos' && (
        <div className="space-y-6">
          {/* Multi-Options Filter Bar for Vigorous Auctions */}
          <div className="p-4 sm:p-5 bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-600 dark:text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Pesquisar por modelo (16 Pro Max, 15 Pro), lote (US-89104), IMEI, cor ou galpão..."
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              {clientSearch && (
                <button
                  onClick={() => setClientSearch('')}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  Limpar Busca
                </button>
              )}
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1 text-xs">
              {/* Filter 0: Auction System (Verizon / Assurant / Stock Apple) */}
              <div>
                <label className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mb-1">Selecionar Leilão:</label>
                <select
                  value={selectedAuctionSystemFilter}
                  onChange={e => setSelectedAuctionSystemFilter(e.target.value as any)}
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400 font-bold"
                >
                  <option value="all">Todos os Leilões</option>
                  <option value="VERIZON">⚡ Leilão VERIZON</option>
                  <option value="T_MOBILE">📡 Leilão T-MOBILE Coppell</option>
                  <option value="ASSURANT">🔹 Leilão ASSURANT</option>
                  <option value="STOCK_APPLE">📦 Estoque Apple Pronta Entrega</option>
                  <option value="MARKETPLACE_1">🏬 Marketplace 1</option>
                  <option value="MARKETPLACE_2">🏬 Marketplace 2</option>
                  <option value="MARKETPLACE_3">🏬 Marketplace 3</option>
                  {normalizedAuctions.some(a => getMarketplaceNumber(a) === 4) && (
                    <option value="MARKETPLACE_4">🏬 Marketplace 4</option>
                  )}
                  <option value="MACBOOKS">💻 Leilão Macbooks</option>
                </select>
              </div>

              {/* Filter 1: Model */}
              <div>
                <label className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold block mb-1">Modelo:</label>
                <select
                  value={selectedModelFilter}
                  onChange={e => setSelectedModelFilter(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400 font-medium"
                >
                  <option value="all">Todos os Modelos</option>
                  <option value="verizon">⚡ Padrão VERIZON</option>
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Filter 2: Grade */}
              <div>
                <label className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold block mb-1">Grade:</label>
                <select
                  value={selectedGradeFilter}
                  onChange={e => setSelectedGradeFilter(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400 font-medium"
                >
                  <option value="all">Todas as Grades</option>
                  {availableGrades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Filter 2b: Categoria (Phones, Tablets, Smartwatch) */}
              <div>
                <label className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold block mb-1">Categoria:</label>
                <select
                  value={selectedCategoryFilter}
                  onChange={e => setSelectedCategoryFilter(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400 font-medium"
                >
                  <option value="all">Todas as Categorias</option>
                  <option value="Phones">Phones</option>
                  <option value="Tablets">Tablets</option>
                  <option value="Smartwatch">Smartwatch</option>
                </select>
              </div>

              {/* Filter 3: Capacity */}
              <div>
                <label className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold block mb-1">Capacidade / Memória:</label>
                <select
                  value={selectedCapacityFilter}
                  onChange={e => setSelectedCapacityFilter(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400 font-medium"
                >
                  <option value="all">Todas as Capacidades</option>
                  <option value="32GB">32GB</option>
                  <option value="64GB">64GB</option>
                  <option value="128GB">128GB</option>
                  <option value="256GB">256GB</option>
                  <option value="512GB">512GB</option>
                  <option value="1TB">1TB</option>
                  <option value="2TB">2TB</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
              <span>
                Exibindo <strong className="text-amber-600 dark:text-amber-400">{clientFilteredLots.length}</strong> de {auctions.length} leilões vigentes
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ● Lances computados instantaneamente no pregão oficial
              </span>
            </div>
          </div>

          {/* View Mode Switcher & Catalog Export Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/80 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-700 dark:text-slate-300 font-bold">Modo de Exibição dos Modelos:</span>
              <span className="text-[11px] text-slate-500 hidden md:inline">· Escolha entre a lista consolidada ou cards visuais</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {auctions.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const targetLots = clientFilteredLots.length > 0 ? clientFilteredLots : auctions;
                      const activeAuctionName = selectedAuctionSystemFilter !== 'all' ? selectedAuctionSystemFilter : undefined;
                      exportAuctionsCatalogXlsx(targetLots, usdRate, {
                        auctionName: activeAuctionName,
                        filterLabel: clientFilteredLots.length < auctions.length
                          ? `Filtro do Cliente (${clientFilteredLots.length} de ${auctions.length} lotes)`
                          : `Todos os Leilões (${auctions.length} lotes)`
                      });
                      showSuccess('Planilha Excel do catálogo de leilões exportada!');
                    }}
                    className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Exportar Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetLots = clientFilteredLots.length > 0 ? clientFilteredLots : auctions;
                      const activeAuctionName = selectedAuctionSystemFilter !== 'all' ? selectedAuctionSystemFilter : undefined;
                      exportAuctionsCatalogPdf(targetLots, usdRate, {
                        auctionName: activeAuctionName,
                        filterLabel: clientFilteredLots.length < auctions.length
                          ? `Filtro do Cliente (${clientFilteredLots.length} de ${auctions.length} lotes)`
                          : `Todos os Leilões (${auctions.length} lotes)`
                      });
                      showSuccess('Catálogo em PDF pronto para salvar/imprimir!');
                    }}
                    className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    viewMode === 'list'
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Lista de Modelos & Ofertas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    viewMode === 'cards'
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards em Grade</span>
                </button>
              </div>
            </div>
          </div>

          {clientFilteredLots.length === 0 ? (
            <div className="p-12 text-center bg-white/75 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <Search className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Nenhum modelo encontrado com os filtros selecionados</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Tente ajustar os filtros de modelo, grade ou capacidade para visualizar os leilões vigentes.
              </p>
              <button
                type="button"
                onClick={() => {
                  setClientSearch('');
                  setSelectedModelFilter('all');
                  setSelectedGradeFilter('all');
                  setSelectedCategoryFilter('all');
                  setSelectedCapacityFilter('all');
                  setSelectedAuctionHouseFilter('all');
                  setSelectedAuctionSystemFilter('all');
                  setSelectedLotTypeFilter('all');
                }}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-300 font-semibold text-xs rounded-xl border border-slate-300 dark:border-slate-700"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {viewMode === 'list' ? (
                  /* ======================================================== */
                  /* LIST VIEW: MODELOS, ESPECIFICAÇÕES E BOTÃO DE OFERTA     */
                  /* ======================================================== */
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                    {/* Mobile Card View (< md) */}
                    <div className="md:hidden divide-y divide-slate-200/80 dark:divide-slate-800/80">
                      {paginatedClientLots.map(lot => {
                        const isVerizon = isVerizonLot(lot);
                        const isAssurant = isAssurantLot(lot);
                        const isProntaEntrega = isProntaEntregaLot(lot);
                        const isMixExpanded = !!expandedMixLotIds[lot.id];
                        const unitPriceUsd = getLotUnitPriceUsd(lot);
                        const totalLotPriceUsd = getLotTotalPriceUsd(lot);
                        const unitPriceBrl = unitPriceUsd * usdRate;
                  return (
                    <div key={lot.id} className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={lot.imageUrl}
                          alt={lot.title}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
                          }}
                          onClick={() => onSelectLot(lot)}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-300 dark:border-slate-700 shrink-0 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">{lot.lotNumber}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                              {lot.grade}
                            </span>
                            {isVerizon && (
                              <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-black text-[9px] uppercase">
                                VERIZON
                              </span>
                            )}
                            {isAssurant && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-black text-[9px] uppercase">
                                ASSURANT
                              </span>
                            )}
                            {isProntaEntrega && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-black text-[9px] uppercase">
                                PRONTA ENTREGA
                              </span>
                            )}
                            {isTMobileLot(lot) && (
                              <span className="px-1.5 py-0.5 rounded bg-fuchsia-600 text-white font-black text-[9px] uppercase">
                                T-MOBILE
                              </span>
                            )}
                            {getMarketplaceNumber(lot) && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-600 text-white font-black text-[9px] uppercase">
                                MARKETPLACE {getMarketplaceNumber(lot)}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                              {isVerizon && <Lock className="w-2.5 h-2.5 text-red-600 dark:text-red-400" />}
                              <span>{lot.quantity} un.{isVerizon ? ' fixas' : ''}</span>
                            </span>
                          </div>
                          <h4
                            onClick={() => onSelectLot(lot)}
                            className="text-xs font-bold text-slate-900 dark:text-white mt-1 line-clamp-2 cursor-pointer"
                          >
                            {stripLotPrefix(lot.title)}
                          </h4>
                          <span className="text-[10px] text-slate-600 dark:text-slate-400 block mt-0.5">{lot.auctionHouse}</span>
                          <LotMixBadgesAndTrigger
                            lot={lot}
                            isExpanded={isMixExpanded}
                            onToggle={(e) => toggleMixExpand(lot.id, e)}
                            compact
                          />
                        </div>
                      </div>
                      <LotMixExpandablePanel
                        lot={lot}
                        isExpanded={isMixExpanded}
                        onSelectLot={onSelectLot}
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                        {isVerizon && lot.currentBidUsd === 0 ? (
                          <div>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 block">Preço Verizon:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm block">Sem Preço Fixo</span>
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold block">
                              Cliente escolhe o valor · Qtd Fixa
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                              {isProntaEntrega ? 'Preço Fixo (Compra Direta):' : isVerizon ? 'Última Oferta (Valor Livre):' : 'Lance Atual:'}
                            </span>
                            <span className={`font-mono font-bold text-sm ${isProntaEntrega ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              ${unitPriceUsd.toLocaleString()} USD <span className="text-[10px] font-normal text-slate-600 dark:text-slate-400">/ un.</span>
                            </span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono ml-1.5">
                              (aprox. R$ {unitPriceBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})
                            </span>
                            {!isAssurant && lot.quantity > 1 && (
                              <span className={`text-[10px] font-mono block ${isProntaEntrega ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
                                {isProntaEntrega ? 'Total Estoque' : 'Total Lote'}: ${totalLotPriceUsd.toLocaleString()} USD
                              </span>
                            )}
                            {isAssurant && (
                              <span className="text-[10px] text-cyan-700 dark:text-cyan-300 font-mono font-semibold block">
                                Incremento: {getLotIncrementSize(lot)} un.
                              </span>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenBidModal(lot)}
                          className={`px-3.5 py-2 font-black rounded-xl text-xs transition-colors ${
                            isProntaEntrega
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          }`}
                        >
                          {isProntaEntrega ? 'Comprar Direto' : isVerizon ? 'Escolher Valor' : 'Dar Oferta'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/95 dark:bg-slate-950/90 text-slate-600 dark:text-slate-400 font-mono uppercase text-[10px] border-b border-slate-200 dark:border-slate-800 tracking-wider">
                    <tr>
                      <th className="p-3.5">Foto</th>
                      <th className="p-3.5">Modelo & Lote</th>
                      <th className="p-3.5">Grade</th>
                      <th className="p-3.5">Qtd / Memória</th>
                      <th className="p-3.5">Status / Laudo</th>
                      <th className="p-3.5">Lance Atual</th>
                      <th className="p-3.5 text-center">Oferta Rápida</th>
                      <th className="p-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 font-sans">
                    {paginatedClientLots.map(lot => {
                      const gradeInfo = GRADE_EXPLANATIONS[lot.grade];
                      const isVerizon = isVerizonLot(lot);
                      const isAssurant = isAssurantLot(lot);
                      const isProntaEntrega = isProntaEntregaLot(lot);
                      const isMixExpanded = !!expandedMixLotIds[lot.id];
                      const mixSummary = getLotMixSummary(lot);
                      const unitPriceUsd = getLotUnitPriceUsd(lot);
                      const totalLotPriceUsd = getLotTotalPriceUsd(lot);

                      return (
                        <React.Fragment key={lot.id}>
                          <tr className="hover:bg-slate-200/50 dark:hover:bg-slate-800/40 transition-colors">
                            {/* Photo Thumbnail */}
                            <td className="p-3.5">
                              <div 
                                onClick={() => onSelectLot(lot)}
                                className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-950 overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer relative group shrink-0"
                                title="Clique para ver fotos e laudo do lote"
                              >
                                <img 
                                  src={lot.imageUrl} 
                                  alt={lot.title} 
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent" />
                              </div>
                            </td>

                            {/* Model & Lot Title */}
                            <td className="p-3.5">
                              <div className="space-y-0.5">
                                <span 
                                  className="font-bold text-white text-sm block hover:text-amber-400 cursor-pointer transition-colors"
                                  onClick={() => onSelectLot(lot)}
                                >
                                  {lot.modelFamily}
                                </span>
                                <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium line-clamp-1">
                                  {stripLotPrefix(lot.title)}
                                </span>
                                <div className="flex items-center gap-2 pt-0.5">
                                  <span className="font-mono text-[10px] text-amber-700 dark:text-amber-300 bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                                    {lot.lotNumber}
                                  </span>
                                  <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
                                    {lot.auctionHouse}
                                  </span>
                                </div>
                                <LotMixBadgesAndTrigger
                                  lot={lot}
                                  isExpanded={isMixExpanded}
                                  onToggle={(e) => toggleMixExpand(lot.id, e)}
                                  compact
                                />
                              </div>
                            </td>

                            {/* Grade Badge */}
                            <td className="p-3.5">
                              <div className="space-y-1">
                                <span className={`px-2.5 py-1 rounded text-xs font-bold border inline-block ${gradeInfo?.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'}`}>
                                  {lot.grade}
                                </span>
                                {isVerizon && (
                                  <span className="px-1.5 py-0.5 rounded bg-red-600/90 text-white font-black text-[9px] block w-max uppercase tracking-wider">
                                    VERIZON
                                  </span>
                                )}
                                {isAssurant && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-600/90 text-white font-black text-[9px] block w-max uppercase tracking-wider">
                                    ASSURANT
                                  </span>
                                )}
                                {isProntaEntrega && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-600/90 text-white font-black text-[9px] block w-max uppercase tracking-wider">
                                    PRONTA ENTREGA
                                  </span>
                                )}
                                {isTMobileLot(lot) && (
                                  <span className="px-1.5 py-0.5 rounded bg-fuchsia-600/90 text-white font-black text-[9px] block w-max uppercase tracking-wider">
                                    T-MOBILE
                                  </span>
                                )}
                                {getMarketplaceNumber(lot) && (
                                  <span className="px-1.5 py-0.5 rounded bg-cyan-600/90 text-white font-black text-[9px] block w-max uppercase tracking-wider">
                                    MARKETPLACE {getMarketplaceNumber(lot)}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Quantity & Storage */}
                            <td className="p-3.5">
                              <div className="font-mono">
                                <span className="text-slate-900 dark:text-white font-bold flex items-center gap-1">
                                  {isVerizon && <Lock className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />}
                                  <span>{lot.quantity} {lot.quantity === 1 ? 'unidade' : 'unidades'}</span>
                                </span>
                                {isVerizon && (
                                  <span className="text-[10px] text-red-700 dark:text-red-300 font-semibold block">Qtd Fixa (Fechado)</span>
                                )}
                                {isAssurant && (
                                  <span className="text-[10px] text-cyan-700 dark:text-cyan-300 font-semibold block">
                                    Inc: {getLotIncrementSize(lot)} un.
                                  </span>
                                )}
                                <span className="text-slate-600 dark:text-slate-400 text-[11px] block">{lot.primaryStorage}</span>
                              </div>
                            </td>

                            {/* Diagnostics & Clean ESN */}
                            <td className="p-3.5">
                              <div className="text-[11px] space-y-0.5">
                                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold flex items-center gap-1">
                                  <Battery className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  {lot.batteryHealthRange}
                                </span>
                                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                  Clean ESN
                                </span>
                              </div>
                            </td>

                            {/* Current Bid */}
                            <td className="p-3.5">
                              {isVerizon && lot.currentBidUsd === 0 ? (
                                <div>
                                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 block">
                                    Sem Preço Fixo
                                  </span>
                                  <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold block">
                                    Cliente escolhe o valor
                                  </span>
                                  <span className="text-[10px] text-slate-500 block">
                                    {lot.totalBidsCount} oferta(s)
                                  </span>
                                </div>
                              ) : (
                                <div className="font-mono">
                                  <span className={`text-base font-black block ${isProntaEntrega ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    ${unitPriceUsd.toLocaleString()} USD <span className="text-[10px] font-normal text-slate-600 dark:text-slate-400">/ un.</span>
                                  </span>
                                  <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                                    aprox. R$ {Math.round(unitPriceUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / un.
                                  </span>
                                  {!isAssurant && lot.quantity > 1 && (
                                    <span className={`text-[10px] font-mono block ${isProntaEntrega ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
                                      {isProntaEntrega ? 'Total Estoque' : 'Total Lote'}: ${totalLotPriceUsd.toLocaleString()} USD
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500 font-sans block">
                                    {isProntaEntrega ? 'Preço Fixo · Compra Direta' : `${isVerizon ? 'Valor Livre · ' : ''}${lot.totalBidsCount} lances`}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Quick Bids / Compra Direta badge */}
                            <td className="p-3.5">
                              {isProntaEntrega ? (
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBidModal(lot)}
                                    className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1"
                                    title="Preço fixo: escolha apenas a quantidade para compra direta"
                                  >
                                    <Lock className="w-3 h-3" />
                                    <span>Preço Fixo · Qtd</span>
                                  </button>
                                </div>
                              ) : isVerizon && lot.currentBidUsd === 0 ? (
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBidModal(lot)}
                                    className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 rounded-lg text-[11px] font-bold transition-colors"
                                  >
                                    Informar Valor ($)
                                  </button>
                                </div>
                              ) : isDiscountBidAuction(lot) ? (
                                <div className="flex items-center justify-center gap-1 font-mono">
                                  {[5, 10, 15, 25].map(delta => (
                                    <button
                                      key={delta}
                                      type="button"
                                      onClick={() => {
                                        const val = Math.max(1, lot.currentBidUsd - delta);
                                        onPlaceBid(lot.id, val);
                                        showSuccess(`🎉 Oferta de $${val.toLocaleString()} USD computada no modelo ${lot.modelFamily} (${lot.lotNumber})!`);
                                      }}
                                      className="py-1 px-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-amber-400 hover:text-slate-950 active:scale-95 text-amber-700 dark:text-amber-300 border border-slate-300/80 dark:border-slate-700/80 rounded text-[10px] font-bold transition-all"
                                      title={`Ofertar -$${delta} USD agora`}
                                    >
                                      -${delta}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1 font-mono">
                                  {[5, 10, 15, 25].map(inc => (
                                    <button
                                      key={inc}
                                      type="button"
                                      onClick={() => {
                                        const val = lot.currentBidUsd + inc;
                                        onPlaceBid(lot.id, val);
                                        showSuccess(`🎉 Oferta de $${val.toLocaleString()} USD computada no modelo ${lot.modelFamily} (${lot.lotNumber})!`);
                                      }}
                                      className="py-1 px-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-amber-400 hover:text-slate-950 active:scale-95 text-amber-700 dark:text-amber-300 border border-slate-300/80 dark:border-slate-700/80 rounded text-[10px] font-bold transition-all"
                                      title={`Ofertar +$${inc} USD agora`}
                                    >
                                      +${inc}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Primary Action: Dar Oferta / Comprar Direto */}
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenBidModal(lot)}
                                  className={`px-3.5 py-2 font-black rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5 shrink-0 ${
                                    isProntaEntrega
                                      ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 shadow-emerald-400/20'
                                      : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-400/20'
                                  }`}
                                >
                                  {isProntaEntrega ? <ShoppingBag className="w-3.5 h-3.5" /> : <Gavel className="w-3.5 h-3.5" />}
                                  <span>{isProntaEntrega ? 'Comprar Direto' : isVerizon ? 'Escolher Valor' : 'Dar Oferta'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onSelectLot(lot)}
                                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs transition-colors"
                                  title="Ver detalhes do lote"
                                >
                                  <ArrowUpRight className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Mix Details Row */}
                          {mixSummary.hasExpandableDetails && (
                            <tr className={isMixExpanded ? 'bg-slate-100/70 dark:bg-slate-950/50' : '!border-t-0'}>
                              <td colSpan={8} className={isMixExpanded ? 'px-4 pb-4 pt-0' : 'p-0 border-0'}>
                                <LotMixExpandablePanel
                                  lot={lot}
                                  isExpanded={isMixExpanded}
                                  onSelectLot={onSelectLot}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* CARDS VIEW: GRADE DE CARDS COM FOTOS GRANDES              */
            /* ======================================================== */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedClientLots.map(lot => {
                const gradeInfo = GRADE_EXPLANATIONS[lot.grade];
                const isVerizon = isVerizonLot(lot);
                const isAssurant = isAssurantLot(lot);
                const isProntaEntrega = isProntaEntregaLot(lot);
                const isMixExpanded = !!expandedMixLotIds[lot.id];
                const unitPriceUsd = getLotUnitPriceUsd(lot);
                const totalLotPriceUsd = getLotTotalPriceUsd(lot);
                const currentBrl = lot.currentBidUsd * usdRate;
                const hasRetailEstimate = (lot.estimatedBrazilRetailBrl || 0) > 0;
                const grossProfitBrl = lot.estimatedBrazilRetailBrl - currentBrl;

                return (
                  <div
                    key={lot.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl transition-all"
                  >
                    {/* Photo & Badge */}
                    <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                      <img
                        src={lot.imageUrl}
                        alt={lot.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/30 pointer-events-none" />

                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span className={`px-2.5 py-1 rounded text-xs font-bold border backdrop-blur-md ${gradeInfo?.badgeColor || ''}`}>
                          {lot.grade}
                        </span>
                        {isVerizon && (
                          <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                            VERIZON
                          </span>
                        )}
                        {isAssurant && (
                          <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                            ASSURANT
                          </span>
                        )}
                        {isProntaEntrega && (
                          <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                            PRONTA ENTREGA
                          </span>
                        )}
                        {isTMobileLot(lot) && (
                          <span className="px-2 py-0.5 rounded bg-fuchsia-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                            T-MOBILE
                          </span>
                        )}
                        {getMarketplaceNumber(lot) && (
                          <span className="px-2 py-0.5 rounded bg-cyan-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                            MARKETPLACE {getMarketplaceNumber(lot)}
                          </span>
                        )}
                      </div>

                      <div className="absolute top-3 right-3">
                        <span className="px-2.5 py-1 rounded bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-200 text-[11px] font-mono flex items-center gap-1">
                          {isVerizon && <Lock className="w-3 h-3 text-red-400" />}
                          <span>{lot.quantity} {lot.quantity === 1 ? 'Aparelho' : 'Aparelhos'}{isVerizon ? ' · Qtd Fixa' : ''}</span>
                        </span>
                      </div>

                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-slate-300">
                        <span className="font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 text-amber-300">
                          {lot.lotNumber}
                        </span>
                        <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 text-slate-300 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-400" />
                          {lot.location}
                        </span>
                      </div>
                    </div>

                    {/* Body & Specs */}
                    <div className="p-4 sm:p-5 space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-white text-base leading-snug line-clamp-2">
                          {stripLotPrefix(lot.title)}
                        </h3>

                        {/* Diagnostic & Technical Spec Badges */}
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />
                            <span className="truncate">{lot.primaryStorage} · {lot.modelFamily}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Battery className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{lot.batteryHealthRange}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="truncate text-slate-700 dark:text-slate-300">Clean ESN / FMI OFF</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span className="truncate text-emerald-600 dark:text-emerald-400">{lot.carrierStatus}</span>
                          </div>
                        </div>

                        <LotMixBadgesAndTrigger
                          lot={lot}
                          isExpanded={isMixExpanded}
                          onToggle={(e) => toggleMixExpand(lot.id, e)}
                          compact
                        />
                        <LotMixExpandablePanel
                          lot={lot}
                          isExpanded={isMixExpanded}
                          onSelectLot={onSelectLot}
                        />
                      </div>

                      {/* Price & Direct Bidding Controls */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
                        {isVerizon && lot.currentBidUsd === 0 ? (
                          <div className="flex items-end justify-between gap-2">
                            <div>
                              <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Preço Verizon:</span>
                              <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight block">
                                Sem Preço Fixo
                              </span>
                              <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold block">
                                Cliente escolhe o valor da oferta
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded bg-red-600/15 border border-red-500/30 text-[10px] font-bold text-red-700 dark:text-red-300 inline-block mb-1">
                                Qtd Fixa: {lot.quantity} un.
                              </span>
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono block">
                                {lot.totalBidsCount} oferta(s)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
                                {isProntaEntrega ? 'Preço Fixo (Pronta Entrega):' : isVerizon ? 'Última Oferta (Valor Livre):' : isAssurant && lot.quantity > 1 ? 'Valor Unitário (Assurant):' : 'Lance Atual:'}
                              </span>
                              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight block ${isProntaEntrega ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                ${unitPriceUsd.toLocaleString()} USD <span className="text-xs font-normal text-slate-600 dark:text-slate-400">/ un.</span>
                              </span>
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono block">
                                aprox. R$ {Math.round(unitPriceUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / un.
                              </span>
                              {!isAssurant && lot.quantity > 1 && (
                                <span className={`text-[10px] font-mono block ${isProntaEntrega ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
                                  {isProntaEntrega ? 'Total Estoque' : 'Total Lote'} ({lot.quantity} un.): ${totalLotPriceUsd.toLocaleString()} USD
                                </span>
                              )}
                              {isAssurant && (
                                <span className="text-[10px] text-cyan-700 dark:text-cyan-300 font-mono font-semibold block mt-0.5">
                                  Incremento: {getLotIncrementSize(lot)} un.
                                </span>
                              )}
                            </div>

                            <div className="text-right">
                              {isVerizon ? (
                                <span className="px-2 py-0.5 rounded bg-red-600/15 border border-red-500/30 text-[10px] font-bold text-red-700 dark:text-red-300 inline-block mb-1">
                                  Qtd Fixa: {lot.quantity} un.
                                </span>
                              ) : isProntaEntrega ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 inline-block mb-1">
                                  Compra Direta · Fixo
                                </span>
                              ) : hasRetailEstimate ? (
                                <>
                                  <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                                    {isAssurant && lot.quantity > 1 ? 'Lucro Bruto Est. (/ un.):' : 'Lucro Bruto Est.:'}
                                  </span>
                                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
                                    aprox. + R$ {grossProfitBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                  </span>
                                </>
                              ) : null}
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                                {isProntaEntrega ? `${lot.quantity} un. disponíveis` : `${lot.totalBidsCount} lances dados`}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                          {isProntaEntrega ? (
                            <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-500/30 text-[10px] text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Preço unitário fixo</span>
                              </span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-300">Escolha apenas a quantidade</span>
                            </div>
                          ) : isVerizon && lot.currentBidUsd === 0 ? (
                            <div className="px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-500/30 text-[10px] text-red-800 dark:text-red-200 flex items-center justify-between">
                              <span>Lote fechado ({lot.quantity} un. fixas)</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-300">Valor Livre (USD)</span>
                            </div>
                          ) : isDiscountBidAuction(lot) ? (
                            <>
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold block">Computar Oferta Rápida:</span>
                              <div className="grid grid-cols-4 gap-1.5">
                                {[5, 10, 15, 25].map(delta => (
                                  <button
                                    key={delta}
                                    type="button"
                                    onClick={() => {
                                      const val = Math.max(1, lot.currentBidUsd - delta);
                                      onPlaceBid(lot.id, val);
                                      showSuccess(`🎉 Oferta de $${val.toLocaleString()} USD computada no lote ${lot.lotNumber}!`);
                                    }}
                                    className="py-1 px-1 bg-slate-100 dark:bg-slate-800/90 hover:bg-amber-400 hover:text-slate-950 active:scale-95 text-amber-700 dark:text-amber-300 border border-slate-300/80 dark:border-slate-700/80 rounded-lg text-[10px] font-mono font-bold transition-all text-center"
                                    title={`Computar oferta imediata de -$${delta} USD`}
                                  >
                                    -${delta}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold block">Computar Oferta Rápida:</span>
                              <div className="grid grid-cols-4 gap-1.5">
                                {[5, 10, 15, 25].map(inc => (
                                  <button
                                    key={inc}
                                    type="button"
                                    onClick={() => {
                                      const val = lot.currentBidUsd + inc;
                                      onPlaceBid(lot.id, val);
                                      showSuccess(`🎉 Oferta de $${val.toLocaleString()} USD computada no lote ${lot.lotNumber}!`);
                                    }}
                                    className="py-1 px-1 bg-slate-100 dark:bg-slate-800/90 hover:bg-amber-400 hover:text-slate-950 active:scale-95 text-amber-700 dark:text-amber-300 border border-slate-300/80 dark:border-slate-700/80 rounded-lg text-[10px] font-mono font-bold transition-all text-center"
                                    title={`Computar oferta imediata de +$${inc} USD`}
                                  >
                                    +${inc}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={() => onSelectLot(lot)}
                              className="py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                            >
                              <span>Ver Detalhes</span>
                              <ArrowUpRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                            </button>

                            <button
                              onClick={() => handleOpenBidModal(lot)}
                              className={`py-2.5 px-3 font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 ${
                                isProntaEntrega
                                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 shadow-emerald-400/20'
                                  : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-400/20'
                              }`}
                            >
                              {isProntaEntrega ? <ShoppingBag className="w-3.5 h-3.5" /> : <Gavel className="w-3.5 h-3.5" />}
                              <span>{isProntaEntrega ? 'Comprar Direto' : isVerizon ? 'Escolher Valor' : 'Computar Oferta'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Client Pagination Footer */}
          {totalClientPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              <div>
                Exibindo <strong className="text-slate-900 dark:text-white">{clientStartIndex + 1}</strong> a <strong className="text-slate-900 dark:text-white">{Math.min(clientStartIndex + CLIENT_ITEMS_PER_PAGE, clientFilteredLots.length)}</strong> de <strong className="text-slate-900 dark:text-white">{clientFilteredLots.length}</strong> leilões
              </div>

              <div className="flex items-center gap-2 font-semibold">
                <button
                  disabled={currentClientPage === 1}
                  onClick={() => {
                    setClientPage(p => Math.max(1, p - 1));
                    window.scrollTo({ top: 350, behavior: 'smooth' });
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-colors"
                >
                  Anterior
                </button>
                <span className="font-mono text-amber-600 dark:text-amber-400 px-2 font-bold">{currentClientPage} / {totalClientPages}</span>
                <button
                  disabled={currentClientPage >= totalClientPages}
                  onClick={() => {
                    setClientPage(p => Math.min(totalClientPages, p + 1));
                    window.scrollTo({ top: 350, behavior: 'smooth' });
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )
      }
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: MEUS LANCES ATIVOS */}
      {/* ========================================================= */}
      {activeTab === 'meus-lances' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Lotes com Seus Lances Computados</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Acompanhe se você é o arrematante vencedor ou se seu lance foi superado</p>
            </div>

            {userBids.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    exportClientBidsXlsx({
                      bids: userBids,
                      auctions,
                      adminOffers,
                      currentUser,
                      usdRate
                    });
                    showSuccess('Planilha Excel dos seus lances ativos exportada!');
                  }}
                  className="px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Exportar Lances (Excel)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportClientBidsPdf({
                      bids: userBids,
                      auctions,
                      adminOffers,
                      currentUser,
                      usdRate
                    });
                    showSuccess('Relatório PDF dos seus lances ativos pronto para salvar/imprimir!');
                  }}
                  className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-700 dark:text-amber-300 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Exportar Lances (PDF)</span>
                </button>
              </div>
            )}
          </div>

          {/* Live Offer Status Alerts from Admin */}
          {adminOffers.filter(o => o.clientEmail === currentUser.email || o.clientName === currentUser.name).length > 0 && (
            <div className="space-y-2.5">
              {adminOffers
                .filter(o => o.clientEmail === currentUser.email || o.clientName === currentUser.name)
                .map(offer => (
                  <div
                    key={offer.id}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      offer.status === 'Aceita'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                        : offer.status === 'Contra-Oferta'
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/40 text-indigo-800 dark:text-indigo-200'
                        : offer.status === 'Em Análise'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500/40 text-amber-800 dark:text-amber-200'
                        : offer.status === 'Recusada'
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500/40 text-rose-800 dark:text-rose-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{offer.lotNumber}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100/80 dark:bg-slate-950/70 font-bold uppercase text-[10px]">
                          Status: {offer.status}
                        </span>
                      </div>
                      <p className="text-xs">
                        Sua oferta de <strong>${offer.amountUsd.toLocaleString()} USD</strong> ({offer.lotTitle}) está com status <strong>{offer.status}</strong>.
                        {offer.status === 'Contra-Oferta' && offer.counterOfferUsd && (
                          <span className="text-indigo-300 font-bold ml-1">
                            Nova contra-oferta do leiloeiro: ${offer.counterOfferUsd.toLocaleString()} USD.
                          </span>
                        )}
                        {offer.adminNote && <span className="block text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Obs: {offer.adminNote}</span>}
                      </p>
                    </div>
                    {offer.status === 'Contra-Oferta' && offer.counterOfferUsd && (
                      <button
                        onClick={() => {
                          const updated = adminOffers.map(o =>
                            o.id === offer.id ? { ...o, status: 'Aceita', amountUsd: offer.counterOfferUsd } : o
                          );
                          setAdminOffers(updated);
                          try {
                            localStorage.setItem('us_admin_offers_v1', JSON.stringify(updated));
                            window.dispatchEvent(new Event('offers_updated'));
                          } catch (e) {}
                          showSuccess(`Contra-oferta de $${offer.counterOfferUsd.toLocaleString()} USD aceita no lote ${offer.lotNumber}!`);
                        }}
                        className="px-3.5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-lg text-xs shrink-0 transition-colors"
                      >
                        Aceitar Contra-Oferta (${offer.counterOfferUsd.toLocaleString()} USD)
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}

          {userBids.length === 0 ? (
            <div className="p-12 text-center bg-white/75 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <Gavel className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Você ainda não deu lances em nenhum lote</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Explore a aba "Todos os Modelos" acima e clique em "Dar Oferta" para disputar leilões oficiais da Apple e Verizon.
              </p>
              <button
                onClick={() => setActiveTab('modelos')}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs transition-colors inline-block"
              >
                Ver Modelos e Dar Lances
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white/80 dark:bg-slate-900/60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 text-[11px]">
                    <th className="py-3 px-4">Lote / Modelo</th>
                    <th className="py-3 px-4">Seu Lance em USD</th>
                    <th className="py-3 px-4">Equivalente em Reais (PTAX)</th>
                    <th className="py-3 px-4">Momento do Lance</th>
                    <th className="py-3 px-4">Situação da Disputa</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {userBids.map((b, idx) => {
                    const lot = auctions.find(a => a.id === b.lotId || a.lotNumber === b.lotId);
                    const offer = adminOffers.find(o => 
                      (o.lotId === b.lotId || o.lotNumber === b.lotId || (lot && o.lotId === lot.id)) &&
                      (o.clientEmail === currentUser.email || o.clientName === currentUser.name)
                    );

                    // Dynamic Dispute Status Logic
                    const isExpired = lot ? new Date(lot.endTime).getTime() <= Date.now() : false;
                    const isOutbid = lot ? lot.currentBidUsd > b.amountUsd : false;

                    let statusBadge = {
                      text: '● Maior Lance (Você está ganhando)',
                      style: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                      isWinning: true,
                      isEnded: false,
                      hasCounterOffer: false,
                      counterPrice: 0
                    };

                    if (offer) {
                      if (offer.status === 'Aceita') {
                        statusBadge = {
                          text: '● Oferta Aceita (Arrematado)',
                          style: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10',
                          isWinning: true,
                          isEnded: true,
                          hasCounterOffer: false,
                          counterPrice: 0
                        };
                      } else if (offer.status === 'Homologada / Arrematada') {
                        statusBadge = {
                          text: '● Arrematado & Homologado',
                          style: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10',
                          isWinning: true,
                          isEnded: true,
                          hasCounterOffer: false,
                          counterPrice: 0
                        };
                      } else if (offer.status === 'Contra-Oferta') {
                        statusBadge = {
                          text: `● Contra-Oferta ($${(offer.counterOfferUsd || b.amountUsd).toLocaleString()} USD)`,
                          style: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/10',
                          isWinning: false,
                          isEnded: false,
                          hasCounterOffer: true,
                          counterPrice: offer.counterOfferUsd || b.amountUsd
                        };
                      } else if (offer.status === 'Em Análise') {
                        statusBadge = {
                          text: '● Em Análise pela Diretoria',
                          style: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10',
                          isWinning: true,
                          isEnded: false,
                          hasCounterOffer: false,
                          counterPrice: 0
                        };
                      } else if (offer.status === 'Recusada') {
                        statusBadge = {
                          text: '○ Oferta Recusada',
                          style: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40',
                          isWinning: false,
                          isEnded: true,
                          hasCounterOffer: false,
                          counterPrice: 0
                        };
                      } else if (offer.status === 'Superada') {
                        statusBadge = {
                          text: '○ Lance Superado por Outro Licitante',
                          style: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40',
                          isWinning: false,
                          isEnded: false,
                          hasCounterOffer: false,
                          counterPrice: 0
                        };
                      }
                    } else if (isExpired) {
                      if (isOutbid) {
                        statusBadge = {
                          text: '○ Encerrado (Lance Superado)',
                          style: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
                          isWinning: false,
                          isEnded: true,
                          hasCounterOffer: false,
                          counterPrice: 0
                        };
                      } else {
                        statusBadge = {
                          text: '● Leilão Encerrado (Arrematado)',
                          style: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10',
                          isWinning: true,
                          isEnded: true,
                          hasCounterOffer: false,
                          counterPrice: 0
                        };
                      }
                    } else if (isOutbid) {
                      statusBadge = {
                        text: `○ Lance Superado ($${lot?.currentBidUsd.toLocaleString()} USD)`,
                        style: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
                        isWinning: false,
                        isEnded: false,
                        hasCounterOffer: false,
                        counterPrice: 0
                      };
                    }

                    return (
                      <tr key={idx} className="hover:bg-slate-200/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 dark:text-white block">{b.lotTitle}</span>
                          <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">{lot?.lotNumber || b.lotId}</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-600 dark:text-amber-400">
                          ${b.amountUsd.toLocaleString()} USD
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                          aprox. R$ {(b.amountUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{b.timestamp}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded text-[11px] font-bold border inline-block ${statusBadge.style}`}>
                            {statusBadge.text}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {statusBadge.hasCounterOffer ? (
                            <button
                              onClick={() => {
                                if (offer) {
                                  const updated = adminOffers.map(o =>
                                    o.id === offer.id ? { ...o, status: 'Aceita' as const, amountUsd: statusBadge.counterPrice } : o
                                  );
                                  setAdminOffers(updated);
                                  try {
                                    localStorage.setItem('us_admin_offers_v1', JSON.stringify(updated));
                                    window.dispatchEvent(new Event('offers_updated'));
                                  } catch (e) {}
                                  showSuccess(`Contra-oferta de $${statusBadge.counterPrice.toLocaleString()} USD aceita!`);
                                }
                              }}
                              className="px-3 py-1 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-lg text-xs transition-colors shadow-sm"
                            >
                              Aceitar (${statusBadge.counterPrice.toLocaleString()})
                            </button>
                          ) : statusBadge.isWinning ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {lot && !statusBadge.isEnded && (
                                <button
                                  onClick={() => handleOpenBidModal(lot)}
                                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg text-[11px] transition-colors"
                                >
                                  Aumentar
                                </button>
                              )}
                              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-[11px] font-bold border border-emerald-500/30">
                                {statusBadge.isEnded ? 'Arrematado' : 'Vencendo'}
                              </span>
                            </div>
                          ) : (
                            lot && (
                              <button
                                onClick={() => handleOpenBidModal(lot)}
                                className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-sm"
                              >
                                Cobrir Lance
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: LOTES ARREMATADOS & INVOICES */}
      {/* ========================================================= */}
      {activeTab === 'arrematados' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Lotes Homologados e Arrematados</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Aparelhos em processamento e conferência física no galpão de Miami Doral para expedição
              </p>
            </div>
          </div>

          <div className="p-6 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
            {/* Standard Primary Invoice Item */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-100 dark:bg-slate-950 rounded-xl border border-emerald-500/30 shadow-md">
              <div className="space-y-1">
                <span className="font-bold text-slate-900 dark:text-white text-sm block">Lote US-88201-MIA · 10x iPhone 15 Pro 128GB Grade A</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Arrematado em 02/11/2026 por <strong>$5.400 USD</strong> · <span className="text-amber-600 dark:text-amber-400 font-semibold">Aguardando Conferência e Embalo nosso Galpão em Doral</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  downloadOfficialInvoicePdf({
                    invoiceNumber: 'INV-2026-US88201',
                    date: '02/11/2026',
                    lotNumber: 'US-88201-MIA',
                    lotTitle: 'Lote Master 10x iPhone 15 Pro 128GB Grade A',
                    quantity: 10,
                    grade: 'Grade A',
                    totalUsd: 5400,
                    usdRate: usdRate,
                    user: currentUser,
                    warehouseStatus: 'Aguardando Conferência e Embalo nosso Galpão em Doral'
                  });
                  showSuccess('Invoice Oficial PDF gerada e pronta para impressão/download!');
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-2 shrink-0 shadow-md shadow-emerald-600/20 active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Invoice Oficial (PDF)</span>
              </button>
            </div>

            {/* Dynamic Accepted / Won Lots from adminOffers */}
            {adminOffers
              .filter(o => (o.clientEmail === currentUser.email || o.clientName === currentUser.name) && (o.status === 'Aceita' || o.status === 'Homologada / Arrematada'))
              .map(offer => (
                <div key={offer.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-100 dark:bg-slate-950 rounded-xl border border-emerald-500/30">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 dark:text-white text-sm block">Lote {offer.lotNumber} · {offer.lotTitle}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Homologado por <strong>${offer.amountUsd.toLocaleString()} USD</strong> · <span className="text-amber-600 dark:text-amber-400 font-semibold">Aguardando Conferência e Embalo nosso Galpão em Doral</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      downloadOfficialInvoicePdf({
                        invoiceNumber: `INV-${offer.lotNumber.replace(/[^A-Z0-9]/gi, '')}`,
                        date: offer.timestamp || 'Hoje',
                        lotNumber: offer.lotNumber,
                        lotTitle: offer.lotTitle,
                        quantity: 1,
                        grade: 'Grade A',
                        totalUsd: offer.amountUsd,
                        usdRate: usdRate,
                        user: currentUser,
                        warehouseStatus: 'Aguardando Conferência e Embalo nosso Galpão em Doral'
                      });
                      showSuccess(`Invoice Oficial PDF do lote ${offer.lotNumber} gerada!`);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-2 shrink-0 shadow-md active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Invoice Oficial (PDF)</span>
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: PERFIL DO ARREMATANTE & SUÍTE MIAMI */}
      {/* ========================================================= */}
      {activeTab === 'perfil' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dados do Arrematante</h2>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Nome do Titular / Razão Social:</span>
                <span className="text-slate-900 dark:text-white font-bold text-sm">{currentUser.name}</span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Documento ID:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{currentUser.cpfCnpj}</span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Consultor Responsável:</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">{currentUser.consultantName || '-'}</span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-400 block text-[11px]">E-mail Registrado:</span>
                <span className="text-slate-800 dark:text-slate-200">{currentUser.email}</span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-400 block text-[11px]">WhatsApp / Contato:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{currentUser.phone}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Limite Liberado para Arrematação:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-base">
                    ${currentUser.biddingLimitUsd.toLocaleString()} USD
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                  Verificado
                </span>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">Notificações de Ofertas via WhatsApp</span>
                <div>
                  <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">Número WhatsApp (com DDI/DDD):</label>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappEnabled}
                    onChange={(e) => setWhatsappEnabled(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <span>Receber avisos de Aceite, Recusa, Análise e Contra-Oferta no WhatsApp</span>
                </label>
                <button
                  type="button"
                  onClick={() => showSuccess('Preferências de notificação WhatsApp salvas com sucesso!')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors"
                >
                  Salvar Preferências WhatsApp
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Sua Suíte de Recebimento nos EUA
              </h2>
              <button
                onClick={copyMiamiAddress}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedAddress ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Use este endereço para entrega dos aparelhos arrematados nas plataformas americanas. Nossa equipe recebe, inspeciona e consolida os lotes para envio ao Brasil.
            </p>

            <div className="p-4 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-xs space-y-1.5 text-slate-800 dark:text-slate-200">
              <div><strong>Recipient:</strong> US iPhone Hub / {currentUser.name}</div>
              <div><strong>Address Line 1:</strong> 8350 NW 53rd Street</div>
              <div><strong>Address Line 2 (Suite):</strong> Suite 302 - Box BR-88201</div>
              <div><strong>City / State:</strong> Doral / Miami - Florida (FL)</div>
              <div><strong>ZIP Code:</strong> 33166-4702</div>
              <div><strong>Country:</strong> United States (USA)</div>
              <div><strong>Warehouse Phone:</strong> +1 (305) 555-0199</div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK BID / COMPRA DIRETA MODAL INSIDE CLIENT PANEL */}
      {quickBidLot && (() => {
        const isVzQuick = isVerizonLot(quickBidLot);
        const isProntaQuick = isProntaEntregaLot(quickBidLot);
        const isDiscountQuick = isDiscountBidAuction(quickBidLot);
        const clampedQuickUnits = Math.max(1, Math.min(quickBidLot.quantity, quickBidUnits));
        const fixedUnitQuick = getLotUnitPriceUsd(quickBidLot);
        const fixedTotalQuick = getLotFixedTotalForQtyUsd(quickBidLot, clampedQuickUnits);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className={`bg-white dark:bg-slate-900 border rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl ${isProntaQuick ? 'border-emerald-500/40' : 'border-slate-300 dark:border-slate-700'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">{quickBidLot.lotNumber}</span>
                    {isProntaQuick && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                        COMPRA DIRETA · PRONTA ENTREGA
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{quickBidLot.title}</h3>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{quickBidLot.quantity} aparelho(s) · {quickBidLot.grade}</span>
                </div>
                <button
                  onClick={() => setQuickBidLot(null)}
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                {isVzQuick ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Preço / Modelo Verizon:</span>
                      {quickBidLot.currentBidUsd === 0 ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">Sem Preço Fixo (Cliente Escolhe)</span>
                      ) : (
                        <span className="font-mono font-bold text-slate-900 dark:text-white">${quickBidLot.currentBidUsd.toLocaleString()} USD</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-red-700 dark:text-red-300 font-medium">
                      <span>Quantidade Fixa (Lote Fechado):</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{quickBidLot.quantity} unidade(s)</span>
                    </div>
                  </>
                ) : isProntaQuick ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Preço Unitário Fixo (Pronta Entrega):</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${fixedUnitQuick.toLocaleString()} USD / un.
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-300 font-medium">
                      <span>Regra:</span>
                      <span className="flex items-center gap-1 font-semibold">
                        <Lock className="w-3 h-3" />
                        <span>Valor fixo (escolha apenas a quantidade)</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">
                        {isAssurantLot(quickBidLot) && quickBidLot.quantity > 1 ? 'Valor Unitário (Assurant):' : 'Lance Atual no Leilão:'}
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ${quickBidLot.currentBidUsd.toLocaleString()} USD{isAssurantLot(quickBidLot) && quickBidLot.quantity > 1 ? ' / un.' : ''}
                      </span>
                    </div>

                    {isAssurantLot(quickBidLot) ? (
                      <>
                        <div className="flex justify-between items-center text-blue-700 dark:text-blue-300 font-medium">
                          <span>Média lance aprovado arremate anterior:</span>
                          <span className="font-mono font-bold">
                            ${getAssurantPreviousApprovedBid(quickBidLot).toLocaleString()} USD{quickBidLot.quantity > 1 ? ' / un.' : ''}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-cyan-700 dark:text-cyan-300 font-medium">
                          <span>Incremento (Assurant):</span>
                          <span className="font-mono font-bold">
                            {getLotIncrementSize(quickBidLot)} un.
                          </span>
                        </div>
                      </>
                    ) : isDiscountQuick ? (
                      <div className="flex justify-between items-center text-cyan-700 dark:text-cyan-300 font-medium">
                        <span>Oferta Livre (Análise):</span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">Pode enviar valor menor</span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Lance Base Atual:</span>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">${quickBidLot.currentBidUsd.toLocaleString()} USD</span>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span>{isProntaQuick ? 'Conversão PTAX do total:' : 'Conversão PTAX da sua oferta:'}</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    aprox. R$ {(((isProntaQuick ? fixedTotalQuick : quickBidAmount) || 0) * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    {!isProntaQuick && isAssurantLot(quickBidLot) && quickBidUnits > 1 ? ' / un.' : ''}
                  </span>
                </div>
              </div>

              {/* Seletor de Unidades (exceto Verizon, que exige lote fechado) */}
              {isVzQuick ? (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-500/30 rounded-xl text-xs text-red-800 dark:text-red-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                    <span>Quantidade Fixa (Verizon - Lote Fechado):</span>
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{quickBidLot.quantity} unidade(s)</span>
                </div>
              ) : (() => {
                const isAssurantQuick = isAssurantLot(quickBidLot);
                const incSizeQuick = getLotIncrementSize(quickBidLot);
                const qtyStepQuick = isAssurantQuick ? getLotEffectiveQuantityStep(quickBidLot) : 1;
                return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {isProntaQuick ? `Quantidade para Compra (Máx: ${quickBidLot.quantity}):` : `Quantidade de Unidades (Máx: ${quickBidLot.quantity}):`}
                    </label>
                    <span className={`text-[11px] font-mono ${isProntaQuick ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {isAssurantQuick ? `Inc: ${incSizeQuick} un.` : `1 a ${quickBidLot.quantity} un.`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickBidUnits(u => Math.max(qtyStepQuick, u - qtyStepQuick))}
                      disabled={quickBidUnits <= qtyStepQuick}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-900 dark:text-white font-bold rounded-lg text-xs"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={qtyStepQuick}
                      max={quickBidLot.quantity}
                      step={qtyStepQuick}
                      value={quickBidUnits}
                      onChange={e => {
                        const rawVal = parseInt(e.target.value || String(qtyStepQuick), 10);
                        let next = Math.max(qtyStepQuick, Math.min(quickBidLot.quantity, isNaN(rawVal) ? qtyStepQuick : rawVal));
                        if (qtyStepQuick > 1 && next < quickBidLot.quantity) {
                          next = Math.max(qtyStepQuick, Math.min(quickBidLot.quantity, Math.round(next / qtyStepQuick) * qtyStepQuick));
                        }
                        setQuickBidUnits(next);
                      }}
                      className={`w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-center text-slate-900 dark:text-white focus:outline-none ${isProntaQuick ? 'focus:border-emerald-400' : 'focus:border-amber-400'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setQuickBidUnits(u => Math.min(quickBidLot.quantity, u + qtyStepQuick))}
                      disabled={quickBidUnits >= quickBidLot.quantity}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-900 dark:text-white font-bold rounded-lg text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
                );
              })()}

              {isProntaQuick ? (
                <div className="p-4 bg-slate-100 dark:bg-slate-950 border border-emerald-500/35 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Total da Compra Direta (Preço Fixo):</span>
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 block mt-0.5">
                      {clampedQuickUnits} {clampedQuickUnits === 1 ? 'unidade' : 'unidades'} × ${fixedUnitQuick.toLocaleString()} USD
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono block">
                      $ {fixedTotalQuick.toLocaleString()} USD
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                      aprox. R$ {(fixedTotalQuick * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {isVzQuick ? 'Escolha o Valor da Sua Oferta em Dólar (USD):' : 'Seu Lance em Dólar (USD):'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-mono font-bold">$</span>
                      <input
                        type="number"
                        min={1}
                        step="any"
                        value={quickBidAmount || ''}
                        placeholder={isVzQuick ? 'Digite o valor em USD (ex: 1500)' : isDiscountQuick ? 'Digite um valor em USD' : undefined}
                        onChange={e => setQuickBidAmount(Number(e.target.value))}
                        className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    {/* Presets */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {isDiscountQuick ? (
                        <>
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">Sugestões:</span>
                          {[5, 10, 15, 25].map(delta => {
                            const target = Math.max(1, quickBidLot.currentBidUsd - delta);
                            return (
                              <button
                                key={delta}
                                type="button"
                                onClick={() => setQuickBidAmount(target)}
                                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                                  quickBidAmount === target
                                    ? 'bg-amber-500 text-slate-950 font-bold'
                                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                - ${delta}
                              </button>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">Sugestões:</span>
                          {[5, 10, 15, 25].map(inc => {
                            const target =
                              quickBidLot.currentBidUsd > 0
                                ? quickBidLot.currentBidUsd + inc
                                : (quickBidAmount || 0) + inc;
                            return (
                              <button
                                key={inc}
                                type="button"
                                onClick={() => setQuickBidAmount(target)}
                                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                                  quickBidLot.currentBidUsd > 0 && quickBidAmount === target
                                    ? 'bg-amber-500 text-slate-950 font-bold'
                                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                +${inc}
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sniperEnabled}
                        onChange={e => setSniperEnabled(e.target.checked)}
                        className="rounded bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-amber-600 dark:text-amber-400 focus:ring-amber-400"
                      />
                      <span>Ativar Sniper (Lance nos últimos 4s)</span>
                    </label>
                  </div>
                </>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickBidLot(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBid}
                  className={`flex-1 py-2.5 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-md ${
                    isProntaQuick
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/15'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/10'
                  }`}
                >
                  {isProntaQuick ? <ShoppingBag className="w-4 h-4" /> : <Gavel className="w-4 h-4" />}
                  <span>{isProntaQuick ? `Confirmar Compra (${clampedQuickUnits} un.)` : isVzQuick ? 'Enviar Oferta Livre' : 'Confirmar Lance'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
