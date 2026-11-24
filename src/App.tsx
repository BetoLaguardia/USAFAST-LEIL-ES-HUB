import React, { useState, useMemo, useEffect } from 'react';
import { Header, AppPage } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { AuctionCard } from './components/AuctionCard';
import { AuctionDetailModal } from './components/AuctionDetailModal';
import { AuctionSystemModal } from './components/AuctionSystemModal';
import { ModelCarousel } from './components/ModelCarousel';
import { GradingGuideModal } from './components/GradingGuideModal';
import { ImportCalculatorModal } from './components/ImportCalculatorModal';
import { QuemSomosPage } from './pages/QuemSomosPage';
import { GradeamentoPage } from './pages/GradeamentoPage';
import { AdminPage } from './pages/AdminPage';
import { ClientePage } from './pages/ClientePage';
import { AdminLoginGate, ClientLoginGate } from './components/AuthGates';
import { INITIAL_AUCTIONS, DEFAULT_PTAX_USD_BRL, GRADE_EXPLANATIONS } from './data/auctionsData';
import { AuctionLot, GradeType, SystemUser, AdminOffer } from './types/auction';
import { apiService } from './services/apiService';
import { supabase } from './services/supabaseClient';
import {
  clearLegacyAuthStorage,
  EMPTY_SYSTEM_USER,
  restoreSupabaseSession,
  signOutFromSupabase,
} from './services/authService';
import { Language, TRANSLATIONS } from './utils/i18n';
import { fetchLivePtaxRate } from './utils/ptaxService';
import { stripLotPrefix } from './utils/deviceImages';
import { isVerizonLot, isTMobileLot, getMarketplaceNumber, isLotUnlockedOnly, getLotMixSummary, VERIZON_GRADES, normalizeVerizonLot, mapVerizonGradeStrict } from './utils/verizonUtils';
import { isAssurantLot, getLotUnitPriceUsd, getLotTotalPriceUsd, getLotIncrementSize } from './utils/assurantUtils';
import { LotMixBadgesAndTrigger, LotMixExpandablePanel } from './components/LotMixExpandable';
import { exportAuctionsCatalogXlsx, exportAuctionsCatalogPdf } from './utils/styledExports';
import { 
  Search, 
  Filter, 
  Layers, 
  Gavel, 
  Calculator, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  MapPin, 
  SlidersHorizontal,
  Package,
  FileSpreadsheet,
  FileText,
  List,
  Lock,
  Sparkles,
  UserCheck,
  Download,
  Server,
  LayoutGrid,
  CheckSquare,
  Square,
  Smartphone,
  Clock
} from 'lucide-react';

export default function App() {
  // Navigation Page State
  const [currentPage, setCurrentPage] = useState<AppPage>('home');

  // Auction State with Persistent LocalStorage
  const [auctions, setAuctions] = useState<AuctionLot[]>(() => {
    try {
      if (localStorage.getItem('us_iphone_auctions_cleared') === 'true') {
        return [];
      }
      const saved = localStorage.getItem('us_iphone_auctions_v1');
      if (saved) {
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Exclude legacy mock auction platforms (e.g. GovDeals, Copart, liquidation.com)
          parsed = parsed.filter((a: any) => {
            const house = (a.auctionHouse || '').toLowerCase();
            const title = (a.title || '').toLowerCase();
            const src = (a.sourceType || '').toLowerCase();
            if (house.includes('govdeals') || title.includes('govdeals') || src.includes('govdeals')) return false;
            if (house.includes('copart') || title.includes('copart') || src.includes('copart')) return false;
            if (house.includes('liquidation.com') || title.includes('liquidation.com')) return false;
            if (house.includes('apple certified') || title.includes('apple certified')) return false;
            return true;
          });
          // Sanitize titles and normalize Verizon grades strictly to DNA/DNB/DNC/DND
          parsed = parsed.map((a: any) => normalizeVerizonLot({
            ...a,
            title: stripLotPrefix(a.title)
          }));
          const hasAssurant = parsed.some((a: any) => a.sourceType === 'ASSURANT');
          if (!hasAssurant) {
            const defaultAssurant = INITIAL_AUCTIONS.filter(a => a.sourceType === 'ASSURANT');
            return [...defaultAssurant, ...parsed];
          }
          if (parsed.length > 0) return parsed;
        }
      }
    } catch (e) {
      // ignore
    }
    return INITIAL_AUCTIONS;
  });

  const [currency, setCurrency] = useState<'USD' | 'BRL'>('USD');
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('us_iphone_lang');
      if (saved === 'pt' || saved === 'es' || saved === 'en') return saved;
    } catch (e) {}
    return 'pt';
  });

  const [expandedMixLotIds, setExpandedMixLotIds] = useState<Record<string, boolean>>({});
  const toggleMixExpand = (lotId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedMixLotIds(prev => ({ ...prev, [lotId]: !prev[lotId] }));
  };

  const handleSelectLanguage = (lang: Language) => {
    setLanguage(lang);
    try {
      localStorage.setItem('us_iphone_lang', lang);
    } catch (e) {}
  };

  const t = TRANSLATIONS[language];

  const [usdRate, setUsdRate] = useState<number>(() => {
    try {
      const savedRate = localStorage.getItem('us_ptax_rate');
      if (savedRate) return parseFloat(savedRate) || DEFAULT_PTAX_USD_BRL;
    } catch (e) {}
    return DEFAULT_PTAX_USD_BRL;
  });

  const [ptaxInfo, setPtaxInfo] = useState<{ isOnline: boolean; source: string; lastUpdated: string }>({
    isOnline: true,
    source: 'Banco Central do Brasil (PTAX)',
    lastUpdated: ''
  });

  const loadLivePtax = async () => {
    try {
      const res = await fetchLivePtaxRate();
      if (res && res.rate) {
        setUsdRate(res.rate);
        try {
          localStorage.setItem('us_ptax_rate', String(res.rate));
        } catch (e) {}
        setPtaxInfo({
          isOnline: res.isOnline,
          source: res.source,
          lastUpdated: res.lastUpdated
        });
      }
    } catch (err) {
      console.error('Error loading live PTAX:', err);
    }
  };

  useEffect(() => {
    loadLivePtax();
  }, []);

  const handleUpdateUsdRate = (rate: number) => {
    setUsdRate(rate);
    try {
      localStorage.setItem('us_ptax_rate', String(rate));
    } catch (e) {}
  };

  // User & Bidding State (hydrated from Supabase Auth session)
  const [currentUser, setCurrentUser] = useState<SystemUser>(EMPTY_SYSTEM_USER);

  const handleUpdateCurrentUser = (user: SystemUser) => {
    setCurrentUser(user);
  };

  // Authentication Gates State (Admin and Client via Supabase Auth)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [isClientAuthenticated, setIsClientAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    clearLegacyAuthStorage();
    let active = true;

    restoreSupabaseSession().then((res) => {
      if (!active) return;
      setIsAdminAuthenticated(res.isAdmin);
      setIsClientAuthenticated(res.isClient);
      setCurrentUser(res.user);
    });

    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setIsAdminAuthenticated(false);
        setIsClientAuthenticated(false);
        setCurrentUser(EMPTY_SYSTEM_USER);
      }
    }).data.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const handleAdminLogout = async () => {
    await signOutFromSupabase();
    setIsAdminAuthenticated(false);
    setIsClientAuthenticated(false);
    setCurrentUser(EMPTY_SYSTEM_USER);
    setCurrentPage('home');
    showToast('Sessão administrativa encerrada.');
  };

  const handleClientLogout = async () => {
    await signOutFromSupabase();
    setIsClientAuthenticated(false);
    setIsAdminAuthenticated(false);
    setCurrentUser(EMPTY_SYSTEM_USER);
    setCurrentPage('home');
    showToast('Sessão do arrematante encerrada.');
  };

  const [userBids, setUserBids] = useState<{
    lotId: string;
    lotTitle: string;
    amountUsd: number;
    timestamp: string;
    status: 'vencendo' | 'superado';
  }[]>(() => {
    try {
      const savedBids = localStorage.getItem('us_iphone_user_bids');
      if (savedBids) return JSON.parse(savedBids);
    } catch (e) {}
    return [];
  });

  // Modals State
  const [selectedLotForDetail, setSelectedLotForDetail] = useState<AuctionLot | null>(null);
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);
  const [systemModalTab, setSystemModalTab] = useState<'terminal' | 'register'>('terminal');
  const [isGradingModalOpen, setIsGradingModalOpen] = useState(false);
  const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState(false);
  const [calculatorInitData, setCalculatorInitData] = useState({ priceUsd: 7450, units: 10 });

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModel, setFilterModel] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterCapacity, setFilterCapacity] = useState<string>('all');
  const [filterLotType, setFilterLotType] = useState<string>('all');
  const [filterAuctionHouse, setFilterAuctionHouse] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'endingSoon' | 'priceAsc' | 'priceDesc' | 'profitDesc' | 'mostBids'>('endingSoon');

  // View Mode in Active Auctions catalog (List vs Cards)
  const [auctionsViewMode, setAuctionsViewMode] = useState<'list' | 'cards'>('list');
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);

  // Quick Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const hasLocalUpdateRef = React.useRef(false);

  const UNSYNCED_FLAG_KEY = 'us_iphone_unsynced_local';
  const CLEARED_FLAG_KEY = 'us_iphone_auctions_cleared';

  const syncAuctionsToSupabaseDirect = async (lots: AuctionLot[]): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error: deleteError } = await supabase
        .from('leiloes_importados')
        .delete()
        .neq('id', 0);
      if (deleteError) return false;

      if (lots.length === 0) return true;

      const chunkSize = 150;
      for (let i = 0; i < lots.length; i += chunkSize) {
        const chunk = lots.slice(i, i + chunkSize).map(lot => ({ data: lot }));
        const { error: insertError } = await supabase
          .from('leiloes_importados')
          .insert(chunk);
        if (insertError) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const fetchAuctionsFromSupabaseDirect = async (): Promise<AuctionLot[] | null> => {
    if (!supabase) return null;
    try {
      const pageSize = 1000;
      let from = 0;
      const allRows: AuctionLot[] = [];
      while (true) {
        const { data: rows, error } = await supabase
          .from('leiloes_importados')
          .select('data')
          .range(from, from + pageSize - 1);
        if (error) return null;
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
          if (r && r.data) allRows.push(r.data as AuctionLot);
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return allRows;
    } catch {
      return null;
    }
  };

  const postAuctionsToBackend = async (lots: AuctionLot[]): Promise<boolean> => {
    try {
      if (lots.length === 0) {
        const res = await fetch('/api/auctions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auctions: [], mode: 'clear' })
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!data || !data.ok) {
          throw new Error(data?.error || 'Falha ao limpar lotes');
        }
        console.log('[App.tsx] Backend /api/auctions POST cleared all lots');
        return true;
      }

      const chunkSize = 1000;
      for (let i = 0; i < lots.length; i += chunkSize) {
        const chunk = lots.slice(i, i + chunkSize);
        const mode = i === 0 ? 'replace' : 'append';
        const res = await fetch('/api/auctions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auctions: chunk, mode })
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!data || !data.ok) {
          throw new Error(data?.error || 'Falha ao salvar lote');
        }
      }
      console.log(`[App.tsx] Backend /api/auctions POST synced ${lots.length} lots`);
      return true;
    } catch (err) {
      console.warn('[App.tsx] Backend /api/auctions POST failed, trying direct Supabase fallback:', err);
    }

    const directOk = await syncAuctionsToSupabaseDirect(lots);
    if (directOk) {
      console.log('[App.tsx] Direct Supabase batch sync succeeded!');
      return true;
    }
    return false;
  };

  const saveAuctionsLocalCache = (lots: AuctionLot[]): boolean => {
    try {
      if (lots.length === 0) {
        localStorage.setItem(CLEARED_FLAG_KEY, 'true');
        localStorage.removeItem('us_iphone_auctions_v1');
        return true;
      }
      localStorage.removeItem(CLEARED_FLAG_KEY);
      const serialized = JSON.stringify(lots);
      // Keep localStorage under ~2MB so auth tokens, bids, and offers never hit quota limits
      if (serialized.length > 2_000_000) {
        localStorage.removeItem('us_iphone_auctions_v1');
        return false;
      }
      localStorage.setItem('us_iphone_auctions_v1', serialized);
      return true;
    } catch {
      try {
        localStorage.removeItem('us_iphone_auctions_v1');
      } catch {}
      return false;
    }
  };

  // Helper to persist auctions (safe localStorage cache + backend /api/auctions for cross-device sync)
  const handleUpdateAuctions = (newAuctions: AuctionLot[]) => {
    hasLocalUpdateRef.current = true;
    setAuctions(newAuctions);
    const cachedLocally = saveAuctionsLocalCache(newAuctions);

    if (cachedLocally) {
      try {
        localStorage.setItem(UNSYNCED_FLAG_KEY, 'true');
      } catch {}
    }

    postAuctionsToBackend(newAuctions).then(synced => {
      if (synced) {
        try {
          localStorage.removeItem(UNSYNCED_FLAG_KEY);
        } catch {}
      }
    });
  };

  useEffect(() => {
    console.log('[App.tsx] Fetching initial auctions from /api/auctions...');
    const sanitizeLots = (lots: any[]): AuctionLot[] => {
      const banned = /govdeals|copart|liquidation\.com|apple certified/i;
      return (lots || [])
        .filter(l => !banned.test(l.auctionHouse || '') && !banned.test(l.title || '') && !banned.test(l.sourceType || '') && isLotUnlockedOnly(l))
        .map(l => normalizeVerizonLot({ ...l, title: stripLotPrefix(l.title) }));
    };

    const loadInitialAuctions = async () => {
      let backendLots: AuctionLot[] = [];
      let backendLoadedOk = false;

      try {
        const pageSize = 1000;
        let offset = 0;
        const collected: any[] = [];

        while (true) {
          const res = await fetch(`/api/auctions?limit=${pageSize}&offset=${offset}`, { cache: 'no-store' });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          if (!data || !Array.isArray(data.auctions)) {
            break;
          }
          backendLoadedOk = true;
          if (data.auctions.length === 0) {
            break;
          }
          collected.push(...data.auctions);
          if (!data.hasMore) {
            break;
          }
          offset += data.auctions.length;
        }

        if (collected.length > 0) {
          backendLots = sanitizeLots(collected);
        }
      } catch (err) {
        console.warn('[App.tsx] Initial fetch from /api/auctions failed, trying Supabase fallback:', err);
      }

      if (!backendLoadedOk) {
        const directLots = await fetchAuctionsFromSupabaseDirect();
        if (directLots !== null) {
          backendLoadedOk = true;
          backendLots = sanitizeLots(directLots);
        }
      }

      if (hasLocalUpdateRef.current) return;

      let localLots: AuctionLot[] = [];
      let hasUnsyncedLocal = false;
      let isLocallyCleared = false;
      try {
        hasUnsyncedLocal = localStorage.getItem(UNSYNCED_FLAG_KEY) === 'true';
        isLocallyCleared = localStorage.getItem(CLEARED_FLAG_KEY) === 'true';
        const saved = localStorage.getItem('us_iphone_auctions_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) localLots = sanitizeLots(parsed);
        }
      } catch (e) {}

      if (hasUnsyncedLocal && isLocallyCleared) {
        console.log('[App.tsx] Pushing pending clear state to backend...');
        setAuctions([]);
        const synced = await postAuctionsToBackend([]);
        if (synced) {
          try {
            localStorage.removeItem(UNSYNCED_FLAG_KEY);
          } catch (e) {}
        }
      } else if (hasUnsyncedLocal && localLots.length > 0) {
        console.log(`[App.tsx] Pushing ${localLots.length} unsynced local lots to backend...`);
        setAuctions(localLots);
        const synced = await postAuctionsToBackend(localLots);
        if (synced) {
          try {
            localStorage.removeItem(UNSYNCED_FLAG_KEY);
          } catch (e) {}
        }
      } else if (backendLoadedOk) {
        console.log(`[App.tsx] Loaded ${backendLots.length} lots from backend /api/auctions`);
        setAuctions(backendLots);
        saveAuctionsLocalCache(backendLots);
      }
    };

    loadInitialAuctions();
  }, []);

  // Real-time live bidding polling effect (connects to PHP or simulated live pool)
  useEffect(() => {
    const cfg = apiService.getConfig();
    if (!cfg.autoPollBids) return;

    const interval = setInterval(async () => {
      try {
        const liveBid = await apiService.pollLatestBids(auctions);
        if (liveBid && liveBid.newBidAmount) {
          setAuctions(prev => {
            let hasChanges = false;
            const next = prev.map(lot => {
              const isMatch = lot.id === liveBid.lotId || lot.lotNumber === liveBid.lotId;
              if (isMatch && liveBid.newBidAmount > lot.currentBidUsd) {
                hasChanges = true;
                return {
                  ...lot,
                  currentBidUsd: liveBid.newBidAmount,
                  totalBidsCount: lot.totalBidsCount + 1,
                  bidsHistory: [
                    {
                      id: `bid-live-${Date.now()}`,
                      bidderName: liveBid.bidderName || 'Licitante EUA Concorrente',
                      amountUsd: liveBid.newBidAmount,
                      timestamp: 'Agora'
                    },
                    ...lot.bidsHistory
                  ]
                };
              }
              return lot;
            });
            return hasChanges ? next : prev;
          });
        }
      } catch (e) {
        // silent fallback
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Place a Bid Handler (Connected to PHP API / Simulated Bridge)
  const handlePlaceBid = (lotId: string, amountUsd: number, selectedQuantity?: number) => {
    const targetLot = auctions.find(a => a.id === lotId);
    const bidQty = targetLot
      ? (isVerizonLot(targetLot)
          ? targetLot.quantity
          : Math.max(1, Math.min(Math.max(1, targetLot.quantity), selectedQuantity || targetLot.quantity)))
      : (selectedQuantity || 1);

    const baseBidderName = currentUser.name ? `${currentUser.name} (Você)` : 'Arrematante Autorizado (Você)';
    const bidderLabel = targetLot && bidQty < targetLot.quantity
      ? `${baseBidderName} (${bidQty} de ${targetLot.quantity} un.)`
      : baseBidderName;

    // Trigger API / Backend submission
    apiService.submitBid(lotId, amountUsd, bidderLabel).catch(err => {
      console.warn('Falha no envio da API PHP, operando localmente:', err);
    });

    const updatedAuctions = auctions.map(lot => {
      if (lot.id === lotId) {
        const newBidHistory = [
          {
            id: `bid-${Date.now()}`,
            bidderName: bidderLabel,
            amountUsd,
            timestamp: 'Agora'
          },
          ...lot.bidsHistory
        ];
        const shouldUpdateLotCurrentBid =
          lot.currentBidUsd === 0 || (bidQty >= lot.quantity && amountUsd > lot.currentBidUsd) || amountUsd > lot.currentBidUsd;
        return {
          ...lot,
          currentBidUsd: shouldUpdateLotCurrentBid ? amountUsd : lot.currentBidUsd,
          totalBidsCount: lot.totalBidsCount + 1,
          bidsHistory: newBidHistory
        };
      }
      return lot;
    });

    handleUpdateAuctions(updatedAuctions);

    if (targetLot) {
      const lotTitleWithQty = bidQty < targetLot.quantity
        ? `${targetLot.title} (${bidQty} de ${targetLot.quantity} un.)`
        : targetLot.title;

      const updatedBids = [
        {
          lotId,
          lotTitle: lotTitleWithQty,
          amountUsd,
          timestamp: 'Agora mesmo',
          status: 'vencendo' as const
        },
        ...userBids.filter(b => b.lotId !== lotId)
      ];
      setUserBids(updatedBids);
      try {
        localStorage.setItem('us_iphone_user_bids', JSON.stringify(updatedBids));
      } catch (e) {}

      // Real-time synchronization with Admin Console ("Ofertas Computadas")
      try {
        const savedAdminOffers = localStorage.getItem('us_admin_offers_v1');
        const curOffers: AdminOffer[] = savedAdminOffers ? JSON.parse(savedAdminOffers) : [];
        const newAdminOffer: AdminOffer = {
          id: `off-${Date.now()}`,
          lotId,
          lotNumber: targetLot.lotNumber || `US-${lotId.slice(-5)}`,
          lotTitle: lotTitleWithQty,
          clientName: currentUser.name || 'Arrematante Autorizado',
          clientEmail: currentUser.email || 'cliente@usafastleiloes.com',
          amountUsd,
          amountBrl: Math.round(amountUsd * usdRate),
          timestamp: 'Agora mesmo',
          status: 'Vencendo',
          isAutoSniper: false
        };
        const nextAdminOffers = [newAdminOffer, ...curOffers.filter(o => o.lotId !== lotId)];
        localStorage.setItem('us_admin_offers_v1', JSON.stringify(nextAdminOffers));
      } catch (e) {}
    }

    showToast(`⚡ Lance de $${amountUsd.toLocaleString()} USD (${bidQty} un.) computado com sucesso!`);
  };

  const handleOpenSystem = (tab: 'terminal' | 'register' = 'terminal') => {
    if (tab === 'terminal') {
      setCurrentPage('cliente');
    } else {
      setSystemModalTab(tab);
      setIsSystemModalOpen(true);
    }
  };

  const handleOpenCalculatorForLot = (lot: AuctionLot) => {
    setCalculatorInitData({
      priceUsd: getLotTotalPriceUsd(lot),
      units: lot.quantity
    });
    setIsCalculatorModalOpen(true);
  };

  // Dynamic list of all imported models for the selected auction (or all auctions)
  const availableImportedModels = useMemo(() => {
    const sourceLots = filterAuctionHouse === 'all'
      ? auctions
      : filterAuctionHouse === 'VERIZON'
        ? auctions.filter(a => a.sourceType === 'VERIZON' || /verizon/i.test(a.auctionHouse))
        : filterAuctionHouse === 'ASSURANT'
          ? auctions.filter(a => a.sourceType === 'ASSURANT' || /assurant/i.test(a.auctionHouse))
          : filterAuctionHouse === 'T_MOBILE'
            ? auctions.filter(a => isTMobileLot(a))
            : filterAuctionHouse === 'MARKETPLACE_1'
              ? auctions.filter(a => getMarketplaceNumber(a) === 1)
              : filterAuctionHouse === 'MARKETPLACE_2'
                ? auctions.filter(a => getMarketplaceNumber(a) === 2)
                : filterAuctionHouse === 'MARKETPLACE_3'
                  ? auctions.filter(a => getMarketplaceNumber(a) === 3)
                  : filterAuctionHouse === 'MARKETPLACE_4'
                    ? auctions.filter(a => getMarketplaceNumber(a) === 4)
                    : auctions.filter(a => a.auctionHouse === filterAuctionHouse);

    const modelMap = new Map<string, { model: string; count: number; totalUnits: number }>();

    sourceLots.forEach(lot => {
      const house = (lot.auctionHouse || '').toLowerCase();
      const title = (lot.title || '').toLowerCase();
      if (house.includes('govdeals') || title.includes('govdeals')) return;
      if (house.includes('copart') || title.includes('copart')) return;
      if (house.includes('liquidation.com') || title.includes('liquidation.com')) return;
      if (house.includes('apple certified') || title.includes('apple certified')) return;
      if (house.includes('pronta entrega') || title.includes('pronta entrega')) return;
      if (!isLotUnlockedOnly(lot)) return;

      const m = (lot.modelFamily || 'Outros').trim();
      const current = modelMap.get(m) || { model: m, count: 0, totalUnits: 0 };
      current.count += 1;
      current.totalUnits += (lot.quantity || 1);
      modelMap.set(m, current);
    });

    return Array.from(modelMap.values()).sort((a, b) => b.totalUnits - a.totalUnits);
  }, [auctions, filterAuctionHouse]);

  // Dynamic list of grades belonging ONLY to the currently selected auction (and model)
  const availableGrades = useMemo(() => {
    const GRADE_ORDER = ['Grade A+', 'Grade A', 'Grade B', 'Grade C', 'Grade D', 'DNA', 'DNB', 'DNC', 'DND'];
    const sourceLots = auctions.filter(lot => {
      const house = (lot.auctionHouse || '').toLowerCase();
      const title = (lot.title || '').toLowerCase();
      if (house.includes('govdeals') || title.includes('govdeals')) return false;
      if (house.includes('copart') || title.includes('copart')) return false;
      if (house.includes('liquidation.com') || title.includes('liquidation.com')) return false;
      if (house.includes('apple certified') || title.includes('apple certified')) return false;
      if (house.includes('pronta entrega') || title.includes('pronta entrega')) return false;
      if (!isLotUnlockedOnly(lot)) return false;

      if (filterAuctionHouse === 'VERIZON') {
        if (!isVerizonLot(lot)) return false;
      } else if (filterAuctionHouse === 'ASSURANT') {
        if (lot.sourceType !== 'ASSURANT' && !/assurant/i.test(lot.auctionHouse || '')) return false;
      } else if (filterAuctionHouse === 'T_MOBILE') {
        if (!isTMobileLot(lot)) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_1') {
        if (getMarketplaceNumber(lot) !== 1) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_2') {
        if (getMarketplaceNumber(lot) !== 2) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_3') {
        if (getMarketplaceNumber(lot) !== 3) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_4') {
        if (getMarketplaceNumber(lot) !== 4) return false;
      } else if (filterAuctionHouse !== 'all') {
        if (lot.auctionHouse !== filterAuctionHouse && lot.sourceType !== filterAuctionHouse) return false;
      }

      if (filterModel !== 'all') {
        const hasInManifest = (lot.manifest || []).some(m => m.model === filterModel);
        if (lot.modelFamily !== filterModel && !hasInManifest) return false;
      }

      return true;
    });

    const gradeSet = new Set<string>();
    sourceLots.forEach(lot => {
      if (isVerizonLot(lot)) {
        gradeSet.add(mapVerizonGradeStrict(lot.grade));
      } else {
        const cleaned = (lot.grade || '').replace(/\(T\)/gi, '').trim();
        if (cleaned) gradeSet.add(cleaned);
      }
    });

    return Array.from(gradeSet).sort((a, b) => {
      const idxA = GRADE_ORDER.indexOf(a);
      const idxB = GRADE_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [auctions, filterAuctionHouse, filterModel]);

  useEffect(() => {
    if (filterGrade !== 'all' && !availableGrades.includes(filterGrade)) {
      setFilterGrade('all');
    }
  }, [availableGrades, filterGrade]);

  // Selection handlers for List Mode
  const handleToggleSelectLot = (lotId: string) => {
    setSelectedLotIds(prev =>
      prev.includes(lotId) ? prev.filter(id => id !== lotId) : [...prev, lotId]
    );
  };

  const handleSelectAllOnPage = () => {
    const pageLotIds = paginatedAuctions.map(l => l.id);
    const allSelected = pageLotIds.length > 0 && pageLotIds.every(id => selectedLotIds.includes(id));
    if (allSelected) {
      setSelectedLotIds(prev => prev.filter(id => !pageLotIds.includes(id)));
    } else {
      setSelectedLotIds(prev => Array.from(new Set([...prev, ...pageLotIds])));
    }
  };

  const handleOpenCalculatorForSelected = () => {
    const selectedLotsObjects = auctions.filter(a => selectedLotIds.includes(a.id));
    if (selectedLotsObjects.length === 0) return;
    const totalUnits = selectedLotsObjects.reduce((acc, l) => acc + (l.quantity || 1), 0);
    const totalPriceUsd = Math.round(
      selectedLotsObjects.reduce((acc, l) => acc + getLotTotalPriceUsd(l), 0)
    );
    setCalculatorInitData({
      priceUsd: totalPriceUsd,
      units: totalUnits
    });
    setIsCalculatorModalOpen(true);
  };

  // Filtered & Sorted Auctions
  const filteredAuctions = useMemo(() => {
    return auctions.filter(lot => {
      // 0. Exclude non-spreadsheet auctions (GovDeals, Copart, Liquidation.com, Apple Certified, etc.)
      const house = (lot.auctionHouse || '').toLowerCase();
      const title = (lot.title || '').toLowerCase();
      if (house.includes('govdeals') || title.includes('govdeals')) return false;
      if (house.includes('copart') || title.includes('copart')) return false;
      if (house.includes('liquidation.com') || title.includes('liquidation.com')) return false;
      if (house.includes('apple certified') || title.includes('apple certified')) return false;
      if (house.includes('pronta entrega') || title.includes('pronta entrega')) return false;
      if (!isLotUnlockedOnly(lot)) return false;

      // 1. Clean grade representation
      const cleanGrade = isVerizonLot(lot)
        ? mapVerizonGradeStrict(lot.grade)
        : (lot.grade || '').replace(/\(T\)/gi, '').trim();

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = stripLotPrefix(lot.title).toLowerCase().includes(query) || lot.title.toLowerCase().includes(query);
        const matchesLotNum = lot.lotNumber.toLowerCase().includes(query);
        const matchesModel = lot.modelFamily.toLowerCase().includes(query);
        const matchesLoc = lot.location.toLowerCase().includes(query);
        const matchesStorage = lot.primaryStorage.toLowerCase().includes(query);
        const matchesOem = (lot.oemBrand || '').toLowerCase().includes(query);
        const matchesHouse = (lot.auctionHouse || '').toLowerCase().includes(query);
        const matchesSource = (lot.sourceType || '').toLowerCase().includes(query);
        const matchesManifest = (lot.manifest || []).some(
          m =>
            (m.model || '').toLowerCase().includes(query) ||
            (m.storage || '').toLowerCase().includes(query) ||
            (m.color || '').toLowerCase().includes(query)
        );
        if (!matchesTitle && !matchesLotNum && !matchesModel && !matchesLoc && !matchesStorage && !matchesOem && !matchesHouse && !matchesSource && !matchesManifest) {
          return false;
        }
      }

      // Filter by Model
      if (filterModel !== 'all') {
        const hasInManifest = (lot.manifest || []).some(m => m.model === filterModel);
        if (lot.modelFamily !== filterModel && !hasInManifest) {
          return false;
        }
      }

      // Filter by Grade
      if (filterGrade !== 'all' && cleanGrade !== filterGrade && lot.grade !== filterGrade) {
        return false;
      }

      // Filter by Capacity
      if (filterCapacity !== 'all') {
        const capUpper = filterCapacity.toUpperCase();
        const matchesCap =
          lot.primaryStorage.toUpperCase().includes(capUpper) ||
          (lot.manifest || []).some(m => (m.storage || '').toUpperCase().includes(capUpper));
        if (!matchesCap) {
          return false;
        }
      }

      // Filter by Auction House / Source
      if (filterAuctionHouse === 'VERIZON') {
        if (!isVerizonLot(lot)) return false;
      } else if (filterAuctionHouse === 'ASSURANT') {
        const isAssurant = lot.sourceType === 'ASSURANT' || /assurant/i.test(lot.auctionHouse);
        if (!isAssurant) return false;
      } else if (filterAuctionHouse === 'T_MOBILE') {
        if (!isTMobileLot(lot)) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_1') {
        if (getMarketplaceNumber(lot) !== 1) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_2') {
        if (getMarketplaceNumber(lot) !== 2) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_3') {
        if (getMarketplaceNumber(lot) !== 3) return false;
      } else if (filterAuctionHouse === 'MARKETPLACE_4') {
        if (getMarketplaceNumber(lot) !== 4) return false;
      } else if (filterAuctionHouse !== 'all') {
        if (lot.auctionHouse !== filterAuctionHouse && lot.sourceType !== filterAuctionHouse) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'endingSoon') {
        return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
      }
      if (sortBy === 'priceAsc') {
        return getLotTotalPriceUsd(a) - getLotTotalPriceUsd(b);
      }
      if (sortBy === 'priceDesc') {
        return getLotTotalPriceUsd(b) - getLotTotalPriceUsd(a);
      }
      if (sortBy === 'profitDesc') {
        const profitA = isAssurantLot(a)
          ? (a.estimatedBrazilRetailBrl - a.currentBidUsd * usdRate) * Math.max(1, a.quantity || 1)
          : a.estimatedBrazilRetailBrl - a.currentBidUsd * usdRate;
        const profitB = isAssurantLot(b)
          ? (b.estimatedBrazilRetailBrl - b.currentBidUsd * usdRate) * Math.max(1, b.quantity || 1)
          : b.estimatedBrazilRetailBrl - b.currentBidUsd * usdRate;
        return profitB - profitA;
      }
      if (sortBy === 'mostBids') {
        return b.totalBidsCount - a.totalBidsCount;
      }
      return 0;
    });
  }, [auctions, searchQuery, filterModel, filterGrade, filterCapacity, filterAuctionHouse, sortBy, usdRate]);

  // Pagination State for Instant Loading & Smooth UI
  const [auctionsPage, setAuctionsPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 15;

  // Reset page when filters change
  useEffect(() => {
    setAuctionsPage(1);
  }, [searchQuery, filterModel, filterGrade, filterCapacity, filterAuctionHouse, sortBy]);

  const totalAuctionsPages = Math.ceil(filteredAuctions.length / ITEMS_PER_PAGE) || 1;
  const paginatedAuctions = useMemo(() => {
    const startIndex = (auctionsPage - 1) * ITEMS_PER_PAGE;
    return filteredAuctions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAuctions, auctionsPage]);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400/40 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header with Navigation Menu & TWO Prominent Links to "Nosso Sistema de Leilões" */}
      <Header
        currentPage={currentPage}
        onNavigate={page => setCurrentPage(page)}
        onOpenSystem={handleOpenSystem}
        currency={currency}
        onToggleCurrency={() => setCurrency(prev => prev === 'USD' ? 'BRL' : 'USD')}
        usdRate={usdRate}
        isPtaxOnline={ptaxInfo.isOnline}
        ptaxSource={ptaxInfo.source}
        ptaxLastUpdated={ptaxInfo.lastUpdated}
        onRefreshPtax={loadLivePtax}
        isClientAuthenticated={isClientAuthenticated}
        isAdminAuthenticated={isAdminAuthenticated}
        onClientLogout={handleClientLogout}
        onAdminLogout={handleAdminLogout}
        clientName={currentUser.name}
        language={language}
        onSelectLanguage={handleSelectLanguage}
      />

      <main className="flex-1">
        {/* ========================================================= */}
        {/* VIEW 1: HOME (VISÃO GERAL + HERO + LEILÕES EM DESTAQUE) */}
        {/* ========================================================= */}
        {currentPage === 'home' && (
          <div>
            <HeroSection
              onOpenSystem={handleOpenSystem}
              onOpenGradingGuide={() => setCurrentPage('gradeamento')}
              onOpenCalculator={() => setIsCalculatorModalOpen(true)}
              totalAuctionsCount={auctions.length}
            />

            {/* Quick Banner: Only show Admin Panel / Spreadsheet import link to logged in Admins */}
            {isAdminAuthenticated ? (
              <div className="bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border-y border-amber-500/20 py-3.5 px-4">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <List className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-white">
                      Modo Administrador: Gestão de leilões, arrematantes e importação de planilhas ativas.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setCurrentPage('admin')}
                      className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Acessar Painel Admin</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : isClientAuthenticated ? (
              <div className="bg-gradient-to-r from-slate-950 via-emerald-950/30 to-slate-950 border-y border-emerald-500/20 py-3 px-4">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Bem-vindo ao Portal do Arrematante, <strong className="text-white">{currentUser.name || 'Cliente Credenciado'}</strong>! Seu limite de lances está liberado.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setCurrentPage('cliente')}
                      className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Meu Painel de Cliente</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-y border-slate-800 py-3 px-4">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Área de Leilões dos EUA: Para visualizar lotes completos, laudos de IMEI e dar lances, faça seu login.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setCurrentPage('cliente')}
                      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Entrar ou Cadastrar-se</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Destaques de Leilões em Carrossel na Home */}
            <ModelCarousel
              auctions={auctions}
              usdRate={usdRate}
              currency={currency}
              onSelectLot={lotItem => {
                if (!isClientAuthenticated && !isAdminAuthenticated) {
                  setCurrentPage('cliente');
                  showToast('🔒 Para acessar os leilões e dar lances, faça seu login ou cadastre-se.');
                } else {
                  setSelectedLotForDetail(lotItem);
                }
              }}
              onQuickBid={lotItem => {
                if (!isClientAuthenticated && !isAdminAuthenticated) {
                  setCurrentPage('cliente');
                  showToast('🔒 Para dar lances nos leilões, faça seu login ou cadastre-se.');
                } else {
                  setSelectedLotForDetail(lotItem);
                }
              }}
              onCalculateLot={lotItem => handleOpenCalculatorForLot(lotItem)}
              onViewAllAuctions={() => setCurrentPage('leiloes')}
            />

            {/* Como Funciona na Home */}
            <section className="bg-slate-950 border-t border-slate-800 py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
                <div className="text-center max-w-3xl mx-auto space-y-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    PASSO A PASSO
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Como Arrematar iPhones nos EUA pelo Nosso Sistema
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
                  <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
                    <span className="font-mono text-amber-400 font-bold text-sm block">01. Cadastro</span>
                    <h3 className="text-sm font-bold text-white">Habilitação - Verificação do cadastro.</h3>
                    <p className="text-slate-400 leading-relaxed">
                      Cadastre seu Documento ID no topo para liberar limite em dólares e sua suíte de recebimento em Miami.
                    </p>
                  </div>
                  <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
                    <span className="font-mono text-amber-400 font-bold text-sm block">02. Seleção</span>
                    <h3 className="text-sm font-bold text-white">Análise de Grades</h3>
                    <p className="text-slate-400 leading-relaxed">
                      Escolha lotes com base no laudo técnico de 30 pontos e consulte os IMEIs antes de lançar.
                    </p>
                  </div>
                  <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
                    <span className="font-mono text-amber-400 font-bold text-sm block">03. Arrematação</span>
                    <h3 className="text-sm font-bold text-white">Lances ou Sniper</h3>
                    <p className="text-slate-400 leading-relaxed">
                      Dê lances manuais ou ative o robô para cobrir concorrentes no último segundo do leilão.
                    </p>
                  </div>
                  <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
                    <span className="font-mono text-amber-400 font-bold text-sm block">04. Despacho</span>
                    <h3 className="text-sm font-bold text-white">Envio Aéreo ao Brasil</h3>
                    <p className="text-slate-400 leading-relaxed">
                      Recebemos no galpão parceiro de Miami e enviamos com seguro para seu endereço no Brasil.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: LEILÕES (CATÁLOGO COMPLETO COM FILTROS) */}
        {/* ========================================================= */}
        {currentPage === 'leiloes' && (
          !isClientAuthenticated && !isAdminAuthenticated ? (
            <ClientLoginGate
              currentUser={currentUser}
              onLoginSuccess={(user) => {
                setIsClientAuthenticated(true);
                setIsAdminAuthenticated(user.role === 'admin');
                setCurrentUser(user);
                showToast(`Bem-vindo, ${user.name}! Acesso ao portal liberado.`);
              }}
              onCancel={() => setCurrentPage('home')}
            />
          ) : (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
                  <Gavel className="w-4 h-4" />
                  <span>CATÁLOGO OFICIAL DE LEILÕES DOS EUA</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Modelos de iPhones Disponíveis para Arrematação
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
                  Filtragem oficial por leilão (Verizon e Assurant), modelos importados, grade técnica e capacidade.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenSystem('terminal')}
                  className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  <Gavel className="w-3.5 h-3.5 text-amber-400" />
                  <span>Terminal de Lances</span>
                </button>
                {isAdminAuthenticated && (
                  <button
                    onClick={() => setCurrentPage('admin')}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Importar Planilha (Admin)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Search & Filter Controls */}
            <div className="p-4 sm:p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 shadow-lg shadow-black/20">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-300"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400 hidden sm:inline">{t.sortLabel}</span>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 font-medium"
                  >
                    <option value="endingSoon">{t.endingSoon}</option>
                    <option value="profitDesc">{t.highestProfit}</option>
                    <option value="priceAsc">{t.lowestPrice}</option>
                    <option value="priceDesc">{t.highestPrice}</option>
                    <option value="mostBids">{t.mostBids}</option>
                  </select>
                </div>
              </div>

              {/* Clean Structured Filter Controls */}
              <div className="pt-3 border-t border-slate-800/80 space-y-3 text-xs">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                  {/* Leilão Segmented Bar */}
                  <div className="lg:col-span-5 space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                      <Gavel className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.auctionFilter}</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterAuctionHouse('all');
                          setFilterModel('all');
                        }}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          filterAuctionHouse === 'all'
                            ? 'bg-amber-400 text-slate-950 font-bold'
                            : 'text-slate-300 hover:text-white hover:bg-slate-900'
                        }`}
                      >
                        {t.allAuctionsFilter}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const nextHouse = filterAuctionHouse === 'VERIZON' ? 'all' : 'VERIZON';
                          setFilterAuctionHouse(nextHouse);
                          setFilterModel('all');
                          if (nextHouse === 'VERIZON' && filterGrade !== 'all' && !VERIZON_GRADES.includes(filterGrade as GradeType)) {
                            setFilterGrade('all');
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          filterAuctionHouse === 'VERIZON'
                            ? 'bg-red-600 text-white font-bold'
                            : 'text-red-300 hover:bg-red-500/15'
                        }`}
                      >
                        {t.verizonBadge}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFilterAuctionHouse(filterAuctionHouse === 'ASSURANT' ? 'all' : 'ASSURANT');
                          setFilterModel('all');
                        }}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          filterAuctionHouse === 'ASSURANT'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-blue-300 hover:bg-blue-500/15'
                        }`}
                      >
                        {t.assurantBadge}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFilterAuctionHouse(filterAuctionHouse === 'T_MOBILE' ? 'all' : 'T_MOBILE');
                          setFilterModel('all');
                        }}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          filterAuctionHouse === 'T_MOBILE'
                            ? 'bg-fuchsia-600 text-white font-bold'
                            : 'text-fuchsia-300 hover:bg-fuchsia-500/15'
                        }`}
                      >
                        T-MOBILE
                      </button>

                      {(['MARKETPLACE_1', 'MARKETPLACE_2', 'MARKETPLACE_3', ...(auctions.some(a => getMarketplaceNumber(a) === 4) ? (['MARKETPLACE_4'] as const) : [])] as const).map((mktKey) => {
                        const num = mktKey.replace('MARKETPLACE_', '');
                        const label = `Marketplace ${num}`;
                        return (
                          <button
                            key={mktKey}
                            type="button"
                            onClick={() => {
                              setFilterAuctionHouse(filterAuctionHouse === mktKey ? 'all' : mktKey);
                              setFilterModel('all');
                            }}
                            className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 ${
                              filterAuctionHouse === mktKey
                                ? 'bg-cyan-600 text-white font-bold'
                                : 'text-cyan-300 hover:bg-cyan-500/15'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}

                      {Array.from(new Set(auctions.map(a => a.auctionHouse)))
                        .filter(h => h &&
                          !/verizon/i.test(h) &&
                          !/assurant/i.test(h) &&
                          !/t-?mobile/i.test(h) &&
                          !/liquidation\.com/i.test(h) &&
                          !/apple certified/i.test(h) &&
                          !/marketplace/i.test(h) &&
                          !/pronta entrega/i.test(h) &&
                          !/stock/i.test(h)
                        )
                        .slice(0, 3)
                        .map(house => (
                          <button
                            key={house}
                            type="button"
                            onClick={() => {
                              setFilterAuctionHouse(filterAuctionHouse === house ? 'all' : house);
                              setFilterModel('all');
                            }}
                            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 ${
                              filterAuctionHouse === house
                                ? 'bg-slate-200 text-slate-950 font-bold'
                                : 'text-slate-300 hover:text-white hover:bg-slate-900'
                            }`}
                          >
                            {house.length > 20 ? house.slice(0, 18) + '...' : house}
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Modelo Dropdown (All 60+ models cleanly organized) */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        Modelo {filterAuctionHouse === 'VERIZON' ? '(Verizon)' : filterAuctionHouse === 'ASSURANT' ? '(Assurant)' : filterAuctionHouse === 'T_MOBILE' ? '(T-Mobile)' : filterAuctionHouse === 'MARKETPLACE_1' ? '(Marketplace 1)' : filterAuctionHouse === 'MARKETPLACE_2' ? '(Marketplace 2)' : filterAuctionHouse === 'MARKETPLACE_3' ? '(Marketplace 3)' : ''}
                      </span>
                    </label>
                    <select
                      value={filterModel}
                      onChange={e => setFilterModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-amber-400 tabular-nums"
                    >
                      <option value="all">
                        Todos os Modelos ({availableImportedModels.reduce((acc, m) => acc + m.totalUnits, 0).toLocaleString('pt-BR')} un)
                      </option>
                      {availableImportedModels.map(item => (
                        <option key={item.model} value={item.model}>
                          {item.model} ({item.totalUnits.toLocaleString('pt-BR')} un)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Grade Dropdown */}
                  <div className="lg:col-span-2 space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t.gradeFilter.replace(':', '')}</span>
                    </label>
                    <select
                      value={filterGrade}
                      onChange={e => setFilterGrade(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-amber-400"
                    >
                      <option value="all">{t.allGradesFilter}</option>
                      {availableGrades.map(gradeKey => (
                        <option key={gradeKey} value={gradeKey}>
                          {gradeKey}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Capacidade Dropdown */}
                  <div className="lg:col-span-2 space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t.capacityFilter.replace(':', '')}</span>
                    </label>
                    <select
                      value={filterCapacity}
                      onChange={e => setFilterCapacity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-amber-400"
                    >
                      <option value="all">{t.allCapacitiesFilter}</option>
                      {['64GB', '128GB', '256GB', '512GB', '1TB'].map(cap => (
                        <option key={cap} value={cap}>
                          {cap}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Single-line Top Models Quick Strip (max 6 primary models, zero vertical wall) */}
                {availableImportedModels.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60 overflow-x-auto pb-0.5">
                    <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap shrink-0">
                      Principais:
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilterModel('all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        filterModel === 'all'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                      }`}
                    >
                      Todos · {availableImportedModels.reduce((acc, m) => acc + m.totalUnits, 0).toLocaleString('pt-BR')}
                    </button>

                    {availableImportedModels
                      .filter(m => !/^Mix:/i.test(m.model))
                      .slice(0, 6)
                      .map(item => {
                        const isActive = filterModel === item.model;
                        return (
                          <button
                            key={item.model}
                            type="button"
                            onClick={() => setFilterModel(isActive ? 'all' : item.model)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 tabular-nums ${
                              isActive
                                ? 'bg-amber-400 text-slate-950 font-bold'
                                : 'bg-slate-950/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                            }`}
                          >
                            <span>{item.model}</span>
                            <span className={`font-mono text-[10px] ${isActive ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                              {item.totalUnits.toLocaleString('pt-BR')}
                            </span>
                          </button>
                        );
                      })}

                    {filterModel !== 'all' && !availableImportedModels.filter(m => !/^Mix:/i.test(m.model)).slice(0, 6).some(m => m.model === filterModel) && (
                      <button
                        type="button"
                        onClick={() => setFilterModel('all')}
                        className="px-2.5 py-1 rounded-lg text-[11px] bg-amber-400 text-slate-950 font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5"
                        title="Remover filtro de modelo"
                      >
                        <span className="max-w-[200px] truncate">{filterModel}</span>
                        <span>✕</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* View Mode Switcher & Selection Toolbar Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 p-3 sm:p-4 rounded-2xl border border-slate-800/80">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-300 font-bold">Modo de Exibição:</span>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setAuctionsViewMode('list')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                      auctionsViewMode === 'list'
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Lista de Modelos & Lotes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuctionsViewMode('cards')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                      auctionsViewMode === 'cards'
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards em Grade</span>
                  </button>
                </div>
              </div>

              {/* Bulk selection action bar & catalog exports */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedLotIds.length > 0 ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                      {selectedLotIds.length} modelo(s) selecionado(s) na lista
                    </span>
                    <button
                      onClick={handleOpenCalculatorForSelected}
                      className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      <span>Calcular Lucro</span>
                    </button>
                    <button
                      onClick={() => setSelectedLotIds([])}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
                    >
                      Limpar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-400 gap-3">
                    <span>
                      Exibindo <strong>{filteredAuctions.length}</strong> lotes/modelos de leilão
                    </span>
                    {(filterGrade !== 'all' || filterCapacity !== 'all' || filterAuctionHouse !== 'all' || filterModel !== 'all' || searchQuery) && (
                      <button
                        onClick={() => {
                          setFilterGrade('all');
                          setFilterCapacity('all');
                          setFilterAuctionHouse('all');
                          setFilterModel('all');
                          setFilterLotType('all');
                          setSearchQuery('');
                        }}
                        className="text-amber-400 hover:underline font-semibold"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                )}

                {auctions.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        exportAuctionsCatalogXlsx(filteredAuctions.length > 0 ? filteredAuctions : auctions, usdRate, {
                          filterLabel: filteredAuctions.length < auctions.length
                            ? `Filtro ativo (${filteredAuctions.length} de ${auctions.length} lotes)`
                            : `Todos os Leilões Importados (${auctions.length} lotes)`
                        });
                        showToast('Planilha Excel dos leilões gerada com sucesso!');
                      }}
                      className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                      title="Exportar leilões exibidos em Excel estilizado"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportAuctionsCatalogPdf(filteredAuctions.length > 0 ? filteredAuctions : auctions, usdRate, {
                          filterLabel: filteredAuctions.length < auctions.length
                            ? `Filtro ativo (${filteredAuctions.length} de ${auctions.length} lotes)`
                            : `Todos os Leilões Importados (${auctions.length} lotes)`
                        });
                        showToast('PDF do catálogo de leilões pronto para salvar/imprimir!');
                      }}
                      className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                      title="Exportar leilões exibidos em PDF com layout executivo"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Results Display: List View or Grid View */}
            {filteredAuctions.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl space-y-3">
                <Package className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">Nenhum modelo encontrado com estes filtros</h3>
                <button
                  onClick={() => {
                    setFilterGrade('all');
                    setFilterCapacity('all');
                    setFilterAuctionHouse('all');
                    setFilterModel('all');
                    setFilterLotType('all');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                >
                  Restaurar Todos os Leilões
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {auctionsViewMode === 'list' ? (
                  /* ======================================================== */
                  /* LIST VIEW: TABELA & SELEÇÃO DE MODELOS                   */
                  /* ======================================================== */
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                    {/* Mobile List View (< md) */}
                    <div className="md:hidden divide-y divide-slate-800/80">
                      {paginatedAuctions.map(lot => {
                        const isSelected = selectedLotIds.includes(lot.id);
                        const isMixExpanded = !!expandedMixLotIds[lot.id];
                        const cleanTitle = stripLotPrefix(lot.title);
                        const isVerizon = isVerizonLot(lot);
                        const gradeInfo = GRADE_EXPLANATIONS[lot.grade] || GRADE_EXPLANATIONS[isVerizon ? 'DNC' : 'Grade A'];
                        const currentBrl = lot.currentBidUsd * usdRate;
                        const isAssurant = lot.sourceType === 'ASSURANT' || /assurant/i.test(lot.auctionHouse);

                        return (
                          <div key={lot.id} className={`p-4 space-y-3 transition-colors ${isSelected ? 'bg-amber-500/5' : ''}`}>
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => handleToggleSelectLot(lot.id)}
                                className="mt-1 text-slate-400 hover:text-amber-400 shrink-0"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-5 h-5 text-amber-400" />
                                ) : (
                                  <Square className="w-5 h-5 text-slate-600" />
                                )}
                              </button>
                              <img
                                src={lot.imageUrl}
                                alt={cleanTitle}
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
                                }}
                                onClick={() => setSelectedLotForDetail(lot)}
                                className="w-16 h-16 rounded-xl object-cover border border-slate-700 shrink-0 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-amber-400 text-xs">{lot.lotNumber}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${gradeInfo?.badgeColor || 'bg-slate-800 text-slate-200'}`}>
                                    {lot.grade}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                                    {isVerizon && <Lock className="w-2.5 h-2.5 text-red-400" />}
                                    <span>{lot.quantity} un.{isVerizon ? ' fixas' : ''}</span>
                                  </span>
                                  {isVerizon && (
                                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-black text-[9px] uppercase tracking-wider">
                                      VERIZON
                                    </span>
                                  )}
                                  {isAssurant && (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-black text-[9px] uppercase tracking-wider">
                                      ASSURANT
                                    </span>
                                  )}
                                  {isTMobileLot(lot) && (
                                    <span className="px-1.5 py-0.5 rounded bg-fuchsia-600 text-white font-black text-[9px] uppercase tracking-wider">
                                      T-MOBILE
                                    </span>
                                  )}
                                  {getMarketplaceNumber(lot) && (
                                    <span className="px-1.5 py-0.5 rounded bg-cyan-600 text-white font-black text-[9px] uppercase tracking-wider">
                                      MARKETPLACE {getMarketplaceNumber(lot)}
                                    </span>
                                  )}
                                </div>
                                <h4
                                  onClick={() => setSelectedLotForDetail(lot)}
                                  className="text-xs font-bold text-white mt-1 line-clamp-2 cursor-pointer hover:text-amber-300"
                                >
                                  {cleanTitle}
                                </h4>
                                <span className="text-[10px] text-slate-400 block mt-0.5">{lot.auctionHouse}</span>
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
                              onSelectLot={l => setSelectedLotForDetail(l)}
                            />

                            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                              {isVerizon && lot.currentBidUsd === 0 ? (
                                <div>
                                  <span className="text-[10px] text-slate-400 block">Preço Verizon:</span>
                                  <span className="font-bold text-emerald-400 text-sm block">Sem Preço Fixo</span>
                                  <span className="text-[10px] text-amber-300 font-semibold block">
                                    Cliente escolhe o valor · Qtd Fixa
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-[10px] text-slate-400 block">
                                    {isVerizon ? 'Última Oferta (Valor Livre):' : isAssurant && lot.quantity > 1 ? 'Valor Unitário (Assurant):' : 'Lance Atual:'}
                                  </span>
                                  <span className="font-mono font-bold text-amber-400 text-sm">
                                    ${lot.currentBidUsd.toLocaleString()} USD{isAssurant && lot.quantity > 1 ? ' / un.' : ''}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono ml-1.5">
                                    (aprox. R$ {currentBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})
                                  </span>
                                  {isAssurant && (
                                    <span className="text-[10px] text-cyan-300 font-mono font-semibold block">
                                      Incremento: {getLotIncrementSize(lot)} un.
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedLotForDetail(lot)}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-colors"
                                >
                                  Detalhes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedLotForDetail(lot)}
                                  className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs transition-colors"
                                >
                                  {isVerizon ? 'Escolher Valor' : 'Dar Lance'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table View (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/90 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800 tracking-wider">
                          <tr>
                            <th className="p-3.5 w-10 text-center">
                              <button
                                type="button"
                                onClick={handleSelectAllOnPage}
                                className="text-slate-400 hover:text-white"
                                title="Selecionar todos da página"
                              >
                                {paginatedAuctions.length > 0 && paginatedAuctions.every(l => selectedLotIds.includes(l.id)) ? (
                                  <CheckSquare className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-500" />
                                )}
                              </button>
                            </th>
                            <th className="p-3.5">Foto</th>
                            <th className="p-3.5">Modelo & Lote</th>
                            <th className="p-3.5">Leilão</th>
                            <th className="p-3.5">Grade</th>
                            <th className="p-3.5">Qtd / Memória</th>
                            <th className="p-3.5">Status Laudo</th>
                            <th className="p-3.5">Lance Atual</th>
                            <th className="p-3.5 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-sans">
                          {paginatedAuctions.map(lot => {
                            const isSelected = selectedLotIds.includes(lot.id);
                            const isMixExpanded = !!expandedMixLotIds[lot.id];
                            const mixSummary = getLotMixSummary(lot);
                            const cleanTitle = stripLotPrefix(lot.title);
                            const isVerizon = isVerizonLot(lot);
                            const gradeInfo = GRADE_EXPLANATIONS[lot.grade] || GRADE_EXPLANATIONS[isVerizon ? 'DNC' : 'Grade A'];
                            const currentBrl = lot.currentBidUsd * usdRate;
                            const isAssurant = lot.sourceType === 'ASSURANT' || /assurant/i.test(lot.auctionHouse);

                            return (
                              <React.Fragment key={lot.id}>
                                <tr className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-amber-500/5' : ''}`}>
                                  <td className="p-3.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSelectLot(lot.id)}
                                      className="text-slate-400 hover:text-amber-400"
                                    >
                                      {isSelected ? (
                                        <CheckSquare className="w-4 h-4 text-amber-400" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-600" />
                                      )}
                                    </button>
                                  </td>

                                  {/* Photo Thumbnail */}
                                  <td className="p-3.5">
                                    <div
                                      onClick={() => setSelectedLotForDetail(lot)}
                                      className="w-14 h-14 rounded-xl bg-slate-950 overflow-hidden border border-slate-800 cursor-pointer relative group shrink-0"
                                    >
                                      <img
                                        src={lot.imageUrl}
                                        alt={cleanTitle}
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
                                        }}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                      />
                                    </div>
                                  </td>

                                  {/* Model & Lot Title */}
                                  <td className="p-3.5">
                                    <div className="space-y-0.5">
                                      <span
                                        className="font-bold text-white text-sm block hover:text-amber-400 cursor-pointer transition-colors"
                                        onClick={() => setSelectedLotForDetail(lot)}
                                      >
                                        {lot.modelFamily}
                                      </span>
                                      <span className="text-[11px] text-slate-300 font-medium line-clamp-1">
                                        {cleanTitle}
                                      </span>
                                      <div className="flex items-center gap-2 pt-0.5">
                                        <span className="font-mono text-[10px] text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                          {lot.lotNumber}
                                        </span>
                                        <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                          {lot.location}
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

                                  {/* Auction Origin */}
                                  <td className="p-3.5">
                                    {isVerizon ? (
                                      <span className="px-2 py-1 rounded bg-red-600/90 text-white font-black text-[10px] uppercase tracking-wider inline-block">
                                        VERIZON
                                      </span>
                                    ) : isAssurant ? (
                                      <span className="px-2 py-1 rounded bg-blue-600/90 text-white font-black text-[10px] uppercase tracking-wider inline-block">
                                        ASSURANT
                                      </span>
                                    ) : isTMobileLot(lot) ? (
                                      <span className="px-2 py-1 rounded bg-fuchsia-600/90 text-white font-black text-[10px] uppercase tracking-wider inline-block">
                                        T-MOBILE
                                      </span>
                                    ) : getMarketplaceNumber(lot) ? (
                                      <span className="px-2 py-1 rounded bg-cyan-600/90 text-white font-black text-[10px] uppercase tracking-wider inline-block">
                                        MARKETPLACE {getMarketplaceNumber(lot)}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-bold text-[10px] inline-block">
                                        {lot.auctionHouse}
                                      </span>
                                    )}
                                  </td>

                                  {/* Grade */}
                                  <td className="p-3.5">
                                    <span className={`px-2.5 py-1 rounded text-xs font-bold border inline-block ${gradeInfo?.badgeColor || 'bg-slate-800 text-slate-200'}`}>
                                      {lot.grade}
                                    </span>
                                  </td>

                                  {/* Qtd & Storage */}
                                  <td className="p-3.5">
                                    <div className="font-mono">
                                      <span className="text-white font-bold flex items-center gap-1">
                                        {isVerizon && <Lock className="w-3 h-3 text-red-400 shrink-0" />}
                                        <span>{lot.quantity} {lot.quantity === 1 ? 'unidade' : 'unidades'}</span>
                                      </span>
                                      {isVerizon && (
                                        <span className="text-[10px] text-red-300 font-semibold block">Qtd Fixa (Fechado)</span>
                                      )}
                                      {isAssurant && (
                                        <span className="text-[10px] text-cyan-300 font-semibold block">
                                          Inc: {getLotIncrementSize(lot)} un.
                                        </span>
                                      )}
                                      <span className="text-slate-400 text-[11px] block">{lot.primaryStorage}</span>
                                    </div>
                                  </td>

                                  {/* Status */}
                                  <td className="p-3.5">
                                    <div className="space-y-0.5 text-[11px]">
                                      <div className="flex items-center gap-1 text-emerald-400 font-medium">
                                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                                        <span>Clean ESN / FMI OFF</span>
                                      </div>
                                      <span className="text-slate-400 font-mono text-[10px] block">
                                        Bat: {lot.batteryHealthRange}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Current Bid */}
                                  <td className="p-3.5">
                                    {isVerizon && lot.currentBidUsd === 0 ? (
                                      <div>
                                        <span className="font-bold text-emerald-400 text-sm block">
                                          Sem Preço Fixo
                                        </span>
                                        <span className="text-[10px] text-amber-300 font-semibold block">
                                          Cliente escolhe o valor
                                        </span>
                                      </div>
                                    ) : (
                                      <div>
                                        <span className="font-mono font-bold text-amber-400 text-sm block">
                                          ${lot.currentBidUsd.toLocaleString()} USD{isAssurant && lot.quantity > 1 ? ' / un.' : ''}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          aprox. R$ {currentBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}{isAssurant && lot.quantity > 1 ? ' / un.' : ''}
                                        </span>
                                        {!isAssurant && (
                                          <span className="text-[10px] text-slate-500 block">
                                            {`($${getLotUnitPriceUsd(lot).toLocaleString()}/un)${isVerizon ? ' · Livre' : ''}`}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  {/* Actions */}
                                  <td className="p-3.5 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenCalculatorForLot(lot)}
                                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                                        title="Calcular Lucro deste lote"
                                      >
                                        <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedLotForDetail(lot)}
                                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs transition-colors"
                                      >
                                        {isVerizon ? 'Escolher Valor' : 'Dar Lance'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {mixSummary.hasExpandableDetails && (
                                  <tr className={isMixExpanded ? 'bg-slate-950/50' : '!border-t-0'}>
                                    <td colSpan={9} className={isMixExpanded ? 'px-4 pb-4 pt-0' : 'p-0 border-0'}>
                                      <LotMixExpandablePanel
                                        lot={lot}
                                        isExpanded={isMixExpanded}
                                        onSelectLot={l => setSelectedLotForDetail(l)}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedAuctions.map(lot => (
                      <AuctionCard
                        key={lot.id}
                        lot={lot}
                        onSelectLot={lotItem => setSelectedLotForDetail(lotItem)}
                        onQuickBid={lotItem => setSelectedLotForDetail(lotItem)}
                        onCalculateLot={lotItem => handleOpenCalculatorForLot(lotItem)}
                        currency={currency}
                        usdRate={usdRate}
                      />
                    ))}
                  </div>
                )}

                {/* Ultra-Fast Responsive Pagination Bar */}
                {totalAuctionsPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
                    <div>
                      Exibindo <strong className="text-white">{(auctionsPage - 1) * ITEMS_PER_PAGE + 1}</strong> a <strong className="text-white">{Math.min(auctionsPage * ITEMS_PER_PAGE, filteredAuctions.length)}</strong> de <strong className="text-white">{filteredAuctions.length}</strong> lotes legíveis
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                      <button
                        disabled={auctionsPage === 1}
                        onClick={() => {
                          setAuctionsPage(p => Math.max(1, p - 1));
                          window.scrollTo({ top: 200, behavior: 'smooth' });
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg transition-colors"
                      >
                        Anterior
                      </button>

                      {Array.from({ length: totalAuctionsPages }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          onClick={() => {
                            setAuctionsPage(p);
                            window.scrollTo({ top: 200, behavior: 'smooth' });
                          }}
                          className={`w-8 h-8 rounded-lg transition-all font-mono text-xs ${
                            auctionsPage === p
                              ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          {p}
                        </button>
                      ))}

                      <button
                        disabled={auctionsPage === totalAuctionsPages}
                        onClick={() => {
                          setAuctionsPage(p => Math.min(totalAuctionsPages, p + 1));
                          window.scrollTo({ top: 200, behavior: 'smooth' });
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg transition-colors"
                      >
                        Próximo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
          )
        )}

        {/* ========================================================= */}
        {/* VIEW 3: GRADEAMENTO (PÁGINA INTERNA DEDICADA) */}
        {/* ========================================================= */}
        {currentPage === 'gradeamento' && (
          <GradeamentoPage
            onSelectGradeFilter={grade => {
              setFilterGrade(grade);
              setCurrentPage('leiloes');
            }}
            onNavigateLeiloes={() => setCurrentPage('leiloes')}
          />
        )}

        {/* ========================================================= */}
        {/* VIEW 4: QUEM SOMOS (PÁGINA INTERNA DEDICADA) */}
        {/* ========================================================= */}
        {currentPage === 'quem-somos' && (
          <QuemSomosPage
            onNavigateLeiloes={() => setCurrentPage('leiloes')}
            onOpenSystem={handleOpenSystem}
          />
        )}

        {/* ========================================================= */}
        {/* VIEW 5: PAINEL DO CLIENTE (PORTAL DO ARREMATANTE) */}
        {/* ========================================================= */}
        {currentPage === 'cliente' && (
          !isClientAuthenticated && !isAdminAuthenticated ? (
            <ClientLoginGate
              currentUser={currentUser}
              onLoginSuccess={(user) => {
                setIsClientAuthenticated(true);
                setIsAdminAuthenticated(user.role === 'admin');
                setCurrentUser(user);
                showToast(`Bem-vindo, ${user.name}! Acesso ao portal liberado.`);
              }}
              onCancel={() => setCurrentPage('home')}
            />
          ) : (
            <ClientePage
              currentUser={currentUser}
              onUpdateCurrentUser={handleUpdateCurrentUser}
              auctions={auctions}
              userBids={userBids}
              onPlaceBid={handlePlaceBid}
              onSelectLot={lotItem => setSelectedLotForDetail(lotItem)}
              currency={currency}
              usdRate={usdRate}
              onLogout={handleClientLogout}
            />
          )
        )}

        {/* ========================================================= */}
        {/* VIEW 6: PAINEL ADMIN (IMPORTAÇÃO EXCEL, OFERTAS, LOTES) */}
        {/* ========================================================= */}
        {currentPage === 'admin' && (
          !isAdminAuthenticated ? (
            <AdminLoginGate
              onLoginSuccess={(adminUser) => {
                setIsAdminAuthenticated(true);
                setIsClientAuthenticated(true);
                setCurrentUser(adminUser);
                showToast('Login de administrador realizado com sucesso!');
              }}
              onCancel={() => setCurrentPage('home')}
            />
          ) : (
            <AdminPage
              auctions={auctions}
              onUpdateAuctions={handleUpdateAuctions}
              currentUser={currentUser}
              onUpdateCurrentUser={handleUpdateCurrentUser}
              usdRate={usdRate}
              onUpdateUsdRate={handleUpdateUsdRate}
              onLogout={handleAdminLogout}
            />
          )
        )}
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-800 bg-[#080c13] py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-300">USAFAST LEILÕES HUB</span>
            <span>·</span>
            <span>Assessoria de Leilões em Miami & Plataforma Oficial de Arrematação</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setCurrentPage('quem-somos')}
              className="hover:text-slate-300 transition-colors"
            >
              Quem Somos
            </button>
            <span>·</span>
            <button
              onClick={() => setCurrentPage('leiloes')}
              className="hover:text-slate-300 transition-colors"
            >
              Leilões
            </button>
            <span>·</span>
            <button
              onClick={() => setCurrentPage('gradeamento')}
              className="hover:text-slate-300 transition-colors"
            >
              Gradeamento
            </button>
            <span>·</span>
            <button
              onClick={() => setCurrentPage('cliente')}
              className="text-emerald-400 hover:underline font-semibold"
            >
              Painel do Cliente
            </button>
            <span>·</span>
            <button
              onClick={() => setCurrentPage('admin')}
              className="text-amber-400 hover:underline font-semibold"
            >
              Painel Admin (Excel)
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuctionDetailModal
        lot={selectedLotForDetail}
        isOpen={!!selectedLotForDetail}
        onClose={() => setSelectedLotForDetail(null)}
        onPlaceBid={handlePlaceBid}
        onOpenSystem={() => {
          setSelectedLotForDetail(null);
          handleOpenSystem('terminal');
        }}
        currency={currency}
        usdRate={usdRate}
      />

      <AuctionSystemModal
        isOpen={isSystemModalOpen}
        onClose={() => setIsSystemModalOpen(false)}
        initialTab={systemModalTab}
        auctions={auctions}
        userBids={userBids}
        onPlaceQuickBid={handlePlaceBid}
        currentUser={currentUser}
        onUpdateUser={updated => {
          setCurrentUser(updated);
          showToast('Cadastro atualizado com sucesso no sistema!');
        }}
        usdRate={usdRate}
      />

      <GradingGuideModal
        isOpen={isGradingModalOpen}
        onClose={() => setIsGradingModalOpen(false)}
        onSelectGradeFilter={grade => {
          setFilterGrade(grade);
          setCurrentPage('leiloes');
        }}
      />

      <ImportCalculatorModal
        isOpen={isCalculatorModalOpen}
        onClose={() => setIsCalculatorModalOpen(false)}
        usdRate={usdRate}
        initialLotPriceUsd={calculatorInitData.priceUsd}
        initialLotUnits={calculatorInitData.units}
      />
    </div>
  );
}
