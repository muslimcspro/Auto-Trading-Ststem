import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Bot, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, Flame, Gauge, Globe2, Home, KeyRound, Newspaper, Search, Send, ShieldAlert, Sparkles, Target, TrendingUp, UserCog, Users, Wallet } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';

type Risk = 'medium' | 'high';
type Timeframe = '5m' | '10m' | '15m' | '1h' | '2h' | '4h' | '1d';
type Side = 'LONG' | 'SHORT';
type ExitMode = 'balanced' | 'quick' | 'extended';
type Ticker = { symbol: string; price: number; change24h: number; quoteVolume: number; eventTime: number };
type ChartCandle = { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number };
type SymbolInfo = { symbol: string; baseAsset: string; quoteAsset: string };
type MarketMode = 'spot' | 'futures';
type StrategyMarketScope = 'spot' | 'futures' | 'all';
type ScoreFilter = 'all' | 'green' | 'yellow' | 'red' | 'unscored';
type Strategy = { id: string; name: string; risk: Risk; description: string };
type Signal = {
  id: number;
  market: MarketMode;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: Timeframe;
  side: Side;
  exitMode: ExitMode;
  entry: number;
  takeProfit: number;
  stopLoss: number;
  expectedProfitPct: number;
  riskPct: number;
  openedAt: number;
  plannedExitAt: number;
  status: 'OPEN' | 'WIN' | 'LOSS';
  confidence: number;
  reason: string;
  executionMode?: 'test' | 'live';
  executionVenueLabel?: string;
  executionLeverage?: number | null;
  executionMarginMode?: 'isolated' | 'cross' | null;
  executionStatus?: 'pending' | 'rejected' | 'test_accepted' | 'test_failed' | 'live_accepted' | 'live_failed' | 'blocked';
  executionNotes?: string[];
  closedAt?: number;
  closePrice?: number;
  binanceCloseOrderId?: string;
  binanceRealizedPnlUsdt?: number;
  binanceRoiPct?: number;
  binancePnlReadAt?: number;
  binancePnlSource?: string;
};
type Stat = {
  strategyId: string;
  name: string;
  risk: Risk;
  wins: number;
  losses: number;
  live: number;
  total: number;
  winRate: number;
  winLong: number;
  winShort: number;
  lossLong: number;
  lossShort: number;
  openLong: number;
  openShort: number;
};
type Notification = { id: number; time: number; title: string; message: string; level: 'info' | 'win' | 'loss' };
type TradeChartTrade = {
  id: number;
  symbol: string;
  strategyName: string;
  status: 'OPEN' | 'WIN' | 'LOSS';
  side: Side;
  market: MarketMode;
  timeframe: Timeframe;
  openedAt: number;
  closedAt?: number;
  entry: number;
  takeProfit?: number;
  stopLoss?: number;
  expectedProfitPct: number;
  riskPct: number;
  pnl?: number;
  pnlLabel?: string;
};
type AccessRequest = {
  id: number;
  userId: string;
  name: string;
  username: string;
  password: string;
  email: string;
  telegram: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  enabled: boolean;
  approvedAt?: number;
  telegramNotificationsEnabled: boolean;
};
type TelegramSubscriber = {
  accountId: string;
  role: 'admin' | 'user';
  displayName: string;
  telegramUsername: string;
  chatId: string | null;
  notificationsEnabled: boolean;
  enabled: boolean;
  selectedStrategies: string[];
  selectedTimeframes: Timeframe[];
  selectedMarkets: MarketMode[];
  acceptedLive: boolean;
  acceptedShadow: boolean;
  linked: boolean;
};
type Page = 'home' | 'dashboard' | 'auto-trade';
type Theme = 'executive' | 'navy' | 'emerald' | 'graphite' | 'light';
type PerformanceRange = '24h' | '7d' | '30d' | '90d' | 'all' | 'custom';
  type BinanceConnection = {
  connected: boolean;
  saved: boolean;
  updatedAt: number | null;
  verifiedAt: number | null;
  keyFingerprint: string | null;
  statusText: string;
};

type BinanceWalletSummary = {
  ok: boolean;
  connected: boolean;
  updatedAt: number | null;
  assetCount: number;
  totalValueUsdt: number;
  futuresTotalUsdt: number;
  futuresAvailableUsdt: number;
  pnl24hUsdt: number;
  pnl24hPct: number;
  balances: {
    asset: string;
    free: number;
    locked: number;
    total: number;
    priceUsdt: number;
    valueUsdt: number;
    change24hPct: number;
  }[];
};

type LivePortfolioLedgerResponse = {
  ok: boolean;
  summary: {
    startingBalance: number;
    currentCapital: number;
    openPnl: number;
    closedPnl: number;
    netPnl: number;
    generatedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    openCount: number;
    closedCount: number;
    bestTrade: SignalTradeRow | null;
    worstTrade: SignalTradeRow | null;
    longCount: number;
    shortCount: number;
    spotCount: number;
    futuresCount: number;
  };
  filterCounts: {
    statusAll: number;
    open: number;
    closed: number;
    win: number;
    loss: number;
    sideAll: number;
    long: number;
    short: number;
    marketAll: number;
    spot: number;
    futures: number;
    scoreAll: number;
    scoreGreen: number;
    scoreYellow: number;
    scoreRed: number;
    unscored: number;
  };
  accepted: {
    total: number;
    page: number;
    pageSize: number;
    rows: (SignalTradeRow & {
      executionStatus?: Signal['executionStatus'];
      allocationAmount?: number;
      allocationPct?: number;
    })[];
  };
  rejected: {
    total: number;
    rows: PortfolioRejectedViewRow[];
  };
};

type LivePortfolioSummaryResponse = {
  ok: boolean;
  summary: {
    startingBalance: number;
    currentCapital: number;
    openPnl: number;
    closedPnl: number;
    netPnl: number;
    generatedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    openCount: number;
    closedCount: number;
    longCount: number;
    shortCount: number;
    spotCount: number;
    futuresCount: number;
  };
  filterCounts: LivePortfolioLedgerResponse['filterCounts'];
};

type HomeIntelResponse = {
  ok: boolean;
  fearGreed: {
    value: number;
    classification: string;
    timestamp: number | null;
    yesterday: { value: number; classification: string } | null;
    lastWeek: { value: number; classification: string } | null;
    lastMonth: { value: number; classification: string } | null;
    updatedAt: number;
  };
  marketCap: {
    id: string;
    symbol: string;
    name: string;
    image: string;
    currentPrice: number;
    marketCap: number;
    marketCapRank: number;
    priceChange24h: number;
  }[];
  news: {
    id: string;
    title: string;
    url: string;
    publishedAt: number | null;
    source: string;
    currencies: string[];
  }[];
  executionIntel: {
    btcDominance: number | null;
    fundingRate: number | null;
    nextFundingTime: number | null;
    openInterest: number | null;
    openInterestUsd: number | null;
    volumeSurgeRatio: number | null;
    volumeSurgeLabel: string;
    marketBreadth: {
      advancers: number;
      decliners: number;
      positiveRatio: number;
    };
    stablecoinFlow: {
      source: 'glassnode' | 'coingecko-proxy';
      available: boolean;
      label: string;
      valueUsd: number | null;
      updatedAt: number | null;
    };
  };
  binance: {
    spotGainers: Ticker[];
    spotLosers: Ticker[];
    futuresGainers: Ticker[];
    futuresLosers: Ticker[];
  };
  updatedAt: number;
};

const livePortfolioRefreshEvent = 'live-portfolio-refresh';


type TelegramConfig = {
  ok: boolean;
  publicChannelEnabled: boolean;
  publicChannelChatId: string;
  publicChannelInviteUrl?: string;
  publicBotUsername: string;
  publicBotConfigured: boolean;
  privateBotUsername: string;
  privateBotConfigured: boolean;
};

const PRIVATE_TELEGRAM_BOT_FALLBACK_USERNAME = 'DirectTradeAlerts71Bot';

type LiveRulesPayload = {
  venueMode: MarketMode;
  executionMode: 'test' | 'live';
  killSwitch: boolean;
  ruleToggles: {
    tradingVenue: boolean;
    allowedDirection: boolean;
    executionSource: boolean;
    openTradeLimit: boolean;
    minRiskReward: boolean;
    cashReserve: boolean;
    riskPerTrade: boolean;
    dailyLoss: boolean;
  };
  riskPerTrade: number;
  maxTrades: number;
  dailyLoss: number;
  reserveRatio: number;
  executionSource: 'best-single' | 'top-2' | 'top-4' | 'custom';
  allocationMethod: 'equal' | 'risk';
  minRiskReward: '1:1' | '1:2' | '1:3' | '1:4' | 'custom';
  customRiskReward: string;
  allowedDirection: 'both' | 'long-only' | 'short-only';
  futuresLeverage: number;
  futuresMarginMode: 'isolated' | 'cross';
  breakEvenEnabled: boolean;
  breakEvenTriggerPct: number;
  trailingStopEnabled: boolean;
  trailingGapPct: number;
  portfolioFloorEnabled: boolean;
  portfolioFloorTriggerPct: number;
  portfolioFloorLockPct: number;
};

const defaultLiveRuleToggles: LiveRulesPayload['ruleToggles'] = {
  tradingVenue: true,
  allowedDirection: true,
  executionSource: true,
  openTradeLimit: true,
  minRiskReward: true,
  cashReserve: true,
  riskPerTrade: true,
  dailyLoss: true
};

type TradingVenue = 'spot' | 'futures';
const allTimeframes: Timeframe[] = ['5m', '10m', '15m', '1h', '2h', '4h', '1d'];

const normalizeBinanceConnection = (value?: Partial<BinanceConnection> | null): BinanceConnection => ({
  connected: Boolean(value?.connected),
  saved: Boolean(value?.saved),
  updatedAt: typeof value?.updatedAt === 'number' ? value.updatedAt : null,
  verifiedAt: typeof value?.verifiedAt === 'number' ? value.verifiedAt : null,
  keyFingerprint: typeof value?.keyFingerprint === 'string' ? value.keyFingerprint : null,
  statusText: typeof value?.statusText === 'string'
    ? value.statusText
    : (value?.connected ? 'Verified with Binance' : value?.saved ? 'Keys saved locally' : 'No Binance account connected')
});

const loginStorageKey = (role: 'user' | 'admin') => `autoTrade.savedLogin.${role}`;

const themes: { id: Theme; name: string }[] = [
  { id: 'executive', name: 'Executive Slate' },
  { id: 'navy', name: 'Institutional Navy' },
  { id: 'emerald', name: 'Market Emerald' },
  { id: 'graphite', name: 'Graphite Desk' },
  { id: 'light', name: 'Light Terminal' }
];

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(url);
  return response.json();
};

const fmt = (value: number) => {
  const absValue = Math.abs(value);
  const formatted = absValue >= 1000
    ? absValue.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : absValue >= 1
      ? absValue.toLocaleString('en-US', { maximumFractionDigits: 4 })
      : absValue.toLocaleString('en-US', { maximumFractionDigits: 8 });
  return value < 0 ? `-${formatted}` : formatted;
};

const fmtSignedUsdt = (value: number) => `${value < 0 ? '-' : ''}$${fmt(Math.abs(value))}`;
const fmtMoney = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const fmtCompactMoney = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);

const time = (stamp: number) => new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
}).format(stamp);

const entryTime = (stamp: number) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
}).format(stamp);

function formatDuration(from: number, to?: number) {
  const diff = Math.max(0, (to ?? Date.now()) - from);
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const durationMinutes = (from: number, to?: number) => Math.max(0, Math.floor(((to ?? Date.now()) - from) / 60000));

const formatMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const averageMinutes = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const formatExitModeLabel = (mode: ExitMode) => mode === 'quick' ? 'Quick' : mode === 'extended' ? 'Extended' : 'Balanced';

const formatTargetRiskRatio = (signal: Pick<Signal, 'expectedProfitPct' | 'riskPct'>) =>
  `${signal.expectedProfitPct >= 0 ? '+' : ''}${signal.expectedProfitPct.toFixed(2)}% / -${Math.abs(signal.riskPct).toFixed(2)}%`;

const formatTradeLabel = (id: number) => `T-${Math.max(0, id).toString(36).toUpperCase().padStart(6, '0')}`;

const extractSignalScore = (reason: string) => {
  const value = reason.match(/\bScore\s+(-?\d+(?:\.\d+)?)/i)?.[1];
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
};

const getSignalScore = (signal: Pick<Signal, 'reason'>) => extractSignalScore(signal.reason);

const scoreTone = (score: number | null): Exclude<ScoreFilter, 'all'> =>
  score == null ? 'unscored' : score >= 60 ? 'green' : score >= 40 ? 'yellow' : 'red';

const scoreMatches = (signal: Pick<Signal, 'reason'>, filter: ScoreFilter) =>
  filter === 'all' || scoreTone(getSignalScore(signal)) === filter;

const formatPrivateVenueLabel = (signal: Pick<Signal, 'market' | 'executionLeverage'>) =>
  signal.market === 'futures' ? `Futures x${Math.max(1, signal.executionLeverage ?? 1)}` : 'Spot';

const tradeLedgerColumns = [
  'Trade',
  'Symbol',
  'Strategy',
  'Status',
  'Side',
  'Venue',
  'Mode',
  'TF',
  'Entry Time',
  'Duration',
  'Entry',
  'Market',
  'TP / SL',
  'Score',
  'PnL'
] as const;

const portfolioLedgerColumns = [
  'Trade',
  'Symbol',
  'Strategy',
  'Broker Status',
  'Status',
  'Side',
  'Venue',
  'Allocation',
  'Mode',
  'TF',
  'Entry Time',
  'Duration',
  'Entry',
  'Market',
  'Liq.Price',
  'TP / SL',
  'Score',
  'PnL'
] as const;

function LedgerHeaderCell({ column }: { column: string }) {
  return <>{column}</>;
}

const formatBrokerStatusLabel = (status?: Signal['executionStatus']) => {
  if (!status) return 'UNTRACKED';
  return status.replace(/_/g, ' ').toUpperCase();
};

const acceptedBrokerStatuses = new Set<NonNullable<Signal['executionStatus']>>(['live_accepted', 'test_accepted']);

function App() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  const [futuresSymbols, setFuturesSymbols] = useState<SymbolInfo[]>([]);
  const [futuresTickers, setFuturesTickers] = useState<Map<string, Ticker>>(new Map());
  const [spotTop, setSpotTop] = useState<Ticker[]>([]);
  const [futuresTop, setFuturesTop] = useState<Ticker[]>([]);
  const [spotGainers, setSpotGainers] = useState<Ticker[]>([]);
  const [spotLosers, setSpotLosers] = useState<Ticker[]>([]);
  const [futuresGainers, setFuturesGainers] = useState<Ticker[]>([]);
  const [futuresLosers, setFuturesLosers] = useState<Ticker[]>([]);
  const [query, setQuery] = useState('');
  const [marketMode, setMarketMode] = useState<MarketMode>('spot');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [labStrategyIds, setLabStrategyIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('autoTrade.labStrategyIds') ?? '[]');
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeframes, setTimeframes] = useState<Set<Timeframe>>(new Set(['5m', '10m', '15m']));
  const [exitModes, setExitModes] = useState<Set<ExitMode>>(new Set(['balanced']));
  const [strategyMarketScope, setStrategyMarketScope] = useState<StrategyMarketScope>('all');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [page, setPage] = useState<Page>('home');
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    return themes.some(item => item.id === saved) ? saved! : 'graphite';
  });
  const [toastDuration, setToastDuration] = useState(() => Number(localStorage.getItem('toastDuration') ?? 2000));
  const [alertsEnabled, setAlertsEnabled] = useState(() => localStorage.getItem('alertsEnabled') !== 'false');
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [dashboard, setDashboard] = useState({ liveSignals: 0, totalSignals: 0, monitored: 0, monitoredSpot: 0, monitoredFutures: 0, availableSpot: 0, availableFutures: 0, selectedStrategies: 0, marketScope: 'all' as StrategyMarketScope, exchange: 'Binance' });
  const [homeIntel, setHomeIntel] = useState<HomeIntelResponse | null>(null);
  const [chartSymbol, setChartSymbol] = useState('');
  const [chartMarket, setChartMarket] = useState<MarketMode>('spot');
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>('15m');
  const [chartOpen, setChartOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('toastDuration', String(toastDuration));
  }, [toastDuration]);

  useEffect(() => {
    localStorage.setItem('alertsEnabled', String(alertsEnabled));
    if (!alertsEnabled) setToasts([]);
  }, [alertsEnabled]);

  useEffect(() => {
    localStorage.setItem('autoTrade.labStrategyIds', JSON.stringify(labStrategyIds));
  }, [labStrategyIds]);

  useEffect(() => {
    Promise.all([
      api<{ symbols: SymbolInfo[] }>('/api/symbols'),
      api<{ tickers: Ticker[] }>('/api/tickers'),
      api<{ symbols: SymbolInfo[] }>('/api/futures-symbols'),
      api<{ tickers: Ticker[] }>('/api/futures-tickers'),
      api<{ strategies: Strategy[]; selected: string[]; timeframes: Timeframe[]; exitModes: ExitMode[]; marketScope: StrategyMarketScope }>('/api/strategies'),
      api<{ signals: Signal[] }>('/api/signals'),
      api<{ notifications: Notification[] }>('/api/notifications'),
      api<{ stats: Stat[]; liveSignals: number; totalSignals: number; monitored: number; monitoredSpot: number; monitoredFutures: number; availableSpot: number; availableFutures: number; selectedStrategies: number; marketScope: StrategyMarketScope; exchange: string }>('/api/dashboard'),
      api<HomeIntelResponse>('/api/home-intel')
    ]).then(([s, t, fs, ft, st, sig, n, d, intel]) => {
      const spotMap = new Map(t.tickers.map(x => [x.symbol, x]));
      const futuresMap = new Map(ft.tickers.map(x => [x.symbol, x]));
      setSymbols(s.symbols);
      setTickers(spotMap);
      setFuturesSymbols(fs.symbols);
      setFuturesTickers(futuresMap);
      setSpotTop(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'].map(symbol => spotMap.get(symbol)).filter(Boolean) as Ticker[]);
      setFuturesTop(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'].map(symbol => futuresMap.get(symbol)).filter(Boolean) as Ticker[]);
      setSpotGainers(intel.binance.spotGainers ?? []);
      setSpotLosers(intel.binance.spotLosers ?? []);
      setFuturesGainers(intel.binance.futuresGainers ?? []);
      setFuturesLosers(intel.binance.futuresLosers ?? []);
      setStrategies(st.strategies);
      setSelected(new Set(st.selected));
      setTimeframes(new Set(st.timeframes));
      setExitModes(new Set(st.exitModes?.length ? st.exitModes : ['balanced']));
      setStrategyMarketScope(st.marketScope);
      setSignals(sig.signals);
      setNotifications(n.notifications);
      setStats(d.stats);
      setDashboard(d);
      setHomeIntel(intel);
    });
  }, [toastDuration]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout = 0;
    let closed = false;

    const connectSocket = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/stream`);
        socket.onmessage = event => {
          const { type, payload } = JSON.parse(event.data);
          if (type === 'prices') {
            setSpotTop(payload.spotTop ?? []);
            setFuturesTop(payload.futuresTop ?? []);
            setSpotGainers(payload.spotGainers ?? []);
            setSpotLosers(payload.spotLosers ?? []);
            setFuturesGainers(payload.futuresGainers ?? []);
            setFuturesLosers(payload.futuresLosers ?? []);
            setHomeIntel(prev => prev ? ({
              ...prev,
              binance: {
                ...prev.binance,
                spotGainers: payload.spotGainers ?? prev.binance.spotGainers,
                spotLosers: payload.spotLosers ?? prev.binance.spotLosers,
                futuresGainers: payload.futuresGainers ?? prev.binance.futuresGainers,
                futuresLosers: payload.futuresLosers ?? prev.binance.futuresLosers
              },
              updatedAt: payload.updatedAt ?? prev.updatedAt
            }) : prev);
          }
          if (type === 'signal') {
            setSignals(prev => [payload, ...prev.filter(item => item.id !== payload.id)]);
            window.dispatchEvent(new CustomEvent(livePortfolioRefreshEvent));
          }
          if (type === 'signalClosed') {
            setSignals(prev => prev.map(s => s.id === payload.id ? payload : s));
            window.dispatchEvent(new CustomEvent(livePortfolioRefreshEvent));
          }
          if (type === 'notification') {
            setNotifications(prev => [payload, ...prev.filter(item => item.id !== payload.id)].slice(0, 100));
            if (alertsEnabled) {
              setToasts(prev => [payload, ...prev].slice(0, 4));
            window.setTimeout(() => {
              setToasts(prev => prev.filter(item => item.id !== payload.id));
            }, toastDuration);
          }
          }
          if (type === 'dashboard') {
            setDashboard(prev => ({ ...prev, ...payload }));
            setStats(payload.stats);
            window.dispatchEvent(new CustomEvent(livePortfolioRefreshEvent));
          }
        };
      socket.onclose = () => {
        if (closed) return;
        reconnectTimeout = window.setTimeout(connectSocket, 1200);
      };
      socket.onerror = () => {
        socket?.close();
      };
    };

    connectSocket();

    const refresh = setInterval(() => {
      Promise.all([
        api<{ tickers: Ticker[] }>('/api/tickers'),
        api<{ tickers: Ticker[] }>('/api/futures-tickers'),
        api<{ signals: Signal[] }>('/api/signals'),
        api<{ notifications: Notification[] }>('/api/notifications'),
        api<{ stats: Stat[]; liveSignals: number; totalSignals: number; monitored: number; monitoredSpot: number; monitoredFutures: number; availableSpot: number; availableFutures: number; selectedStrategies: number; marketScope: StrategyMarketScope; exchange: string }>('/api/dashboard'),
        api<HomeIntelResponse>('/api/home-intel')
      ])
        .then(([spotResponse, futuresResponse, signalResponse, notificationResponse, dashboardResponse, intelResponse]) => {
          setTickers(new Map(spotResponse.tickers.map(x => [x.symbol, x])));
          setFuturesTickers(new Map(futuresResponse.tickers.map(x => [x.symbol, x])));
          setSignals(signalResponse.signals);
          setNotifications(notificationResponse.notifications);
          setDashboard(dashboardResponse);
          setStats(dashboardResponse.stats);
          setHomeIntel(intelResponse);
        })
        .catch(() => undefined);
    }, 60000);
    return () => {
      closed = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      socket?.close();
      clearInterval(refresh);
    };
  }, [alertsEnabled, toastDuration]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toUpperCase();
    if (!needle) return [];
    const activeSymbols = marketMode === 'spot' ? symbols : futuresSymbols;
    const activeTickers = marketMode === 'spot' ? tickers : futuresTickers;
    return activeSymbols
      .filter(s => s.symbol.includes(needle) || s.baseAsset.includes(needle))
      .slice(0, 12)
      .map(s => ({ ...s, ticker: activeTickers.get(s.symbol) }));
  }, [query, marketMode, symbols, futuresSymbols, tickers, futuresTickers]);
  const openSymbolChart = (symbol: string, market: MarketMode) => {
    setChartSymbol(symbol);
    setChartMarket(market);
    setChartOpen(true);
  };
  const deferredSignals = useDeferredValue(signals);
  const deferredNotifications = useDeferredValue(notifications);
  const deferredStats = useDeferredValue(stats);
  const deferredTickers = useDeferredValue(tickers);
  const deferredFuturesTickers = useDeferredValue(futuresTickers);
  const openAutoTradeLogin = () => {
    try {
      localStorage.setItem('autoTrade.portalView', 'login');
    } catch {
      // Keep navigation working even if storage is unavailable.
    }
    setPage('auto-trade');
  };

  const saveSelection = async (nextSelected = selected, nextTimeframes = timeframes, nextExitModes = exitModes, nextMarketScope = strategyMarketScope) => {
    setSelected(new Set(nextSelected));
    setTimeframes(new Set(nextTimeframes));
    setExitModes(new Set(nextExitModes));
    setStrategyMarketScope(nextMarketScope);
    await api('/api/strategies/select', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ strategyIds: [...nextSelected], timeframes: [...nextTimeframes], exitModes: [...nextExitModes], marketScope: nextMarketScope })
    });
  };

  const shell = (
    <div className={`app-shell${chartOpen ? ' chart-open' : ''}`}>
      <header className="shell-header">
        <div className="shell-brand" aria-label="Auto Trading System">
          <span className="shell-brand-mark"><TrendingUp size={20} /></span>
          <div>
            <strong>Auto Trading</strong>
            <small>Live crypto command center</small>
          </div>
        </div>
        <nav className="shell-nav" aria-label="Primary navigation">
          <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}><Home size={17} /> <span>Home</span></button>
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}><BarChart3 size={17} /> <span>Dashboard</span></button>
          <button className={page === 'auto-trade' ? 'active premium' : 'premium'} onClick={openAutoTradeLogin}><Bot size={17} /> <span>Auto Trading</span></button>
        </nav>
        <div className="shell-tools">
          <ThemeStudio currentTheme={theme} onOpen={() => setThemePanelOpen(true)} />
          <NotificationSettings
            duration={toastDuration}
            enabled={alertsEnabled}
            onChange={setToastDuration}
            open={alertsPanelOpen}
            onToggle={() => setAlertsEnabled(value => !value)}
            onClose={() => setAlertsPanelOpen(false)}
          />
        </div>
      </header>
      <main className={`page-frame page-${page}`}>
        {page === 'home' && <HomePage
          spotTop={spotTop}
          futuresTop={futuresTop}
          marketMode={marketMode}
          setMarketMode={setMarketMode}
          query={query}
          setQuery={setQuery}
          symbols={symbols}
          futuresSymbols={futuresSymbols}
          searchResults={searchResults}
          dashboard={dashboard}
          homeIntel={homeIntel}
          spotGainers={spotGainers}
          spotLosers={spotLosers}
          futuresGainers={futuresGainers}
          futuresLosers={futuresLosers}
          openAutoTradeLogin={openAutoTradeLogin}
          openSymbolChart={openSymbolChart}
        />}
        {page === 'dashboard' && <DashboardPage
          stats={deferredStats}
          signals={deferredSignals}
          tickers={deferredTickers}
          futuresTickers={deferredFuturesTickers}
          notifications={deferredNotifications}
          selected={selected}
          labStrategyIds={labStrategyIds}
        />}
        {page === 'auto-trade' && <AutoTradePage signals={deferredSignals} strategies={strategies} labStrategyIds={labStrategyIds} setLabStrategyIds={setLabStrategyIds} strategyMarketScope={strategyMarketScope} tickers={deferredTickers} futuresTickers={deferredFuturesTickers} selected={selected} timeframes={timeframes} saveSelection={saveSelection} />}
      </main>
      <ToastStack notifications={toasts} onDismiss={(id) => setToasts(prev => prev.filter(item => item.id !== id))} signals={deferredSignals} />
      {chartOpen && <SymbolChartPanel
        symbol={chartSymbol}
        market={chartMarket}
        timeframe={chartTimeframe}
        onTimeframeChange={setChartTimeframe}
        onClose={() => setChartOpen(false)}
      />}
      {themePanelOpen && <ThemePanel currentTheme={theme} onPick={setTheme} onClose={() => setThemePanelOpen(false)} />}
    </div>
  );

  return shell;
}

function NotificationSettings({
  duration,
  enabled,
  onChange,
  open,
  onToggle,
  onClose
}: {
  duration: number;
  enabled: boolean;
  onChange: (value: number) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open, onClose]);

  return <section ref={panelRef} className={`${open ? 'notification-settings open' : 'notification-settings'} ${enabled ? 'enabled' : 'disabled'}`}>
    <button type="button" className="notification-settings-trigger" onClick={onToggle} aria-pressed={enabled} aria-label={enabled ? 'Turn alerts off' : 'Turn alerts on'}>
      <div className="notification-settings-title">
        <Bell size={14} />
        <span>Alerts</span>
      </div>
      <strong>{enabled ? 'ON' : 'OFF'}</strong>
    </button>
    {open && <div className="notification-settings-popover">
      <div className="toast-duration-grid">
        {[2000, 4000, 7000, 12000].map(value => <button key={value} className={duration === value ? 'active' : ''} onClick={() => {
          onChange(value);
          onClose();
        }}>
          {Math.round(value / 1000)}s
        </button>)}
      </div>
    </div>}
  </section>;
}

function ToastStack({ notifications, onDismiss, signals }: { notifications: Notification[]; onDismiss: (id: number) => void; signals: Signal[] }) {
  const signalSideById = new Map(signals.map(signal => [signal.id, signal.side]));
  if (notifications.length === 0) return null;
  return <div className="toast-stack" aria-live="polite">
    {notifications.map(notification => {
      const side = extractSide(notification.message) ?? signalSideById.get(extractSignalId(notification.title));
      const outcome = notification.level === 'win' ? 'WIN' : notification.level === 'loss' ? 'LOSS' : 'NEW';
      return <article key={notification.id} className={`toast ${notification.level}`} onClick={() => onDismiss(notification.id)}>
        <div className="toast-icon"><Bell size={18} /></div>
        <div>
          <header>
            <strong>{formatToastTitle(notification)}</strong>
            <span className={`toast-outcome ${notification.level}`}>{outcome}</span>
            <button onClick={(event) => { event.stopPropagation(); onDismiss(notification.id); }} aria-label="Dismiss notification">x</button>
          </header>
          <p className="toast-compact-line">{side && <SideBadge side={side} />} <b className={notification.level === 'loss' ? 'bad' : notification.level === 'win' ? 'good' : ''}>{formatToastSummary(notification)}</b></p>
          <small>{time(notification.time)}</small>
        </div>
      </article>;
    })}
  </div>;
}

function NotificationsPanel({
  notifications,
  signals,
  onSelectTrade
}: {
  notifications: Notification[];
  signals: Signal[];
  onSelectTrade?: (tradeId: number | null) => void;
}) {
  const signalSideById = new Map(signals.map(signal => [signal.id, signal.side]));
  return <section className="panel dashboard-notifications-panel">
    <div className="section-title"><h2>Notifications</h2><p>Trade entries and exits.</p></div>
    <div className="notifications">
      {notifications.map(n => {
        const side = extractSide(n.message) ?? signalSideById.get(extractSignalId(n.title));
        const tradeId = extractSignalId(n.title);
        return <button type="button" key={n.id} className={`notification-card ${n.level}`} onClick={() => onSelectTrade?.(tradeId || null)}>
          <Bell size={16} />
          <div className="notification-copy">
            <div className="notification-head">
              <strong>{formatToastTitle(n)}</strong>
              <div className="notification-meta">
                <small>{time(n.time)}</small>
                <span className={`toast-outcome ${n.level}`}>{n.level === 'win' ? 'WIN' : n.level === 'loss' ? 'LOSS' : 'NEW'}</span>
              </div>
            </div>
            <span className="notification-compact-line">{side && <SideBadge side={side} />} <b className={n.level === 'loss' ? 'bad' : n.level === 'win' ? 'good' : ''}>{formatToastSummary(n)}</b></span>
          </div>
        </button>;
      })}
    </div>
  </section>;
}

function formatToastTitle(notification: Notification) {
  const id = extractSignalId(notification.title);
  const symbol = parseNotificationMessage(notification.message).symbol ?? 'Signal';
  return id ? `${formatTradeLabel(id)} ${symbol}` : notification.title;
}

const marketScopeButtonActive = (scope: StrategyMarketScope, button: Exclude<StrategyMarketScope, 'all'>) =>
  scope === 'all' || scope === button;

function formatToastSummary(notification: Notification) {
  const parts = parseNotificationMessage(notification.message);
  if (parts.pnlUsdt) return `${parts.pnlUsdt}${parts.closedPrice ? ` · Closed ${parts.closedPrice}` : ''}`;
  if (parts.pnl) return `${parts.pnl}${parts.closedPrice ? ` · Closed ${parts.closedPrice}` : ''}`;
  if (parts.entryPrice) {
    const riskTargets = [parts.takeProfit ? `TP ${parts.takeProfit}` : '', parts.stopLoss ? `SL ${parts.stopLoss}` : ''].filter(Boolean).join(' · ');
    return `Entry ${parts.entryPrice}${riskTargets ? ` · ${riskTargets}` : ''}`;
  }
  return [parts.direction, parts.market].filter(Boolean).join(' · ') || notification.message;
}

function parseNotificationMessage(message: string) {
  const chunks = message.split('|').map(part => part.trim()).filter(Boolean);
  const symbolSideParts = (chunks[1] ?? '').split(/\s+/).filter(Boolean);
  return {
    market: chunks[0],
    symbol: symbolSideParts[0],
    side: symbolSideParts.includes('LONG') ? 'LONG' : symbolSideParts.includes('SHORT') ? 'SHORT' : undefined,
    direction: chunks.find(part => part.startsWith('Direction '))?.replace('Direction ', ''),
    entryPrice: chunks.find(part => part.startsWith('Entry price '))?.replace('Entry price ', ''),
    closedPrice: chunks.find(part => part.startsWith('Closed price '))?.replace('Closed price ', ''),
    takeProfit: chunks.find(part => part.startsWith('TP '))?.replace('TP ', ''),
    stopLoss: chunks.find(part => part.startsWith('SL '))?.replace('SL ', ''),
    duration: chunks.find(part => part.startsWith('Duration '))?.replace('Duration ', ''),
    pnl: chunks.find(part => part.startsWith('PnL '))?.replace('PnL ', ''),
    pnlUsdt: chunks.find(part => part.startsWith('PnL USDT '))?.replace('PnL USDT ', '')
  };
}

const tradeChartCache = new Map<string, ChartCandle[]>();

function getTradeChartLevels(trade: TradeChartTrade) {
  const takeProfit = trade.takeProfit ?? (trade.side === 'LONG'
    ? trade.entry * (1 + trade.expectedProfitPct / 100)
    : trade.entry * (1 - trade.expectedProfitPct / 100));
  const stopLoss = trade.stopLoss ?? (trade.side === 'LONG'
    ? trade.entry * (1 - trade.riskPct / 100)
    : trade.entry * (1 + trade.riskPct / 100));
  return { entry: trade.entry, takeProfit, stopLoss };
}

function TradeChartModal({ trade, onClose }: { trade: TradeChartTrade | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trade) return;
    let cancelled = false;
    const key = `${trade.market}:${trade.symbol}:${trade.timeframe}`;
    const cached = tradeChartCache.get(key);
    if (cached) {
      setCandles(cached);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    api<{ ok: boolean; candles: ChartCandle[] }>(`/api/chart?symbol=${encodeURIComponent(trade.symbol)}&market=${trade.market}&interval=${trade.timeframe}&limit=240`)
      .then(response => {
        if (cancelled) return;
        tradeChartCache.set(key, response.candles);
        setCandles(response.candles);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load chart candles.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trade]);

  useEffect(() => {
    if (!trade || !containerRef.current || candles.length === 0) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    const container = containerRef.current;
    const levels = getTradeChartLevels(trade);

    import('lightweight-charts').then(module => {
      if (disposed || !containerRef.current) return;
      const { createChart, CandlestickSeries, ColorType, LineStyle } = module as any;
      const chart = createChart(container, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: '#141414' },
          textColor: '#d1d4dc',
          attributionLogo: false
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.06)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.12)' },
        timeScale: { borderColor: 'rgba(255, 255, 255, 0.12)', timeVisible: true, secondsVisible: false },
        crosshair: {
          mode: 1,
          vertLine: { color: 'rgba(209, 212, 220, 0.32)', width: 1, style: LineStyle.Solid },
          horzLine: { color: 'rgba(209, 212, 220, 0.32)', width: 1, style: LineStyle.Solid }
        }
      });
      chartRef.current = chart;
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        priceLineVisible: false,
        lastValueVisible: true
      });
      series.setData(candles.map(candle => ({
        time: Math.floor(candle.openTime / 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      })));
      const isPrimaryLine = (name: 'entry' | 'takeProfit' | 'stopLoss') => {
        if (trade.status === 'WIN') return name === 'takeProfit';
        if (trade.status === 'LOSS') return name === 'stopLoss';
        return name === 'entry';
      };
      const lineOptions = (name: 'entry' | 'takeProfit' | 'stopLoss', color: string) => ({
        lineWidth: isPrimaryLine(name) ? 2 : 1,
        lineStyle: LineStyle.Solid,
        color: isPrimaryLine(name) ? color : color.replace('1)', '0.58)'),
        axisLabelVisible: true
      });
      series.createPriceLine({ price: levels.entry, ...lineOptions('entry', 'rgba(56, 189, 248, 1)'), title: `Entry ${fmt(levels.entry)}` });
      series.createPriceLine({ price: levels.takeProfit, ...lineOptions('takeProfit', 'rgba(8, 153, 129, 1)'), title: `TP ${fmt(levels.takeProfit)}` });
      series.createPriceLine({ price: levels.stopLoss, ...lineOptions('stopLoss', 'rgba(242, 54, 69, 1)'), title: `SL ${fmt(levels.stopLoss)}` });
      chart.timeScale().fitContent();
      resizeObserver = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }));
      resizeObserver.observe(container);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chartRef.current?.remove?.();
      chartRef.current = null;
    };
  }, [candles, trade]);

  if (!trade) return null;
  const levels = getTradeChartLevels(trade);
  const pnl = trade.pnlLabel ?? (typeof trade.pnl === 'number' ? `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}%` : '--');
  return <div className="trade-chart-overlay" role="dialog" aria-modal="true" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className={`trade-chart-modal ${trade.status.toLowerCase()}`}>
      <header className="trade-chart-head">
        <div>
          <span>{formatTradeLabel(trade.id)} | {trade.market.toUpperCase()} | {trade.timeframe}</span>
          <h3>{trade.symbol} {trade.side}</h3>
        </div>
        <div className="trade-chart-status">
          <b className={trade.status === 'WIN' ? 'good' : trade.status === 'LOSS' ? 'bad' : ''}>{trade.status === 'OPEN' ? 'ENTRY' : trade.status}</b>
          <strong className={trade.status === 'LOSS' || (trade.pnl ?? 0) < 0 ? 'bad' : 'good'}>{pnl}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </header>
      <div className="trade-chart-levels">
        <span><b>Entry</b>{fmt(levels.entry)}</span>
        <span><b>TP</b>{fmt(levels.takeProfit)}</span>
        <span><b>SL</b>{fmt(levels.stopLoss)}</span>
        <span><b>Duration</b>{formatDuration(trade.openedAt, trade.closedAt)}</span>
      </div>
      <div className="trade-chart-canvas" ref={containerRef}>
        {loading && <div className="trade-chart-state">Loading TradingView chart...</div>}
        {error && <div className="trade-chart-state error">{error}</div>}
      </div>
    </section>
  </div>;
}

function ThemeStudio({ currentTheme, onOpen }: { currentTheme: Theme; onOpen: () => void }) {
  return <section className={`theme-studio ${currentTheme}`}>
    <div>
      <span>Theme</span>
      <strong>Theme</strong>
    </div>
    <button onClick={onOpen}>Customize</button>
  </section>;
}

function ThemePanel({ currentTheme, onPick, onClose }: { currentTheme: Theme; onPick: (theme: Theme) => void; onClose: () => void }) {
  return <div className="theme-overlay" role="presentation" onClick={onClose}>
    <section className="theme-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
      <header>
        <div>
          <p className="eyebrow">Theme Studio</p>
          <h2>Choose Your Trading Desk</h2>
        </div>
        <button onClick={onClose}>Close</button>
      </header>
      <div className="theme-showcase">
        {themes.map(item => <button key={item.id} className={currentTheme === item.id ? `theme-showcase-card ${item.id} active` : `theme-showcase-card ${item.id}`} onClick={() => {
          onPick(item.id);
          onClose();
        }}>
          <div className="showcase-top">
            <span>{item.name}</span>
            <b>{currentTheme === item.id ? 'ACTIVE' : 'SELECT'}</b>
          </div>
          <div className="showcase-screen">
            <aside>
              <i />
              <i />
              <i />
            </aside>
            <main>
              <span />
              <span />
              <div>
                <i />
                <i />
                <i />
              </div>
              <b />
            </main>
          </div>
          <div className="showcase-palette">
            <i />
            <i />
            <i />
            <i />
          </div>
        </button>)}
      </div>
    </section>
  </div>;
}

function HomePage({
  spotTop,
  futuresTop,
  marketMode,
  setMarketMode,
  query,
  setQuery,
  symbols,
  futuresSymbols,
  searchResults,
  dashboard,
  homeIntel,
  spotGainers,
  spotLosers,
  futuresGainers,
  futuresLosers,
  openAutoTradeLogin,
  openSymbolChart
}: {
  spotTop: Ticker[];
  futuresTop: Ticker[];
  marketMode: MarketMode;
  setMarketMode: (value: MarketMode) => void;
  query: string;
  setQuery: (value: string) => void;
  symbols: SymbolInfo[];
  futuresSymbols: SymbolInfo[];
  searchResults: (SymbolInfo & { ticker?: Ticker })[];
  dashboard: { liveSignals: number; totalSignals: number; monitored: number; monitoredSpot: number; monitoredFutures: number; availableSpot: number; availableFutures: number; selectedStrategies: number; marketScope: StrategyMarketScope; exchange: string };
  homeIntel: HomeIntelResponse | null;
  spotGainers: Ticker[];
  spotLosers: Ticker[];
  futuresGainers: Ticker[];
  futuresLosers: Ticker[];
  openAutoTradeLogin: () => void;
  openSymbolChart: (symbol: string, market: MarketMode) => void;
}) {
  const [leaderMarketMode, setLeaderMarketMode] = useState<MarketMode>('spot');
  const liveCrypto = (marketMode === 'spot' ? spotTop : futuresTop).slice(0, 4);
  const monitoredCount = marketMode === 'spot' ? dashboard.monitoredSpot : dashboard.monitoredFutures;
  const availableCount = marketMode === 'spot' ? dashboard.availableSpot : dashboard.availableFutures;
  const activeLeaders = leaderMarketMode === 'spot'
    ? { gainers: spotGainers, losers: spotLosers }
    : { gainers: futuresGainers, losers: futuresLosers };
  const fearGreedTone =
    (homeIntel?.fearGreed.value ?? 50) >= 75 ? 'hot'
      : (homeIntel?.fearGreed.value ?? 50) >= 55 ? 'warm'
        : (homeIntel?.fearGreed.value ?? 50) >= 40 ? 'neutral'
          : 'cold';

  return <>
    <section className="home-launchpad">
      <div className="home-launchpad-copy">
        <h1>Auto Trading System</h1>
        <p className="home-launchpad-summary">by Muslim Alramadhan</p>
        <div className="home-cta-row">
          <button type="button" className="home-cta-primary" onClick={openAutoTradeLogin}>
            <Bot size={22} />
            <span>
              <strong>Join Auto Trading</strong>
              <small>Member access</small>
            </span>
          </button>
          <a className="home-cta-secondary" href="https://t.me/Autotradingbot71" target="_blank" rel="noreferrer">
            <Send size={22} />
            <span>
              <strong>Join Free Trade Alerts</strong>
              <small>@Autotradingbot71</small>
            </span>
          </a>
        </div>
      </div>
      <div className="home-launchpad-side">
        <div className="home-live-pulse">
          <span className="nav-badge glow">LIVE</span>
          <strong>Crypto</strong>
          <small>{dashboard.liveSignals} live trades</small>
        </div>
        <div className="home-market-grid">
          <article className="market-card active">
            <span>Crypto</span>
            <strong>LIVE</strong>
            <small>Binance</small>
          </article>
          <article className="market-card">
            <span>US Market</span>
            <strong>SOON</strong>
            <small>Equities</small>
          </article>
          <article className="market-card">
            <span>Saudi Market</span>
            <strong>SOON</strong>
            <small>Tadawul</small>
          </article>
          <article className="market-card">
            <span>Forex</span>
            <strong>SOON</strong>
            <small>FX</small>
          </article>
        </div>
      </div>
    </section>

    <section className="home-live-board">
      <div className="home-live-board-head">
        <div>
          <span className="eyebrow">Live crypto pulse</span>
          <h2>Public market board</h2>
        </div>
        <div className="home-market-switch">
          <button type="button" className={marketMode === 'spot' ? 'active' : ''} onClick={() => setMarketMode('spot')}>Spot</button>
          <button type="button" className={marketMode === 'futures' ? 'active' : ''} onClick={() => setMarketMode('futures')}>Futures</button>
        </div>
      </div>
      <div className="home-live-grid">
        {liveCrypto.map(item => <article key={item.symbol} className="home-live-card" onClick={() => openSymbolChart(item.symbol, marketMode)} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openSymbolChart(item.symbol, marketMode); }}>
          <div className="home-live-card-top">
            <span>{item.symbol.replace('USDT', '')}</span>
            <small>{new Date(item.eventTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</small>
          </div>
          <strong>${fmt(item.price)}</strong>
          <div className="home-live-card-bottom">
            <b className={item.change24h >= 0 ? 'good' : 'bad'}>{item.change24h.toFixed(2)}%</b>
            <small>{item.quoteVolume >= 1_000_000 ? `$${(item.quoteVolume / 1_000_000).toFixed(1)}M volume` : `$${Math.round(item.quoteVolume / 1000)}K volume`}</small>
          </div>
        </article>)}
      </div>
    </section>

    <section className="home-search-bridge">
      <div className="search-panel home-search-panel">
        <Search size={20} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={marketMode === 'spot' ? 'Search spot symbols: BTC, ETH, SOL...' : 'Search futures symbols: BTC, ETH, SOL...'} />
        <span>{`${monitoredCount.toLocaleString('en-US')} ${marketMode} markets actively scanned • ${availableCount.toLocaleString('en-US')} available on Binance`}</span>
      </div>
      {searchResults.length > 0 && <section className="results home-results">
        {searchResults.map(item => <article key={item.symbol} onClick={() => openSymbolChart(item.symbol, marketMode)} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openSymbolChart(item.symbol, marketMode); }}>
          <strong>{item.symbol}</strong>
          <span>{item.baseAsset}/{item.quoteAsset}</span>
          <b>${item.ticker ? fmt(item.ticker.price) : '...'}</b>
          <small className={(item.ticker?.change24h ?? 0) >= 0 ? 'good' : 'bad'}>{item.ticker?.change24h.toFixed(2) ?? '0.00'}%</small>
        </article>)}
      </section>}
    </section>

    <section className="home-intel-grid">
      <article className={`home-intel-card home-fear-card tone-${fearGreedTone}`}>
        <div className="home-intel-head">
          <div>
            <span className="eyebrow">Alternative.me</span>
            <h3>Fear &amp; Greed</h3>
          </div>
          <Flame size={20} />
        </div>
        <div className="home-fear-hero">
          <div className="home-fear-copy">
            <small>Now</small>
            <strong>{homeIntel?.fearGreed.classification ?? 'Loading...'}</strong>
          </div>
          <div className="home-fear-gauge">
            <div className="home-fear-gauge-arc" />
            <div className="home-fear-gauge-needle" style={{ transform: `rotate(${((Math.max(0, Math.min(100, homeIntel?.fearGreed.value ?? 0)) / 100) * 180) - 90}deg)` }} />
            <div className="home-fear-gauge-core">{homeIntel?.fearGreed.value ?? '--'}</div>
          </div>
        </div>
        <small>{homeIntel?.fearGreed.timestamp ? `Last updated ${entryTime(homeIntel.fearGreed.timestamp)}` : 'Cached sentiment feed'}</small>
      </article>

      <article className="home-intel-card home-fear-history-card">
        <div className="home-intel-head">
          <div>
            <span className="eyebrow">Historical values</span>
            <h3>Fear Timeline</h3>
          </div>
          <CalendarDays size={20} />
        </div>
        <div className="home-fear-history-list">
          {[
            { label: 'Now', row: { value: homeIntel?.fearGreed.value ?? 0, classification: homeIntel?.fearGreed.classification ?? 'Loading...' } },
            { label: 'Yesterday', row: homeIntel?.fearGreed.yesterday },
            { label: 'Last week', row: homeIntel?.fearGreed.lastWeek },
            { label: 'Last month', row: homeIntel?.fearGreed.lastMonth }
          ].map(item => <article key={item.label} className="home-fear-history-row">
            <div>
              <span>{item.label}</span>
              <strong>{item.row?.classification ?? 'Unavailable'}</strong>
            </div>
            <b>{item.row?.value ?? '--'}</b>
          </article>)}
        </div>
      </article>
    </section>

    <section className="home-signal-shell">
      <div className="home-live-board-head">
        <div>
          <span className="eyebrow">Execution intelligence</span>
          <h2>Decision Inputs</h2>
        </div>
      </div>
      <div className="home-signal-grid">
        <article className="home-signal-card">
          <span>BTC Dominance</span>
          <strong>{homeIntel?.executionIntel.btcDominance != null ? `${homeIntel.executionIntel.btcDominance.toFixed(2)}%` : '--'}</strong>
          <small>CoinGecko global market share</small>
        </article>
        <article className="home-signal-card">
          <span>Funding Rate</span>
          <strong>{homeIntel?.executionIntel.fundingRate != null ? `${homeIntel.executionIntel.fundingRate.toFixed(4)}%` : '--'}</strong>
          <small>{homeIntel?.executionIntel.nextFundingTime ? `Next ${entryTime(homeIntel.executionIntel.nextFundingTime)}` : 'Binance futures'}</small>
        </article>
        <article className="home-signal-card">
          <span>Open Interest</span>
          <strong>{homeIntel?.executionIntel.openInterestUsd != null ? `$${fmtCompactMoney(homeIntel.executionIntel.openInterestUsd)}` : '--'}</strong>
          <small>{homeIntel?.executionIntel.openInterest != null ? `${fmtCompactMoney(homeIntel.executionIntel.openInterest)} BTC contracts` : 'Binance futures'}</small>
        </article>
        <article className="home-signal-card">
          <span>Volume Surge</span>
          <strong>{homeIntel?.executionIntel.volumeSurgeRatio != null ? `${homeIntel.executionIntel.volumeSurgeRatio.toFixed(2)}x` : '--'}</strong>
          <small>{homeIntel?.executionIntel.volumeSurgeLabel ?? 'BTC 1h volume regime'}</small>
        </article>
        <article className="home-signal-card">
          <span>Market Breadth</span>
          <strong>{homeIntel?.executionIntel.marketBreadth.positiveRatio != null ? `${(homeIntel.executionIntel.marketBreadth.positiveRatio * 100).toFixed(0)}%` : '--'}</strong>
          <small>{homeIntel ? `${homeIntel.executionIntel.marketBreadth.advancers} up / ${homeIntel.executionIntel.marketBreadth.decliners} down` : 'Binance breadth'}</small>
        </article>
        <article className="home-signal-card">
          <span>Stablecoin Flow</span>
          <strong>{homeIntel?.executionIntel.stablecoinFlow.available && homeIntel.executionIntel.stablecoinFlow.valueUsd != null ? `$${fmtCompactMoney(Math.abs(homeIntel.executionIntel.stablecoinFlow.valueUsd))}` : 'N/A'}</strong>
          <small>{homeIntel?.executionIntel.stablecoinFlow.label ?? 'Glassnode signal'}</small>
        </article>
      </div>
    </section>

    <section className="home-leader-shell">
      <div className="home-live-board-head">
        <div>
          <span className="eyebrow">Binance live feed</span>
          <h2>Top Gainers &amp; Losers</h2>
        </div>
        <div className="home-leader-head-tools">
          <div className="home-market-switch">
            <button type="button" className={leaderMarketMode === 'spot' ? 'active' : ''} onClick={() => setLeaderMarketMode('spot')}>Spot</button>
            <button type="button" className={leaderMarketMode === 'futures' ? 'active' : ''} onClick={() => setLeaderMarketMode('futures')}>Futures</button>
          </div>
          <div className="home-leader-source-links">
          <a className="home-news-badge" href="https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams#all-market-tickers-stream" target="_blank" rel="noreferrer">
            <Activity size={16} />
            <span>Spot source</span>
          </a>
          <a className="home-news-badge" href="https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/All-Market-Tickers-Streams" target="_blank" rel="noreferrer">
            <Activity size={16} />
            <span>Futures source</span>
          </a>
        </div>
        </div>
      </div>
      <div className="home-leader-columns">
        <article className="home-leader-card gainers">
          <div className="home-intel-head">
            <div>
              <span className="eyebrow">Momentum</span>
              <h3>Top Gainers</h3>
            </div>
            <ArrowUpRight size={20} />
          </div>
          <div className="home-leader-list">
            {activeLeaders.gainers.slice(0, 6).map(item => <button key={`g-${item.symbol}`} type="button" className="home-leader-row" onClick={() => openSymbolChart(item.symbol, leaderMarketMode)}>
              <div>
                <strong>{item.symbol}</strong>
                <small>${fmt(item.price)}</small>
              </div>
              <div className="home-leader-values">
                <b className="good">+{item.change24h.toFixed(2)}%</b>
                <small>{item.quoteVolume >= 1_000_000 ? `$${(item.quoteVolume / 1_000_000).toFixed(1)}M` : `$${Math.round(item.quoteVolume / 1000)}K`}</small>
              </div>
            </button>)}
          </div>
        </article>

        <article className="home-leader-card losers">
          <div className="home-intel-head">
            <div>
              <span className="eyebrow">Pressure</span>
              <h3>Top Losers</h3>
            </div>
            <ArrowDownRight size={20} />
          </div>
          <div className="home-leader-list">
            {activeLeaders.losers.slice(0, 6).map(item => <button key={`l-${item.symbol}`} type="button" className="home-leader-row" onClick={() => openSymbolChart(item.symbol, leaderMarketMode)}>
              <div>
                <strong>{item.symbol}</strong>
                <small>${fmt(item.price)}</small>
              </div>
              <div className="home-leader-values">
                <b className="bad">{item.change24h.toFixed(2)}%</b>
                <small>{item.quoteVolume >= 1_000_000 ? `$${(item.quoteVolume / 1_000_000).toFixed(1)}M` : `$${Math.round(item.quoteVolume / 1000)}K`}</small>
              </div>
            </button>)}
          </div>
        </article>
      </div>
    </section>

    <section className="home-marketcap-shell">
      <div className="home-live-board-head">
        <div>
          <span className="eyebrow">CoinGecko</span>
          <h2>Top Market Cap</h2>
        </div>
        <div className="home-news-badge">
          <Globe2 size={16} />
          <span>Global leaders</span>
        </div>
      </div>
      <div className="home-marketcap-list">
        {(homeIntel?.marketCap ?? []).slice(0, 6).map(asset => <button key={asset.id} type="button" className="home-marketcap-row" onClick={() => openSymbolChart(`${asset.symbol.toUpperCase()}USDT`, 'spot')}>
          <div className="home-marketcap-rank">#{asset.marketCapRank}</div>
          <div className="home-marketcap-copy">
            <strong>{asset.symbol.toUpperCase()}</strong>
            <small>{asset.name}</small>
          </div>
          <div className="home-marketcap-values">
            <b>${fmt(asset.currentPrice)}</b>
            <small>${(asset.marketCap / 1_000_000_000).toFixed(1)}B</small>
          </div>
        </button>)}
      </div>
    </section>

    <section className="home-news-shell">
      <div className="home-live-board-head">
        <div>
          <span className="eyebrow">CoinDesk</span>
          <h2>Crypto News Flow</h2>
        </div>
        <div className="home-news-badge">
          <Newspaper size={16} />
          <span>Fresh headlines</span>
        </div>
      </div>
      <div className="home-news-grid">
        {(homeIntel?.news ?? []).slice(0, 6).map(item => <a key={item.id} className="home-news-card" href={item.url} target="_blank" rel="noreferrer">
          <div className="home-news-top">
            <span>{item.source}</span>
            <small>{item.publishedAt ? entryTime(item.publishedAt) : 'Recent'}</small>
          </div>
          <strong>{item.title}</strong>
          <div className="home-news-tags">
            {item.currencies.slice(0, 4).map(currency => <b key={`${item.id}-${currency}`}>{currency}</b>)}
          </div>
        </a>)}
      </div>
    </section>

  </>;
}

function FieldHint({ label, hint }: { label: string; hint: string }) {
  return <span className="field-label">
    <span>{label}</span>
    <span className="field-hint">
      <AlertCircle size={13} />
      <i>{hint}</i>
    </span>
  </span>;
}

function readAutoTradeSetting(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function readAutoTradeBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

type ShadowRuleProfile = {
  enabled: boolean;
  replayMode: 'live-shadow' | 'historical-replay';
  replayRange: PerformanceRange;
  startDate: string;
  endDate: string;
  liveStartAt: number;
  capital: string;
  riskPerTrade: string;
  maxTrades: string;
  dailyLoss: string;
  reserveRatio: string;
  executionSource: 'best-single' | 'top-2' | 'top-4' | 'custom';
  allocationMethod: 'equal' | 'risk';
  maxStrategyExposure: string;
  minRiskReward: '1:1' | '1:2' | '1:3' | '1:4' | 'custom';
  customRiskReward: string;
  allowedDirection: 'both' | 'long-only' | 'short-only';
};

type ShadowRunSnapshot = {
  id: string;
  profileId: string;
  profileName: string;
  savedAt: number;
  startTime: number;
  endTime: number;
  durationLabel: string;
  startingCapital: number;
  currentCapital: number;
  closedPnl: number;
  openPnl: number;
  netPnl: number;
  changePct: number;
  rejectedCount: number;
  checkedSignalsCount: number;
  rejectedReasonItems: { label: string; value: number }[];
};

function readShadowRuleProfile(key: string, fallback: ShadowRuleProfile) {
  try {
    const raw = localStorage.getItem(`autoTrade.shadowProfile.${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ShadowRuleProfile>;
    return {
      ...fallback,
      ...parsed,
      liveStartAt: typeof parsed.liveStartAt === 'number' ? parsed.liveStartAt : fallback.liveStartAt
    } as ShadowRuleProfile;
  } catch {
    return fallback;
  }
}

function readShadowRunSnapshots() {
  try {
    const raw = localStorage.getItem('autoTrade.shadowSnapshots');
    if (!raw) return [] as ShadowRunSnapshot[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ShadowRunSnapshot[] : [];
  } catch {
    return [] as ShadowRunSnapshot[];
  }
}

function isPresetValue(value: string, presets: string[]) {
  return presets.includes(value.trim());
}

function sanitizeNumericInput(value: string, integerOnly = false) {
  if (integerOnly) return value.replace(/[^\d]/g, '');
  const cleaned = value.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
}

function CustomPillLabel({ active }: { active: boolean }) {
  return <>Custom{active && <span className="custom-pill-check" aria-hidden="true">✓</span>}</>;
}

function buildDefaultShadowProfile(profileId: string, baseShadowProfile: ShadowRuleProfile): ShadowRuleProfile {
  const now = Date.now();
  if (profileId === 'shadowA') return {
    ...baseShadowProfile,
    enabled: true,
    replayMode: 'live-shadow',
    replayRange: '24h',
    startDate: toDateInput(now),
    endDate: toDateInput(now),
    liveStartAt: now,
    capital: '100',
    riskPerTrade: '1.5',
    maxTrades: '4',
    dailyLoss: '5',
    reserveRatio: '25',
    executionSource: 'best-single',
    allocationMethod: 'equal',
    maxStrategyExposure: '40',
    minRiskReward: '1:2',
    customRiskReward: '1:2.5',
    allowedDirection: 'both'
  };
  if (profileId === 'shadowB') return {
    ...baseShadowProfile,
    enabled: true,
    replayMode: 'historical-replay',
    replayRange: '7d',
    startDate: toDateInput(now - 6 * 24 * 60 * 60 * 1000),
    endDate: toDateInput(now),
    liveStartAt: now,
    capital: '100',
    riskPerTrade: '1',
    maxTrades: '3',
    dailyLoss: '4',
    reserveRatio: '35',
    executionSource: 'top-2',
    allocationMethod: 'risk',
    maxStrategyExposure: '30',
    minRiskReward: '1:2',
    customRiskReward: '1:2.5',
    allowedDirection: 'both'
  };
  if (profileId === 'shadowC') return {
    ...baseShadowProfile,
    enabled: true,
    replayMode: 'historical-replay',
    replayRange: '30d',
    startDate: toDateInput(now - 29 * 24 * 60 * 60 * 1000),
    endDate: toDateInput(now),
    liveStartAt: now,
    capital: '100',
    riskPerTrade: '2',
    maxTrades: '5',
    dailyLoss: '6',
    reserveRatio: '20',
    executionSource: 'top-4',
    allocationMethod: 'equal',
    maxStrategyExposure: '45',
    minRiskReward: '1:3',
    customRiskReward: '1:2.5',
    allowedDirection: 'both'
  };
  if (profileId === 'shadowD') return {
    ...baseShadowProfile,
    enabled: true,
    replayMode: 'historical-replay',
    replayRange: '90d',
    startDate: toDateInput(now - 89 * 24 * 60 * 60 * 1000),
    endDate: toDateInput(now),
    liveStartAt: now,
    capital: '100',
    riskPerTrade: '2.5',
    maxTrades: '6',
    dailyLoss: '8',
    reserveRatio: '15',
    executionSource: 'custom',
    allocationMethod: 'risk',
    maxStrategyExposure: '55',
    minRiskReward: 'custom',
    customRiskReward: '1:2.5',
    allowedDirection: 'both'
  };
  return { ...baseShadowProfile, liveStartAt: now };
}

function buildClearedShadowProfile(profileId: string, baseShadowProfile: ShadowRuleProfile): ShadowRuleProfile {
  const now = Date.now();
  const defaultProfile = buildDefaultShadowProfile(profileId, baseShadowProfile);
  return {
    ...defaultProfile,
    enabled: false,
    replayMode: 'live-shadow',
    replayRange: '24h',
    startDate: toDateInput(now),
    endDate: toDateInput(now),
    liveStartAt: now
  };
}

function AutoTradePage({
  signals,
  strategies,
  labStrategyIds,
  setLabStrategyIds,
  strategyMarketScope,
  tickers,
  futuresTickers,
  selected,
  timeframes,
  saveSelection
}: {
  signals: Signal[];
  strategies: Strategy[];
  labStrategyIds: string[];
  setLabStrategyIds: React.Dispatch<React.SetStateAction<string[]>>;
  strategyMarketScope: StrategyMarketScope;
  tickers: Map<string, Ticker>;
  futuresTickers: Map<string, Ticker>;
  selected: Set<string>;
  timeframes: Set<Timeframe>;
  saveSelection: (nextSelected?: Set<string>, nextTimeframes?: Set<Timeframe>, nextExitModes?: Set<ExitMode>, nextMarketScope?: StrategyMarketScope) => Promise<void>;
}) {
  const [portalView, setPortalView] = useState<'login' | 'user' | 'admin'>(() => {
    const saved = readAutoTradeSetting('autoTrade.portalView', 'login');
    return saved === 'user' || saved === 'admin' ? saved : 'login';
  });
  const [capital] = useState(() => readAutoTradeSetting('autoTrade.capital', '25000'));
  const [venueMode, setVenueMode] = useState<MarketMode>(() => readAutoTradeSetting('autoTrade.venueMode', 'spot') === 'futures' ? 'futures' : 'spot');
  const [riskPerTrade, setRiskPerTrade] = useState(() => readAutoTradeSetting('autoTrade.riskPerTrade', '1.5'));
  const [maxTrades, setMaxTrades] = useState(() => readAutoTradeSetting('autoTrade.maxTrades', '6'));
  const [dailyLoss, setDailyLoss] = useState(() => readAutoTradeSetting('autoTrade.dailyLoss', '3'));
  const [customOpenTradeLimit, setCustomOpenTradeLimit] = useState(() => {
    const saved = readAutoTradeSetting('autoTrade.maxTrades', '6');
    return Number(saved) >= 999 ? '6' : saved;
  });
  const [customDailyLossLimit, setCustomDailyLossLimit] = useState(() => {
    const saved = readAutoTradeSetting('autoTrade.dailyLoss', '3');
    return saved === '3' ? '5' : saved;
  });
  const [reserveRatio, setReserveRatio] = useState(() => readAutoTradeSetting('autoTrade.reserveRatio', '25'));
  const [autoMode] = useState<'shadow' | 'live'>('live');
  const [futuresLeverage, setFuturesLeverage] = useState(() => readAutoTradeSetting('autoTrade.futuresLeverage', '5'));
  const [futuresMarginMode, setFuturesMarginMode] = useState<'isolated' | 'cross'>(() => readAutoTradeSetting('autoTrade.futuresMarginMode', 'isolated') === 'cross' ? 'cross' : 'isolated');
  const [breakEvenEnabled, setBreakEvenEnabled] = useState(() => readAutoTradeSetting('autoTrade.breakEvenEnabled', 'true') !== 'false');
  const [breakEvenTriggerPct, setBreakEvenTriggerPct] = useState(() => readAutoTradeSetting('autoTrade.breakEvenTriggerPct', '1'));
  const [trailingStopEnabled, setTrailingStopEnabled] = useState(() => readAutoTradeSetting('autoTrade.trailingStopEnabled', 'true') !== 'false');
  const [trailingGapPct, setTrailingGapPct] = useState(() => readAutoTradeSetting('autoTrade.trailingGapPct', '0.8'));
  const [portfolioFloorEnabled, setPortfolioFloorEnabled] = useState(() => readAutoTradeSetting('autoTrade.portfolioFloorEnabled', 'true') !== 'false');
  const [portfolioFloorTriggerPct, setPortfolioFloorTriggerPct] = useState(() => readAutoTradeSetting('autoTrade.portfolioFloorTriggerPct', '13'));
  const [portfolioFloorLockPct, setPortfolioFloorLockPct] = useState(() => readAutoTradeSetting('autoTrade.portfolioFloorLockPct', '8'));
  const [liveExecutionMode, setLiveExecutionMode] = useState<'test' | 'live'>(() => readAutoTradeSetting('autoTrade.liveExecutionMode', 'live') === 'live' ? 'live' : 'test');
  const [liveKillSwitch, setLiveKillSwitch] = useState(() => readAutoTradeSetting('autoTrade.liveKillSwitch', 'false') !== 'false');
  const [, setLiveRuleToggles] = useState<LiveRulesPayload['ruleToggles']>(defaultLiveRuleToggles);
  const [executionSource, setExecutionSource] = useState<'best-single' | 'top-2' | 'top-4' | 'custom'>(() => {
    const saved = readAutoTradeSetting('autoTrade.executionSource', 'best-single');
    return saved === 'top-2' || saved === 'top-4' || saved === 'custom' ? saved : 'best-single';
  });
  const [allocationMethod, setAllocationMethod] = useState<'equal' | 'risk'>('equal');
  const [maxStrategyExposure, setMaxStrategyExposure] = useState(() => readAutoTradeSetting('autoTrade.maxStrategyExposure', '40'));
  const [allowedDirection, setAllowedDirection] = useState<'both' | 'long-only' | 'short-only'>(() => {
    const saved = readAutoTradeSetting('autoTrade.allowedDirection', 'both');
    return saved === 'long-only' || saved === 'short-only' ? saved : 'both';
  });
  const [maxLossStreak, setMaxLossStreak] = useState(() => readAutoTradeSetting('autoTrade.maxLossStreak', '3'));
  const [drawdownPause, setDrawdownPause] = useState(() => readAutoTradeSetting('autoTrade.drawdownPause', '8'));
  const [minRiskReward, setMinRiskReward] = useState<'1:1' | '1:2' | '1:3' | '1:4' | 'custom'>(() => {
    const saved = readAutoTradeSetting('autoTrade.minRiskReward', '1:2');
    return saved === '1:1' || saved === '1:3' || saved === '1:4' || saved === 'custom' ? saved : '1:2';
  });
  const [customRiskReward, setCustomRiskReward] = useState(() => readAutoTradeSetting('autoTrade.customRiskReward', '1:2.5'));
  const [portfolioTradesStatusFilter, setPortfolioTradesStatusFilter] = useState<'all' | 'open' | 'closed' | 'win' | 'loss'>('all');
  const [portfolioTradesSideFilter, setPortfolioTradesSideFilter] = useState<'all' | 'long' | 'short'>('all');
  const [portfolioTradesMarketFilter, setPortfolioTradesMarketFilter] = useState<'all' | 'spot' | 'futures'>('all');
  const [portfolioTradesTimeframeFilter, setPortfolioTradesTimeframeFilter] = useState<'all' | Timeframe>('all');
  const [portfolioTradesExecutionProfileFilter, setPortfolioTradesExecutionProfileFilter] = useState<'all' | ExitMode>('all');
  const [portfolioTradesScoreFilter, setPortfolioTradesScoreFilter] = useState<ScoreFilter>('all');
  const [portfolioTradeQuery, setPortfolioTradeQuery] = useState('');
  const [portfolioRejectedTradeQuery, setPortfolioRejectedTradeQuery] = useState('');
  const [portfolioAcceptedKind, setPortfolioAcceptedKind] = useState<'all' | 'test' | 'live'>('all');
  const [portfolioRejectedKind, setPortfolioRejectedKind] = useState<'all' | 'test' | 'live'>('all');
  const [chartTrade, setChartTrade] = useState<TradeChartTrade | null>(null);
  const [livePortfolioSummary, setLivePortfolioSummary] = useState<LivePortfolioSummaryResponse | null>(null);
  const [livePortfolioData, setLivePortfolioData] = useState<LivePortfolioLedgerResponse | null>(null);
  const [livePortfolioLoading, setLivePortfolioLoading] = useState(false);
  const [liveRulesOpen, setLiveRulesOpen] = useState(false);
  const [adminControlOpen, setAdminControlOpen] = useState(() => readAutoTradeSetting('autoTrade.adminControlOpen', 'false') === 'true');
  const [publicOpsOpen, setPublicOpsOpen] = useState(true);
  const liveRulesAutoSaveReadyRef = useRef(false);
  const liveRulesAutoSaveTimerRef = useRef<number | null>(null);
  const lastAutoSavedRulesKeyRef = useRef('');
  const [adminPersonalOpen, setAdminPersonalOpen] = useState(false);
  const [hideSmallBinanceAssets, setHideSmallBinanceAssets] = useState(() => readAutoTradeSetting('autoTrade.hideSmallBinanceAssets', 'false') === 'true');
  const [focusedPortfolioTradeId, setFocusedPortfolioTradeId] = useState<number | null>(null);
  const [portfolioTradesRange, setPortfolioTradesRange] = useState<PerformanceRange>('24h');
  const [portfolioTradesCustomFrom, setPortfolioTradesCustomFrom] = useState(() => toDateInput(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const [portfolioTradesCustomTo, setPortfolioTradesCustomTo] = useState(() => toDateInput(Date.now()));
  const acceptedPortfolioSectionRef = useRef<HTMLDivElement | null>(null);
  const handledFocusedPortfolioTradeIdRef = useRef<number | null>(null);
  const [selectedShadowProfileId, setSelectedShadowProfileId] = useState('shadowA');
  const [editingShadowProfileId, setEditingShadowProfileId] = useState<string | null>(null);
  const [shadowRunSnapshots, setShadowRunSnapshots] = useState<ShadowRunSnapshot[]>(() => readShadowRunSnapshots());
  const [selectedShadowRunIndex, setSelectedShadowRunIndex] = useState(0);
  const baseShadowProfile = useMemo<ShadowRuleProfile>(() => ({
    enabled: true,
    replayMode: 'live-shadow',
    replayRange: '24h',
    startDate: toDateInput(Date.now()),
    endDate: toDateInput(Date.now()),
    liveStartAt: Date.now(),
    capital,
    riskPerTrade,
    maxTrades,
    dailyLoss,
    reserveRatio,
    executionSource,
    allocationMethod,
    maxStrategyExposure,
    minRiskReward,
    customRiskReward,
    allowedDirection
  }), [allocationMethod, allowedDirection, capital, customRiskReward, dailyLoss, executionSource, maxStrategyExposure, maxTrades, minRiskReward, reserveRatio, riskPerTrade]);
  const [shadowRuleProfiles, setShadowRuleProfiles] = useState<Record<string, ShadowRuleProfile>>(() => ({
    shadowA: readShadowRuleProfile('shadowA', buildDefaultShadowProfile('shadowA', baseShadowProfile)),
    shadowB: readShadowRuleProfile('shadowB', buildDefaultShadowProfile('shadowB', baseShadowProfile)),
    shadowC: readShadowRuleProfile('shadowC', buildDefaultShadowProfile('shadowC', baseShadowProfile)),
    shadowD: readShadowRuleProfile('shadowD', buildDefaultShadowProfile('shadowD', baseShadowProfile))
  }));

  const insightRows = useMemo(() => buildInsightRows(signals, strategies, tickers)
    .sort((a, b) => b.score - a.score || b.winRate - a.winRate || b.closed - a.closed || b.total - a.total), [signals, strategies, tickers]);
  const lead = insightRows[0] ?? null;
  const [memberName, setMemberName] = useState(() => readAutoTradeSetting('autoTrade.memberName', 'Premium Member'));
  const [adminName, setAdminName] = useState(() => readAutoTradeSetting('autoTrade.adminName', 'Muslim Alramadhan'));
  const [adminUsername, setAdminUsername] = useState(() => readAutoTradeSetting('autoTrade.adminUsername', 'Muslim Alramadhan'));
  const [adminPassword, setAdminPassword] = useState(() => readAutoTradeSetting('autoTrade.adminPassword', 'Mueaa71_'));
  const [adminEmail, setAdminEmail] = useState(() => readAutoTradeSetting('autoTrade.adminEmail', 'admin@local.test'));
  const [adminTelegram, setAdminTelegram] = useState(() => readAutoTradeSetting('autoTrade.adminTelegram', '@admin'));
  const [adminPhone, setAdminPhone] = useState(() => readAutoTradeSetting('autoTrade.adminPhone', '+966599204215'));
  const [binanceApiKey, setBinanceApiKey] = useState('');
  const [binanceSecretKey, setBinanceSecretKey] = useState('');
  const [binanceApiVisible, setBinanceApiVisible] = useState(false);
  const [binanceSecretVisible, setBinanceSecretVisible] = useState(false);
  const [binanceConnection, setBinanceConnection] = useState<BinanceConnection>(normalizeBinanceConnection());
  const [binanceWallet, setBinanceWallet] = useState<BinanceWalletSummary>({
    ok: false,
    connected: false,
    updatedAt: null,
    assetCount: 0,
    totalValueUsdt: 0,
    futuresTotalUsdt: 0,
    futuresAvailableUsdt: 0,
    pnl24hUsdt: 0,
    pnl24hPct: 0,
    balances: []
  });
  const [binanceEditorOpen, setBinanceEditorOpen] = useState(false);
  const [binanceMessage, setBinanceMessage] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinTelegram, setJoinTelegram] = useState('');
  const [joinPhone, setJoinPhone] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<'user' | 'admin'>('user');
  const [rememberLogin, setRememberLogin] = useState(() => Boolean(localStorage.getItem(loginStorageKey('user'))));
  const [authMessage, setAuthMessage] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [accessFilter, setAccessFilter] = useState<'all' | 'active' | 'pending' | 'pause'>('all');
  const [adminCredentialsOpen, setAdminCredentialsOpen] = useState(false);
  const [adminDraftUsername, setAdminDraftUsername] = useState(adminUsername);
  const [adminDraftEmail, setAdminDraftEmail] = useState(adminEmail);
  const [adminDraftTelegram, setAdminDraftTelegram] = useState(adminTelegram);
  const [adminDraftPhone, setAdminDraftPhone] = useState(adminPhone);
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminCurrentPasswordVisible, setAdminCurrentPasswordVisible] = useState(false);
  const [adminNewPasswordVisible, setAdminNewPasswordVisible] = useState(false);
  const [adminConfirmPasswordVisible, setAdminConfirmPasswordVisible] = useState(false);
  const [adminCredentialMessage, setAdminCredentialMessage] = useState('');
  const [userAccessOpen, setUserAccessOpen] = useState(false);
  const [userDraftUsername, setUserDraftUsername] = useState('');
  const [userDraftTelegram, setUserDraftTelegram] = useState('');
  const [userDraftPhone, setUserDraftPhone] = useState('');
  const [userCurrentPassword, setUserCurrentPassword] = useState('');
  const [userNewPassword, setUserNewPassword] = useState('');
  const [userConfirmPassword, setUserConfirmPassword] = useState('');
  const [userCurrentPasswordVisible, setUserCurrentPasswordVisible] = useState(false);
  const [userNewPasswordVisible, setUserNewPasswordVisible] = useState(false);
  const [userConfirmPasswordVisible, setUserConfirmPasswordVisible] = useState(false);
  const [userAccessMessage, setUserAccessMessage] = useState('');
  const [adminTelegramNotificationEnabled, setAdminTelegramNotificationEnabled] = useState(() => localStorage.getItem('autoTrade.adminTelegramNotificationEnabled') !== 'false');
  const [telegramSubscribers, setTelegramSubscribers] = useState<TelegramSubscriber[]>([]);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    ok: true,
    publicChannelEnabled: true,
    publicChannelChatId: '@Autotradingbot71',
    publicChannelInviteUrl: 'https://t.me/+dUNDQCSrwpJjM2U0',
    publicBotUsername: 'Autotradingbot71',
    publicBotConfigured: true,
    privateBotUsername: PRIVATE_TELEGRAM_BOT_FALLBACK_USERNAME,
    privateBotConfigured: true
  });
  const [telegramActionMessage, setTelegramActionMessage] = useState('');
  const [telegramActionBusyId, setTelegramActionBusyId] = useState<string | null>(null);
  const [telegramActionLevel, setTelegramActionLevel] = useState<'info' | 'success' | 'warning'>('info');
  const [rulesSaveMessage, setRulesSaveMessage] = useState('');
  const [adminControlMessage, setAdminControlMessage] = useState('');
  const [adminStrategyViews, setAdminStrategyViews] = useState<Set<'public' | 'lab'>>(new Set(['public']));
  const [userStrategyViews, setUserStrategyViews] = useState<Set<'public' | 'lab'>>(new Set(['public']));
  const [dashboardResetConfirmOpen, setDashboardResetConfirmOpen] = useState(false);
  const [liveModeConfirmOpen, setLiveModeConfirmOpen] = useState(false);
  const [userSelectedStrategies, setUserSelectedStrategies] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('autoTrade.userSelectedStrategies') ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>(() => {
    const cleanSeed = [{
      id: 1,
      userId: 'USR-0001',
      name: '\u0627\u0643\u062a\u0628',
      username: '\u0627\u0643\u062a\u0628',
      password: 'Pending123!',
      email: 'pending@local.test',
      telegram: '-',
      phone: '-',
      status: 'pending' as const,
      enabled: false,
      telegramNotificationsEnabled: true
    }];
    try {
      if (localStorage.getItem('autoTrade.accessCleanSeed.v1') !== 'done') {
        localStorage.setItem('autoTrade.accessRequests', JSON.stringify(cleanSeed));
        localStorage.setItem('autoTrade.accessCleanSeed.v1', 'done');
        return cleanSeed;
      }
      const saved = JSON.parse(localStorage.getItem('autoTrade.accessRequests') ?? '[]');
      return Array.isArray(saved) ? saved.map((request: any) => ({
        id: Number(request.id) || Date.now(),
        userId: String(request.userId ?? `USR-${String(request.id ?? Date.now()).slice(-6)}`),
        name: String(request.name ?? 'New Member'),
        username: String(request.username ?? ''),
        password: String(request.password ?? ''),
        email: String(request.email ?? ''),
        telegram: String(request.telegram ?? ''),
        phone: String(request.phone ?? ''),
        status: request.status === 'approved' || request.status === 'rejected' ? request.status : 'pending',
        enabled: request.enabled !== false,
        approvedAt: Number(request.approvedAt) || undefined,
        telegramNotificationsEnabled: request.telegramNotificationsEnabled !== false
      })) : [];
    } catch {
      return [];
    }
  });
  const activeName = portalView === 'admin' ? adminUsername : memberName;
  useEffect(() => {
  }, [portfolioTradesRange, portfolioTradesCustomFrom, portfolioTradesCustomTo, portfolioTradesStatusFilter, portfolioTradesSideFilter, portfolioTradesMarketFilter, portfolioTradesTimeframeFilter, portfolioTradesExecutionProfileFilter, portfolioTradeQuery, portfolioRejectedTradeQuery, portfolioAcceptedKind, portfolioRejectedKind, autoMode]);
  const greetingLine = useMemo(() => {
    const hour = new Date().getHours();
    const moment = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const lines = [
      `${activeName}, everything is ready for your success.`,
      `${activeName}, your setup is ready for progress.`,
      `${activeName}, your trading desk is ready.`,
      `${activeName}, everything is set for clear execution.`
    ];
    return lines[Math.floor(Date.now() / 60000) % lines.length];
  }, [activeName]);

  const saveAccessRequests = (next: typeof accessRequests) => {
    setAccessRequests(next);
    localStorage.setItem('autoTrade.accessRequests', JSON.stringify(next));
  };

  const getNextUserId = (requests = accessRequests) => {
    const used = new Set(requests.map(request => request.userId));
    for (let index = 1; index < 10000; index += 1) {
      const userId = `USR-${String(index).padStart(4, '0')}`;
      if (!used.has(userId)) return userId;
    }
    return `USR-${Date.now()}`;
  };

  const submitAccessRequest = () => {
    const username = joinUsername.trim();
    const password = joinPassword.trim();
    const email = joinEmail.trim().toLowerCase();
    const telegram = joinTelegram.trim() || '-';
    const phone = joinPhone.trim();
    if (!username || !password) {
      setAuthMessage('Username and password are required.');
      return;
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setAuthMessage(policyError);
      return;
    }
    if (accessRequests.some(request => request.username === username || (email && request.email.toLowerCase() === email))) {
      setAuthMessage(email ? 'This username or email already exists.' : 'This username already exists.');
      return;
    }
    const id = Date.now();
    saveAccessRequests([{ id, userId: getNextUserId(), name: username, username, password, email, telegram, phone, status: 'pending', enabled: true, telegramNotificationsEnabled: true }, ...accessRequests]);
    setJoinName('');
    setJoinUsername('');
    setJoinPassword('');
    setJoinEmail('');
    setJoinTelegram('');
    setJoinPhone('');
    setAuthMessage('Request sent. Waiting for admin approval.');
    setRegisterOpen(false);
  };

  const updateAccessRequest = (id: number, status: 'approved' | 'rejected') => {
    saveAccessRequests(accessRequests.map(request => request.id === id ? { ...request, status, enabled: status === 'approved' ? request.enabled : false, approvedAt: status === 'approved' ? (request.approvedAt ?? Date.now()) : request.approvedAt } : request));
  };

  const toggleMemberEnabled = (id: number) => {
    saveAccessRequests(accessRequests.map(request => request.id === id ? { ...request, enabled: !request.enabled } : request));
  };
  const removeAccessRequest = (id: number) => {
    saveAccessRequests(accessRequests.filter(request => request.id !== id));
  };

  const toggleAdminStrategy = (strategyId: string) => {
    const nextSelected = new Set(selected);
    if (nextSelected.has(strategyId)) nextSelected.delete(strategyId);
    else nextSelected.add(strategyId);
    saveSelection(nextSelected).catch(() => setAuthMessage('Strategy update failed.'));
  };
  const toggleAllPublicStrategies = (enabled: boolean) => {
    const nextSelected = new Set(selected);
    strategies.forEach(strategy => {
      if (enabled) nextSelected.add(strategy.id);
      else nextSelected.delete(strategy.id);
    });
    const nextTimeframes = enabled ? new Set(allTimeframes) : new Set<Timeframe>();
    saveSelection(nextSelected, nextTimeframes, undefined, 'all').then(() => {
      setAdminControlMessage(enabled ? 'All strategies, both venues, and all timeframes enabled.' : 'All strategies disabled and filters reset.');
    }).catch(() => setAdminControlMessage('Bulk strategy update failed.'));
    setAdminStrategyViews(new Set(['public', 'lab']));
  };
  const toggleAdminTimeframe = (timeframe: Timeframe) => {
    const nextTimeframes = new Set(timeframes);
    if (nextTimeframes.has(timeframe)) nextTimeframes.delete(timeframe);
    else nextTimeframes.add(timeframe);
    saveSelection(selected, nextTimeframes, undefined, strategyMarketScope).then(() => {
      setAdminControlMessage(`Timeframes updated: ${allTimeframes.filter(item => nextTimeframes.has(item)).join(' / ') || 'None'}.`);
    }).catch(() => setAdminControlMessage('Timeframe update failed.'));
  };
  const updateStrategyMarketScope = (scope: StrategyMarketScope) => {
    saveSelection(selected, undefined, undefined, scope).then(() => {
      setAdminControlMessage(`Strategy market set to ${scope.toUpperCase()}.`);
    }).catch(() => setAdminControlMessage('Market scope update failed.'));
  };
  const moveLabStrategyToPublic = (strategyId: string) => {
    setLabStrategyIds(prev => prev.filter(id => id !== strategyId));
    setAdminControlMessage('Strategy moved to Public.');
  };
  const resetDashboardData = async () => {
    try {
      await api('/api/dashboard/reset', { method: 'POST' });
      setAdminControlMessage('Dashboard data reset.');
      setDashboardResetConfirmOpen(false);
      window.location.reload();
    } catch {
      setAdminControlMessage('Dashboard reset failed.');
    }
  };
  const handlePasswordReset = () => {
    setAuthMessage('Email password recovery is not enabled yet in this local version.');
    setPasswordResetOpen(false);
  };
  const toggleUserStrategy = (strategyId: string) => {
    const next = new Set(userSelectedStrategies);
    if (next.has(strategyId)) next.delete(strategyId);
    else next.add(strategyId);
    setUserSelectedStrategies(next);
    localStorage.setItem('autoTrade.userSelectedStrategies', JSON.stringify([...next]));
  };
  const toggleAllUserStrategies = (enabled: boolean) => {
    const next = new Set(userSelectedStrategies);
    strategies.forEach(strategy => {
      if (enabled) next.add(strategy.id);
      else next.delete(strategy.id);
    });
    setUserSelectedStrategies(next);
    localStorage.setItem('autoTrade.userSelectedStrategies', JSON.stringify([...next]));
    const nextSelected = new Set(selected);
    strategies.forEach(strategy => {
      if (enabled) nextSelected.add(strategy.id);
      else nextSelected.delete(strategy.id);
    });
    const nextTimeframes = enabled ? new Set(allTimeframes) : new Set<Timeframe>();
    saveSelection(nextSelected, nextTimeframes, undefined, 'all').catch(() => undefined);
    setUserStrategyViews(new Set(['public', 'lab']));
  };
  const toggleStrategyViewFilter = (view: 'public' | 'lab', owner: 'admin' | 'user') => {
    const setter = owner === 'admin' ? setAdminStrategyViews : setUserStrategyViews;
    const current = owner === 'admin' ? adminStrategyViews : userStrategyViews;
    const next = new Set(current);
    if (next.has(view)) {
      if (next.size === 1) return;
      next.delete(view);
    } else {
      next.add(view);
    }
    setter(next);
  };
  const toggleStrategyMarketScope = (scope: Exclude<StrategyMarketScope, 'all'>) => {
    const current = new Set<Exclude<StrategyMarketScope, 'all'>>();
    if (strategyMarketScope === 'all' || strategyMarketScope === 'spot') current.add('spot');
    if (strategyMarketScope === 'all' || strategyMarketScope === 'futures') current.add('futures');
    if (current.has(scope)) {
      if (current.size === 1) return;
      current.delete(scope);
    } else {
      current.add(scope);
    }
    const nextScope: StrategyMarketScope = current.size === 2 ? 'all' : current.has('spot') ? 'spot' : 'futures';
    updateStrategyMarketScope(nextScope);
  };
  const toggleUserTelegramDelivery = () => {
    if (!activeUserRecord) return;
    saveAccessRequests(accessRequests.map(request => request.id === activeUserRecord.id ? { ...request, telegramNotificationsEnabled: !request.telegramNotificationsEnabled } : request));
  };
  const toggleAdminTelegramNotification = () => {
    setAdminTelegramNotificationEnabled(value => {
      localStorage.setItem('autoTrade.adminTelegramNotificationEnabled', String(!value));
      return !value;
    });
  };
  const openBinanceEditor = () => {
    setBinanceApiKey('');
    setBinanceSecretKey('');
    setBinanceApiVisible(false);
    setBinanceSecretVisible(false);
    setBinanceMessage('');
    setBinanceEditorOpen(true);
  };
  const saveBinanceConnection = async () => {
    const apiKey = binanceApiKey.trim();
    const secretKey = binanceSecretKey.trim();
    if (!apiKey || !secretKey) {
      setBinanceMessage('API key and secret key are required.');
      return;
    }
    try {
      const next = await api<BinanceConnection & { ok: boolean; message?: string }>('/api/binance/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, secretKey })
      });
      setBinanceConnection(normalizeBinanceConnection(next));
      setBinanceApiKey('');
      setBinanceSecretKey('');
      setBinanceEditorOpen(false);
      setBinanceMessage(next.message ?? next.statusText);
    } catch {
      setBinanceMessage('Connection failed. Check Binance permissions and IP whitelist.');
    }
  };
  const disconnectBinanceConnection = async () => {
    try {
      const next = await api<BinanceConnection & { ok: boolean }>('/api/binance/connection', { method: 'DELETE' });
      setBinanceConnection(normalizeBinanceConnection(next));
      setBinanceEditorOpen(false);
      setBinanceApiKey('');
      setBinanceSecretKey('');
      setBinanceMessage('Disconnected.');
    } catch {
      setBinanceMessage('Disconnect failed.');
    }
  };

  const refreshBinanceWallet = async () => {
    try {
      const next = await api<BinanceWalletSummary>('/api/binance/wallet');
      setBinanceWallet(next);
      setBinanceMessage('Binance wallet refreshed.');
    } catch {
      setBinanceMessage('Wallet refresh failed.');
    }
  };

  const closeAllFuturesPositions = async () => {
    if (portalView !== 'admin') return;
    const confirmed = window.confirm('Close every open Binance Futures position now? This sends real MARKET close orders.');
    if (!confirmed) return;
    setRulesSaveMessage('Closing all Binance Futures positions...');
    try {
      const response = await api<{ ok: boolean; closedCount: number; failedCount: number; message?: string }>('/api/binance/futures/close-all', {
        method: 'POST'
      });
      await refreshBinanceWallet();
      window.dispatchEvent(new CustomEvent(livePortfolioRefreshEvent));
      setRulesSaveMessage(`Close all sent. Closed: ${response.closedCount}. Failed: ${response.failedCount}.`);
    } catch {
      setRulesSaveMessage('Close all failed. Check Binance permissions and server logs.');
    }
  };

  const saveLiveRulesSettings = async () => {
    try {
      const resolvedMaxTrades = openTradeLimitUnlimited ? 999 : Math.max(1, Number(customOpenTradeLimit) || 6);
      const resolvedDailyLoss = Math.max(0, dailyLossUsesCustom ? (Number(customDailyLossLimit) || 3) : 3);
      const effectiveRuleToggles: LiveRulesPayload['ruleToggles'] = {
        tradingVenue: true,
        allowedDirection: venueMode === 'futures',
        executionSource: false,
        openTradeLimit: !openTradeLimitUnlimited,
        minRiskReward: false,
        cashReserve: false,
        riskPerTrade: false,
        dailyLoss: true
      };
      const response = await api<{ ok: boolean; rules: LiveRulesPayload }>('/api/live-rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          venueMode,
          executionMode: liveExecutionMode,
          killSwitch: liveKillSwitch,
          ruleToggles: effectiveRuleToggles,
          liveActivationConfirmed: portalView === 'admin' && liveExecutionMode === 'live',
          riskPerTrade: Number(riskPerTrade),
          maxTrades: resolvedMaxTrades,
          dailyLoss: resolvedDailyLoss,
          reserveRatio: Number(reserveRatio),
          executionSource: 'top-4',
          allocationMethod: 'equal',
          minRiskReward,
          customRiskReward,
          allowedDirection: venueMode === 'spot' ? 'long-only' : allowedDirection,
          futuresLeverage: Number(futuresLeverage),
          futuresMarginMode,
          breakEvenEnabled,
          breakEvenTriggerPct: Number(breakEvenTriggerPct),
          trailingStopEnabled,
          trailingGapPct: Number(trailingGapPct),
          portfolioFloorEnabled,
          portfolioFloorTriggerPct: Number(portfolioFloorTriggerPct),
          portfolioFloorLockPct: Number(portfolioFloorLockPct)
        })
      });
      localStorage.setItem('autoTrade.capital', venueMode === 'spot' ? String(binanceWallet.totalValueUsdt) : String(binanceWallet.futuresTotalUsdt));
      localStorage.setItem('autoTrade.riskPerTrade', riskPerTrade);
      localStorage.setItem('autoTrade.maxTrades', String(resolvedMaxTrades));
      localStorage.setItem('autoTrade.dailyLoss', String(resolvedDailyLoss));
      localStorage.setItem('autoTrade.reserveRatio', reserveRatio);
      localStorage.setItem('autoTrade.futuresLeverage', futuresLeverage);
      localStorage.setItem('autoTrade.futuresMarginMode', futuresMarginMode);
      localStorage.setItem('autoTrade.breakEvenEnabled', String(breakEvenEnabled));
      localStorage.setItem('autoTrade.breakEvenTriggerPct', breakEvenTriggerPct);
      localStorage.setItem('autoTrade.trailingStopEnabled', String(trailingStopEnabled));
      localStorage.setItem('autoTrade.trailingGapPct', trailingGapPct);
      localStorage.setItem('autoTrade.portfolioFloorEnabled', String(portfolioFloorEnabled));
      localStorage.setItem('autoTrade.portfolioFloorTriggerPct', portfolioFloorTriggerPct);
      localStorage.setItem('autoTrade.portfolioFloorLockPct', portfolioFloorLockPct);
      localStorage.setItem('autoTrade.breakEvenEnabled', String(response.rules.breakEvenEnabled));
      localStorage.setItem('autoTrade.breakEvenTriggerPct', String(response.rules.breakEvenTriggerPct));
      localStorage.setItem('autoTrade.trailingStopEnabled', String(response.rules.trailingStopEnabled));
      localStorage.setItem('autoTrade.trailingGapPct', String(response.rules.trailingGapPct));
      localStorage.setItem('autoTrade.portfolioFloorEnabled', String(response.rules.portfolioFloorEnabled));
      localStorage.setItem('autoTrade.portfolioFloorTriggerPct', String(response.rules.portfolioFloorTriggerPct));
      localStorage.setItem('autoTrade.portfolioFloorLockPct', String(response.rules.portfolioFloorLockPct));
      localStorage.setItem('autoTrade.liveExecutionMode', response.rules.executionMode);
      localStorage.setItem('autoTrade.liveKillSwitch', String(response.rules.killSwitch));
      setLiveRuleToggles({ ...defaultLiveRuleToggles, ...(response.rules.ruleToggles ?? {}) });
      setMaxTrades(String(response.rules.maxTrades));
      setDailyLoss(String(response.rules.dailyLoss));
      setBreakEvenEnabled(response.rules.breakEvenEnabled);
      setBreakEvenTriggerPct(String(response.rules.breakEvenTriggerPct));
      setTrailingStopEnabled(response.rules.trailingStopEnabled);
      setTrailingGapPct(String(response.rules.trailingGapPct));
      setPortfolioFloorEnabled(response.rules.portfolioFloorEnabled);
      setPortfolioFloorTriggerPct(String(response.rules.portfolioFloorTriggerPct));
      setPortfolioFloorLockPct(String(response.rules.portfolioFloorLockPct));
      localStorage.setItem('autoTrade.executionSource', 'top-4');
      localStorage.setItem('autoTrade.allocationMethod', 'equal');
      localStorage.setItem('autoTrade.minRiskReward', minRiskReward);
      localStorage.setItem('autoTrade.customRiskReward', customRiskReward);
      localStorage.setItem('autoTrade.allowedDirection', venueMode === 'spot' ? 'long-only' : allowedDirection);
      localStorage.setItem('autoTrade.venueMode', venueMode);
      setRulesSaveMessage(`Settings auto-saved. Execution mode: ${response.rules.executionMode.toUpperCase()}${response.rules.killSwitch ? ' with kill switch ON.' : '.'}`);
    } catch {
      setRulesSaveMessage('Save failed.');
    }
  };

  const requestExecutionModeChange = (nextMode: 'test' | 'live') => {
    if (portalView !== 'admin') return;
    if (nextMode === 'live') {
      setLiveModeConfirmOpen(true);
      return;
    }
    setLiveExecutionMode('test');
  };

  useEffect(() => {
    if (autoMode !== 'live') {
      setLivePortfolioSummary(null);
      setLivePortfolioData(null);
      setLivePortfolioLoading(false);
      return;
    }
    const params = new URLSearchParams({
      range: portfolioTradesRange,
      status: portfolioTradesStatusFilter,
      side: portfolioTradesSideFilter,
      market: venueMode,
      timeframe: portfolioTradesTimeframeFilter,
      mode: portfolioTradesExecutionProfileFilter,
      score: portfolioTradesScoreFilter,
      acceptedKind: portfolioAcceptedKind,
      rejectedKind: portfolioRejectedKind,
      acceptedQuery: portfolioTradeQuery,
      rejectedQuery: portfolioRejectedTradeQuery
    });
    if (portfolioTradesRange === 'custom') {
      params.set('customFrom', portfolioTradesCustomFrom);
      params.set('customTo', portfolioTradesCustomTo);
    }
    let cancelled = false;
    let firstLoad = true;
    let ledgerRefreshTimeout = 0;
    const ledgerUrl = `/api/portfolio/live-ledger?${params.toString()}`;
    const fetchLivePortfolioLedger = () => {
      api<LivePortfolioLedgerResponse>(ledgerUrl)
        .then(response => {
          if (!cancelled) {
            setLivePortfolioData(response);
            setLivePortfolioSummary(response);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLivePortfolioData(null);
            setLivePortfolioSummary(null);
          }
        });
    };
    const fetchLivePortfolio = () => {
      if (firstLoad) setLivePortfolioLoading(true);
      api<LivePortfolioLedgerResponse>(ledgerUrl)
        .then(ledgerResponse => {
          if (!cancelled) {
            setLivePortfolioData(ledgerResponse);
            setLivePortfolioSummary(ledgerResponse);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLivePortfolioSummary(null);
            setLivePortfolioData(null);
          }
        })
        .finally(() => {
          if (!cancelled && firstLoad) {
            setLivePortfolioLoading(false);
            firstLoad = false;
          }
        });
    };
    const scheduleRefresh = () => {
      if (ledgerRefreshTimeout) window.clearTimeout(ledgerRefreshTimeout);
      ledgerRefreshTimeout = window.setTimeout(fetchLivePortfolioLedger, 120);
    };
    fetchLivePortfolio();
    window.addEventListener(livePortfolioRefreshEvent, scheduleRefresh);
    const ledgerRefresh = window.setInterval(fetchLivePortfolioLedger, 5000);
    return () => {
      cancelled = true;
      window.removeEventListener(livePortfolioRefreshEvent, scheduleRefresh);
      if (ledgerRefreshTimeout) window.clearTimeout(ledgerRefreshTimeout);
      window.clearInterval(ledgerRefresh);
    };
  }, [autoMode, portfolioTradeQuery, portfolioRejectedTradeQuery, portfolioAcceptedKind, portfolioRejectedKind, portfolioTradesCustomFrom, portfolioTradesCustomTo, portfolioTradesExecutionProfileFilter, portfolioTradesRange, portfolioTradesScoreFilter, portfolioTradesSideFilter, portfolioTradesStatusFilter, portfolioTradesTimeframeFilter, venueMode]);

  const confirmLiveExecutionMode = () => {
    setLiveExecutionMode('live');
    setLiveModeConfirmOpen(false);
  };

  const handleAutoLogin = () => {
    const username = loginUsername.trim();
    const password = loginPassword.trim();
    if (!username || !password) {
      setAuthMessage('');
      return;
    }
    if (loginRole === 'admin') {
      const normalizedUsername = username.toLowerCase();
      const normalizedAdminUsername = adminUsername.trim().toLowerCase();
      const normalizedAdminName = adminName.trim().toLowerCase();
      const normalizedPassword = password;
      const storedAdminPassword = adminPassword.trim();
      const canonicalAdminUsername = 'muslim alramadhan';
      const canonicalAdminPassword = 'Mueaa71_';
      const isDefaultAdmin = normalizedUsername === 'admin' && normalizedPassword === 'admin123';
      const isSavedAdmin = (normalizedUsername === normalizedAdminUsername || normalizedUsername === normalizedAdminName) && normalizedPassword === storedAdminPassword;
      const isCanonicalAdmin = normalizedUsername === canonicalAdminUsername && normalizedPassword === canonicalAdminPassword;
      if (isDefaultAdmin || isSavedAdmin || isCanonicalAdmin) {
        setAdminName('Muslim Alramadhan');
        setAdminUsername('Muslim Alramadhan');
        setAdminPassword('Mueaa71_');
        if (rememberLogin) localStorage.setItem(loginStorageKey('admin'), JSON.stringify({ username, password }));
        else localStorage.removeItem(loginStorageKey('admin'));
        setAuthMessage('');
        setPortalView('admin');
        return;
      }
      setAuthMessage('Admin login must match the saved admin username or admin name, with the saved password.');
      return;
    }
    const approvedUser = accessRequests.find(request => request.status === 'approved' && request.enabled && request.username === username && request.password === password);
    if (!approvedUser) {
      const pendingUser = accessRequests.find(request => request.status === 'pending' && request.username === username);
      setAuthMessage(pendingUser ? 'Your account is waiting for admin approval.' : 'User account not approved yet.');
      return;
    }
    if (rememberLogin) localStorage.setItem(loginStorageKey('user'), JSON.stringify({ username, password }));
    else localStorage.removeItem(loginStorageKey('user'));
    setMemberName(approvedUser.name);
    setAuthMessage('');
    setPortalView('user');
  };


  const liveCapitalValue = venueMode === 'spot' ? binanceWallet.totalValueUsdt : binanceWallet.futuresTotalUsdt;
  const capitalValue = autoMode === 'live' ? liveCapitalValue : Number(capital) || 0;
  const visibleBinanceBalances = useMemo(
    () => hideSmallBinanceAssets ? binanceWallet.balances.filter(balance => balance.valueUsdt >= 1) : binanceWallet.balances,
    [binanceWallet.balances, hideSmallBinanceAssets]
  );
  const hiddenBinanceBalanceCount = binanceWallet.balances.length - visibleBinanceBalances.length;
  const leverageValue = Math.max(1, Math.min(20, Number(futuresLeverage) || 1));
  const openTradeLimitUnlimited = Number(maxTrades) >= 999;
  const effectiveDailyLossLimit = Math.max(0, Number(dailyLoss) || 0);
  const dailyLossUsesCustom = effectiveDailyLossLimit !== 3;
  const leverageTone = leverageValue <= 5 ? 'low' : leverageValue <= 10 ? 'medium' : leverageValue <= 15 ? 'elevated' : 'high';
  const leverageLabel = leverageTone === 'low' ? 'Low Risk' : leverageTone === 'medium' ? 'Moderate' : leverageTone === 'elevated' ? 'Elevated' : 'High Risk';
  const riskValue = Number(riskPerTrade) || 0;
  const maxTradesValue = Math.max(1, Number(maxTrades) || 1);
  const dailyLossValue = effectiveDailyLossLimit;
  const reserveValue = Math.max(0, Math.min(100, Number(reserveRatio) || 0));
  const deployableCapital = capitalValue * (1 - reserveValue / 100);

  useEffect(() => {
    const autoSaveKey = JSON.stringify({
      venueMode,
      liveExecutionMode,
      liveKillSwitch,
      riskPerTrade,
      maxTrades,
      customOpenTradeLimit,
      dailyLoss,
      customDailyLossLimit,
      reserveRatio,
      minRiskReward,
      customRiskReward,
      allowedDirection,
      futuresLeverage,
      futuresMarginMode,
      breakEvenEnabled,
      breakEvenTriggerPct,
      trailingStopEnabled,
      trailingGapPct,
      portfolioFloorEnabled,
      portfolioFloorTriggerPct,
      portfolioFloorLockPct
    });
    if (!liveRulesAutoSaveReadyRef.current) {
      liveRulesAutoSaveReadyRef.current = true;
      lastAutoSavedRulesKeyRef.current = autoSaveKey;
      return;
    }
    if (lastAutoSavedRulesKeyRef.current === autoSaveKey) return;
    if (liveRulesAutoSaveTimerRef.current) window.clearTimeout(liveRulesAutoSaveTimerRef.current);
    liveRulesAutoSaveTimerRef.current = window.setTimeout(() => {
      lastAutoSavedRulesKeyRef.current = autoSaveKey;
      void saveLiveRulesSettings();
    }, 450);
    return () => {
      if (liveRulesAutoSaveTimerRef.current) window.clearTimeout(liveRulesAutoSaveTimerRef.current);
    };
  }, [venueMode, liveExecutionMode, liveKillSwitch, riskPerTrade, maxTrades, customOpenTradeLimit, dailyLoss, customDailyLossLimit, reserveRatio, minRiskReward, customRiskReward, allowedDirection, futuresLeverage, futuresMarginMode, breakEvenEnabled, breakEvenTriggerPct, trailingStopEnabled, trailingGapPct, portfolioFloorEnabled, portfolioFloorTriggerPct, portfolioFloorLockPct]);
  const riskBudget = capitalValue * (riskValue / 100);
  const splitFour = deployableCapital / 4;
  const splitTwo = deployableCapital / 2;
  const perTradeCap = deployableCapital / maxTradesValue;
  const allInDrawdown = capitalValue * Math.min(0.18, (riskValue / 100) * 3.4 || 0);
  const splitFourDrawdown = Math.min(riskBudget * 2.1, deployableCapital * 0.12);
  const baseScore = Math.max(0, lead?.score ?? 0);
  const confidence = Math.min(96, 45 + (lead?.winRate ?? 0) * 0.35 + Math.min(18, (lead?.closed ?? 0) * 0.22));
  const priorityStack = insightRows.slice(0, Math.max(1, Math.min(4, maxTradesValue)));
  const trackedTrades = priorityStack.reduce((sum, row) => sum + row.total, 0);
  const weightedAveragePnl = priorityStack.length ? priorityStack.reduce((sum, row) => sum + row.avgPnl, 0) / priorityStack.length : 0;
  const shadowGrowthPct = Math.max(-18, Math.min(36, weightedAveragePnl * priorityStack.length * 1.4));
  const projectedBalance = capitalValue * (1 + shadowGrowthPct / 100);
  const reserveCash = capitalValue - deployableCapital;
  const losingStreakCut = Math.min(dailyLossValue, Math.max(riskValue * 2, 2));
  const modeSummary = autoMode === 'shadow'
    ? 'Tracks real site trades with simulated capital only so the user can verify auto behavior safely.'
    : 'Prepares the same ranked and risk-bounded plan for future live execution once broker wiring is enabled.';
  const exposurePct = capitalValue > 0 ? (deployableCapital / capitalValue) * 100 : 0;
  const strategyExposureValue = deployableCapital * ((Number(maxStrategyExposure) || 0) / 100);
  const strategyExposurePct = capitalValue > 0 ? (strategyExposureValue / capitalValue) * 100 : 0;
  const longExposurePct = priorityStack.length ? Math.round((priorityStack.filter(item => item.longCount >= item.shortCount).length / priorityStack.length) * 100) : 0;
  const shortExposurePct = Math.max(0, 100 - longExposurePct);
  const healthState = shadowGrowthPct >= 8 ? 'Strong' : shadowGrowthPct >= 0 ? 'Stable' : 'Defensive';
  const healthNote = healthState === 'Strong'
    ? 'Portfolio is compounding with healthy exposure and acceptable risk pressure.'
    : healthState === 'Stable'
      ? 'Portfolio remains controlled, but growth is moderate and should be monitored.'
      : 'Protection rules matter more right now because the portfolio is in a defensive state.';
  const strategyContribution = priorityStack.map((item, index) => {
    const allocationShare = index === 0 ? 0.4 : index === 1 ? 0.28 : index === 2 ? 0.2 : 0.12;
    return {
      ...item,
      capital: deployableCapital * allocationShare,
      contribution: shadowGrowthPct * allocationShare
    };
  });
  const portfolioSignals = signals;
  const emptyReplay = useMemo<ReplayResult>(() => ({
    tradeRows: [] as ReplayTradeRow[],
    closedPnl: 0,
    openPnl: 0,
    netPnl: 0,
    currentCapital: 0,
    changePct: 0,
    openCount: 0,
    closedCount: 0,
    rejectedCount: 0,
    rejectedTradeRows: [] as RejectedTradeRow[],
    strategyContribution: [] as Array<{ id: string; name: string; capital: number; contribution: number }>,
    rejectedReasons: {
      executionSource: 0,
      directionFilter: 0,
      duplicateSymbol: 0,
      maxTrades: 0,
      dailyLossLimit: 0,
      riskReward: 0,
      riskPerTrade: 0
    },
    startingCapital: 0
  }), []);
  const liveReplay = useMemo(() => autoMode === 'live' ? emptyReplay : simulatePortfolioReplay(portfolioSignals, tickers, futuresTickers, baseShadowProfile, venueMode), [autoMode, baseShadowProfile, emptyReplay, futuresTickers, portfolioSignals, tickers, venueMode]);
  const portfolioTradeRows = liveReplay.tradeRows;
  const portfolioClosedPnl = liveReplay.closedPnl;
  const portfolioOpenPnl = liveReplay.openPnl;
  const portfolioNetPnl = liveReplay.netPnl;
  const portfolioCurrentCapital = liveReplay.currentCapital;
  const portfolioChangePct = liveReplay.changePct;
  const portfolioOpenCount = liveReplay.openCount;
  const portfolioClosedCount = liveReplay.closedCount;
  const portfolioRejectedCount = liveReplay.rejectedCount;
  const portfolioRejectedTradeRows = liveReplay.rejectedTradeRows;
  const shadowProfiles = useMemo(() => {
    if (autoMode !== 'shadow') return [] as Array<{
      id: string;
      name: string;
      summary: string;
      rules: ShadowRuleProfile;
      tradeRows: ReplayTradeRow[];
      closedPnl: number;
      openPnl: number;
      netPnl: number;
      currentCapital: number;
      changePct: number;
      openCount: number;
      closedCount: number;
      rejectedCount: number;
      rejectedTradeRows: RejectedTradeRow[];
      rejectedReasons: ReplayResult['rejectedReasons'];
      startingCapital: number;
    }>;
    const profileDefs = [
      {
        id: 'shadowA',
        name: 'Shadow A',
        summary: 'Profile A result for the selected shadow rules and time range.'
      },
      {
        id: 'shadowB',
        name: 'Shadow B',
        summary: 'Profile B result for the selected shadow rules and time range.'
      },
      {
        id: 'shadowC',
        name: 'Shadow C',
        summary: 'Profile C result for the selected shadow rules and time range.'
      },
      {
        id: 'shadowD',
        name: 'Shadow D',
        summary: 'Profile D result for the selected shadow rules and time range.'
      }
    ];
    return profileDefs.map(profile => {
      const rules = { ...(shadowRuleProfiles[profile.id] ?? baseShadowProfile), replayMode: 'live-shadow' as const };
      const replay = simulatePortfolioReplay(portfolioSignals, tickers, futuresTickers, rules, venueMode);
      return {
        ...profile,
        rules,
        ...replay
      };
    });
  }, [autoMode, baseShadowProfile, portfolioSignals, shadowRuleProfiles, tickers]);
  const selectedShadowProfile = shadowProfiles.find(profile => profile.id === selectedShadowProfileId) ?? shadowProfiles[0];
  const activePortfolioTradeRows = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.tradeRows : portfolioTradeRows;
  const activePortfolioClosedPnl = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.closedPnl : portfolioClosedPnl;
  const activePortfolioOpenPnl = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.openPnl : portfolioOpenPnl;
  const activePortfolioNetPnl = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.netPnl : portfolioNetPnl;
  const activePortfolioCurrentCapital = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.currentCapital : portfolioCurrentCapital;
  const activePortfolioChangePct = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.changePct : portfolioChangePct;
  const activePortfolioOpenCount = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.openCount : portfolioOpenCount;
  const activePortfolioClosedCount = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.closedCount : portfolioClosedCount;
  const activePortfolioRejectedCount = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.rejectedCount : portfolioRejectedCount;
  const activePortfolioRejectedReasons = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.rejectedReasons : liveReplay.rejectedReasons;
  const activeRejectedTradeRows = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.rejectedTradeRows : portfolioRejectedTradeRows;
  const activeStartingCapital = autoMode === 'shadow' && selectedShadowProfile ? selectedShadowProfile.startingCapital : capitalValue;
  const portfolioTradesRangeStart = portfolioTradesRange === 'custom'
    ? new Date(`${portfolioTradesCustomFrom}T00:00:00`).getTime()
    : getRangeStart(portfolioTradesRange);
  const portfolioTradesRangeEnd = portfolioTradesRange === 'custom'
    ? new Date(`${portfolioTradesCustomTo}T23:59:59`).getTime()
    : Date.now();
  const filteredPortfolioTradeRows = activePortfolioTradeRows.filter(row => {
    const stamp = signalTimestamp(row);
    const inRange = stamp >= portfolioTradesRangeStart && stamp <= portfolioTradesRangeEnd;
    const statusMatch = portfolioTradesStatusFilter === 'all'
      || (portfolioTradesStatusFilter === 'open' && row.isCurrentlyOpen)
      || (portfolioTradesStatusFilter === 'closed' && !row.isCurrentlyOpen)
      || (portfolioTradesStatusFilter === 'win' && row.status === 'WIN')
      || (portfolioTradesStatusFilter === 'loss' && row.status === 'LOSS');
    const sideMatch = portfolioTradesSideFilter === 'all'
      || (portfolioTradesSideFilter === 'long' && row.side === 'LONG')
      || (portfolioTradesSideFilter === 'short' && row.side === 'SHORT');
    return inRange && row.market === venueMode && statusMatch && sideMatch && scoreMatches(row, portfolioTradesScoreFilter);
  });
  const normalizedPortfolioTradeQuery = portfolioTradeQuery.trim().toUpperCase();
  const normalizedPortfolioRejectedTradeQuery = portfolioRejectedTradeQuery.trim().toUpperCase();
  const privateAcceptedRows = useMemo<PortfolioAcceptedRow[]>(() => {
    if (autoMode === 'live') return [];
    if (autoMode === 'shadow') {
        return filteredPortfolioTradeRows.map(row => ({
          id: row.id,
          symbol: row.symbol,
          strategyName: row.strategyName,
          status: row.status,
          executionStatus: row.executionStatus,
          side: row.side,
          market: row.market,
        venueLabel: row.market === 'futures' ? `Futures x${Math.max(1, leverageValue)}` : 'Spot',
        exitMode: row.exitMode,
        timeframe: row.timeframe,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        entry: row.entry,
        marketPrice: row.marketPrice,
        liquidationPrice: row.liquidationPrice,
        expectedProfitPct: row.expectedProfitPct,
        riskPct: row.riskPct,
        pnl: row.pnl,
        pnlUsdt: row.pnlUsdt,
        roiPct: row.roiPct,
        pnlLabel: `${row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(2)}%`,
        score: extractSignalScore(row.reason)
      }));
    }
    return signals
      .filter(signal => {
        const stamp = signalTimestamp(signal);
        const inRange = stamp >= portfolioTradesRangeStart && stamp <= portfolioTradesRangeEnd;
        const accepted = acceptedBrokerStatuses.has(signal.executionStatus ?? 'pending');
        const marketMatch = signal.market === venueMode;
        const statusMatch = portfolioTradesStatusFilter === 'all'
          || (portfolioTradesStatusFilter === 'open' && signal.status === 'OPEN')
          || (portfolioTradesStatusFilter === 'closed' && signal.status !== 'OPEN')
          || (portfolioTradesStatusFilter === 'win' && signal.status === 'WIN')
          || (portfolioTradesStatusFilter === 'loss' && signal.status === 'LOSS');
        const sideMatch = portfolioTradesSideFilter === 'all'
          || (portfolioTradesSideFilter === 'long' && signal.side === 'LONG')
          || (portfolioTradesSideFilter === 'short' && signal.side === 'SHORT');
        return inRange && accepted && marketMatch && statusMatch && sideMatch && scoreMatches(signal, portfolioTradesScoreFilter);
      })
      .map(signal => {
        const marketPrice = signal.market === 'futures' ? futuresTickers.get(signal.symbol)?.price : tickers.get(signal.symbol)?.price;
        const pnl = getSignalPnl(signal, marketPrice);
        return {
          id: signal.id,
          symbol: signal.symbol,
          strategyName: signal.strategyName,
          status: signal.status,
          executionStatus: signal.executionStatus,
          side: signal.side,
          market: signal.market,
          venueLabel: formatPrivateVenueLabel(signal),
          exitMode: signal.exitMode,
          timeframe: signal.timeframe,
          openedAt: signal.openedAt,
          closedAt: signal.closedAt,
          entry: signal.entry,
          marketPrice,
          expectedProfitPct: signal.expectedProfitPct,
          riskPct: signal.riskPct,
          pnl,
          pnlLabel: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`,
          score: extractSignalScore(signal.reason)
        };
      })
      .sort((a, b) => b.openedAt - a.openedAt);
  }, [autoMode, filteredPortfolioTradeRows, futuresTickers, leverageValue, portfolioTradesRangeEnd, portfolioTradesRangeStart, portfolioTradesScoreFilter, portfolioTradesSideFilter, portfolioTradesStatusFilter, signals, tickers, venueMode]);
  const privateRejectedRows = useMemo<PortfolioRejectedViewRow[]>(() => {
    if (autoMode === 'live') return [];
    if (autoMode === 'shadow') {
      return activeRejectedTradeRows
        .filter(row => {
          const stamp = signalTimestamp(row);
          const inRange = stamp >= portfolioTradesRangeStart && stamp <= portfolioTradesRangeEnd;
          const marketMatch = row.market === venueMode;
          const sideMatch = portfolioTradesSideFilter === 'all'
            || (portfolioTradesSideFilter === 'long' && row.side === 'LONG')
            || (portfolioTradesSideFilter === 'short' && row.side === 'SHORT');
          const timeframeMatch = portfolioTradesTimeframeFilter === 'all' || row.timeframe === portfolioTradesTimeframeFilter;
          const modeMatch = portfolioTradesExecutionProfileFilter === 'all' || row.exitMode === portfolioTradesExecutionProfileFilter;
          const tradeLabel = formatTradeLabel(row.id).toUpperCase();
            const queryMatches = !normalizedPortfolioRejectedTradeQuery
              || tradeLabel.includes(normalizedPortfolioRejectedTradeQuery)
              || String(row.id).includes(normalizedPortfolioRejectedTradeQuery.replace(/^T-?/, ''));
          return inRange && marketMatch && sideMatch && timeframeMatch && modeMatch && scoreMatches(row, portfolioTradesScoreFilter) && queryMatches;
        })
        .map(row => ({
          id: row.id,
          symbol: row.symbol,
          status: row.executionStatus ?? 'rejected',
          strategyName: row.strategyName,
          side: row.side,
          market: row.market,
          exitMode: row.exitMode,
          timeframe: row.timeframe,
          venueLabel: row.market === 'futures' ? `Futures x${Math.max(1, leverageValue)}` : 'Spot',
          openedAt: row.openedAt,
          closedAt: row.closedAt,
          entry: row.entry,
          marketPrice: row.market === 'futures' ? futuresTickers.get(row.symbol)?.price : tickers.get(row.symbol)?.price,
          expectedProfitPct: row.expectedProfitPct,
          riskPct: row.riskPct,
          failedRules: row.failedRules
        }));
    }
    return signals
      .filter(signal => {
        const stamp = signalTimestamp(signal);
        const inRange = stamp >= portfolioTradesRangeStart && stamp <= portfolioTradesRangeEnd;
        const rejected = signal.executionStatus === 'rejected' || signal.executionStatus === 'blocked' || signal.executionStatus === 'live_failed' || signal.executionStatus === 'test_failed';
        const marketMatch = signal.market === venueMode;
        const sideMatch = portfolioTradesSideFilter === 'all'
          || (portfolioTradesSideFilter === 'long' && signal.side === 'LONG')
          || (portfolioTradesSideFilter === 'short' && signal.side === 'SHORT');
        const timeframeMatch = portfolioTradesTimeframeFilter === 'all' || signal.timeframe === portfolioTradesTimeframeFilter;
        const modeMatch = portfolioTradesExecutionProfileFilter === 'all' || signal.exitMode === portfolioTradesExecutionProfileFilter;
        const tradeLabel = formatTradeLabel(signal.id).toUpperCase();
        const queryMatches = !normalizedPortfolioRejectedTradeQuery
          || tradeLabel.includes(normalizedPortfolioRejectedTradeQuery)
          || String(signal.id).includes(normalizedPortfolioRejectedTradeQuery.replace(/^T-?/, ''));
        return inRange && rejected && marketMatch && sideMatch && timeframeMatch && modeMatch && scoreMatches(signal, portfolioTradesScoreFilter) && queryMatches;
      })
      .map(signal => ({
        id: signal.id,
        symbol: signal.symbol,
        status: signal.executionStatus ?? 'rejected',
        strategyName: signal.strategyName,
        side: signal.side,
        market: signal.market,
        exitMode: signal.exitMode,
        timeframe: signal.timeframe,
        venueLabel: formatPrivateVenueLabel(signal),
        openedAt: signal.openedAt,
        closedAt: signal.closedAt,
        entry: signal.entry,
        marketPrice: signal.market === 'futures' ? futuresTickers.get(signal.symbol)?.price : tickers.get(signal.symbol)?.price,
        expectedProfitPct: signal.expectedProfitPct,
        riskPct: signal.riskPct,
        failedRules: signal.executionNotes?.length ? signal.executionNotes : [signal.executionStatus ?? 'Rejected']
      }))
      .sort((a, b) => b.openedAt - a.openedAt);
  }, [activeRejectedTradeRows, autoMode, futuresTickers, leverageValue, normalizedPortfolioRejectedTradeQuery, portfolioTradesExecutionProfileFilter, portfolioTradesRangeEnd, portfolioTradesRangeStart, portfolioTradesScoreFilter, portfolioTradesSideFilter, portfolioTradesTimeframeFilter, signals, tickers, venueMode]);
  const portfolioLedgerBaseSignals = useMemo(() => {
    if (autoMode === 'live') return [];
    if (autoMode === 'shadow') {
      return activePortfolioTradeRows.filter(row => {
        const stamp = signalTimestamp(row);
        const inRange = stamp >= portfolioTradesRangeStart && stamp <= portfolioTradesRangeEnd;
        const marketMatch = row.market === venueMode;
        return inRange && marketMatch;
      });
    }
    return signals.filter(signal => {
      const stamp = signalTimestamp(signal);
      const inRange = stamp >= portfolioTradesRangeStart && stamp <= portfolioTradesRangeEnd;
      const accepted = acceptedBrokerStatuses.has(signal.executionStatus ?? 'pending');
      const marketMatch = signal.market === venueMode;
      return inRange && accepted && marketMatch;
    });
  }, [activePortfolioTradeRows, autoMode, portfolioTradesRangeEnd, portfolioTradesRangeStart, signals, venueMode]);
  const portfolioLedgerSignals = useMemo(() => portfolioLedgerBaseSignals.filter(signal => {
    const tradeLabel = formatTradeLabel(signal.id).toUpperCase();
    const queryMatches = !normalizedPortfolioTradeQuery
      || tradeLabel.includes(normalizedPortfolioTradeQuery)
      || String(signal.id).includes(normalizedPortfolioTradeQuery.replace(/^T-?/, ''));
    return statusMatches(signal, portfolioTradesStatusFilter)
      && sideMatches(signal, portfolioTradesSideFilter)
      && (portfolioTradesTimeframeFilter === 'all' || signal.timeframe === portfolioTradesTimeframeFilter)
      && (portfolioTradesExecutionProfileFilter === 'all' || signal.exitMode === portfolioTradesExecutionProfileFilter)
      && scoreMatches(signal, portfolioTradesScoreFilter)
      && queryMatches;
  }), [normalizedPortfolioTradeQuery, portfolioLedgerBaseSignals, portfolioTradesExecutionProfileFilter, portfolioTradesScoreFilter, portfolioTradesSideFilter, portfolioTradesStatusFilter, portfolioTradesTimeframeFilter]);
  const portfolioLedgerRows = useMemo<SignalTradeRow[]>(() => portfolioLedgerSignals.map(signal => {
    const marketPrice = signal.market === 'futures' ? futuresTickers.get(signal.symbol)?.price : tickers.get(signal.symbol)?.price;
    const pnl = getSignalPnl(signal, marketPrice);
    const allocatedCapital = typeof (signal as Partial<ReplayTradeRow>).allocatedCapital === 'number'
      ? (signal as Partial<ReplayTradeRow>).allocatedCapital
      : undefined;
    const allocationPct = typeof allocatedCapital === 'number' && activeStartingCapital > 0
      ? (allocatedCapital / activeStartingCapital) * 100
      : undefined;
    return {
      ...signal,
      marketPrice,
      label: formatTradeLabel(signal.id),
      pnl,
      pnlLabel: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`,
      score: extractSignalScore(signal.reason),
      allocationAmount: allocatedCapital,
      allocationPct
    };
  }), [activeStartingCapital, portfolioLedgerSignals, futuresTickers, tickers]);
  const portfolioLedgerBestTrade = useMemo(() => portfolioLedgerRows.reduce<SignalTradeRow | null>((best, row) => !best || row.pnl > best.pnl ? row : best, null), [portfolioLedgerRows]);
  const portfolioLedgerWorstTrade = useMemo(() => portfolioLedgerRows.reduce<SignalTradeRow | null>((worst, row) => !worst || row.pnl < worst.pnl ? row : worst, null), [portfolioLedgerRows]);
  const portfolioLedgerStats = useMemo(() => ({
    winCount: portfolioLedgerRows.filter(row => row.status === 'WIN').length,
    lossCount: portfolioLedgerRows.filter(row => row.status === 'LOSS').length,
    openCount: portfolioLedgerRows.filter(row => row.status === 'OPEN').length,
    longCount: portfolioLedgerRows.filter(row => row.side === 'LONG').length,
    shortCount: portfolioLedgerRows.filter(row => row.side === 'SHORT').length,
    spotCount: portfolioLedgerRows.filter(row => row.market === 'spot').length,
    futuresCount: portfolioLedgerRows.filter(row => row.market === 'futures').length
  }), [portfolioLedgerRows]);
  const portfolioLedgerPnlCards = useMemo(() => {
    const openPnl = portfolioLedgerRows.filter(row => row.status === 'OPEN').reduce((sum, row) => sum + row.pnl, 0);
    const closedPnl = portfolioLedgerRows.filter(row => row.status !== 'OPEN').reduce((sum, row) => sum + row.pnl, 0);
    return { openPnl, closedPnl, netPnl: openPnl + closedPnl };
  }, [portfolioLedgerRows]);
  const portfolioBrokerStatusCounts = useMemo(() => {
    const source = autoMode === 'shadow'
      ? activePortfolioTradeRows
      : signals.filter(signal => {
        const stamp = signalTimestamp(signal);
        const inRange = stamp >= portfolioTradesRangeStart && stamp <= portfolioTradesRangeEnd;
        const marketMatch = signal.market === venueMode;
        return inRange && marketMatch;
      });
    return {
      liveAccepted: source.filter(signal => signal.executionStatus === 'live_accepted').length,
      testAccepted: source.filter(signal => signal.executionStatus === 'test_accepted').length,
      failed: source.filter(signal => signal.executionStatus === 'live_failed' || signal.executionStatus === 'test_failed').length
    };
  }, [activePortfolioTradeRows, autoMode, portfolioTradesRangeEnd, portfolioTradesRangeStart, signals, venueMode]);
  const portfolioLedgerFilterCounts = useMemo(
    () => getSignalFilterCounts(portfolioLedgerBaseSignals, portfolioTradesStatusFilter, portfolioTradesSideFilter),
    [portfolioLedgerBaseSignals, portfolioTradesSideFilter, portfolioTradesStatusFilter]
  );
  const activeUserRecord = accessRequests.find(request => request.status === 'approved' && request.name === memberName);
  const effectivePortfolioBestTrade = autoMode === 'live' ? (livePortfolioData?.summary.bestTrade ?? null) : portfolioLedgerBestTrade;
  const effectivePortfolioWorstTrade = autoMode === 'live' ? (livePortfolioData?.summary.worstTrade ?? null) : portfolioLedgerWorstTrade;
  const effectivePortfolioStats = autoMode === 'live' && livePortfolioSummary
      ? {
      winCount: livePortfolioSummary.filterCounts.win,
      lossCount: livePortfolioSummary.filterCounts.loss,
      openCount: livePortfolioSummary.summary.openCount,
      longCount: livePortfolioSummary.summary.longCount,
      shortCount: livePortfolioSummary.summary.shortCount,
      spotCount: livePortfolioSummary.summary.spotCount,
      futuresCount: livePortfolioSummary.summary.futuresCount
    }
    : portfolioLedgerStats;
  const effectivePortfolioPnlCards = autoMode === 'live' && livePortfolioSummary
    ? {
      openPnl: livePortfolioSummary.summary.openPnl,
      closedPnl: livePortfolioSummary.summary.closedPnl,
      netPnl: livePortfolioSummary.summary.netPnl
    }
    : portfolioLedgerPnlCards;
  const effectivePortfolioFilterCounts = autoMode === 'live' && livePortfolioSummary
    ? livePortfolioSummary.filterCounts
    : portfolioLedgerFilterCounts;
  const effectivePortfolioLedgerRows = autoMode === 'live' && livePortfolioData ? livePortfolioData.accepted.rows : portfolioLedgerRows;
  const effectivePrivateRejectedRows = autoMode === 'live' && livePortfolioData ? livePortfolioData.rejected.rows : privateRejectedRows;
  const effectiveStartingCapital = autoMode === 'live' && livePortfolioSummary ? livePortfolioSummary.summary.startingBalance : activeStartingCapital;
  const effectiveCurrentCapital = autoMode === 'live' && livePortfolioSummary ? livePortfolioSummary.summary.currentCapital : activePortfolioCurrentCapital;
  const effectiveAcceptedTotal = autoMode === 'live' && livePortfolioData ? livePortfolioData.accepted.total : effectivePortfolioLedgerRows.length;
  const effectiveRejectedTotal = autoMode === 'live' && livePortfolioData ? livePortfolioData.rejected.total : effectivePrivateRejectedRows.length;
  const effectiveGeneratedTotal = autoMode === 'live' && livePortfolioSummary ? livePortfolioSummary.summary.generatedCount : effectiveAcceptedTotal + effectiveRejectedTotal;
  const jumpToAcceptedTrade = (tradeId?: number | null) => {
    if (!tradeId) return;
    setPortfolioTradesStatusFilter('all');
    setPortfolioTradesSideFilter('all');
    setPortfolioTradesMarketFilter('all');
    setPortfolioTradesTimeframeFilter('all');
    setPortfolioTradesExecutionProfileFilter('all');
    setPortfolioAcceptedKind('all');
    setPortfolioTradeQuery('');
    handledFocusedPortfolioTradeIdRef.current = null;
    setFocusedPortfolioTradeId(tradeId);
  };
  const cyclePortfolioStatusFilter = () => {
    setPortfolioTradesStatusFilter(prev => prev === 'all' ? 'win' : prev === 'win' ? 'loss' : 'all');
  };
  const cyclePortfolioSideFilter = () => {
    if (venueMode === 'spot' || allowedDirection === 'long-only') {
      setPortfolioTradesSideFilter(prev => prev === 'long' ? 'all' : 'long');
      return;
    }
    if (allowedDirection === 'short-only') {
      setPortfolioTradesSideFilter(prev => prev === 'short' ? 'all' : 'short');
      return;
    }
    setPortfolioTradesSideFilter(prev => prev === 'all' ? 'long' : prev === 'long' ? 'short' : 'all');
  };
  const cyclePortfolioMarketFilter = () => {
    setPortfolioTradesMarketFilter(prev => prev === 'all' ? 'spot' : prev === 'spot' ? 'futures' : 'all');
  };
  const cyclePortfolioModeFilter = () => {
    setPortfolioTradesExecutionProfileFilter(prev => {
      const options: ('all' | ExitMode)[] = ['all', 'quick', 'balanced', 'extended'];
      const index = options.indexOf(prev);
      return options[(index + 1) % options.length] ?? 'all';
    });
  };
  const cyclePortfolioTimeframeFilter = () => {
    setPortfolioTradesTimeframeFilter(prev => {
      const options: ('all' | Timeframe)[] = ['all', ...allTimeframes];
      const index = options.indexOf(prev);
      return options[(index + 1) % options.length] ?? 'all';
    });
  };
  const activeUserTelegramSubscriber = activeUserRecord ? telegramSubscribers.find(item => item.accountId === activeUserRecord.userId) : null;
  const adminTelegramSubscriber = telegramSubscribers.find(item => item.accountId === 'ADMIN');
  const activeUserTelegramMeta = getTelegramStatusMeta(activeUserTelegramSubscriber, activeUserRecord?.telegram);
  const adminTelegramMeta = getTelegramStatusMeta(adminTelegramSubscriber, adminTelegram);
  const pendingRequests = accessRequests.filter(request => request.status === 'pending');
  const rejectedRequests = accessRequests.filter(request => request.status === 'rejected');
  const activeUsers = accessRequests.filter(request => request.status === 'approved');
  const pausedUsers = activeUsers.filter(request => !request.enabled);
  const accessDirectory = accessRequests.filter(request => {
    if (accessFilter === 'active') return request.status === 'approved' && request.enabled;
    if (accessFilter === 'pending') return request.status === 'pending';
    if (accessFilter === 'pause') return request.status === 'approved' && !request.enabled;
    return true;
  });
  const updateActiveMember = (patch: Partial<{ name: string; password: string; telegram: string; phone: string }>) => {
    if (!activeUserRecord) return;
    saveAccessRequests(accessRequests.map(request => request.id === activeUserRecord.id ? { ...request, ...patch, username: patch.name ?? request.username } : request));
    if (patch.name) setMemberName(patch.name);
  };
  const openUserAccessEditor = () => {
    setUserDraftUsername(activeUserRecord?.username ?? memberName);
    setUserDraftTelegram(activeUserRecord?.telegram ?? '');
    setUserDraftPhone(activeUserRecord?.phone ?? '');
    setUserCurrentPassword('');
    setUserNewPassword('');
    setUserConfirmPassword('');
    setUserAccessMessage('');
    setUserAccessOpen(true);
  };
  const closeUserAccessEditor = () => {
    setUserAccessOpen(false);
    setUserAccessMessage('');
  };
  const openAdminCredentialsEditor = () => {
    setAdminDraftUsername(adminUsername);
    setAdminDraftEmail(adminEmail);
    setAdminDraftTelegram(adminTelegram);
    setAdminDraftPhone(adminPhone);
    setAdminCurrentPassword('');
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setAdminCredentialMessage('');
    setAdminCredentialsOpen(true);
  };
  const closeAdminCredentialsEditor = () => {
    setAdminCredentialsOpen(false);
    setAdminCredentialMessage('');
  };
  const passwordPolicyError = (password: string) => {
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Password needs one uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Password needs one lowercase letter.';
    if (!/\d/.test(password)) return 'Password needs one number.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password needs one special character.';
    return '';
  };
  const saveAdminCredentials = () => {
    const nextUsername = adminDraftUsername.trim();
    const nextTelegram = adminDraftTelegram.trim();
    const nextPhone = adminDraftPhone.trim();
    const hasExistingPassword = Boolean(adminPassword && adminPassword !== 'admin123');
    const wantsPasswordChange = adminCurrentPassword || adminNewPassword || adminConfirmPassword || !hasExistingPassword;
    if (!nextUsername) {
      setAdminCredentialMessage('Username is required.');
      return;
    }
    if (!hasExistingPassword && !adminNewPassword) {
      setAdminCredentialMessage('Password is required.');
      return;
    }
    if (wantsPasswordChange) {
      if (hasExistingPassword && adminCurrentPassword !== adminPassword) {
        setAdminCredentialMessage('Current password is not correct.');
        return;
      }
      const policyError = passwordPolicyError(adminNewPassword);
      if (policyError) {
        setAdminCredentialMessage(policyError);
        return;
      }
      if (adminNewPassword !== adminConfirmPassword) {
        setAdminCredentialMessage('New password confirmation does not match.');
        return;
      }
      setAdminPassword(adminNewPassword);
    }
    setAdminUsername(nextUsername);
    setAdminTelegram(nextTelegram);
    setAdminPhone(nextPhone);
    setAdminCurrentPassword('');
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setAdminCredentialMessage('Saved.');
    setAdminCredentialsOpen(false);
  };
  const saveUserAccess = () => {
    if (!activeUserRecord) return;
    const nextUsername = userDraftUsername.trim();
    const nextTelegram = userDraftTelegram.trim();
    const nextPhone = userDraftPhone.trim();
    const wantsPasswordChange = userCurrentPassword || userNewPassword || userConfirmPassword;
    if (!nextUsername) {
      setUserAccessMessage('Username is required.');
      return;
    }
    const patch: Partial<typeof activeUserRecord> = { username: nextUsername, name: nextUsername, telegram: nextTelegram, phone: nextPhone };
    if (wantsPasswordChange) {
      if (userCurrentPassword !== activeUserRecord.password) {
        setUserAccessMessage('Current password is not correct.');
        return;
      }
      const policyError = passwordPolicyError(userNewPassword);
      if (policyError) {
        setUserAccessMessage(policyError);
        return;
      }
      if (userNewPassword !== userConfirmPassword) {
        setUserAccessMessage('New password confirmation does not match.');
        return;
      }
      patch.password = userNewPassword;
    }
    saveAccessRequests(accessRequests.map(request => request.id === activeUserRecord.id ? { ...request, ...patch } : request));
    setMemberName(nextUsername);
    setUserAccessOpen(false);
    setUserAccessMessage('Saved.');
  };

  useEffect(() => {
    setSelectedShadowRunIndex(prev => {
      if (shadowRunSnapshots.length === 0) return 0;
      return Math.min(prev, shadowRunSnapshots.length - 1);
    });
  }, [shadowRunSnapshots.length]);

  useEffect(() => {
    if (adminCredentialMessage !== 'Saved.') return;
    const timeout = window.setTimeout(() => setAdminCredentialMessage(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [adminCredentialMessage]);

  useEffect(() => {
    if (userAccessMessage !== 'Saved.') return;
    const timeout = window.setTimeout(() => setUserAccessMessage(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [userAccessMessage]);

  useEffect(() => {
    setAdminName('Muslim Alramadhan');
    setAdminUsername('Muslim Alramadhan');
    setAdminPassword('Mueaa71_');
    setAdminEmail(current => current || 'admin@local.test');
    setAdminDraftUsername('Muslim Alramadhan');
    setAdminDraftEmail(current => current || 'admin@local.test');
    try {
      localStorage.setItem('autoTrade.adminName', 'Muslim Alramadhan');
      localStorage.setItem('autoTrade.adminUsername', 'Muslim Alramadhan');
      localStorage.setItem('autoTrade.adminPassword', 'Mueaa71_');
      if (!localStorage.getItem('autoTrade.adminEmail')) localStorage.setItem('autoTrade.adminEmail', 'admin@local.test');
    } catch {
      // Ignore storage issues in UI-only mode.
    }
  }, []);

  useEffect(() => {
    if (portalView !== 'user' && portalView !== 'admin') return;
    api<BinanceConnection>('/api/binance/connection')
      .then(next => setBinanceConnection(normalizeBinanceConnection(next)))
      .catch(() => {
        setBinanceConnection(normalizeBinanceConnection());
      });
  }, [portalView]);

  useEffect(() => {
    if (portalView !== 'user' && portalView !== 'admin') return;
    api<BinanceWalletSummary>('/api/binance/wallet')
      .then(setBinanceWallet)
      .catch(() => setBinanceWallet({ ok: false, connected: false, updatedAt: null, assetCount: 0, totalValueUsdt: 0, futuresTotalUsdt: 0, futuresAvailableUsdt: 0, pnl24hUsdt: 0, pnl24hPct: 0, balances: [] }));
  }, [portalView, binanceConnection.saved, binanceConnection.verifiedAt]);

  useEffect(() => {
    if (portalView !== 'user' && portalView !== 'admin') return;
    api<{ ok: boolean; rules: LiveRulesPayload }>('/api/live-rules')
      .then(({ rules }) => {
        setVenueMode(rules.venueMode === 'futures' ? 'futures' : 'spot');
        setLiveExecutionMode(rules.executionMode === 'live' ? 'live' : 'test');
        setLiveKillSwitch(Boolean(rules.killSwitch));
        setLiveRuleToggles({ ...defaultLiveRuleToggles, ...(rules.ruleToggles ?? {}) });
        setRiskPerTrade(String(rules.riskPerTrade));
        setMaxTrades(String(rules.maxTrades));
        setDailyLoss(String(rules.dailyLoss));
        setCustomOpenTradeLimit(Number(rules.maxTrades) >= 999 ? '6' : String(rules.maxTrades));
        setCustomDailyLossLimit(String(rules.dailyLoss === 3 ? 5 : rules.dailyLoss));
        setReserveRatio(String(rules.reserveRatio));
        setExecutionSource(rules.executionSource);
        setAllocationMethod('equal');
        setMinRiskReward(rules.minRiskReward);
        setCustomRiskReward(rules.customRiskReward);
        setAllowedDirection(rules.allowedDirection);
        setFuturesLeverage(String(rules.futuresLeverage));
        setFuturesMarginMode(rules.futuresMarginMode);
        setBreakEvenEnabled(rules.breakEvenEnabled !== false);
        setBreakEvenTriggerPct(String(rules.breakEvenTriggerPct ?? 1));
        setTrailingStopEnabled(rules.trailingStopEnabled !== false);
        setTrailingGapPct(String(rules.trailingGapPct ?? 0.8));
        setPortfolioFloorEnabled(rules.portfolioFloorEnabled !== false);
        setPortfolioFloorTriggerPct(String(rules.portfolioFloorTriggerPct ?? 13));
        setPortfolioFloorLockPct(String(rules.portfolioFloorLockPct ?? 8));
      })
      .catch(() => undefined);
  }, [portalView]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(loginStorageKey(loginRole));
      if (!saved) {
        setRememberLogin(false);
        setLoginUsername('');
        setLoginPassword('');
        return;
      }
      const parsed = JSON.parse(saved) as { username?: string; password?: string };
      setRememberLogin(true);
      setLoginUsername(parsed.username ?? '');
      setLoginPassword(parsed.password ?? '');
    } catch {
      setRememberLogin(false);
      setLoginUsername('');
      setLoginPassword('');
    }
  }, [loginRole]);

  useEffect(() => {
    setLoginPasswordVisible(false);
    setRegisterPasswordVisible(false);
    setResetPasswordVisible(false);
    setAdminCurrentPasswordVisible(false);
    setAdminNewPasswordVisible(false);
    setAdminConfirmPasswordVisible(false);
    setUserCurrentPasswordVisible(false);
    setUserNewPasswordVisible(false);
    setUserConfirmPasswordVisible(false);
  }, [portalView, loginRole, registerOpen, adminCredentialsOpen, passwordResetOpen, userAccessOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('autoTrade.portalView', portalView);
      localStorage.setItem('autoTrade.memberName', memberName);
      localStorage.setItem('autoTrade.adminName', adminName);
      localStorage.setItem('autoTrade.adminUsername', adminUsername);
      localStorage.setItem('autoTrade.adminPassword', adminPassword);
      localStorage.setItem('autoTrade.adminEmail', adminEmail);
      localStorage.setItem('autoTrade.adminTelegram', adminTelegram);
      localStorage.setItem('autoTrade.adminPhone', adminPhone);
      localStorage.setItem('autoTrade.binanceApiKey', binanceApiKey);
      localStorage.setItem('autoTrade.binanceSecretKey', binanceSecretKey);
      localStorage.setItem('autoTrade.capital', capital);
      localStorage.setItem('autoTrade.venueMode', venueMode);
      localStorage.setItem('autoTrade.riskPerTrade', riskPerTrade);
      localStorage.setItem('autoTrade.maxTrades', maxTrades);
      localStorage.setItem('autoTrade.dailyLoss', dailyLoss);
      localStorage.setItem('autoTrade.reserveRatio', reserveRatio);
      localStorage.setItem('autoTrade.futuresLeverage', futuresLeverage);
      localStorage.setItem('autoTrade.futuresMarginMode', futuresMarginMode);
      localStorage.setItem('autoTrade.liveExecutionMode', liveExecutionMode);
      localStorage.setItem('autoTrade.liveKillSwitch', String(liveKillSwitch));
      localStorage.setItem('autoTrade.executionSource', executionSource);
      localStorage.setItem('autoTrade.allocationMethod', allocationMethod);
      localStorage.setItem('autoTrade.allowedDirection', allowedDirection);
      localStorage.setItem('autoTrade.maxStrategyExposure', maxStrategyExposure);
      localStorage.setItem('autoTrade.maxLossStreak', maxLossStreak);
      localStorage.setItem('autoTrade.drawdownPause', drawdownPause);
      localStorage.setItem('autoTrade.minRiskReward', minRiskReward);
      localStorage.setItem('autoTrade.customRiskReward', customRiskReward);
    } catch {
      // Ignore storage issues and keep the in-memory state working.
    }
  }, [adminEmail, adminName, adminPassword, adminPhone, adminTelegram, adminUsername, allocationMethod, allowedDirection, autoMode, breakEvenEnabled, breakEvenTriggerPct, capital, customRiskReward, dailyLoss, drawdownPause, executionSource, futuresLeverage, futuresMarginMode, liveExecutionMode, liveKillSwitch, maxLossStreak, maxStrategyExposure, maxTrades, memberName, minRiskReward, portfolioFloorEnabled, portfolioFloorLockPct, portfolioFloorTriggerPct, portalView, reserveRatio, riskPerTrade, trailingGapPct, trailingStopEnabled, venueMode]);

  useEffect(() => {
    if (!rulesSaveMessage) return;
    const timeout = window.setTimeout(() => setRulesSaveMessage(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [rulesSaveMessage]);

  useEffect(() => {
    try {
      localStorage.setItem('autoTrade.liveRulesOpen', String(liveRulesOpen));
    } catch {
      // Keep the in-memory toggle working if storage is unavailable.
    }
  }, [liveRulesOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('autoTrade.adminControlOpen', String(adminControlOpen));
    } catch {
      // Keep the in-memory toggle working if storage is unavailable.
    }
  }, [adminControlOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('autoTrade.hideSmallBinanceAssets', String(hideSmallBinanceAssets));
    } catch {
      // Keep the in-memory toggle working if storage is unavailable.
    }
  }, [hideSmallBinanceAssets]);

  useEffect(() => {
    if (venueMode === 'spot' && allowedDirection !== 'long-only') setAllowedDirection('long-only');
  }, [allowedDirection, venueMode]);

  useEffect(() => {
    setPortfolioTradesMarketFilter(venueMode);
    setPortfolioTradesSideFilter(current => {
      if (venueMode === 'spot') return current === 'short' ? 'all' : current;
      if (allowedDirection === 'long-only') return current === 'short' ? 'all' : current;
      if (allowedDirection === 'short-only') return current === 'long' ? 'all' : current;
      return current;
    });
  }, [allowedDirection, venueMode]);

  useEffect(() => {
    if (focusedPortfolioTradeId == null) return;
    const timeout = window.setTimeout(() => {
      setFocusedPortfolioTradeId(current => current === focusedPortfolioTradeId ? null : current);
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [focusedPortfolioTradeId]);

  useEffect(() => {
    if (focusedPortfolioTradeId == null) return;
    if (handledFocusedPortfolioTradeIdRef.current === focusedPortfolioTradeId) return;
    if (!effectivePortfolioLedgerRows.some(row => row.id === focusedPortfolioTradeId)) return;
    handledFocusedPortfolioTradeIdRef.current = focusedPortfolioTradeId;
    let frameId = 0;
    let attempt = 0;
    const alignPortfolioRow = () => {
      const row = document.getElementById(`portfolio-trade-row-${focusedPortfolioTradeId}`);
      if (!row) {
        if (attempt < 8) {
          attempt += 1;
          frameId = window.requestAnimationFrame(alignPortfolioRow);
        }
        return;
      }
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    acceptedPortfolioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    frameId = window.requestAnimationFrame(alignPortfolioRow);
    return () => window.cancelAnimationFrame(frameId);
  }, [effectivePortfolioLedgerRows, focusedPortfolioTradeId]);

  useEffect(() => {
    if (!adminControlMessage) return;
    const timeout = window.setTimeout(() => setAdminControlMessage(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [adminControlMessage]);

  useEffect(() => {
    const selectedMarkets: MarketMode[] = strategyMarketScope === 'all'
      ? ['spot', 'futures']
      : [strategyMarketScope];
    const subscribers = [
      {
        accountId: 'ADMIN',
        role: 'admin' as const,
        displayName: adminUsername || adminName || 'Admin',
        telegramUsername: adminTelegram,
        notificationsEnabled: adminTelegramNotificationEnabled,
        enabled: true,
        selectedStrategies: [...selected],
        selectedTimeframes: [...timeframes],
        selectedMarkets,
        acceptedLive: true,
        acceptedShadow: true
      },
      ...accessRequests
        .filter(request => request.status === 'approved')
        .map(request => ({
          accountId: request.userId,
          role: 'user' as const,
          displayName: request.username || request.name,
          telegramUsername: request.telegram,
          notificationsEnabled: request.telegramNotificationsEnabled !== false,
          enabled: request.enabled,
          selectedStrategies: [...userSelectedStrategies],
          selectedTimeframes: [...timeframes],
          selectedMarkets,
          acceptedLive: true,
          acceptedShadow: true
        }))
    ];
    api<{ ok: boolean; subscribers: TelegramSubscriber[] }>('/api/telegram/subscribers/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribers })
    }).then(response => {
      setTelegramSubscribers(response.subscribers);
    }).catch(() => undefined);
  }, [accessRequests, adminName, adminTelegram, adminTelegramNotificationEnabled, adminUsername, selected, strategyMarketScope, timeframes, userSelectedStrategies]);

  useEffect(() => {
    api<TelegramConfig>('/api/telegram/config')
      .then(response => setTelegramConfig(response))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api<{ ok: boolean; subscribers: TelegramSubscriber[] }>('/api/telegram/subscribers')
      .then(response => setTelegramSubscribers(response.subscribers))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!telegramActionMessage) return undefined;
    const timeout = window.setTimeout(() => setTelegramActionMessage(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [telegramActionMessage]);

  const pushTelegramActionMessage = (message: string, level: 'info' | 'success' | 'warning' = 'info') => {
    setTelegramActionLevel(level);
    setTelegramActionMessage(message);
  };

  const togglePublicTelegramChannel = async () => {
    try {
      const response = await api<{ ok: boolean; publicChannelEnabled: boolean; delivery?: { ok: boolean; message: string } }>('/api/telegram/public-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !telegramConfig.publicChannelEnabled })
      });
      setTelegramConfig(prev => ({ ...prev, publicChannelEnabled: response.publicChannelEnabled }));
      setAdminControlMessage(response.publicChannelEnabled
        ? response.delivery?.ok ? 'Public Telegram channel alerts enabled and test delivered.' : `Public alerts enabled, but Telegram test failed: ${response.delivery?.message ?? 'unknown error'}`
        : 'Public Telegram channel alerts disabled.');
    } catch {
      setAdminControlMessage('Public Telegram channel toggle failed.');
    }
  };

  const refreshTelegramSubscribers = async () => {
    const response = await api<{ ok: boolean; subscribers: TelegramSubscriber[] }>('/api/telegram/subscribers/refresh', {
      method: 'POST'
    });
    setTelegramSubscribers(response.subscribers);
    return response.subscribers;
  };

  const runTelegramLinkTest = async (accountId: string, displayName: string, telegramUsername?: string) => {
    setTelegramActionBusyId(accountId);
    try {
      const subscribers = await refreshTelegramSubscribers();
      const subscriber = subscribers.find(item => item.accountId === accountId);
      if (!subscriber?.linked) {
        const target = (telegramUsername || subscriber?.telegramUsername || '').trim();
        pushTelegramActionMessage(target && target !== '-'
          ? `${displayName} is not linked yet. Open the private bot, send one message, then press Link/Test Telegram again.`
          : `${displayName} has no Telegram username saved yet. Add the username first, then open the bot to complete linking.`, 'warning');
        return;
      }
      const response = await api<{ ok: boolean; message: string }>('/api/telegram/test/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      pushTelegramActionMessage(response.message, 'success');
    } catch {
      pushTelegramActionMessage(`Telegram test failed for ${displayName}.`, 'warning');
    } finally {
      setTelegramActionBusyId(null);
    }
  };

  const openTelegramBot = (telegramUsername?: string) => {
    const target = (telegramUsername ?? '').trim();
    const effectivePrivateBotUsername = telegramConfig.privateBotUsername || PRIVATE_TELEGRAM_BOT_FALLBACK_USERNAME;
    window.open(`https://t.me/${effectivePrivateBotUsername}`, '_blank', 'noopener,noreferrer');
    pushTelegramActionMessage(
      target && target !== '-'
        ? `Private bot opened. Send one message from ${target}, then return and press Link/Test Telegram.`
        : `Private bot opened. Save the Telegram username first if you want this account to be matched automatically.`,
      'info'
    );
  };

  function getTelegramStatusMeta(subscriber: TelegramSubscriber | null | undefined, telegramUsername?: string) {
    const effectivePrivateBotUsername = telegramConfig.privateBotUsername || PRIVATE_TELEGRAM_BOT_FALLBACK_USERNAME;
    const hasTelegramUsername = Boolean(telegramUsername && telegramUsername.trim() && telegramUsername.trim() !== '-');
    if (subscriber?.linked) {
      return {
        badge: 'Linked',
        badgeClass: 'linked',
        summary: 'Private accepted-trade alerts are armed for this account.',
        helper: 'Link/Test Telegram will send a live private verification message to the linked chat.',
        actionLabel: 'Send Private Test',
        action: 'test' as const
      };
    }
    if (hasTelegramUsername) {
      return {
        badge: 'Awaiting Bot Handshake',
        badgeClass: 'pending',
        summary: 'Username saved. Telegram is still waiting for the first inbound message from this account.',
        helper: `Open @${effectivePrivateBotUsername}, send one message, then run Link/Test Telegram again.`,
        actionLabel: 'Open Bot',
        action: 'open' as const
      };
    }
    return {
      badge: 'Username Missing',
      badgeClass: 'missing',
      summary: 'No Telegram username is stored for this account yet.',
      helper: 'Add the Telegram username in credentials first, then open the bot to finish linking.',
      actionLabel: 'Open Bot',
      action: 'open' as const
    };
  }

  const labStrategySet = useMemo(() => new Set(labStrategyIds), [labStrategyIds]);
  const publicStrategies = useMemo(() => strategies.filter(strategy => !labStrategySet.has(strategy.id)), [labStrategySet, strategies]);
  const labStrategies = useMemo(() => strategies.filter(strategy => labStrategySet.has(strategy.id)), [labStrategySet, strategies]);

  const updateShadowRuleProfile = (profileId: string, patch: Partial<ShadowRuleProfile>) => {
    setShadowRuleProfiles(prev => {
      const currentProfile = prev[profileId] ?? baseShadowProfile;
      const nextProfile = {
        ...currentProfile,
        ...patch,
        liveStartAt: patch.replayMode === 'live-shadow' && currentProfile.replayMode !== 'live-shadow'
          ? Date.now()
          : patch.liveStartAt ?? currentProfile.liveStartAt
      };
      try {
        localStorage.setItem(`autoTrade.shadowProfile.${profileId}`, JSON.stringify(nextProfile));
      } catch {
        // Ignore storage issues in UI-only mode.
      }
      return {
        ...prev,
        [profileId]: nextProfile
      };
    });
  };

  const saveShadowRuleProfile = (profileId: string) => {
    const profile = shadowRuleProfiles[profileId];
    if (!profile) return;
    try {
      localStorage.setItem(`autoTrade.shadowProfile.${profileId}`, JSON.stringify(profile));
    } catch {
      // Ignore storage issues in UI-only mode.
    }
    setEditingShadowProfileId(null);
  };

  const resetShadowRuleProfile = (profileId: string) => {
    const defaultProfile = buildClearedShadowProfile(profileId, baseShadowProfile);
    setShadowRuleProfiles(prev => ({
      ...prev,
      [profileId]: defaultProfile
    }));
    try {
      localStorage.setItem(`autoTrade.shadowProfile.${profileId}`, JSON.stringify(defaultProfile));
    } catch {
      // Ignore storage issues in UI-only mode.
    }
    setEditingShadowProfileId(null);
  };

  const saveAndClearShadowRuleProfile = (profileId: string) => {
    const profile = shadowProfiles.find(item => item.id === profileId);
    if (!profile) return;
    const rules = profile.rules;
    const startTime = rules.liveStartAt;
    const endTime = Date.now();
    const snapshot: ShadowRunSnapshot = {
      id: `${profileId}-${Date.now()}`,
      profileId,
      profileName: profile.name,
      savedAt: Date.now(),
      startTime,
      endTime,
      durationLabel: formatDuration(startTime, endTime),
      startingCapital: profile.startingCapital,
      currentCapital: profile.currentCapital,
      closedPnl: profile.closedPnl,
      openPnl: profile.openPnl,
      netPnl: profile.netPnl,
      changePct: profile.changePct,
      rejectedCount: profile.rejectedCount,
      checkedSignalsCount: profile.tradeRows.length + profile.rejectedTradeRows.length,
      rejectedReasonItems: buildRejectedReasonItems(profile.rules, profile.rejectedReasons)
    };
    setShadowRunSnapshots(prev => {
      const next = [snapshot, ...prev].slice(0, 24);
      try {
        localStorage.setItem('autoTrade.shadowSnapshots', JSON.stringify(next));
      } catch {
        // Ignore storage issues in UI-only mode.
      }
      return next;
    });
    const clearedProfile = buildClearedShadowProfile(profileId, baseShadowProfile);
    setShadowRuleProfiles(prev => ({
      ...prev,
      [profileId]: clearedProfile
    }));
    try {
      localStorage.setItem(`autoTrade.shadowProfile.${profileId}`, JSON.stringify(clearedProfile));
    } catch {
      // Ignore storage issues in UI-only mode.
    }
    setEditingShadowProfileId(null);
  };

  if (portalView === 'login') {
    return <section className="auto-trade-page">
      <div className="auto-auth-shell">
        <div className="auto-auth-card">
          <form onSubmit={event => { event.preventDefault(); handleAutoLogin(); }}>
          <div className="auto-auth-head">
            <p className="eyebrow">Premium Access</p>
            <h1>Auto Trading System</h1>
          </div>
          <div className="role-switch">
            <button type="button" className={loginRole === 'user' ? 'active' : ''} onClick={() => { setLoginRole('user'); setAuthMessage(''); setLoginPasswordVisible(false); }}>User</button>
            <button type="button" className={loginRole === 'admin' ? 'active' : ''} onClick={() => { setLoginRole('admin'); setAuthMessage(''); setLoginPasswordVisible(false); }}>Admin</button>
          </div>
          <div className="auto-auth-form">
            <input value={loginUsername} onChange={event => setLoginUsername(event.target.value)} placeholder={loginRole === 'admin' ? 'Admin username or admin name' : 'Username'} />
            <div className="password-field">
              <input value={loginPassword} onChange={event => setLoginPassword(event.target.value)} placeholder="Password" type={loginPasswordVisible ? 'text' : 'password'} />
              <button type="button" onClick={() => setLoginPasswordVisible(value => !value)} aria-label={loginPasswordVisible ? 'Hide password' : 'Show password'}>
                {loginPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <label className="remember-login">
              <input type="checkbox" checked={rememberLogin} onChange={event => setRememberLogin(event.target.checked)} />
              <span>Remember login</span>
            </label>
            <small className="password-policy-note">8+ characters, uppercase, lowercase, number, and special character.</small>
            <button type="submit">Login</button>
          </div>
          <div className="register-prompt">
            <span>Forgot password?</span>
            <button type="button" onClick={() => setPasswordResetOpen(value => !value)}>{passwordResetOpen ? 'Close reset' : 'Reset password'}</button>
          </div>
          {authMessage && <p className="auth-message">{authMessage}</p>}
          {loginRole === 'user' && <div className="register-prompt">
            <span>Don't have an account?</span>
            <button type="button" onClick={() => setRegisterOpen(value => !value)}>{registerOpen ? 'Close request' : 'Request access'}</button>
          </div>}
          </form>
          {passwordResetOpen && <form className="register-panel" onSubmit={event => { event.preventDefault(); handlePasswordReset(); }}>
            <div className="register-panel-head">
              <strong>{loginRole === 'admin' ? 'Admin password reset' : 'User password reset'}</strong>
              <button type="button" onClick={() => setPasswordResetOpen(false)} aria-label="Close password reset form">x</button>
            </div>
            <small className="password-policy-note">Email recovery will be enabled after secure email delivery is configured.</small>
            <button type="button" onClick={() => setPasswordResetOpen(false)}>Close</button>
          </form>}
          {loginRole === 'user' && registerOpen && <form className="register-panel" onSubmit={event => { event.preventDefault(); submitAccessRequest(); }}>
            <div className="register-panel-head">
              <strong>New access request</strong>
              <button type="button" onClick={() => setRegisterOpen(false)} aria-label="Close registration form">x</button>
            </div>
            <input required value={joinUsername} onChange={event => setJoinUsername(event.target.value)} placeholder="Username" />
            <div className="password-field">
              <input value={joinPassword} onChange={event => setJoinPassword(event.target.value)} placeholder="Password" type={registerPasswordVisible ? 'text' : 'password'} />
              <button type="button" onClick={() => setRegisterPasswordVisible(value => !value)} aria-label={registerPasswordVisible ? 'Hide password' : 'Show password'}>
                {registerPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <small className="password-policy-note">8+ characters, uppercase, lowercase, number, and special character.</small>
            <input value={joinTelegram} onChange={event => setJoinTelegram(event.target.value)} placeholder="Telegram account or link" />
            <input value={joinPhone} onChange={event => setJoinPhone(event.target.value)} placeholder="Phone number" />
            <button type="submit">Submit Request</button>
          </form>}
          <small className="auth-help">If you have any problem, contact admin on <a href="https://wa.me/966599204215" target="_blank" rel="noreferrer">WhatsApp</a>.</small>
        </div>
      </div>
    </section>;
  }

  return <section className="auto-trade-page">
    <div className="auto-trade-headbar">
      <div>
        <div className="welcome-lockup">
          <strong>{greetingLine}</strong>
        </div>
      </div>
      <div className="auto-trade-head-actions">
        <button className="ghost" onClick={() => setPortalView('login')}>Back To Login</button>
      </div>
    </div>

    <div className="premium-workspace-grid">
      {portalView === 'user' && <section className="admin-split-panel user-access-panel">
        <div className="admin-split-head">
          <div>
            <span>User Access</span>
            <h3>{activeUserRecord?.username ?? memberName}</h3>
          </div>
          <div className="admin-split-actions">
            {userAccessMessage && <small className={userAccessMessage === 'Saved.' ? 'admin-credential-message good' : 'admin-credential-message'}>{userAccessMessage}</small>}
            <button type="button" onClick={userAccessOpen ? closeUserAccessEditor : openUserAccessEditor}>{userAccessOpen ? 'Close Editor' : 'Edit Access'}</button>
          </div>
        </div>
        <div className="admin-split-body">
          <div className="admin-split-section login">
            <span>Login Credentials</span>
            <div><small>User ID</small><b>{activeUserRecord?.userId ?? 'USR-0001'}</b></div>
            <div><small>Username</small><b>{activeUserRecord?.username ?? memberName}</b></div>
            <div><small>Password Status</small><b className="protected-status">Protected</b></div>
          </div>
          <i aria-hidden="true" />
          <div className="admin-split-section recovery">
            <span>Contact Info</span>
            <div><small>Telegram</small><b>{activeUserRecord?.telegram || '-'}</b></div>
            <div><small>Mobile</small><b>{activeUserRecord?.phone || '-'}</b></div>
          </div>
        </div>
        {userAccessOpen && <form className="admin-credentials-editor" onSubmit={event => { event.preventDefault(); saveUserAccess(); }}>
          <label className="required-field">
            <span>Username <b>Required</b></span>
            <input required value={userDraftUsername} onChange={event => setUserDraftUsername(event.target.value)} placeholder="Username" />
          </label>
          <label>
            <span>Telegram</span>
            <input value={userDraftTelegram} onChange={event => setUserDraftTelegram(event.target.value)} placeholder="Telegram account" />
          </label>
          <label>
            <span>Mobile</span>
            <input value={userDraftPhone} onChange={event => setUserDraftPhone(event.target.value)} placeholder="Mobile number" />
          </label>
          <div className="admin-password-editor">
            <span>Change Password</span>
            <label className="password-field">
              <input value={userCurrentPassword} onChange={event => setUserCurrentPassword(event.target.value)} placeholder="Current password" type={userCurrentPasswordVisible ? 'text' : 'password'} />
              <button type="button" onClick={() => setUserCurrentPasswordVisible(visible => !visible)}>{userCurrentPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </label>
            <label className="password-field">
              <input value={userNewPassword} onChange={event => setUserNewPassword(event.target.value)} placeholder="New password" type={userNewPasswordVisible ? 'text' : 'password'} />
              <button type="button" onClick={() => setUserNewPasswordVisible(visible => !visible)}>{userNewPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </label>
            <label className="password-field">
              <input value={userConfirmPassword} onChange={event => setUserConfirmPassword(event.target.value)} placeholder="Confirm new password" type={userConfirmPasswordVisible ? 'text' : 'password'} />
              <button type="button" onClick={() => setUserConfirmPasswordVisible(visible => !visible)}>{userConfirmPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </label>
            <small>8+ characters, uppercase, lowercase, number, and special character.</small>
          </div>
          <div className="admin-editor-actions">
            <button type="submit">Save Changes</button>
            <button type="button" className="ghost" onClick={closeUserAccessEditor}>Cancel</button>
          </div>
        </form>}
      </section>}

      {portalView === 'user' && <section className="admin-strategy-control user-strategy-control">
        <div className="portfolio-card-head">
          <strong>{userStrategyViews.size === 2 ? 'Public + Lab Strategies' : userStrategyViews.has('public') ? 'Public Strategies' : 'Lab Strategies'}</strong>
          <span>{`${[...userSelectedStrategies].length}/${strategies.length} active`}</span>
        </div>
        <div className="admin-strategy-toolbar">
          <div className="admin-strategy-toolbar-row">
            <div className="access-filter-pills">
              <button className={userStrategyViews.has('public') ? 'active' : ''} onClick={() => toggleStrategyViewFilter('public', 'user')}>Public Strategies</button>
              <button className={userStrategyViews.has('lab') ? 'active' : ''} onClick={() => toggleStrategyViewFilter('lab', 'user')}>Lab Strategies</button>
            </div>
            <div className="access-filter-pills">
              {([
                ['spot', 'Spot'],
                ['futures', 'Futures']
              ] as const).map(([value, label]) => <button key={value} className={marketScopeButtonActive(strategyMarketScope, value) ? 'active' : ''} onClick={() => toggleStrategyMarketScope(value)}>
                {label}
              </button>)}
            </div>
            <div className="access-filter-pills">
              <button type="button" className="active">{allTimeframes.filter(timeframe => timeframes.has(timeframe)).join(' / ')}</button>
            </div>
          </div>
          <div className="admin-split-actions">
            <button type="button" onClick={() => toggleAllUserStrategies(true)}>Enable All</button>
            <button type="button" className="ghost" onClick={() => toggleAllUserStrategies(false)}>Disable All</button>
          </div>
        </div>
        {userStrategyViews.has('public') && <div className="admin-strategy-grid">
          {publicStrategies.map(strategy => {
            const isActive = userSelectedStrategies.has(strategy.id);
            return <button key={strategy.id} type="button" className={isActive ? 'admin-strategy-card active' : 'admin-strategy-card'} onClick={() => toggleUserStrategy(strategy.id)}>
              <div>
                <strong>{strategy.name}</strong>
                <span>{strategy.risk === 'high' ? 'High risk' : 'Medium risk'} • {allTimeframes.filter(timeframe => timeframes.has(timeframe)).join(' / ')}</span>
              </div>
              <b>{isActive ? 'ON' : 'OFF'}</b>
            </button>;
          })}
        </div>}
        {userStrategyViews.has('lab') && <div className="admin-strategy-grid">
          {labStrategies.length === 0 && <p className="empty">No lab strategies visible right now.</p>}
          {labStrategies.map(strategy => <article key={strategy.id} className="admin-strategy-card admin-strategy-shell">
            <div>
              <strong>{strategy.name}</strong>
              <span>{strategy.risk === 'high' ? 'High risk' : 'Medium risk'}</span>
            </div>
            <b>LAB</b>
          </article>)}
        </div>}
      </section>}

      {portalView === 'user' && <section className="telegram-delivery-panel">
        <div>
          <span>Telegram Notifications</span>
          <strong>{activeUserRecord?.telegram && activeUserRecord.telegram !== '-' ? activeUserRecord.telegram : 'No Telegram account'}</strong>
          <p className={`telegram-status-pill ${activeUserTelegramMeta.badgeClass}`}>{activeUserTelegramMeta.badge}</p>
          <small>{activeUserTelegramMeta.summary}</small>
          <small>{activeUserTelegramMeta.helper}</small>
          {telegramActionMessage && <small className={`telegram-inline-message ${telegramActionLevel}`}>{telegramActionMessage}</small>}
        </div>
        <div className="telegram-delivery-actions">
          <button type="button" className={activeUserRecord?.telegramNotificationsEnabled !== false ? 'active' : ''} onClick={toggleUserTelegramDelivery}>
            {activeUserRecord?.telegramNotificationsEnabled !== false ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => activeUserRecord && (activeUserTelegramMeta.action === 'test'
              ? runTelegramLinkTest(activeUserRecord.userId, activeUserRecord.username || activeUserRecord.name, activeUserRecord.telegram)
              : openTelegramBot(activeUserRecord.telegram))}
            disabled={!activeUserRecord || telegramActionBusyId === activeUserRecord.userId}
          >
            {telegramActionBusyId === activeUserRecord?.userId ? 'Checking...' : activeUserTelegramMeta.actionLabel}
          </button>
          <button
            type="button"
            onClick={() => activeUserRecord && runTelegramLinkTest(activeUserRecord.userId, activeUserRecord.username || activeUserRecord.name, activeUserRecord.telegram)}
            disabled={!activeUserRecord || telegramActionBusyId === activeUserRecord.userId}
          >
            {telegramActionBusyId === activeUserRecord?.userId ? 'Checking...' : 'Link/Test Telegram'}
          </button>
        </div>
      </section>}

      <section className="premium-panel">
        <div className="premium-panel-heading">
          <div>
            <h2>Capital</h2>
          </div>
          <span className="nav-badge subtle">Members</span>
        </div>
        <section className="premium-panel premium-panel-accent">
          <div className="premium-panel-heading">
            <div>
              <h2>Portfolio</h2>
            </div>
            <span className="nav-badge glow">Portfolio View</span>
          </div>
          {autoMode === 'shadow' && <section className="portfolio-card">
            <div className="shadow-profile-grid">
              {shadowProfiles.map(profile => <article key={profile.id} className={selectedShadowProfileId === profile.id ? 'shadow-profile-card active' : 'shadow-profile-card'}>
                <div className="shadow-profile-topline">
                  <button type="button" className="shadow-profile-select" onClick={() => {
                    setSelectedShadowProfileId(profile.id);
                    setEditingShadowProfileId(current => current === profile.id ? null : profile.id);
                  }}>
                    <strong>{profile.name}</strong>
                    <small className={profile.netPnl >= 0 ? 'good' : 'bad'}>{`${profile.netPnl >= 0 ? '+' : ''}${profile.netPnl.toFixed(2)}%`}</small>
                  </button>
                  <div className="shadow-profile-actions">
                    <button type="button" className={profile.rules.enabled ? 'shadow-profile-toggle active' : 'shadow-profile-toggle'} onClick={() => updateShadowRuleProfile(profile.id, { enabled: !profile.rules.enabled })}>
                      {profile.rules.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
                <button type="button" className="shadow-profile-select" onClick={() => {
                  setSelectedShadowProfileId(profile.id);
                  setEditingShadowProfileId(current => current === profile.id ? null : profile.id);
                }}>
                  <div className="shadow-profile-metrics">
                    <span>Starting <b>{`$${fmt(profile.startingCapital)}`}</b></span>
                    <span>Current <b>{`$${fmt(profile.currentCapital)}`}</b></span>
                    <span>Closed trades <b>{profile.closedCount}</b></span>
                  </div>
                  <small>{profile.summary}</small>
                </button>
              </article>)}
            </div>
            <div className="portfolio-card-head">
              <strong>{selectedShadowProfile?.name ?? 'Shadow Portfolio'}</strong>
              <span>Shadow snapshot</span>
            </div>
            <div className="binance-wallet-summary">
              <div>
                <span>Starting Capital</span>
                <strong>{`$${fmt(selectedShadowProfile?.startingCapital || 0)}`}</strong>
                <small>Shadow profile capital remains simulated only.</small>
              </div>
              <div>
                <span>Current Capital</span>
                <strong className={activePortfolioCurrentCapital >= 0 ? 'good' : 'bad'}>{`$${fmt(activePortfolioCurrentCapital || 0)}`}</strong>
                <small>{`${activePortfolioChangePct >= 0 ? '+' : ''}${activePortfolioChangePct.toFixed(2)}% total`}</small>
              </div>
            </div>
            {editingShadowProfileId === selectedShadowProfileId && <>
            <div className="portfolio-card-head">
              <strong>{`${selectedShadowProfile?.name ?? 'Shadow'} Rules`}</strong>
              <span>Shadow Spot / Futures</span>
            </div>
            <div className="venue-switch-panel">
              <div className="venue-switch-head">
                <strong>Trading Venue</strong>
                <span>{venueMode === 'spot' ? 'Shadow Spot' : 'Shadow Futures'}</span>
              </div>
              <div className="venue-switch">
                <button type="button" className={venueMode === 'spot' ? 'active' : ''} onClick={() => setVenueMode('spot')}>Spot</button>
                <button type="button" className={venueMode === 'futures' ? 'active' : ''} onClick={() => setVenueMode('futures')}>Futures</button>
              </div>
            </div>
            {venueMode === 'futures' && <div className="portfolio-card-head">
              <strong>Futures Settings</strong>
              <span>Leverage and margin mode</span>
            </div>}
            {venueMode === 'futures' && <div className="shadow-rule-pill-groups">
              <div className="selection-control-card">
                <span className="field-label-inline"><FieldHint label="Leverage" hint="Set the futures leverage for this shadow venue." /><small className="field-priority">Futures</small></span>
                <div className={`leverage-meter ${leverageTone}`}>
                  <div className="leverage-meter-topline">
                    <strong>{`${leverageValue}x`}</strong>
                    <span>{leverageLabel}</span>
                  </div>
                  <input type="range" min="1" max="20" step="1" value={leverageValue} onChange={event => setFuturesLeverage(event.target.value)} />
                  <div className="leverage-meter-scale">
                    <small>1x</small>
                    <small>10x</small>
                    <small>20x</small>
                  </div>
                </div>
              </div>
              <div className="selection-control-card">
                <span className="field-label-inline"><FieldHint label="Margin Mode" hint="Choose whether futures margin is isolated per position or shared across positions." /><small className="field-priority">Futures</small></span>
                <div className="selection-pill-row">
                  {([
                    ['isolated', 'Isolated'],
                    ['cross', 'Cross']
                  ] as const).map(([value, label]) => <button key={value} className={futuresMarginMode === value ? 'active' : ''} onClick={() => setFuturesMarginMode(value)}>
                    {value === 'isolated' ? <>{label} <em>Recommended</em></> : label}
                  </button>)}
                </div>
              </div>
            </div>}
            <div className="shadow-rule-pill-groups">
              <div className="selection-control-card">
                <span className="field-label-inline"><FieldHint label="Execution Mode" hint="Test mode submits Binance test orders only. Live mode submits real orders after server-side rule checks." /><small className="field-priority">Safety</small></span>
                <div className="selection-pill-row">
                  {([
                    ['test', 'Test'],
                    ['live', 'Live']
                  ] as const).map(([value, label]) => <button
                    key={value}
                    className={liveExecutionMode === value ? 'active' : ''}
                    onClick={() => setLiveExecutionMode(value)}
                    disabled={portalView !== 'admin'}
                  >
                    {label}
                  </button>)}
                </div>
                <small className="selection-footnote">{portalView === 'admin' ? 'Live orders require an explicit save from the admin.' : 'Only admin can switch between test and live execution.'}</small>
              </div>
              <div className="selection-control-card">
                <span className="field-label-inline"><FieldHint label="Kill Switch" hint="When ON, the server blocks all new Binance orders even if a trade passes the rules." /><small className="field-priority">Safety</small></span>
                <div className="selection-pill-row">
                  {([
                    [true, 'On'],
                    [false, 'Off']
                  ] as const).map(([value, label]) => <button
                    key={label}
                    className={liveKillSwitch === value ? 'active' : ''}
                    onClick={() => setLiveKillSwitch(value)}
                    disabled={portalView !== 'admin'}
                  >
                    {label}
                  </button>)}
                </div>
                <small className="selection-footnote">{liveKillSwitch ? 'Kill switch is currently blocking all new live orders.' : 'Kill switch is off. Orders can proceed if every rule passes.'}</small>
              </div>
            </div>
            <div className="shadow-rule-grid">
              <label>
                <span className="field-label-inline"><FieldHint label="Portfolio Capital" hint="Simulated capital for the selected shadow profile and venue." /><small className="field-priority">Shadow</small></span>
                <div className="selection-pill-row">
                  {['100', '500', '1000'].map(option => <button key={option} className={String(selectedShadowProfile?.rules.capital ?? capital) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { capital: option })}>
                    {option === '100' ? <>{`$${option}`} <em>Recommended</em></> : `$${option}`}
                  </button>)}
                </div>
              </label>
              <label>
                <span className="field-label-inline"><FieldHint label="Risk Per Trade %" hint="The percentage of shadow capital risked on one test trade." /><small className="field-priority">Core</small></span>
                <div className="selection-pill-row">
                  {['0.5', '1', '1.5'].map(option => <button key={option} className={String(selectedShadowProfile?.rules.riskPerTrade ?? riskPerTrade) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { riskPerTrade: option })}>
                    {option === '1' ? <>{option}% <em>Recommended</em></> : `${option}%`}
                  </button>)}
                </div>
              </label>
              <label>
                <span className="field-label-inline"><FieldHint label="Open Trade Limit" hint="The maximum number of shadow trades open at one time." /><small className="field-priority">Core</small></span>
                <div className="selection-pill-row">
                  {['2', '4', '6'].map(option => <button key={option} className={String(selectedShadowProfile?.rules.maxTrades ?? maxTrades) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { maxTrades: option })}>
                    {option === '4' ? <>{option} <em>Recommended</em></> : option}
                  </button>)}
                </div>
              </label>
              <label>
                <FieldHint label="Daily Loss Limit %" hint="If total daily loss reaches this percentage, shadow auto stops taking more trades." />
                <div className="selection-pill-row">
                  {['3', '5', '8'].map(option => <button key={option} className={String(selectedShadowProfile?.rules.dailyLoss ?? dailyLoss) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { dailyLoss: option })}>
                    {option === '5' ? <>{option}% <em>Recommended</em></> : `${option}%`}
                  </button>)}
                </div>
              </label>
              <label>
                <FieldHint label="Cash Reserve %" hint="The percentage of shadow capital held back instead of being deployed into test trades." />
                <div className="selection-pill-row">
                  {['0', '10', '25'].map(option => <button key={option} className={String(selectedShadowProfile?.rules.reserveRatio ?? reserveRatio) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { reserveRatio: option })}>
                    {option === '25' ? <>{option}% <em>Recommended</em></> : `${option}%`}
                  </button>)}
                </div>
              </label>
            </div>
            <div className="shadow-rule-pill-groups">
              <div className="selection-control-card">
                <span className="field-label-inline"><FieldHint label="Execution Source" hint="Choose where shadow auto sources trades from." /><small className="field-priority">Core</small></span>
                <div className="selection-pill-row">
                  {(['best-single', 'top-2', 'top-4', 'custom'] as const).map(option => <button key={option} className={String(selectedShadowProfile?.rules.executionSource ?? executionSource) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { executionSource: option })}>
                    {option === 'best-single' ? <>Best Single Strategy <em>Recommended</em></> : option === 'top-2' ? 'Top 2 Strategies' : option === 'top-4' ? 'All Strategies' : 'Custom Strategy Selection'}
                  </button>)}
                </div>
              </div>
              <div className="selection-control-card">
                <span className="field-label-inline"><FieldHint label="Allocation Method" hint="Choose how shadow capital is allocated across accepted trades." /><small className="field-priority">Core</small></span>
                <div className="selection-pill-row">
                  {(['equal', 'risk'] as const).map(option => <button key={option} className={String(selectedShadowProfile?.rules.allocationMethod ?? allocationMethod) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { allocationMethod: option })}>
                    {option === 'equal' ? 'Equal Split' : <>Risk-Based <em>Recommended</em></>}
                  </button>)}
                </div>
              </div>
              <div className="selection-control-card">
                <FieldHint label="Minimum Risk/Reward" hint="Minimum reward threshold required for shadow setups." />
                <div className="selection-pill-row rr-pill-row">
                  {(['1:1', '1:2', '1:3', '1:4', 'custom'] as const).map(option => <button key={option} className={String(selectedShadowProfile?.rules.minRiskReward ?? minRiskReward) === option ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { minRiskReward: option })}>
                    {option === '1:2' ? <>{option} <em>Recommended</em></> : option === 'custom' ? 'Custom RR' : option}
                  </button>)}
                </div>
                {String(selectedShadowProfile?.rules.minRiskReward ?? minRiskReward) === 'custom' && <label className="selection-inline-input">
                  <span>Custom RR</span>
                  <input value={selectedShadowProfile?.rules.customRiskReward ?? customRiskReward} onChange={event => updateShadowRuleProfile(selectedShadowProfileId, { customRiskReward: event.target.value })} />
                </label>}
              </div>
              <div className="selection-control-card">
                <FieldHint label="Allowed Direction" hint="Choose whether shadow auto accepts both sides, long-only trades, or short-only trades." />
                <div className="selection-pill-row rr-pill-row">
                  {(venueMode === 'spot'
                    ? [['long-only', 'Long']] as const
                    : [
                      ['both', 'Both'],
                      ['long-only', 'Long'],
                      ['short-only', 'Short']
                    ] as const).map(([value, label]) => <button key={value} className={String(selectedShadowProfile?.rules.allowedDirection ?? allowedDirection) === value ? 'active' : ''} onClick={() => updateShadowRuleProfile(selectedShadowProfileId, { allowedDirection: value })}>
                    {label}
                  </button>)}
                </div>
                {venueMode === 'spot' && <small className="selection-footnote">Spot uses long-only execution.</small>}
              </div>
            </div>
            <div className="shadow-rule-actions">
              <button type="button" className="secondary" onClick={() => resetShadowRuleProfile(selectedShadowProfileId)}>Clear</button>
              <button type="button" className="secondary" onClick={() => saveAndClearShadowRuleProfile(selectedShadowProfileId)}>Save & Clear</button>
              <button type="button" onClick={() => saveShadowRuleProfile(selectedShadowProfileId)}>Save Settings</button>
            </div>
            </>}
          </section>}
          {autoMode === 'live' && <section className={`portfolio-card live-rules-shell ${liveRulesOpen ? 'open' : 'collapsed'}`}>
            <button type="button" className="live-rules-toggle" onClick={() => setLiveRulesOpen(value => !value)} aria-expanded={liveRulesOpen}>
              <div className="live-rules-toggle-main">
                <strong>Live Auto Rules</strong>
                <span>{venueMode === 'futures' ? `${allowedDirection === 'both' ? 'Both' : allowedDirection === 'long-only' ? 'Long' : 'Short'} | ${leverageValue}x | ${futuresMarginMode}` : 'Spot | Long only'} | {openTradeLimitUnlimited ? 'Unlimited' : `${Math.max(1, Number(customOpenTradeLimit) || 6)} max`} | {liveExecutionMode.toUpperCase()}</span>
              </div>
              <div className="live-rules-badge-row">
                <span className="nav-badge subtle">{venueMode === 'spot' ? 'Spot' : 'Futures'}</span>
                <span className={`nav-badge ${liveExecutionMode === 'live' ? 'glow' : 'subtle'}`}>{liveExecutionMode === 'live' ? 'Live' : 'Test'}</span>
                {liveKillSwitch && <span className="nav-badge subtle">Kill Switch</span>}
                {liveRulesOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>
            {liveRulesOpen && <>
            <div className="live-rules-panel-grid">
              <div className="venue-switch-panel live-rules-panel-card live-venue-direction-card">
                <div className="venue-switch-head">
                  <strong>Trading Venue</strong>
                </div>
                <div className="live-venue-direction-controls">
                  <div className="venue-switch">
                    <button type="button" className={venueMode === 'spot' ? 'active' : ''} onClick={() => setVenueMode('spot')}>Spot</button>
                    <button
                      type="button"
                      className={venueMode === 'futures' ? 'active' : ''}
                      onClick={() => {
                        setVenueMode('futures');
                        if (venueMode === 'spot' && allowedDirection === 'long-only') setAllowedDirection('both');
                      }}
                    >
                      Futures
                    </button>
                  </div>
                  {venueMode === 'spot' && <small className="selection-footnote">Spot execution accepts long-only buy orders.</small>}
                </div>
              </div>
              {venueMode === 'futures' && <div className="selection-control-card live-rules-panel-card live-futures-direction-card">
                <span className="field-label-inline"><FieldHint label="Futures Direction" hint="Choose which futures signals are allowed to become real Binance orders." /><small className="field-priority">Futures</small></span>
                <div className="selection-pill-row">
                  {([
                    ['both', 'Both'],
                    ['long-only', 'Long'],
                    ['short-only', 'Short']
                  ] as const).map(([value, label]) => <button
                    key={value}
                    type="button"
                    className={allowedDirection === value ? 'active' : ''}
                    onClick={() => setAllowedDirection(value)}
                  >
                    {label}
                  </button>)}
                </div>
                <small className="selection-footnote">
                  {allowedDirection === 'both'
                    ? 'Both LONG and SHORT futures signals can pass this rule.'
                    : allowedDirection === 'long-only'
                      ? 'SHORT futures signals will be rejected by Allowed Direction.'
                      : 'LONG futures signals will be rejected by Allowed Direction.'}
                </small>
              </div>}
              <div className="selection-control-card live-rules-panel-card">
                <span className="field-label-inline"><FieldHint label="Execution Mode" hint="Test sends Binance test orders. Live sends real orders after the active rules pass." /><small className="field-priority">Safety</small></span>
                <div className="selection-pill-row">
                  {([
                    ['test', 'Test'],
                    ['live', 'Live']
                  ] as const).map(([value, label]) => <button
                    key={value}
                    className={liveExecutionMode === value ? 'active' : ''}
                    onClick={() => requestExecutionModeChange(value)}
                    disabled={portalView !== 'admin'}
                  >
                    {label}
                  </button>)}
                </div>
                {venueMode === 'futures' && <button
                  type="button"
                  className="danger-action-button"
                  onClick={closeAllFuturesPositions}
                  disabled={portalView !== 'admin' || !binanceConnection.connected}
                >
                  Close All Futures
                </button>}
              </div>
              <div className="selection-control-card live-rules-panel-card">
                <span className="field-label-inline"><FieldHint label="Kill Switch" hint="When ON, the server blocks new orders and emergency-closes matched live Binance Futures positions." /><small className="field-priority">Safety</small></span>
                <div className="selection-pill-row">
                  {([
                    [true, 'On'],
                    [false, 'Off']
                  ] as const).map(([value, label]) => <button
                    key={label}
                    className={liveKillSwitch === value ? 'active' : ''}
                    onClick={() => portalView === 'admin' && setLiveKillSwitch(value)}
                    disabled={portalView !== 'admin'}
                  >
                    {label}
                  </button>)}
                </div>
              </div>
              <div className="selection-control-card live-rules-panel-card live-rule-wide">
                <span className="field-label-inline"><FieldHint label="Open Trade Limit" hint="Unlimited bypasses the limit. Custom keeps a fixed maximum number of concurrent accepted trades." /><small className="field-priority">Core</small></span>
                <div className="selection-pill-row">
                  <button type="button" className={openTradeLimitUnlimited ? 'active' : ''} onClick={() => setMaxTrades('999')}>Unlimited</button>
                  <button type="button" className={!openTradeLimitUnlimited ? 'active' : ''} onClick={() => setMaxTrades(customOpenTradeLimit || '6')}>Custom</button>
                </div>
                {!openTradeLimitUnlimited && <label className="selection-inline-input live-rule-input">
                  <span>Custom open trades</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={customOpenTradeLimit}
                    onChange={event => {
                      const next = event.target.value.replace(/[^\d]/g, '');
                      setCustomOpenTradeLimit(next);
                      setMaxTrades(next || '6');
                    }}
                  />
                </label>}
              </div>
              <div className="selection-control-card live-rules-panel-card">
                <span className="field-label-inline"><FieldHint label="Daily Loss Limit %" hint="Once accepted trades for today hit the loss limit, the server stops taking more trades." /><small className="field-priority">Safety</small></span>
                <div className="selection-pill-row">
                  <button type="button" className={!dailyLossUsesCustom ? 'active' : ''} onClick={() => setDailyLoss('3')}>3%</button>
                  <button type="button" className={dailyLossUsesCustom ? 'active' : ''} onClick={() => setDailyLoss(customDailyLossLimit || '5')}>Custom</button>
                </div>
                {dailyLossUsesCustom && <label className="selection-inline-input live-rule-input">
                  <span>Custom loss limit %</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={customDailyLossLimit}
                    onChange={event => {
                      const next = event.target.value.replace(/[^\d.]/g, '');
                      setCustomDailyLossLimit(next);
                      setDailyLoss(next || '3');
                    }}
                  />
                </label>}
              </div>
              <div className="selection-control-card live-rules-panel-card live-rule-locked">
                <span className="field-label-inline"><FieldHint label="Allocation Method" hint="Live allocation is locked to equal split so accepted trades are sized consistently." /><small className="field-priority">Core</small></span>
                <div className="selection-pill-row">
                  <button type="button" className="active" disabled>Equal Split</button>
                </div>
              </div>
              {venueMode === 'futures' && <div className="selection-control-card live-rules-panel-card live-rule-wide live-futures-rule-card">
                <span className="field-label-inline"><FieldHint label="Futures Handling" hint="Set leverage and margin behavior for futures execution." /><small className="field-priority">Futures</small></span>
                <div className="live-futures-settings live-futures-settings-advanced">
                  <div
                    className={`live-leverage-spectrum ${leverageTone}`}
                    style={{ '--leverage-progress': `${Math.max(0, Math.min(100, ((leverageValue - 1) / 19) * 100))}%` } as React.CSSProperties}
                  >
                    <div className="live-leverage-spectrum-rail">
                      <input type="range" min="1" max="20" step="0.1" value={leverageValue} onChange={event => setFuturesLeverage(event.target.value)} aria-label="Futures leverage" />
                    </div>
                    <div className="live-leverage-spectrum-ticks" aria-hidden="true">
                      {[1, 5, 10, 15, 20].map(value => <button
                        key={value}
                        type="button"
                        className={Math.abs(leverageValue - value) < 0.05 ? 'active' : ''}
                        onClick={() => setFuturesLeverage(String(value))}
                        tabIndex={-1}
                      >
                        {`${value}x`}
                      </button>)}
                    </div>
                    <div className="live-leverage-risk-scale" aria-hidden="true">
                      <span className="low">Low Risk</span>
                      <span className="medium">Medium Risk</span>
                      <span className="high">High Risk</span>
                    </div>
                  </div>
                  <div className="selection-pill-row">
                    {([
                      ['isolated', 'Isolated'],
                      ['cross', 'Cross']
                    ] as const).map(([value, label]) => <button key={value} className={futuresMarginMode === value ? 'active' : ''} onClick={() => setFuturesMarginMode(value)}>
                      {label}
                    </button>)}
                  </div>
                </div>
              </div>}
              {venueMode === 'futures' && <div className="selection-control-card live-rules-panel-card live-rule-wide live-protection-rule-card">
                <span className="field-label-inline"><FieldHint label="Live Protection" hint="Closes live Binance Futures positions when break-even, trailing stop, or portfolio floor rules trigger." /><small className="field-priority">Binance</small></span>
                <div className="live-protection-grid">
                  <label className="protection-toggle-row">
                    <input type="checkbox" checked={breakEvenEnabled} onChange={event => setBreakEvenEnabled(event.target.checked)} />
                    <span>Break-even lock</span>
                  </label>
                  <div className="protection-concept-note"><b>Dynamic R</b><span>Arms after the trade earns enough of its original risk.</span></div>
                  <label className="protection-toggle-row">
                    <input type="checkbox" checked={trailingStopEnabled} onChange={event => setTrailingStopEnabled(event.target.checked)} />
                    <span>Trailing stop</span>
                  </label>
                  <div className="protection-concept-note"><b>Adaptive gap</b><span>Uses risk, target distance, and market volatility.</span></div>
                  <label className="protection-toggle-row">
                    <input type="checkbox" checked={portfolioFloorEnabled} onChange={event => setPortfolioFloorEnabled(event.target.checked)} />
                    <span>Portfolio floor</span>
                  </label>
                  <div className="protection-concept-note protection-wide-note"><b>Basket R floor</b><span>Arms when open trades earn about one shared risk unit, then locks a dynamic part of the peak.</span></div>
                </div>
                <small className="selection-footnote">Protection runs only in LIVE Futures and sends real Binance close orders for matched open positions. Thresholds are derived from each trade instead of fixed percentages.</small>
              </div>}
            </div>
            <div className="shadow-rule-actions live-rules-actions">
              {rulesSaveMessage && <small className="admin-credential-message good">{rulesSaveMessage}</small>}
            </div>
            </>}
          </section>}
          {autoMode === 'live' && binanceConnection.saved && <section className="capital-group binance-wallet-panel">
            <div className="capital-group-head binance-wallet-head">
              <div>
                <strong>Binance Wallet</strong>
                <span>{binanceWallet.updatedAt ? `Updated ${entryTime(binanceWallet.updatedAt)}` : 'Reading required'}</span>
              </div>
              <div className="binance-wallet-head-actions">
                <button
                  type="button"
                  className={`binance-wallet-filter ${hideSmallBinanceAssets ? 'active' : ''}`}
                  onClick={() => setHideSmallBinanceAssets(value => !value)}
                >
                  Hide assets &lt;1 USD
                </button>
              </div>
            </div>
            <div className="binance-wallet-hero">
              <article className="primary">
                <span>{venueMode === 'spot' ? 'Spot Total' : 'Futures Total'}</span>
                <strong>{`${fmtMoney(venueMode === 'spot' ? binanceWallet.totalValueUsdt : binanceWallet.futuresTotalUsdt)} USDT`}</strong>
              </article>
              <article>
                <span>Wallet Total</span>
                <strong>{`${fmtMoney(binanceWallet.totalValueUsdt)} USDT`}</strong>
              </article>
              <article>
                <span>24H Change</span>
                <strong className={binanceWallet.pnl24hUsdt >= 0 ? 'good' : 'bad'}>{`${binanceWallet.pnl24hUsdt >= 0 ? '+' : '-'}$${fmtMoney(Math.abs(binanceWallet.pnl24hUsdt))}`}</strong>
                <small className={binanceWallet.pnl24hPct >= 0 ? 'good' : 'bad'}>{`${binanceWallet.pnl24hPct >= 0 ? '+' : ''}${binanceWallet.pnl24hPct.toFixed(2)}%`}</small>
              </article>
              <article>
                <span>Assets</span>
                <strong>{visibleBinanceBalances.length}</strong>
                <small>{hideSmallBinanceAssets ? `${hiddenBinanceBalanceCount} hidden` : `${binanceWallet.assetCount} tracked`}</small>
              </article>
            </div>
            <div className="binance-wallet-list">
              {visibleBinanceBalances.length > 0
                ? visibleBinanceBalances.map(balance => <div key={balance.asset} className="binance-wallet-row">
                  <div className="binance-wallet-asset-mark">{balance.asset.slice(0, 3)}</div>
                  <div className="binance-wallet-row-main">
                    <strong>{balance.asset}</strong>
                    <span>{`${fmt(balance.total)} total`}</span>
                  </div>
                  <div className="binance-wallet-row-side">
                    <strong>{`${fmtMoney(balance.valueUsdt)} USDT`}</strong>
                    <span className={balance.change24hPct >= 0 ? 'good' : 'bad'}>{`${balance.change24hPct >= 0 ? '+' : ''}${balance.change24hPct.toFixed(2)}%`}</span>
                  </div>
                </div>)
                : <p className="binance-wallet-empty">{hideSmallBinanceAssets ? 'No assets above 1 USD after filtering.' : 'Connect Binance and enable Reading to view live holdings here.'}</p>}
            </div>
          </section>}
          <section className="portfolio-card portfolio-ledger-section">
            <div className="portfolio-card-head">
              <strong>{autoMode === 'shadow' ? 'Shadow Portfolio Ledger' : 'Live Portfolio Ledger'}</strong>
              <span>{autoMode === 'shadow' ? selectedShadowProfile?.name ?? 'Shadow profile' : portalView === 'admin' ? 'Admin live workspace' : 'User live workspace'}</span>
            </div>
            <div className="ledger-range-filter portfolio-ledger-range-filter">
              <span className="dashboard-range-label">{getRangeLabel(portfolioTradesRange)}</span>
              <div className="range-pills">
                {(['24h', '7d', '30d', '90d', 'all', 'custom'] as PerformanceRange[]).map(option => <button key={option} className={portfolioTradesRange === option ? 'active' : ''} onClick={() => setPortfolioTradesRange(option)}>
                  {getRangeLabel(option)}
                </button>)}
              </div>
              <small className="range-retention-note">Portfolio ledger follows the active profile and selected range.</small>
            </div>
            {portfolioTradesRange === 'custom' && <div className="custom-range-panel ledger-custom-range">
              <CustomDateField label="From" value={portfolioTradesCustomFrom} max={portfolioTradesCustomTo} onChange={setPortfolioTradesCustomFrom} />
              <CustomDateField label="To" value={portfolioTradesCustomTo} min={portfolioTradesCustomFrom} onChange={setPortfolioTradesCustomTo} />
            </div>}
            <div className="trade-extremes">
              <div className="trade-extremes-row trade-extremes-row-top">
                <button type="button" className="trade-extreme-card">
                  <span>Starting Balance</span>
                  <strong>{`$${fmt(effectiveStartingCapital || 0)}`}</strong>
                  <small>{autoMode === 'shadow' ? 'Saved starting capital for this shadow profile' : 'Base live capital allocated to this workspace'}</small>
                </button>
                <button type="button" className="trade-extreme-card">
                  <span>{autoMode === 'shadow' ? 'Current Shadow Capital' : 'Current Live Capital'}</span>
                  <strong className={effectiveCurrentCapital >= effectiveStartingCapital ? 'good' : 'bad'}>{`$${fmt(effectiveCurrentCapital || 0)}`}</strong>
                  <small>{`${activePortfolioChangePct >= 0 ? '+' : ''}${activePortfolioChangePct.toFixed(2)}% total`}</small>
                </button>
                <button type="button" className={`trade-extreme-card ${effectivePortfolioBestTrade ? 'interactive' : ''}`} onClick={() => jumpToAcceptedTrade(effectivePortfolioBestTrade?.id ?? null)}>
                  <span>Best Trade</span>
                  <strong className="good">{effectivePortfolioBestTrade ? effectivePortfolioBestTrade.pnlLabel : 'N/A'}</strong>
                  <small>{effectivePortfolioBestTrade ? `${effectivePortfolioBestTrade.symbol} | ${effectivePortfolioBestTrade.strategyName}` : 'No portfolio trades yet'}</small>
                </button>
                <button type="button" className={`trade-extreme-card ${effectivePortfolioWorstTrade ? 'interactive' : ''}`} onClick={() => jumpToAcceptedTrade(effectivePortfolioWorstTrade?.id ?? null)}>
                  <span>Worst Trade</span>
                  <strong className="bad">{effectivePortfolioWorstTrade ? effectivePortfolioWorstTrade.pnlLabel : 'N/A'}</strong>
                  <small>{effectivePortfolioWorstTrade ? `${effectivePortfolioWorstTrade.symbol} | ${effectivePortfolioWorstTrade.strategyName}` : 'No portfolio trades yet'}</small>
                </button>
                <button type="button" className="trade-extreme-card" onClick={cyclePortfolioStatusFilter}>
                  <span>Wins / Losses</span>
                  <strong><b className="good">{effectivePortfolioStats.winCount}</b> / <b className="bad">{effectivePortfolioStats.lossCount}</b></strong>
                  <small>{effectivePortfolioStats.openCount} portfolio trades still open</small>
                </button>
              </div>
              <div className="trade-extremes-row trade-extremes-row-bottom">
                <button type="button" className="trade-extreme-card" onClick={() => setPortfolioTradesStatusFilter(prev => prev === 'open' ? 'all' : 'open')}>
                  <span>Open PnL</span>
                  <strong className={effectivePortfolioPnlCards.openPnl >= 0 ? 'good' : 'bad'}>{`${effectivePortfolioPnlCards.openPnl >= 0 ? '+' : ''}${effectivePortfolioPnlCards.openPnl.toFixed(2)}%`}</strong>
                  <small>{portfolioTradesStatusFilter === 'open' ? 'OPEN filter active' : 'Aggregate unrealized portfolio performance'}</small>
                </button>
                <button type="button" className="trade-extreme-card" onClick={() => setPortfolioTradesStatusFilter(prev => prev === 'closed' ? 'all' : 'closed')}>
                  <span>Closed PnL</span>
                  <strong className={effectivePortfolioPnlCards.closedPnl >= 0 ? 'good' : 'bad'}>{`${effectivePortfolioPnlCards.closedPnl >= 0 ? '+' : ''}${effectivePortfolioPnlCards.closedPnl.toFixed(2)}%`}</strong>
                  <small>{portfolioTradesStatusFilter === 'closed' ? 'CLOSED filter active' : `${activePortfolioClosedCount} closed trades inside this range`}</small>
                </button>
                <button type="button" className="trade-extreme-card" onClick={() => { setPortfolioTradesStatusFilter('all'); setPortfolioTradesSideFilter('all'); }}>
                  <span>Net PnL</span>
                  <strong className={effectivePortfolioPnlCards.netPnl >= 0 ? 'good' : 'bad'}>{`${effectivePortfolioPnlCards.netPnl >= 0 ? '+' : ''}${effectivePortfolioPnlCards.netPnl.toFixed(2)}%`}</strong>
                  <small>{effectivePortfolioPnlCards.netPnl >= 0 ? 'Net portfolio profit across open and closed trades' : 'Net portfolio loss across open and closed trades'}</small>
                </button>
                <button type="button" className="trade-extreme-card" onClick={cyclePortfolioSideFilter}>
                  <span>Long / Short</span>
                  <strong><b className="good">{effectivePortfolioStats.longCount}</b> / <b className="bad">{effectivePortfolioStats.shortCount}</b></strong>
                  <small>{portfolioTradesSideFilter === 'all' ? 'Showing both sides' : portfolioTradesSideFilter === 'long' ? 'LONG filter active' : 'SHORT filter active'}</small>
                </button>
                <button type="button" className="trade-extreme-card locked" onClick={() => setPortfolioTradesMarketFilter(venueMode)}>
                  <span>Spot / Futures</span>
                  <strong><b>{effectivePortfolioStats.spotCount}</b> / <b>{effectivePortfolioStats.futuresCount}</b></strong>
                  <small>{venueMode === 'spot' ? 'Auto Trading is locked to Spot execution' : `Auto Trading is locked to Futures ${allowedDirection === 'both' ? 'both sides' : allowedDirection === 'long-only' ? 'long only' : 'short only'}`}</small>
                </button>
              </div>
            </div>
            <SignalFilterBar
              statusFilter={portfolioTradesStatusFilter}
              sideFilter={portfolioTradesSideFilter}
              marketFilter={portfolioTradesMarketFilter}
              timeframeFilter={portfolioTradesTimeframeFilter}
              executionProfileFilter={portfolioTradesExecutionProfileFilter}
              scoreFilter={portfolioTradesScoreFilter}
              setStatusFilter={setPortfolioTradesStatusFilter}
              setSideFilter={setPortfolioTradesSideFilter}
              setTimeframeFilter={setPortfolioTradesTimeframeFilter}
              setExecutionProfileFilter={setPortfolioTradesExecutionProfileFilter}
              setScoreFilter={setPortfolioTradesScoreFilter}
              counts={effectivePortfolioFilterCounts}
            />
            <div className="trade-extremes-row trade-extremes-row-bottom portfolio-ledger-meta-row">
              <button type="button" className="trade-extreme-card" onClick={() => { setPortfolioTradesStatusFilter('all'); setPortfolioTradeQuery(''); }}>
                <span>Generated</span>
                <strong>{effectiveGeneratedTotal}</strong>
                <small>All generated trades routed through portfolio classification</small>
              </button>
              <button type="button" className="trade-extreme-card" onClick={() => setPortfolioTradesStatusFilter('all')}>
                <span>Accepted</span>
                <strong className="good">{effectiveAcceptedTotal}</strong>
                <small>Passed rules and broker execution checks</small>
              </button>
              <button type="button" className="trade-extreme-card" onClick={() => { setPortfolioTradesStatusFilter('all'); setPortfolioRejectedTradeQuery(''); }}>
                <span>Rejected</span>
                <strong className={effectiveRejectedTotal > 0 ? 'bad' : ''}>{effectiveRejectedTotal}</strong>
                <small>Rejected by rules, pending, or broker-side failure</small>
              </button>
              <button type="button" className="trade-extreme-card" onClick={cyclePortfolioModeFilter}>
                <span>Mode</span>
                <strong>{portfolioTradesExecutionProfileFilter === 'all' ? 'All' : formatExitModeLabel(portfolioTradesExecutionProfileFilter)}</strong>
                <small>{portfolioTradesExecutionProfileFilter === 'all' ? 'Showing every mode' : `${formatExitModeLabel(portfolioTradesExecutionProfileFilter)} filter active`}</small>
              </button>
              <button type="button" className="trade-extreme-card" onClick={cyclePortfolioTimeframeFilter}>
                <span>Timeframe</span>
                <strong>{portfolioTradesTimeframeFilter === 'all' ? 'All' : portfolioTradesTimeframeFilter}</strong>
                <small>{portfolioTradesTimeframeFilter === 'all' ? 'Showing every timeframe' : `${portfolioTradesTimeframeFilter} filter active`}</small>
              </button>
            </div>
            {livePortfolioLoading && autoMode === 'live' && <p className="empty">Loading live portfolio ledger...</p>}
              {!livePortfolioLoading && <div className="trade-ledger-shell portfolio-ledger-shell" ref={acceptedPortfolioSectionRef}>
                <div className="trade-ledger-toolbar portfolio-ledger-toolbar">
                  <strong className="portfolio-ledger-title">{autoMode === 'shadow' ? 'Accepted Shadow Trades' : 'Accepted Portfolio Trades'}</strong>
                  <div className="portfolio-kind-menu">
                    {([
                      ['all', 'All Accepted'],
                      ['test', 'Test Accepted'],
                      ['live', 'Live Accepted']
                    ] as const).map(([kind, label]) => <button
                      key={kind}
                      type="button"
                      className={portfolioAcceptedKind === kind ? 'active' : ''}
                      onClick={() => setPortfolioAcceptedKind(kind)}
                    >
                      {label}
                    </button>)}
                  </div>
                  <div className="ledger-search-input trade-ledger-search portfolio-ledger-search">
                  <Search size={16} />
                  <input
                    type="search"
                    value={portfolioTradeQuery}
                    onChange={event => setPortfolioTradeQuery(event.target.value)}
                    placeholder="Search accepted trade number: T-0002B"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {portfolioTradeQuery && <button
                    type="button"
                    className="ledger-search-clear"
                    onClick={() => setPortfolioTradeQuery('')}
                  >
                    Clear
                  </button>}
                </div>
              </div>
              {effectivePortfolioLedgerRows.length === 0 ? <p className="empty portfolio-ledger-empty">No accepted portfolio trades matched this selection yet.</p> : <div className="trade-ledger-scroll portfolio-ledger-scroll">
                <table className="trade-ledger trade-ledger-body portfolio-accepted-table">
                  <thead>
                    <tr>
                      {portfolioLedgerColumns.map(column => <th key={column}><LedgerHeaderCell column={column} /></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {effectivePortfolioLedgerRows.map(row => <tr
                      key={`portfolio-ledger-${row.id}`}
                      id={`portfolio-trade-row-${row.id}`}
                      className={`${focusedPortfolioTradeId === row.id ? 'focused' : ''} chartable-row`}
                      onClick={() => setChartTrade(row)}
                      title="Open TradingView chart"
                    >
                      <td>{formatTradeLabel(row.id)}</td>
                      <td><strong>{row.symbol}</strong></td>
                      <td><span className="strategy-cell">{row.strategyName}</span></td>
                      <td><span className={`status-pill broker ${row.executionStatus === 'live_accepted' ? 'live' : row.executionStatus === 'test_accepted' ? 'test' : row.executionStatus === 'pending' ? 'open' : 'loss'}`}>{formatBrokerStatusLabel(row.executionStatus)}</span></td>
                      <td><span className={`status-pill ${row.status.toLowerCase()}`}>{row.status}</span></td>
                      <td><SideBadge side={row.side} /></td>
                      <td><span className="ledger-venue-cell"><strong>{row.market === 'futures' ? `Futures x${Math.max(1, leverageValue)}` : 'Spot'}</strong></span></td>
                      <td>
                        <span className="portfolio-allocation-cell">
                          <strong>{typeof row.allocationPct === 'number' ? `${row.allocationPct.toFixed(1)}%` : '-'}</strong>
                          <small>{typeof row.allocationAmount === 'number' ? fmtSignedUsdt(row.allocationAmount) : 'Capital slot'}</small>
                        </span>
                      </td>
                      <td>{formatExitModeLabel(row.exitMode)}</td>
                      <td>{row.timeframe}</td>
                      <td>{entryTime(row.openedAt)}</td>
                      <td>{formatDuration(row.openedAt, row.closedAt)}</td>
                      <td>{fmt(row.entry)}</td>
                      <td>{row.marketPrice != null ? fmt(row.marketPrice) : '-'}</td>
                      <td>{row.liquidationPrice != null ? fmt(row.liquidationPrice) : '-'}</td>
                      <td>{formatTargetRiskRatio(row)}</td>
                      <td className="ledger-score-cell"><b className={`ledger-score ${scoreTone(row.score)}`}>{row.score == null ? '-' : row.score.toFixed(1)}</b></td>
                      <td className="ledger-pnl-cell">
                        {row.pnlUsdt != null || row.roiPct != null
                          ? <span className="portfolio-pnl-stack">
                            <b className={`ledger-pnl-value ${(row.pnlUsdt ?? row.pnl) >= 0 ? 'good' : 'bad'}`}>{`${(row.pnlUsdt ?? 0) >= 0 ? '+' : ''}${(row.pnlUsdt ?? 0).toFixed(2)} USDT`}</b>
                            <small className={(row.roiPct ?? row.pnl) >= 0 ? 'good' : 'bad'}>{`${(row.roiPct ?? row.pnl) >= 0 ? '+' : ''}${(row.roiPct ?? row.pnl).toFixed(2)}%`}</small>
                            {row.pnlSource && <small className="binance-read-label">Binance read</small>}
                          </span>
                          : <b className={`ledger-pnl-value ${row.pnl >= 0 ? 'good' : 'bad'}`}>{row.pnlLabel}</b>}
                      </td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
            </div>}
          </section>
          <div className="portfolio-detail-grid">
            <section className="portfolio-card portfolio-rejected-full">
              {!livePortfolioLoading && <div className="trade-ledger-shell portfolio-ledger-shell">
                <div className="trade-ledger-toolbar portfolio-ledger-toolbar">
                  <strong className="portfolio-ledger-title">{autoMode === 'shadow' ? 'Rejected Shadow Trades' : 'Rejected Live Trades'}</strong>
                  <div className="portfolio-kind-menu">
                    {([
                      ['all', 'All Rejected'],
                      ['test', 'Test Rejected'],
                      ['live', 'Live Rejected']
                    ] as const).map(([kind, label]) => <button
                      key={kind}
                      type="button"
                      className={portfolioRejectedKind === kind ? 'active' : ''}
                      onClick={() => setPortfolioRejectedKind(kind)}
                    >
                      {label}
                    </button>)}
                  </div>
                  <div className="ledger-search-input trade-ledger-search portfolio-ledger-search">
                    <Search size={16} />
                    <input
                      type="search"
                      value={portfolioRejectedTradeQuery}
                      onChange={event => setPortfolioRejectedTradeQuery(event.target.value)}
                      placeholder="Search rejected trade number: T-0002B"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {portfolioRejectedTradeQuery && <button
                      type="button"
                      className="ledger-search-clear"
                      onClick={() => setPortfolioRejectedTradeQuery('')}
                    >
                      Clear
                    </button>}
                  </div>
                </div>
                {effectivePrivateRejectedRows.length === 0 ? <p className="empty portfolio-ledger-empty">No rejected trades in this selection yet.</p> : <div className="trade-ledger-scroll portfolio-ledger-scroll">
                  <table className="trade-ledger trade-ledger-body portfolio-rejected-table">
                    <thead>
                      <tr>
                        <th>Trade</th>
                        <th>Symbol</th>
                        <th>Strategy</th>
                        <th>Status</th>
                        <th>Side</th>
                        <th>Venue</th>
                        <th>Rejected Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectivePrivateRejectedRows.map(row => <tr key={`portfolio-rejected-${row.id}`}>
                        <td>{formatTradeLabel(row.id)}</td>
                        <td><strong>{row.symbol}</strong></td>
                        <td><span className="strategy-cell">{row.strategyName}</span></td>
                        <td><span className="status-pill loss">{String(row.status).replace(/_/g, ' ').toUpperCase()}</span></td>
                        <td><SideBadge side={row.side} /></td>
                        <td><span className="ledger-venue-cell"><strong>{row.venueLabel}</strong></span></td>
                        <td>
                          <span className="portfolio-rejected-reason">
                            {row.failedRules.map(rule => <b key={`${row.id}-${rule}`}>{formatFailedRuleLabel(rule)}</b>)}
                          </span>
                        </td>
                      </tr>)}
                      </tbody>
                    </table>
                </div>}
              </div>}
            </section>
          </div>
        </section>
      </section>

      {portalView === 'admin' && <section className={`premium-panel public-ops-panel ${publicOpsOpen ? 'open' : 'collapsed'}`}>
        <button type="button" className="public-ops-toggle" onClick={() => setPublicOpsOpen(value => !value)} aria-expanded={publicOpsOpen}>
          <div>
            <h2>Public Controls</h2>
            <span>{telegramConfig.publicChannelEnabled ? 'Broadcast ON' : 'Broadcast OFF'} | {publicStrategies.length} public strategies | {[...selected].filter(id => !labStrategySet.has(id)).length} active</span>
          </div>
          <div className="live-rules-badge-row">
            <span className={`nav-badge ${telegramConfig.publicChannelEnabled ? 'glow' : 'subtle'}`}>Public</span>
            {publicOpsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>
        {publicOpsOpen && <div className="public-ops-body">
          <section className="public-strategies-card">
            <div className="public-strategies-head">
              <div>
                <span>Strategy Visibility</span>
                <strong>{adminStrategyViews.size === 2 ? 'Public + Lab Strategies' : adminStrategyViews.has('public') ? 'Public Strategies' : 'Lab Strategies'}</strong>
              </div>
              <div className="public-card-actions">
                <button type="button" onClick={() => toggleAllPublicStrategies(true)}>Enable All</button>
                <button type="button" className="ghost" onClick={() => toggleAllPublicStrategies(false)}>Disable All</button>
              </div>
            </div>
            <div className="public-strategy-tools">
              <div className="access-filter-pills">
                <button className={adminStrategyViews.has('public') ? 'active' : ''} onClick={() => toggleStrategyViewFilter('public', 'admin')}>Public Strategies</button>
                <button className={adminStrategyViews.has('lab') ? 'active' : ''} onClick={() => toggleStrategyViewFilter('lab', 'admin')}>Lab Strategies</button>
              </div>
              <div className="access-filter-pills">
                {([
                  ['spot', 'Spot'],
                  ['futures', 'Futures']
                ] as const).map(([value, label]) => <button key={value} className={marketScopeButtonActive(strategyMarketScope, value) ? 'active' : ''} onClick={() => toggleStrategyMarketScope(value)}>
                  {label}
                </button>)}
              </div>
              <div className="access-filter-pills">
                {allTimeframes.map(timeframe => <button key={timeframe} className={timeframes.has(timeframe) ? 'active' : ''} onClick={() => toggleAdminTimeframe(timeframe)}>
                  {timeframe}
                </button>)}
              </div>
            </div>
            {adminStrategyViews.has('public') && <div className="public-strategy-grid">
              {publicStrategies.length === 0 && <p className="empty">No public strategies yet.</p>}
              {publicStrategies.map(strategy => {
                const isActive = selected.has(strategy.id);
                return <button key={strategy.id} type="button" className={isActive ? 'public-strategy-card active' : 'public-strategy-card'} onClick={() => toggleAdminStrategy(strategy.id)}>
                  <span>{strategy.name}</span>
                  <b>{isActive ? 'ON' : 'OFF'}</b>
                </button>;
              })}
            </div>}
            {adminStrategyViews.has('lab') && <div className="public-strategy-grid">
              {labStrategies.length === 0 && <p className="empty">No lab strategies yet.</p>}
              {labStrategies.map(strategy => {
                const isActive = selected.has(strategy.id);
                return <article key={strategy.id} className={isActive ? 'public-strategy-card active lab' : 'public-strategy-card lab'}>
                  <button type="button" onClick={() => toggleAdminStrategy(strategy.id)}>
                    <span>{strategy.name}</span>
                    <b>{isActive ? 'ON' : 'OFF'}</b>
                  </button>
                  <button type="button" className="move" onClick={() => moveLabStrategyToPublic(strategy.id)}>Move To Public</button>
                </article>;
              })}
            </div>}
          </section>
          <div className="public-ops-bottomline">
            <section className="public-broadcast-card">
              <div className="public-card-copy">
                <span>Public Channel Broadcast</span>
                <strong>{telegramConfig.publicChannelChatId || 'No public channel'}</strong>
                <small>{telegramConfig.publicBotUsername ? `Bot: @${telegramConfig.publicBotUsername}` : 'Bot not configured'}</small>
                {adminControlMessage && <small className={adminControlMessage.includes('failed') ? 'telegram-inline-message warning' : 'telegram-inline-message success'}>{adminControlMessage}</small>}
              </div>
              <div className="public-card-actions">
                <button type="button" className={telegramConfig.publicChannelEnabled ? 'active' : ''} onClick={togglePublicTelegramChannel}>
                  {telegramConfig.publicChannelEnabled ? 'ON' : 'OFF'}
                </button>
                <button type="button" className="ghost" onClick={() => window.open(telegramConfig.publicChannelInviteUrl || `https://t.me/${(telegramConfig.publicChannelChatId || '').replace(/^@/, '')}`, '_blank', 'noopener,noreferrer')} disabled={!telegramConfig.publicChannelInviteUrl && !telegramConfig.publicChannelChatId}>
                  Open Channel
                </button>
              </div>
            </section>
            <section className="public-reset-card">
              <div className="public-card-copy">
                <span>Dashboard Data</span>
                <strong>Reset Workspace</strong>
                <small>Clear signals, notifications, and dashboard totals.</small>
              </div>
              <div className="public-card-actions">
                <button type="button" className="danger" onClick={() => setDashboardResetConfirmOpen(true)}>Reset Dashboard Data</button>
              </div>
            </section>
          </div>
        </div>}
      </section>}

      {portalView === 'admin' && <section className={`premium-panel admin-panel ${adminControlOpen ? 'open' : 'collapsed'}`}>
        <button type="button" className="admin-control-toggle" onClick={() => setAdminControlOpen(value => !value)} aria-expanded={adminControlOpen}>
          <div>
            <h2>Admin Control</h2>
            <span>{binanceConnection.connected ? 'Binance verified' : binanceConnection.saved ? 'Binance saved' : 'Binance disconnected'} | {activeUsers.filter(request => request.enabled).length} active users</span>
          </div>
          <div className="live-rules-badge-row">
            <span className="nav-badge glow">Admin</span>
            {adminControlOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>
        {adminControlOpen && <>
        {autoMode === 'live' && <section className="binance-connect-panel admin-binance-panel">
          <div className="binance-admin-head">
            <div>
              <strong>Binance Connection</strong>
              <span>{binanceConnection.connected ? 'Verified with Binance' : binanceConnection.saved ? 'Save Only' : 'No Binance account connected'}</span>
            </div>
            <span className={`nav-badge ${binanceConnection.connected ? 'glow' : 'subtle'}`}>{binanceConnection.connected ? 'Verified' : binanceConnection.saved ? 'Save Only' : 'Disconnected'}</span>
          </div>
          {!binanceEditorOpen && <div className="binance-admin-grid">
            <article><span>Fingerprint</span><strong>{binanceConnection.keyFingerprint ?? '-'}</strong></article>
            <article><span>Last Verified</span><strong>{binanceConnection.verifiedAt ? entryTime(binanceConnection.verifiedAt) : '-'}</strong></article>
            <article><span>State</span><strong>{binanceConnection.connected ? 'Verified' : binanceConnection.saved ? 'Save Only' : 'No Keys'}</strong></article>
          </div>}
          {binanceEditorOpen && <form className="binance-connect-grid compact" onSubmit={event => { event.preventDefault(); saveBinanceConnection(); }}>
            <label>
              <span>API Key</span>
              <div className="password-field">
                <input value={binanceApiKey} onChange={event => setBinanceApiKey(event.target.value)} placeholder="Binance API key" type={binanceApiVisible ? 'text' : 'password'} />
                <button type="button" onClick={() => setBinanceApiVisible(value => !value)} aria-label={binanceApiVisible ? 'Hide API key' : 'Show API key'}>
                  {binanceApiVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <label>
              <span>Secret Key</span>
              <div className="password-field">
                <input value={binanceSecretKey} onChange={event => setBinanceSecretKey(event.target.value)} placeholder="Binance secret key" type={binanceSecretVisible ? 'text' : 'password'} />
                <button type="button" onClick={() => setBinanceSecretVisible(value => !value)} aria-label={binanceSecretVisible ? 'Hide secret key' : 'Show secret key'}>
                  {binanceSecretVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <div className="binance-connect-actions">
              <button type="submit">Save</button>
              <button type="button" className="ghost" onClick={() => setBinanceEditorOpen(false)}>Cancel</button>
            </div>
          </form>}
          <div className="binance-admin-actions">
            <small className="binance-connect-note">
              <b>Tip:</b> Enable Reading and Spot &amp; Margin Trading. Enable Futures only if needed. Keep Withdrawals disabled. Create keys from <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noreferrer">Binance API Management</a>. <b>Verified:</b> keys checked with Binance and ready. <b>Save Only:</b> keys saved but not verified yet.
            </small>
            {!binanceEditorOpen && <button type="button" onClick={openBinanceEditor}>{binanceConnection.saved ? 'Replace Keys' : 'Connect Binance'}</button>}
            {binanceConnection.saved && !binanceEditorOpen && <button type="button" className="ghost" onClick={disconnectBinanceConnection}>Disconnect</button>}
          </div>
          {binanceMessage && <small className="binance-connect-note">{binanceMessage}</small>}
        </section>}
        {false && <section className="telegram-delivery-panel">
          <div>
            <span>Telegram Notifications</span>
            <strong>{adminTelegram || 'No Telegram account'}</strong>
            <p className={`telegram-status-pill ${adminTelegramMeta.badgeClass}`}>{adminTelegramMeta.badge}</p>
            <small>{adminTelegramMeta.summary}</small>
            <small>{adminTelegramMeta.helper}</small>
            {telegramActionMessage && <small className={`telegram-inline-message ${telegramActionLevel}`}>{telegramActionMessage}</small>}
          </div>
          <div className="telegram-delivery-actions">
            <button type="button" className={adminTelegramNotificationEnabled ? 'active' : ''} onClick={toggleAdminTelegramNotification}>
              {adminTelegramNotificationEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => (adminTelegramMeta.action === 'test'
                ? runTelegramLinkTest('ADMIN', adminUsername || adminName || 'Admin', adminTelegram)
                : openTelegramBot(adminTelegram))}
              disabled={telegramActionBusyId === 'ADMIN'}
            >
              {telegramActionBusyId === 'ADMIN' ? 'Checking...' : adminTelegramMeta.actionLabel}
            </button>
            <button
              type="button"
              onClick={() => runTelegramLinkTest('ADMIN', adminUsername || adminName || 'Admin', adminTelegram)}
              disabled={telegramActionBusyId === 'ADMIN'}
            >
              {telegramActionBusyId === 'ADMIN' ? 'Checking...' : 'Link/Test Telegram'}
            </button>
          </div>
        </section>}
        {false && <section className="admin-strategy-control">
          <div className="portfolio-card-head">
            <strong>Lab Strategies</strong>
            <span>{`${labStrategies.filter(strategy => selected.has(strategy.id)).length}/${labStrategies.length} active`}</span>
          </div>
          <div className="admin-strategy-toolbar">
            <div className="admin-strategy-toolbar-row">
              <div className="access-filter-pills">
                {([
                  ['spot', 'Spot'],
                  ['futures', 'Futures']
                ] as const).map(([value, label]) => <button key={value} className={marketScopeButtonActive(strategyMarketScope, value) ? 'active' : ''} onClick={() => toggleStrategyMarketScope(value)}>
                  {label}
                </button>)}
              </div>
            </div>
            <div className="admin-split-actions">
              {adminControlMessage && <small className={adminControlMessage.includes('failed') ? 'admin-credential-message' : 'admin-credential-message good'}>{adminControlMessage}</small>}
            </div>
          </div>
          {false && <div className="admin-strategy-grid">
            {publicStrategies.length === 0 && <p className="empty">No public strategies yet.</p>}
            {publicStrategies.map(strategy => {
              const isActive = selected.has(strategy.id);
              return <article key={strategy.id} className={isActive ? 'admin-strategy-card active admin-strategy-shell' : 'admin-strategy-card admin-strategy-shell'}>
                <button type="button" className="admin-strategy-main" onClick={() => toggleAdminStrategy(strategy.id)}>
                  <div>
                    <strong>{strategy.name}</strong>
                    <span>{strategy.risk === 'high' ? 'High risk' : 'Medium risk'} • {allTimeframes.filter(timeframe => timeframes.has(timeframe)).join(' / ')}</span>
                  </div>
                  <b>{isActive ? 'ON' : 'OFF'}</b>
                </button>
              </article>;
            })}
          </div>}
          <div className="admin-strategy-grid">
            {labStrategies.length === 0 && <p className="empty">No lab strategies yet. Move a strategy here to test it before making it public.</p>}
            {labStrategies.map(strategy => {
              const isActive = selected.has(strategy.id);
              return <article key={strategy.id} className={isActive ? 'admin-strategy-card active admin-strategy-shell' : 'admin-strategy-card admin-strategy-shell'}>
                <button type="button" className="admin-strategy-main" onClick={() => toggleAdminStrategy(strategy.id)}>
                  <div>
                    <strong>{strategy.name}</strong>
                    <span>{strategy.risk === 'high' ? 'High risk' : 'Medium risk'}</span>
                  </div>
                  <b>{isActive ? 'ON' : 'OFF'}</b>
                </button>
                <button type="button" className="admin-strategy-move" onClick={() => moveLabStrategyToPublic(strategy.id)}>Move To Public</button>
              </article>;
            })}
          </div>
        </section>}
        <div className="admin-control-grid">
          <section className="admin-account-card access-board-card">
            <strong>User Access</strong>
            <div className="access-command-strip">
              <div><span>All</span><b>{accessRequests.length}</b></div>
              <div><span>Active</span><b>{activeUsers.filter(request => request.enabled).length}</b></div>
              <div><span>Pending</span><b>{pendingRequests.length}</b></div>
              <div><span>Pause</span><b>{pausedUsers.length}</b></div>
            </div>
            <div className="access-directory-toolbar">
              <div className="access-filter-pills">
                {(['all', 'active', 'pending', 'pause'] as const).map(filter => <button key={filter} className={accessFilter === filter ? 'active' : ''} onClick={() => setAccessFilter(filter)}>
                  {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : filter === 'pending' ? 'Pending' : 'Pause'}
                </button>)}
              </div>
              <span>{accessDirectory.length} shown</span>
            </div>
            <div className="access-directory">
              <div className="access-directory-header">
                <span>ID</span>
                <span>Username</span>
                <span>Telegram</span>
                <span>Phone</span>
                <span>Status</span>
                <span>Joined date</span>
                <span>Duration</span>
                <span>Actions</span>
              </div>
              <div className="access-directory-body">
                {accessDirectory.length === 0 && <p className="empty">No users in this filter.</p>}
                {accessDirectory.map(request => {
                  const statusLabel = request.status === 'pending' ? 'Pending' : request.status === 'rejected' ? 'Rejected' : request.enabled ? 'Active' : 'Paused';
                  const statusClass = request.status === 'pending' ? 'pending' : request.status === 'rejected' ? 'rejected' : request.enabled ? 'approved' : 'paused';
                  return <article key={request.id} className="access-directory-row">
                    <b>{request.userId.replace('USR-', '')}</b>
                    <strong>{request.username || '-'}</strong>
                    <span>{request.telegram || '-'}</span>
                    <span>{request.phone || '-'}</span>
                    <small className={statusClass}>{statusLabel}</small>
                    <span>{request.approvedAt ? entryTime(request.approvedAt) : '-'}</span>
                    <span>{request.approvedAt ? formatDuration(request.approvedAt) : '-'}</span>
                    <div className="request-actions">
                      {request.status === 'pending' && <button onClick={() => updateAccessRequest(request.id, 'approved')}>Approve</button>}
                      {request.status === 'pending' && <button className="danger" onClick={() => updateAccessRequest(request.id, 'rejected')}>Reject</button>}
                      {request.status === 'approved' && <button onClick={() => toggleMemberEnabled(request.id)}>{request.enabled ? 'Pause' : 'Activate'}</button>}
                      {request.status === 'approved' && <button onClick={() => runTelegramLinkTest(request.userId, request.username || request.name, request.telegram)} disabled={telegramActionBusyId === request.userId}>{telegramActionBusyId === request.userId ? 'Checking...' : 'Link/Test Telegram'}</button>}
                      {request.status === 'approved' && <button className="danger" onClick={() => removeAccessRequest(request.id)}>Remove</button>}
                      {request.status === 'rejected' && <button onClick={() => updateAccessRequest(request.id, 'approved')}>Restore</button>}
                    </div>
                  </article>;
                })}
              </div>
            </div>
          </section>
          {false && <section className="admin-split-panel">
            <div className="admin-split-head">
              <div>
                <span>Admin Access</span>
                <h3>{adminUsername || 'admin'}</h3>
              </div>
              <div className="admin-split-actions">
                {adminCredentialMessage && <small className={adminCredentialMessage === 'Saved.' ? 'admin-credential-message good' : 'admin-credential-message'}>{adminCredentialMessage}</small>}
                <button type="button" onClick={adminCredentialsOpen ? closeAdminCredentialsEditor : openAdminCredentialsEditor}>{adminCredentialsOpen ? 'Close Editor' : 'Edit Credentials'}</button>
              </div>
            </div>
            <div className="admin-split-body">
              <div className="admin-split-section login">
                <span>Login Credentials</span>
                <div><small>Admin ID</small><b>ADM-0001</b></div>
                <div><small>Username</small><b>{adminUsername || '-'}</b></div>
                <div><small>Password Status</small><b className={adminPassword && adminPassword !== 'admin123' ? 'protected-status' : 'unset-status'}>{adminPassword && adminPassword !== 'admin123' ? 'Protected' : 'Not set'}</b></div>
              </div>
              <i aria-hidden="true" />
              <div className="admin-split-section recovery">
                <span>Contact Info</span>
                <div><small>Telegram</small><b>{adminTelegram || '-'}</b></div>
                <div><small>Mobile</small><b>{adminPhone || '-'}</b></div>
              </div>
            </div>
            {adminCredentialsOpen && <form className="admin-credentials-editor" onSubmit={event => { event.preventDefault(); saveAdminCredentials(); }}>
              <label className="required-field">
                <span>Username <b>Required</b></span>
                <input required value={adminDraftUsername} onChange={event => setAdminDraftUsername(event.target.value)} placeholder="Admin username" />
              </label>
              <label>
                <span>Telegram</span>
                <input value={adminDraftTelegram} onChange={event => setAdminDraftTelegram(event.target.value)} placeholder="Telegram account" />
              </label>
              <label>
                <span>Mobile</span>
                <input value={adminDraftPhone} onChange={event => setAdminDraftPhone(event.target.value)} placeholder="Mobile number" />
              </label>
              <div className="admin-password-editor">
                <span>Change Password</span>
                {adminPassword && adminPassword !== 'admin123' && <label className="password-field">
                  <input value={adminCurrentPassword} onChange={event => setAdminCurrentPassword(event.target.value)} placeholder="Current password" type={adminCurrentPasswordVisible ? 'text' : 'password'} />
                  <button type="button" onClick={() => setAdminCurrentPasswordVisible(visible => !visible)}>{adminCurrentPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </label>}
                <label className="password-field">
                  <input value={adminNewPassword} onChange={event => setAdminNewPassword(event.target.value)} placeholder="New password" type={adminNewPasswordVisible ? 'text' : 'password'} />
                  <button type="button" onClick={() => setAdminNewPasswordVisible(visible => !visible)}>{adminNewPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </label>
                <label className="password-field">
                  <input value={adminConfirmPassword} onChange={event => setAdminConfirmPassword(event.target.value)} placeholder="Confirm new password" type={adminConfirmPasswordVisible ? 'text' : 'password'} />
                  <button type="button" onClick={() => setAdminConfirmPasswordVisible(visible => !visible)}>{adminConfirmPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </label>
                <small>8+ characters, uppercase, lowercase, number, and special character.</small>
              </div>
              <div className="admin-editor-actions">
                <button type="submit">Save Changes</button>
                <button type="button" className="ghost" onClick={closeAdminCredentialsEditor}>Cancel</button>
              </div>
            </form>}
          </section>}
        </div>
        <section className={`admin-personal-panel ${adminPersonalOpen ? 'open' : 'collapsed'}`}>
          <button type="button" className="admin-personal-toggle" onClick={() => setAdminPersonalOpen(value => !value)} aria-expanded={adminPersonalOpen}>
            <div>
              <h2>Admin Personal Control</h2>
              <span>{adminUsername || 'admin'} | Telegram {adminTelegramNotificationEnabled ? 'ON' : 'OFF'}</span>
            </div>
            <div className="live-rules-badge-row">
              <span className={`nav-badge ${adminTelegramNotificationEnabled ? 'glow' : 'subtle'}`}>Personal</span>
              {adminPersonalOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>
          {adminPersonalOpen && <div className="admin-personal-body">
            <section className="admin-personal-card telegram">
              <div className="admin-personal-card-head">
                <div>
                  <span>Telegram</span>
                  <strong>{adminTelegram || 'No Telegram account'}</strong>
                </div>
                <b className={adminTelegramMeta.badgeClass}>{adminTelegramMeta.badge}</b>
              </div>
              <div className="admin-personal-actions">
                <button type="button" className={adminTelegramNotificationEnabled ? 'active' : ''} onClick={toggleAdminTelegramNotification}>
                  {adminTelegramNotificationEnabled ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => (adminTelegramMeta.action === 'test'
                    ? runTelegramLinkTest('ADMIN', adminUsername || adminName || 'Admin', adminTelegram)
                    : openTelegramBot(adminTelegram))}
                  disabled={telegramActionBusyId === 'ADMIN'}
                >
                  {telegramActionBusyId === 'ADMIN' ? 'Checking...' : adminTelegramMeta.actionLabel}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => runTelegramLinkTest('ADMIN', adminUsername || adminName || 'Admin', adminTelegram)}
                  disabled={telegramActionBusyId === 'ADMIN'}
                >
                  {telegramActionBusyId === 'ADMIN' ? 'Checking...' : 'Link/Test'}
                </button>
              </div>
              {telegramActionMessage && <small className={`telegram-inline-message ${telegramActionLevel}`}>{telegramActionMessage}</small>}
            </section>
            <section className="admin-personal-card access">
              <div className="admin-personal-card-head">
                <div>
                  <span>Admin Access</span>
                  <strong>{adminUsername || 'admin'}</strong>
                </div>
                <button type="button" onClick={adminCredentialsOpen ? closeAdminCredentialsEditor : openAdminCredentialsEditor}>{adminCredentialsOpen ? 'Close' : 'Edit'}</button>
              </div>
              <div className="admin-personal-summary">
                <article><span>Password</span><strong className={adminPassword && adminPassword !== 'admin123' ? 'protected-status' : 'unset-status'}>{adminPassword && adminPassword !== 'admin123' ? 'Protected' : 'Not set'}</strong></article>
                <article><span>Telegram</span><strong>{adminTelegram || '-'}</strong></article>
                <article><span>Mobile</span><strong>{adminPhone || '-'}</strong></article>
              </div>
              {adminCredentialMessage && <small className={adminCredentialMessage === 'Saved.' ? 'admin-credential-message good' : 'admin-credential-message'}>{adminCredentialMessage}</small>}
              {adminCredentialsOpen && <form className="admin-credentials-editor personal" onSubmit={event => { event.preventDefault(); saveAdminCredentials(); }}>
                <label className="required-field">
                  <span>Username <b>Required</b></span>
                  <input required value={adminDraftUsername} onChange={event => setAdminDraftUsername(event.target.value)} placeholder="Admin username" />
                </label>
                <label>
                  <span>Telegram</span>
                  <input value={adminDraftTelegram} onChange={event => setAdminDraftTelegram(event.target.value)} placeholder="Telegram account" />
                </label>
                <label>
                  <span>Mobile</span>
                  <input value={adminDraftPhone} onChange={event => setAdminDraftPhone(event.target.value)} placeholder="Mobile number" />
                </label>
                <div className="admin-password-editor">
                  <span>Change Password</span>
                  {adminPassword && adminPassword !== 'admin123' && <label className="password-field">
                    <input value={adminCurrentPassword} onChange={event => setAdminCurrentPassword(event.target.value)} placeholder="Current password" type={adminCurrentPasswordVisible ? 'text' : 'password'} />
                    <button type="button" onClick={() => setAdminCurrentPasswordVisible(visible => !visible)}>{adminCurrentPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </label>}
                  <label className="password-field">
                    <input value={adminNewPassword} onChange={event => setAdminNewPassword(event.target.value)} placeholder="New password" type={adminNewPasswordVisible ? 'text' : 'password'} />
                    <button type="button" onClick={() => setAdminNewPasswordVisible(visible => !visible)}>{adminNewPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </label>
                  <label className="password-field">
                    <input value={adminConfirmPassword} onChange={event => setAdminConfirmPassword(event.target.value)} placeholder="Confirm new password" type={adminConfirmPasswordVisible ? 'text' : 'password'} />
                    <button type="button" onClick={() => setAdminConfirmPasswordVisible(visible => !visible)}>{adminConfirmPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </label>
                  <small>8+ characters with uppercase, lowercase, number, and symbol.</small>
                </div>
                <div className="admin-editor-actions">
                  <button type="submit">Save Changes</button>
                  <button type="button" className="ghost" onClick={closeAdminCredentialsEditor}>Cancel</button>
                </div>
              </form>}
            </section>
          </div>}
        </section>
        </>}
      </section>}
      {dashboardResetConfirmOpen && <div className="theme-overlay" role="dialog" aria-modal="true">
        <div className="theme-modal confirm-modal">
          <header>
            <div>
              <span className="eyebrow">Sensitive Action</span>
              <h3>Reset Dashboard Data?</h3>
            </div>
            <button type="button" onClick={() => setDashboardResetConfirmOpen(false)}>Close</button>
          </header>
          <p>This will clear signals, notifications, and dashboard totals. Strategies will remain visible with zero values.</p>
          <div className="confirm-modal-actions">
            <button type="button" className="ghost" onClick={() => setDashboardResetConfirmOpen(false)}>Cancel</button>
            <button type="button" className="danger" onClick={resetDashboardData}>Yes, Reset</button>
          </div>
        </div>
      </div>}
      {liveModeConfirmOpen && <div className="theme-overlay" role="dialog" aria-modal="true">
        <div className="theme-modal confirm-modal">
          <header>
            <div>
              <span className="eyebrow">Sensitive Action</span>
              <h3>Enable Live Execution?</h3>
            </div>
            <button type="button" onClick={() => setLiveModeConfirmOpen(false)}>Close</button>
          </header>
          <p>Live mode sends real Binance orders after every server-side rule passes. Continue only if you are ready for real execution.</p>
          <div className="confirm-modal-actions">
            <button type="button" className="ghost" onClick={() => setLiveModeConfirmOpen(false)}>Cancel</button>
            <button type="button" className="danger" onClick={confirmLiveExecutionMode}>Yes, Enable Live</button>
          </div>
        </div>
      </div>}
    </div>
    <TradeChartModal trade={chartTrade} onClose={() => setChartTrade(null)} />
  </section>;
}

function DashboardPage({
  stats,
  signals,
  tickers,
  futuresTickers,
  notifications,
  selected,
  labStrategyIds
}: {
  stats: Stat[];
  signals: Signal[];
  tickers: Map<string, Ticker>;
  futuresTickers: Map<string, Ticker>;
  notifications: Notification[];
  selected: Set<string>;
  labStrategyIds: string[];
}) {
  const [strategyBoardView, setStrategyBoardView] = useState<'public' | 'lab'>('public');
  const [commandRange, setCommandRange] = useState<PerformanceRange>('24h');
  const [commandCustomFrom, setCommandCustomFrom] = useState(() => toDateInput(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [commandCustomTo, setCommandCustomTo] = useState(() => toDateInput(Date.now()));
  const filteredSignals = useMemo(() => signals.filter(signal => strategyBoardView === 'lab' ? labStrategyIds.includes(signal.strategyId) : !labStrategyIds.includes(signal.strategyId)), [signals, strategyBoardView, labStrategyIds]);
  const filteredStats = useMemo(() => stats.filter(stat => strategyBoardView === 'lab' ? labStrategyIds.includes(stat.strategyId) : !labStrategyIds.includes(stat.strategyId)), [stats, strategyBoardView, labStrategyIds]);
  const filteredSelected = useMemo(() => new Set([...selected].filter(id => strategyBoardView === 'lab' ? labStrategyIds.includes(id) : !labStrategyIds.includes(id))), [selected, strategyBoardView, labStrategyIds]);
  return <>
    <section className="dashboard-hero">
      <div className="dashboard-heading-row">
        <div className="dashboard-heading-copy">
          <h1>Dashboard</h1>
        </div>
        <div className="home-market-switch">
          <button type="button" className={strategyBoardView === 'public' ? 'active' : ''} onClick={() => setStrategyBoardView('public')}>Public Strategies</button>
          <button type="button" className={strategyBoardView === 'lab' ? 'active' : ''} onClick={() => setStrategyBoardView('lab')}>Lab Strategies</button>
        </div>
      </div>
    </section>
    <PerformanceChart
      stats={filteredStats}
      signals={filteredSignals}
      tickers={tickers}
      futuresTickers={futuresTickers}
      notifications={notifications}
      commandRange={commandRange}
      onCommandRangeChange={setCommandRange}
      commandCustomFrom={commandCustomFrom}
      commandCustomTo={commandCustomTo}
      onCommandCustomFromChange={setCommandCustomFrom}
      onCommandCustomToChange={setCommandCustomTo}
      selected={filteredSelected}
    />
  </>;
}

function SignalFilterBar({
  statusFilter,
  sideFilter,
  marketFilter,
  timeframeFilter,
  executionProfileFilter,
  scoreFilter,
  setStatusFilter,
  setSideFilter,
  setMarketFilter,
  setTimeframeFilter,
  setExecutionProfileFilter,
  setScoreFilter,
  counts
}: {
  statusFilter: 'all' | 'open' | 'closed' | 'win' | 'loss';
  sideFilter: 'all' | 'long' | 'short';
  marketFilter?: 'all' | 'spot' | 'futures';
  timeframeFilter?: 'all' | Timeframe;
  executionProfileFilter?: 'all' | ExitMode;
  scoreFilter?: ScoreFilter;
  setStatusFilter: (filter: 'all' | 'open' | 'closed' | 'win' | 'loss') => void;
  setSideFilter: (filter: 'all' | 'long' | 'short') => void;
  setMarketFilter?: (filter: 'all' | 'spot' | 'futures') => void;
  setTimeframeFilter?: (filter: 'all' | Timeframe) => void;
  setExecutionProfileFilter?: (filter: 'all' | ExitMode) => void;
  setScoreFilter?: (filter: ScoreFilter) => void;
  counts: ReturnType<typeof getSignalFilterCounts>;
}) {
  return <div className="signal-filters">
    <div>
      <span>Status</span>
      {([
        ['all', `All ${counts.statusAll}`],
        ['open', `Open ${counts.open}`],
        ['closed', `Closed ${counts.closed}`],
        ['win', `Win ${counts.win}`],
        ['loss', `Loss ${counts.loss}`]
      ] as const).map(([value, label]) => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label}</button>)}
    </div>
    <div>
      <span>Side</span>
      {([
        ['all', `All ${counts.sideAll}`],
        ['long', `Long ${counts.long}`],
        ['short', `Short ${counts.short}`]
      ] as const).map(([value, label]) => <button key={value} className={sideFilter === value ? 'active' : ''} onClick={() => setSideFilter(value)}>{label}</button>)}
    </div>
      {marketFilter && setMarketFilter && <div>
        <span>Venue</span>
        {([
          ['all', `All ${counts.marketAll}`],
          ['spot', `Spot ${counts.spot}`],
          ['futures', `Futures ${counts.futures}`]
        ] as const).map(([value, label]) => <button key={value} className={marketFilter === value ? 'active' : ''} onClick={() => setMarketFilter(value)}>{label}</button>)}
      </div>}
      {timeframeFilter && setTimeframeFilter && <div>
        <span>Timeframe</span>
        {(['all', ...allTimeframes] as ('all' | Timeframe)[]).map(option => <button key={option} className={timeframeFilter === option ? 'active' : ''} onClick={() => setTimeframeFilter(option)}>
          {option === 'all' ? 'All Timeframes' : option}
        </button>)}
      </div>}
      {executionProfileFilter && setExecutionProfileFilter && <div>
        <span>Mode</span>
        {(['all', 'quick', 'balanced', 'extended'] as ('all' | ExitMode)[]).map(option => <button key={option} className={executionProfileFilter === option ? 'active' : ''} onClick={() => setExecutionProfileFilter(option)}>
          {option === 'all' ? 'All Modes' : formatExitModeLabel(option)}
        </button>)}
      </div>}
      {scoreFilter && setScoreFilter && <div>
        <span>Score</span>
        {([
          ['all', `All Scores ${counts.scoreAll}`],
          ['green', `Green ${counts.scoreGreen}`],
          ['yellow', `Yellow ${counts.scoreYellow}`],
          ['red', `Red ${counts.scoreRed}`],
          ['unscored', `No Score ${counts.unscored}`]
        ] as const).map(([value, label]) => <button key={value} className={`${scoreFilter === value ? 'active' : ''} score-filter-${value}`} onClick={() => setScoreFilter(value)}>{label}</button>)}
      </div>}
    </div>;
  }

function getSignalFilterCounts(signals: Signal[], statusFilter: 'all' | 'open' | 'closed' | 'win' | 'loss', sideFilter: 'all' | 'long' | 'short') {
  const scoreBase = signals.filter(signal => statusMatches(signal, statusFilter) && sideMatches(signal, sideFilter));
  return {
    statusAll: signals.filter(signal => sideMatches(signal, sideFilter)).length,
    open: signals.filter(signal => sideMatches(signal, sideFilter) && signal.status === 'OPEN').length,
    closed: signals.filter(signal => sideMatches(signal, sideFilter) && signal.status !== 'OPEN').length,
    win: signals.filter(signal => sideMatches(signal, sideFilter) && signal.status === 'WIN').length,
    loss: signals.filter(signal => sideMatches(signal, sideFilter) && signal.status === 'LOSS').length,
    sideAll: signals.filter(signal => statusMatches(signal, statusFilter)).length,
    long: signals.filter(signal => statusMatches(signal, statusFilter) && signal.side === 'LONG').length,
    short: signals.filter(signal => statusMatches(signal, statusFilter) && signal.side === 'SHORT').length,
    marketAll: signals.filter(signal => statusMatches(signal, statusFilter) && sideMatches(signal, sideFilter)).length,
    spot: signals.filter(signal => statusMatches(signal, statusFilter) && sideMatches(signal, sideFilter) && signal.market === 'spot').length,
    futures: signals.filter(signal => statusMatches(signal, statusFilter) && sideMatches(signal, sideFilter) && signal.market === 'futures').length,
    scoreAll: scoreBase.length,
    scoreGreen: scoreBase.filter(signal => scoreTone(getSignalScore(signal)) === 'green').length,
    scoreYellow: scoreBase.filter(signal => scoreTone(getSignalScore(signal)) === 'yellow').length,
    scoreRed: scoreBase.filter(signal => scoreTone(getSignalScore(signal)) === 'red').length,
    unscored: scoreBase.filter(signal => scoreTone(getSignalScore(signal)) === 'unscored').length
  };
}

function RuleToggle({
  enabled,
  onToggle,
  disabled = false
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return <button
    type="button"
    className={enabled ? 'rule-toggle on' : 'rule-toggle off'}
    onClick={onToggle}
    disabled={disabled}
  >
    {enabled ? 'ON' : 'OFF'}
  </button>;
}

function statusMatches(signal: Signal, statusFilter: 'all' | 'open' | 'closed' | 'win' | 'loss') {
  return statusFilter === 'all' ||
    (statusFilter === 'open' && signal.status === 'OPEN') ||
    (statusFilter === 'closed' && signal.status !== 'OPEN') ||
    (statusFilter === 'win' && signal.status === 'WIN') ||
    (statusFilter === 'loss' && signal.status === 'LOSS');
}

function sideMatches(signal: Signal, sideFilter: 'all' | 'long' | 'short') {
  return sideFilter === 'all' ||
    (sideFilter === 'long' && signal.side === 'LONG') ||
    (sideFilter === 'short' && signal.side === 'SHORT');
}

function getRangeStart(range: PerformanceRange) {
  const now = Date.now();
  if (range === '24h') return now - 24 * 60 * 60 * 1000;
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  if (range === '90d') return now - 90 * 24 * 60 * 60 * 1000;
  return 0;
}

function toDateInput(stamp: number) {
  const date = new Date(stamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateLabel(value: string) {
  if (!value) return 'Select date';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function signalTimestamp(signal: Signal) {
  return signal.closedAt ?? signal.openedAt;
}

function rangeSignalTimestamp(signal: Signal) {
  return signal.openedAt;
}

function getRangeLabel(range: PerformanceRange) {
  if (range === '24h') return '24 Hours';
  if (range === '7d') return '7 Days';
  if (range === '30d') return '30 Days';
  if (range === '90d') return '90 Days';
  if (range === 'custom') return 'Custom Date';
  return 'All Time';
}

type InsightRow = {
  strategyId: string;
  name: string;
  risk: Risk;
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
  longCount: number;
  shortCount: number;
  longNetPnl: number;
  shortNetPnl: number;
  score: number;
};

type TimeframeInsight = {
  timeframe: Timeframe;
  top: InsightRow | null;
};

type ReplayTradeRow = Signal & {
  pnl: number;
  marketPrice?: number;
  liquidationPrice?: number | null;
  pnlUsdt?: number | null;
  roiPct?: number | null;
  capitalImpact: number;
  allocatedCapital: number;
  isCurrentlyOpen: boolean;
};

type RejectedTradeRow = Signal & {
  failedRules: string[];
};

type ReplayResult = {
  tradeRows: ReplayTradeRow[];
  rejectedTradeRows: RejectedTradeRow[];
  closedPnl: number;
  openPnl: number;
  netPnl: number;
  currentCapital: number;
  changePct: number;
  openCount: number;
  closedCount: number;
  rejectedCount: number;
  rejectedReasons: {
    executionSource: number;
    directionFilter: number;
    duplicateSymbol: number;
    maxTrades: number;
    dailyLossLimit: number;
    riskReward: number;
    riskPerTrade: number;
  };
  startingCapital: number;
};

type PortfolioAcceptedRow = {
  id: number;
  symbol: string;
  strategyName: string;
  status: 'OPEN' | 'WIN' | 'LOSS';
  executionStatus?: Signal['executionStatus'];
  side: Side;
  market: TradingVenue;
  venueLabel: string;
  exitMode: ExitMode;
  timeframe: Timeframe;
  openedAt: number;
  closedAt?: number;
  entry: number;
  marketPrice?: number;
  liquidationPrice?: number | null;
  expectedProfitPct: number;
  riskPct: number;
  pnl: number;
  pnlUsdt?: number | null;
  roiPct?: number | null;
  pnlSource?: string | null;
  pnlReadAt?: number | null;
  pnlLabel: string;
  score: number | null;
  allocationAmount?: number;
  allocationPct?: number;
};

type PortfolioRejectedViewRow = {
  id: number;
  symbol: string;
  status: string;
  strategyName: string;
  side: Side;
  market: TradingVenue;
  exitMode: ExitMode;
  timeframe: Timeframe;
  venueLabel: string;
  openedAt: number;
  closedAt?: number;
  entry: number;
  marketPrice?: number;
  expectedProfitPct: number;
  riskPct: number;
  failedRules: string[];
};

function buildInsightRows(signals: Signal[], strategies: { id: string; name: string; risk: Risk }[], tickers: Map<string, Ticker>) {
  return strategies.map(strategy => {
    const own = signals.filter(signal => signal.strategyId === strategy.id);
    const wins = own.filter(signal => signal.status === 'WIN').length;
    const losses = own.filter(signal => signal.status === 'LOSS').length;
    const open = own.filter(signal => signal.status === 'OPEN').length;
    const closedSignals = own.filter(signal => signal.status !== 'OPEN');
    const pnlRows = own.map(signal => getSignalPnl(signal, tickers.get(signal.symbol)?.price));
    const netPnl = pnlRows.reduce((sum, pnl) => sum + pnl, 0);
    const avgPnl = pnlRows.length ? netPnl / pnlRows.length : 0;
    const longSignals = own.filter(signal => signal.side === 'LONG');
    const shortSignals = own.filter(signal => signal.side === 'SHORT');
    const longNetPnl = longSignals.reduce((sum, signal) => sum + getSignalPnl(signal, tickers.get(signal.symbol)?.price), 0);
    const shortNetPnl = shortSignals.reduce((sum, signal) => sum + getSignalPnl(signal, tickers.get(signal.symbol)?.price), 0);
    const winRate = closedSignals.length ? (wins / closedSignals.length) * 100 : 0;
    const stabilityPenalty = losses * 1.35 + open * 0.35;
    const score = netPnl + winRate - stabilityPenalty;
    return {
      strategyId: strategy.id,
      name: strategy.name,
      risk: strategy.risk,
      total: own.length,
      open,
      closed: closedSignals.length,
      wins,
      losses,
      winRate,
      netPnl,
      avgPnl,
      longCount: longSignals.length,
      shortCount: shortSignals.length,
      longNetPnl,
      shortNetPnl,
      score
    };
  });
}

function getRiskRewardMultiplier(rule: ShadowRuleProfile['minRiskReward'], customRiskReward: string) {
  const raw = rule === 'custom' ? customRiskReward : rule;
  const reward = Number(raw.split(':')[1] ?? '2');
  if (!Number.isFinite(reward) || reward <= 0) return 2;
  return reward;
}

function buildRejectedReasonItems(
  rules: ShadowRuleProfile,
  reasons: ReplayResult['rejectedReasons']
) {
  return [
    {
      label: `Execution Source ${rules.executionSource === 'best-single' ? 'Best Single Strategy' : rules.executionSource === 'top-2' ? 'Top 2 Strategies' : rules.executionSource === 'top-4' ? 'All Strategies' : 'Custom Strategy Selection'}`,
      value: reasons.executionSource
    },
    {
      label: `Allowed Direction ${rules.allowedDirection === 'both' ? 'Both' : rules.allowedDirection === 'long-only' ? 'Long Only' : 'Short Only'}`,
      value: reasons.directionFilter
    },
    {
      label: 'Symbol Already Open',
      value: reasons.duplicateSymbol
    },
    {
      label: `Risk Per Trade ${rules.riskPerTrade || '0'}%`,
      value: reasons.riskPerTrade
    },
    {
      label: `Open Trade Limit ${rules.maxTrades || '0'}`,
      value: reasons.maxTrades
    },
    {
      label: `Daily Loss Limit ${rules.dailyLoss || '0'}%`,
      value: reasons.dailyLossLimit
    },
    {
      label: `Minimum Risk/Reward ${rules.minRiskReward === 'custom' ? rules.customRiskReward : rules.minRiskReward}`,
      value: reasons.riskReward
    }
  ];
}

function formatFailedRuleLabel(rule: string) {
  if (rule === 'Execution Source') return 'Execution Source';
  if (rule === 'Allowed Direction') return 'Allowed Direction';
  if (rule === 'Symbol Already Open') return 'Symbol Already Open';
  if (rule === 'Open Trade Limit') return 'Open Trade Limit';
  if (rule === 'Daily Loss Limit %') return 'Daily Loss Limit';
  if (rule === 'Minimum Risk/Reward') return 'Minimum Risk/Reward';
  if (rule === 'Risk Per Trade %') return 'Risk Per Trade';
  if (rule === 'Trading Venue') return 'Trading Venue';
  if (rule === 'Kill Switch') return 'Kill Switch';
  return rule;
}

function simulatePortfolioReplay(
  signals: Signal[],
  tickers: Map<string, Ticker>,
  futuresTickers: Map<string, Ticker>,
  rules: ShadowRuleProfile,
  venueMode: MarketMode
): ReplayResult {
  if (!rules.enabled) {
    return {
      tradeRows: [],
      rejectedTradeRows: [],
      closedPnl: 0,
      openPnl: 0,
      netPnl: 0,
      currentCapital: Math.max(0, Number(rules.capital) || 0),
      changePct: 0,
      openCount: 0,
      closedCount: 0,
      rejectedCount: 0,
      rejectedReasons: {
        executionSource: 0,
        directionFilter: 0,
        duplicateSymbol: 0,
        maxTrades: 0,
        dailyLossLimit: 0,
        riskReward: 0,
        riskPerTrade: 0
      },
      startingCapital: Math.max(0, Number(rules.capital) || 0)
    };
  }
  const now = Date.now();
  const replayStart = rules.replayMode === 'historical-replay'
      ? rules.replayRange === 'custom'
        ? new Date(`${rules.startDate}T00:00:00`).getTime()
        : getRangeStart(rules.replayRange)
      : rules.liveStartAt;
  const replayEnd = rules.replayMode === 'historical-replay'
    ? rules.replayRange === 'custom'
      ? new Date(`${rules.endDate}T23:59:59`).getTime()
      : now
    : Infinity;
  const startingCapital = Math.max(0, Number(rules.capital) || 0);
  const reserveRatio = Math.max(0, Math.min(100, Number(rules.reserveRatio) || 0));
  const maxTrades = Math.max(1, Number(rules.maxTrades) || 1);
  const riskPerTrade = Math.max(0, Number(rules.riskPerTrade) || 0);
  const dailyLossLimit = Math.max(0, Number(rules.dailyLoss) || 0);
  const maxStrategyExposure = Math.max(0, Math.min(100, Number(rules.maxStrategyExposure) || 0));
  const minRewardMultiple = getRiskRewardMultiplier(rules.minRiskReward, rules.customRiskReward);
  const marketPriceFor = (signal: Signal) => signal.market === 'futures'
    ? futuresTickers.get(signal.symbol)?.price
    : tickers.get(signal.symbol)?.price;
  const sortedSignals = signals
    .filter(signal => signal.openedAt >= replayStart && signal.openedAt <= replayEnd && signal.market === venueMode)
    .sort((a, b) => a.openedAt - b.openedAt || a.id - b.id);
  const rankedStrategyIds = Array.from(sortedSignals.reduce((map, signal) => {
    const marketPrice = marketPriceFor(signal);
    const current = map.get(signal.strategyId) ?? { score: 0, count: 0 };
    current.score += getSignalPnl(signal, marketPrice);
    current.count += 1;
    map.set(signal.strategyId, current);
    return map;
  }, new Map<string, { score: number; count: number }>()).entries())
    .sort((a, b) => b[1].score - a[1].score || b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([strategyId]) => strategyId);
  const allowedStrategyIds = rules.executionSource === 'best-single'
    ? new Set(rankedStrategyIds.slice(0, 1))
    : rules.executionSource === 'top-2'
      ? new Set(rankedStrategyIds.slice(0, 2))
      : new Set(rankedStrategyIds);
  const activePositions: { id: number; symbol: string; releaseTime: number; allocatedCapital: number; strategyId: string; side: Side }[] = [];
  const strategyExposure = new Map<string, number>();
  const tradeRows: ReplayTradeRow[] = [];
  const rejectedTradeRows: RejectedTradeRow[] = [];
  let rejectedCount = 0;
  const rejectedReasons = {
    executionSource: 0,
    directionFilter: 0,
    duplicateSymbol: 0,
    maxTrades: 0,
    dailyLossLimit: 0,
    riskReward: 0,
    riskPerTrade: 0
  };
  let realizedPnl = 0;
  let currentCapital = startingCapital;

  const releasePositionsUntil = (time: number) => {
    for (let index = activePositions.length - 1; index >= 0; index--) {
      const position = activePositions[index];
      if (position.releaseTime > time) continue;
      activePositions.splice(index, 1);
      strategyExposure.set(position.strategyId, Math.max(0, (strategyExposure.get(position.strategyId) ?? 0) - position.allocatedCapital));
    }
  };

    for (const signal of sortedSignals) {
      releasePositionsUntil(signal.openedAt);
      const failedRules: string[] = [];
      if (allowedStrategyIds.size > 0 && !allowedStrategyIds.has(signal.strategyId)) {
        failedRules.push('Execution Source');
      }
      if (rules.allowedDirection === 'long-only' && signal.side !== 'LONG') {
        failedRules.push('Allowed Direction');
      }
      if (rules.allowedDirection === 'short-only' && signal.side !== 'SHORT') {
        failedRules.push('Allowed Direction');
      }
      if (venueMode === 'spot' && signal.side !== 'LONG') {
        failedRules.push('Allowed Direction');
      }
      if (activePositions.some(position => position.symbol === signal.symbol)) {
        failedRules.push('Symbol Already Open');
      }
      const availableCapital = Math.max(0, currentCapital * (1 - reserveRatio / 100) - activePositions.reduce((sum, position) => sum + position.allocatedCapital, 0));
        if (activePositions.length >= maxTrades) {
          failedRules.push('Open Trade Limit');
        }
      if (dailyLossLimit > 0 && currentCapital <= startingCapital * (1 - dailyLossLimit / 100)) {
        failedRules.push('Daily Loss Limit %');
      }
      const requiredRewardMultiple = signal.riskPct > 0 ? signal.expectedProfitPct / signal.riskPct : Infinity;
      if (requiredRewardMultiple < minRewardMultiple) {
        failedRules.push('Minimum Risk/Reward');
      }
      const strategyCap = currentCapital * (maxStrategyExposure / 100);
      const currentStrategyExposure = strategyExposure.get(signal.strategyId) ?? 0;
      const riskSizedCapital = signal.riskPct > 0 ? (currentCapital * (riskPerTrade / 100)) / (signal.riskPct / 100) : availableCapital / maxTrades;
      const slotCapital = availableCapital / Math.max(1, maxTrades - activePositions.length);
      const cappedStrategyCapital = Math.max(0, strategyCap - currentStrategyExposure) || availableCapital;
      const methodSizedCapital = rules.allocationMethod === 'equal' ? slotCapital : riskSizedCapital;
      const allocatedCapital = Math.max(0, Math.min(availableCapital, methodSizedCapital, cappedStrategyCapital));
      if (signal.riskPct > 0 && riskSizedCapital <= 0) {
        failedRules.push('Risk Per Trade %');
      }

      if (failedRules.length > 0) {
        const uniqueFailedRules = Array.from(new Set(failedRules));
        rejectedCount += 1;
        rejectedTradeRows.push({ ...signal, failedRules: uniqueFailedRules });
        for (const rule of uniqueFailedRules) {
          if (rule === 'Execution Source') rejectedReasons.executionSource += 1;
          if (rule === 'Allowed Direction') rejectedReasons.directionFilter += 1;
          if (rule === 'Symbol Already Open') rejectedReasons.duplicateSymbol += 1;
            if (rule === 'Open Trade Limit') rejectedReasons.maxTrades += 1;
          if (rule === 'Daily Loss Limit %') rejectedReasons.dailyLossLimit += 1;
          if (rule === 'Minimum Risk/Reward') rejectedReasons.riskReward += 1;
          if (rule === 'Risk Per Trade %') rejectedReasons.riskPerTrade += 1;
        }
        continue;
      }

    const marketPrice = marketPriceFor(signal);
    const pnl = getSignalPnl(signal, marketPrice);
    const capitalImpact = allocatedCapital * (pnl / 100);
    const tradeRow: ReplayTradeRow = {
      ...signal,
      pnl,
      marketPrice,
      capitalImpact,
      allocatedCapital,
      isCurrentlyOpen: false
    };
    tradeRows.push(tradeRow);

    if (signal.status === 'OPEN') {
      const releaseTime = signal.plannedExitAt || signal.closedAt || Infinity;
      activePositions.push({
        id: signal.id,
        symbol: signal.symbol,
        releaseTime,
        allocatedCapital,
        strategyId: signal.strategyId,
        side: signal.side
      });
      strategyExposure.set(signal.strategyId, currentStrategyExposure + allocatedCapital);
      continue;
    }

    realizedPnl += capitalImpact;
    currentCapital = startingCapital + realizedPnl;
  }

  const evaluationTime = rules.replayMode === 'historical-replay' ? Math.min(replayEnd, now) : now;
  releasePositionsUntil(evaluationTime);
  const activePositionIds = new Set(activePositions.map(position => position.id));
  const finalizedTradeRows = tradeRows.map(row => ({
    ...row,
    isCurrentlyOpen: activePositionIds.has(row.id)
  }));
  const closedPnl = finalizedTradeRows.filter(row => !row.isCurrentlyOpen).reduce((sum, row) => sum + row.capitalImpact, 0);
  const openPnl = finalizedTradeRows.filter(row => row.isCurrentlyOpen).reduce((sum, row) => sum + row.capitalImpact, 0);
  const netPnl = closedPnl + openPnl;
  const endingCapital = startingCapital + netPnl;
    return {
      tradeRows: finalizedTradeRows.sort((a, b) => signalTimestamp(b) - signalTimestamp(a)),
      rejectedTradeRows: rejectedTradeRows.sort((a, b) => signalTimestamp(b) - signalTimestamp(a)),
      closedPnl,
    openPnl,
    netPnl,
      currentCapital: endingCapital,
      changePct: startingCapital > 0 ? (netPnl / startingCapital) * 100 : 0,
      openCount: finalizedTradeRows.filter(row => row.isCurrentlyOpen).length,
      closedCount: finalizedTradeRows.filter(row => !row.isCurrentlyOpen).length,
      rejectedCount,
      rejectedReasons,
      startingCapital
    };
  }

function buildTimeframeInsights(signals: Signal[], strategies: { id: string; name: string; risk: Risk }[], tickers: Map<string, Ticker>) {
  return allTimeframes.map(timeframe => {
    const rows = buildInsightRows(signals.filter(signal => signal.timeframe === timeframe), strategies, tickers);
    return {
      timeframe,
      top: rows.sort((a, b) => b.score - a.score)[0] ?? null
    };
  });
}


function PerformanceChart({
  stats,
  signals,
  tickers,
  futuresTickers,
  notifications,
  compact = false,
  commandRange,
  onCommandRangeChange,
  commandCustomFrom,
  commandCustomTo,
  onCommandCustomFromChange,
  onCommandCustomToChange,
  selected
}: {
  stats: Stat[];
  signals: Signal[];
  tickers: Map<string, Ticker>;
  futuresTickers: Map<string, Ticker>;
  notifications: Notification[];
  compact?: boolean;
  commandRange?: PerformanceRange;
  onCommandRangeChange?: (value: PerformanceRange) => void;
  commandCustomFrom?: string;
  commandCustomTo?: string;
  onCommandCustomFromChange?: (value: string) => void;
  onCommandCustomToChange?: (value: string) => void;
  selected?: Set<string>;
}) {
  const performanceCommandRef = useRef<HTMLElement | null>(null);
  const tradeLedgerRef = useRef<HTMLDivElement | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState('all');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'all' | 'open' | 'closed' | 'win' | 'loss'>('all');
  const [ledgerSideFilter, setLedgerSideFilter] = useState<'all' | 'long' | 'short'>('all');
  const [ledgerMarketFilter, setLedgerMarketFilter] = useState<'all' | 'spot' | 'futures'>('all');
  const [ledgerTimeframeFilter, setLedgerTimeframeFilter] = useState<'all' | Timeframe>('all');
  const [ledgerExecutionProfileFilter, setLedgerExecutionProfileFilter] = useState<'all' | ExitMode>('all');
  const [ledgerScoreFilter, setLedgerScoreFilter] = useState<ScoreFilter>('all');
  const [ledgerTradeQuery, setLedgerTradeQuery] = useState('');
  const [chartTrade, setChartTrade] = useState<TradeChartTrade | null>(null);
  const [ledgerRange, setLedgerRange] = useState<PerformanceRange>('all');
  const [ledgerCustomFrom, setLedgerCustomFrom] = useState(() => toDateInput(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [ledgerCustomTo, setLedgerCustomTo] = useState(() => toDateInput(Date.now()));
  const [focusedTradeId, setFocusedTradeId] = useState<number | null>(null);
  const [performanceRange, setPerformanceRange] = useState<PerformanceRange>('24h');
  const [customFrom, setCustomFrom] = useState(() => toDateInput(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [customTo, setCustomTo] = useState(() => toDateInput(Date.now()));
  const ledgerScrollRef = useRef<HTMLDivElement | null>(null);
  const handledFocusedTradeIdRef = useRef<number | null>(null);
  const [ledgerScrollTop, setLedgerScrollTop] = useState(0);
  const [ledgerViewportHeight, setLedgerViewportHeight] = useState(560);
  const effectiveCommandRange = commandRange ?? performanceRange;
  const setEffectiveCommandRange = onCommandRangeChange ?? setPerformanceRange;
  const effectiveCommandCustomFrom = commandCustomFrom ?? customFrom;
  const effectiveCommandCustomTo = commandCustomTo ?? customTo;
  const setEffectiveCommandCustomFrom = onCommandCustomFromChange ?? setCustomFrom;
  const setEffectiveCommandCustomTo = onCommandCustomToChange ?? setCustomTo;
  const commandRangeStart = effectiveCommandRange === 'custom'
    ? new Date(`${effectiveCommandCustomFrom}T00:00:00`).getTime() || 0
    : getRangeStart(effectiveCommandRange);
  const commandRangeEnd = effectiveCommandRange === 'custom'
    ? new Date(`${effectiveCommandCustomTo}T23:59:59.999`).getTime() || Date.now()
    : Date.now();
  const commandSignals = useMemo(() => signals.filter(signal => {
    const stamp = rangeSignalTimestamp(signal);
    return stamp >= commandRangeStart && stamp <= commandRangeEnd;
  }), [signals, commandRangeStart, commandRangeEnd]);
  const rangeStart = performanceRange === 'custom'
    ? new Date(`${customFrom}T00:00:00`).getTime() || 0
    : getRangeStart(performanceRange);
  const rangeEnd = performanceRange === 'custom'
    ? new Date(`${customTo}T23:59:59.999`).getTime() || Date.now()
    : Date.now();
  const rangedSignals = useMemo(() => signals.filter(signal => {
    const stamp = rangeSignalTimestamp(signal);
    return stamp >= rangeStart && stamp <= rangeEnd;
  }), [signals, rangeStart, rangeEnd]);
  const strategyCatalog = useMemo(() => {
    return stats
      .map(item => ({ id: item.strategyId, name: item.name, risk: item.risk }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stats]);
  const selectedStats = selectedStrategyId === 'all' ? null : stats.find(item => item.strategyId === selectedStrategyId);
  const performanceSignals = selectedStrategyId === 'all'
    ? commandSignals
    : commandSignals.filter(signal => signal.strategyId === selectedStrategyId);
  const insightRows = useMemo(() => buildInsightRows(commandSignals, strategyCatalog, tickers)
    .sort((a, b) => b.score - a.score || b.winRate - a.winRate || b.closed - a.closed || b.open - a.open || a.name.localeCompare(b.name)), [commandSignals, strategyCatalog, tickers]);
  const timeframeInsights = useMemo(() => buildTimeframeInsights(rangedSignals, strategyCatalog, tickers), [rangedSignals, strategyCatalog, tickers]);
  const scopedInsights = selectedStrategyId === 'all' ? insightRows : insightRows.filter(row => row.strategyId === selectedStrategyId);
  const rangedPortfolioTotals = insightRows.reduce((acc, item) => ({
    total: acc.total + item.total,
    open: acc.open + item.open,
    wins: acc.wins + item.wins,
    losses: acc.losses + item.losses
  }), { total: 0, open: 0, wins: 0, losses: 0 });
  const ledgerRangeStart = ledgerRange === 'custom'
    ? new Date(`${ledgerCustomFrom}T00:00:00`).getTime() || 0
    : getRangeStart(ledgerRange);
  const ledgerRangeEnd = ledgerRange === 'custom'
    ? new Date(`${ledgerCustomTo}T23:59:59.999`).getTime() || Date.now()
    : Date.now();
  const ledgerBaseSignals = useMemo(() => signals.filter(signal => {
    const stamp = rangeSignalTimestamp(signal);
    const marketMatches = ledgerMarketFilter === 'all' ? true : (signal.market ?? 'spot') === ledgerMarketFilter;
    return stamp >= ledgerRangeStart && stamp <= ledgerRangeEnd && marketMatches;
  }), [signals, ledgerRangeStart, ledgerRangeEnd, ledgerMarketFilter]);
  const ledgerBaseRows = useMemo(() => ledgerBaseSignals.map(signal => {
    const marketPrice = signal.market === 'futures' ? futuresTickers.get(signal.symbol)?.price : tickers.get(signal.symbol)?.price;
    const pnl = getSignalPnl(signal, marketPrice);
    return {
      ...signal,
      marketPrice,
      label: formatTradeLabel(signal.id),
      pnl,
      score: extractSignalScore(signal.reason),
      pnlLabel: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`
    };
  }), [ledgerBaseSignals, tickers, futuresTickers]);
  const normalizedLedgerTradeQuery = ledgerTradeQuery.trim().toUpperCase();
  const ledgerSignals = useMemo(() => ledgerBaseSignals.filter(signal => {
    const tradeLabel = formatTradeLabel(signal.id).toUpperCase();
    const tradeQueryMatches = !normalizedLedgerTradeQuery
      || tradeLabel.includes(normalizedLedgerTradeQuery)
      || String(signal.id).includes(normalizedLedgerTradeQuery.replace(/^T-?/, ''));
    return statusMatches(signal, ledgerStatusFilter)
      && sideMatches(signal, ledgerSideFilter)
      && (ledgerTimeframeFilter === 'all' || signal.timeframe === ledgerTimeframeFilter)
      && (ledgerExecutionProfileFilter === 'all' || signal.exitMode === ledgerExecutionProfileFilter)
      && scoreMatches(signal, ledgerScoreFilter)
      && tradeQueryMatches;
  }), [ledgerBaseSignals, ledgerStatusFilter, ledgerSideFilter, ledgerTimeframeFilter, ledgerExecutionProfileFilter, ledgerScoreFilter, normalizedLedgerTradeQuery]);
  const tradeRows = useMemo(() => ledgerSignals.map(signal => {
    const marketPrice = signal.market === 'futures' ? futuresTickers.get(signal.symbol)?.price : tickers.get(signal.symbol)?.price;
    const pnl = getSignalPnl(signal, marketPrice);
    return {
      ...signal,
      marketPrice,
      label: formatTradeLabel(signal.id),
      pnl,
      score: extractSignalScore(signal.reason),
      pnlLabel: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`
    };
  }), [ledgerSignals, tickers, futuresTickers]);
  const bestTrade = useMemo(() => ledgerBaseRows.reduce<SignalTradeRow | null>((best, row) => !best || row.pnl > best.pnl ? row : best, null), [ledgerBaseRows]);
  const worstTrade = useMemo(() => ledgerBaseRows.reduce<SignalTradeRow | null>((worst, row) => !worst || row.pnl < worst.pnl ? row : worst, null), [ledgerBaseRows]);
  const ledgerStats = useMemo(() => ({
    winCount: tradeRows.filter(row => row.status === 'WIN').length,
    lossCount: tradeRows.filter(row => row.status === 'LOSS').length,
    openCount: tradeRows.filter(row => row.status === 'OPEN').length,
    longCount: tradeRows.filter(row => row.side === 'LONG').length,
    shortCount: tradeRows.filter(row => row.side === 'SHORT').length
  }), [tradeRows]);
    const ledgerPnlCards = useMemo(() => {
      const openPnl = tradeRows.filter(row => row.status === 'OPEN').reduce((sum, row) => sum + row.pnl, 0);
      const closedPnl = tradeRows.filter(row => row.status !== 'OPEN').reduce((sum, row) => sum + row.pnl, 0);
      return {
        openPnl,
        closedPnl,
        netPnl: openPnl + closedPnl
      };
    }, [tradeRows]);
  const filterCounts = useMemo(() => getSignalFilterCounts(ledgerBaseSignals, ledgerStatusFilter, ledgerSideFilter), [ledgerBaseSignals, ledgerStatusFilter, ledgerSideFilter]);
  const performanceRows = useMemo(() => performanceSignals.map(signal => {
    const marketPrice = tickers.get(signal.symbol)?.price;
    return { pnl: getSignalPnl(signal, marketPrice) };
  }), [performanceSignals, tickers]);
  const selectedInsight = selectedStrategyId === 'all' ? null : insightRows.find(item => item.strategyId === selectedStrategyId) ?? null;
  const closedCount = selectedInsight ? selectedInsight.closed : rangedPortfolioTotals.wins + rangedPortfolioTotals.losses;
  const openCount = selectedInsight ? selectedInsight.open : rangedPortfolioTotals.open;
  const avgPnl = performanceRows.length ? performanceRows.reduce((sum, row) => sum + row.pnl, 0) / performanceRows.length : 0;
  const selectedName = selectedInsight?.name ?? selectedStats?.name ?? 'All Strategies';
  const wins = selectedInsight ? selectedInsight.wins : rangedPortfolioTotals.wins;
  const losses = selectedInsight ? selectedInsight.losses : rangedPortfolioTotals.losses;
  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
  useEffect(() => {
    if (focusedTradeId == null) return;
    if (handledFocusedTradeIdRef.current === focusedTradeId) return;
    const targetIndex = tradeRows.findIndex(row => row.id === focusedTradeId);
    if (targetIndex === -1) return;
    handledFocusedTradeIdRef.current = focusedTradeId;
    tradeLedgerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const list = ledgerScrollRef.current;
    if (!list) return;
    const visibleRows = 4;
    const desiredRowSlot = 0;
    const maxStartIndex = Math.max(0, tradeRows.length - visibleRows);
    const startIndex = Math.min(maxStartIndex, Math.max(0, targetIndex - desiredRowSlot));
    const estimatedTop = startIndex * ledgerRowHeight;
    list.scrollTo({ top: estimatedTop, behavior: 'auto' });
    setLedgerScrollTop(estimatedTop);

    let frameId = 0;
    let attempt = 0;
    const maxAttempts = 8;
    const alignFocusedRow = () => {
      const row = document.getElementById(`trade-row-${focusedTradeId}`) as HTMLTableRowElement | null;
      if (!row) {
        if (attempt < maxAttempts) {
          attempt += 1;
          frameId = window.requestAnimationFrame(alignFocusedRow);
        }
        return;
      }

      const rowTop = row.offsetTop;
      const desiredTop = Math.max(0, rowTop - (desiredRowSlot * ledgerRowHeight));
      if (Math.abs(list.scrollTop - desiredTop) > 1) {
        list.scrollTo({ top: desiredTop, behavior: 'smooth' });
        setLedgerScrollTop(desiredTop);
      }
    };
    frameId = window.requestAnimationFrame(alignFocusedRow);

    const timer = window.setTimeout(() => {
      setFocusedTradeId(current => current === focusedTradeId ? null : current);
      if (handledFocusedTradeIdRef.current === focusedTradeId) handledFocusedTradeIdRef.current = null;
    }, 15000);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timer);
    };
  }, [focusedTradeId, tradeRows, ledgerViewportHeight]);
  useEffect(() => {
    const updateHeight = () => setLedgerViewportHeight(ledgerScrollRef.current?.clientHeight ?? 560);
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const ledgerRowHeight = 56;
  const ledgerOverscan = 8;
  const visibleLedgerCount = Math.max(18, Math.ceil(ledgerViewportHeight / ledgerRowHeight) + ledgerOverscan * 2);
  const visibleLedgerStart = Math.max(0, Math.floor(ledgerScrollTop / ledgerRowHeight) - ledgerOverscan);
  const visibleLedgerEnd = Math.min(tradeRows.length, visibleLedgerStart + visibleLedgerCount);
  const visibleTradeRows = useMemo(() => tradeRows.slice(visibleLedgerStart, visibleLedgerEnd), [tradeRows, visibleLedgerStart, visibleLedgerEnd]);
  const ledgerTopSpacerHeight = visibleLedgerStart * ledgerRowHeight;
  const ledgerBottomSpacerHeight = Math.max(0, (tradeRows.length - visibleLedgerEnd) * ledgerRowHeight);

  const resetLedgerScroll = () => {
    ledgerScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setLedgerScrollTop(0);
  };

  const focusTrade = (tradeId: number | null) => {
    setLedgerStatusFilter('all');
    setLedgerSideFilter('all');
    setLedgerScrollTop(0);
    handledFocusedTradeIdRef.current = null;
    setFocusedTradeId(tradeId);
  };
  const cycleLedgerOutcomeFilter = () => {
    setFocusedTradeId(null);
    setLedgerStatusFilter(prev => prev === 'all' ? 'win' : prev === 'win' ? 'loss' : 'all');
    resetLedgerScroll();
  };
  const cycleLedgerSideFilter = () => {
    setFocusedTradeId(null);
    setLedgerSideFilter(prev => prev === 'all' ? 'long' : prev === 'long' ? 'short' : 'all');
    resetLedgerScroll();
  };
  const cycleLedgerMarketFilter = () => {
    setFocusedTradeId(null);
    setLedgerMarketFilter(prev => prev === 'all' ? 'spot' : prev === 'spot' ? 'futures' : 'all');
    resetLedgerScroll();
  };
  const cycleLedgerTimeframeFilter = () => {
    setFocusedTradeId(null);
    setLedgerTimeframeFilter(prev => {
      const options: ('all' | Timeframe)[] = ['all', ...allTimeframes];
      const index = options.indexOf(prev);
      return options[(index + 1) % options.length] ?? 'all';
    });
    resetLedgerScroll();
  };
  const cycleLedgerModeFilter = () => {
    setFocusedTradeId(null);
    setLedgerExecutionProfileFilter(prev => {
      const options: ('all' | ExitMode)[] = ['all', 'quick', 'balanced', 'extended'];
      const index = options.indexOf(prev);
      return options[(index + 1) % options.length] ?? 'all';
    });
    resetLedgerScroll();
  };
  const toggleOpenPnlFocus = () => {
    setFocusedTradeId(null);
    setLedgerStatusFilter(prev => prev === 'open' ? 'all' : 'open');
    resetLedgerScroll();
  };
  const toggleClosedPnlFocus = () => {
    setFocusedTradeId(null);
    setLedgerStatusFilter(prev => prev === 'closed' ? 'all' : 'closed');
    resetLedgerScroll();
  };
  return <section className="panel performance-command" id="performance-command" ref={performanceCommandRef}>
    <div className="section-title dashboard-section-title performance-command-head">
      <h2>Performance Command Center</h2>
      {!compact && <div className="dashboard-command-filter in-command">
        <span className="dashboard-range-label">{getRangeLabel(effectiveCommandRange)}</span>
        <div className="range-pills">
          {(['24h', '7d', '30d', '90d', 'all', 'custom'] as PerformanceRange[]).map(option => <button key={option} className={effectiveCommandRange === option ? 'active' : ''} onClick={() => setEffectiveCommandRange(option)}>
            {getRangeLabel(option)}
          </button>)}
        </div>
        <small className="range-retention-note">Data retained for the last 90 days only.</small>
        {effectiveCommandRange === 'custom' && <div className="custom-range-panel dashboard-custom-range">
          <CustomDateField label="From" value={effectiveCommandCustomFrom} max={effectiveCommandCustomTo} onChange={setEffectiveCommandCustomFrom} />
          <CustomDateField label="To" value={effectiveCommandCustomTo} min={effectiveCommandCustomFrom} onChange={setEffectiveCommandCustomTo} />
        </div>}
      </div>}
    </div>

    {!compact && <div className="strategy-scorecards">
      <button className={selectedStrategyId === 'all' ? 'scorecard active' : 'scorecard'} onClick={() => setSelectedStrategyId('all')}>
        <span>Portfolio</span>
        <strong>All Strategies</strong>
        <div className="scoreline"><i style={{ width: `${Math.min(100, rangedPortfolioTotals.total * 6)}%` }} /></div>
        <small>{rangedPortfolioTotals.total} trades</small>
      </button>
      {insightRows.map(item => <button key={item.strategyId} className={selectedStrategyId === item.strategyId ? 'scorecard active' : 'scorecard'} onClick={() => setSelectedStrategyId(item.strategyId)}>
        <div className="scorecard-topline"><RiskBadge risk={item.risk} /><span className={selected?.has(item.strategyId) ? 'strategy-switch on' : 'strategy-switch off'}>{selected?.has(item.strategyId) ? 'ON' : 'OFF'}</span></div>
        <strong>{item.name}</strong>
        <small className="scorecard-caption">{`${item.winRate.toFixed(0)}% WR`}</small>
        <small className="scorecard-score">{`${item.score.toFixed(1)} score`}</small>
        <div className="scoreline"><i style={{ width: `${item.winRate || Math.min(100, item.total * 8)}%` }} /></div>
      </button>)}
    </div>}

    {!compact && <section className="performance-summary">
      <div className="section-title compact dashboard-section-title"><h2>Performance Summary</h2></div>
      <div className="command-summary">
        <article className="selected-brief">
          <span>Selected</span>
          <strong>{selectedName}</strong>
          <small>{selectedInsight ? `${selectedInsight.risk === 'high' ? 'High Risk' : 'Medium Risk'} strategy` : 'Complete strategy portfolio'}</small>
        </article>
        <Metric icon={<Bell />} label="Total" value={selectedInsight ? selectedInsight.total : rangedPortfolioTotals.total} />
        <Metric icon={<Activity />} label="Open" value={openCount} />
        <Metric icon={<Target />} label="Closed" value={closedCount} />
        <Metric icon={<TrendingUp />} label="Wins" value={wins} />
        <Metric icon={<ShieldAlert />} label="Losses" value={losses} />
        <Metric icon={<Gauge />} label="Win Rate" value={`${winRate}%`} />
        <Metric icon={<TrendingUp />} label="Avg PnL" value={`${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%`} />
      </div>
    </section>}

    {!compact && <PerformanceCharts
      stats={stats}
      signals={rangedSignals}
      tickers={tickers}
      selectedStrategyId={selectedStrategyId}
      range={performanceRange}
      onRangeChange={setPerformanceRange}
      insights={scopedInsights}
      timeframeInsights={timeframeInsights}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFromChange={setCustomFrom}
      onCustomToChange={setCustomTo}
    />}

    <div className="ledger-wrap" ref={tradeLedgerRef}>
      <div className="section-title compact dashboard-section-title"><h2>Trade Ledger</h2></div>
      <div className="ledger-range-filter">
        <span className="dashboard-range-label">{getRangeLabel(ledgerRange)}</span>
        <div className="range-pills">
          {(['24h', '7d', '30d', '90d', 'all', 'custom'] as PerformanceRange[]).map(option => <button key={option} className={ledgerRange === option ? 'active' : ''} onClick={() => setLedgerRange(option)}>
            {getRangeLabel(option)}
          </button>)}
        </div>
        <small className="range-retention-note">Data retained for the last 90 days only.</small>
      </div>
      {ledgerRange === 'custom' && <div className="custom-range-panel ledger-custom-range">
        <CustomDateField label="From" value={ledgerCustomFrom} max={ledgerCustomTo} onChange={setLedgerCustomFrom} />
        <CustomDateField label="To" value={ledgerCustomTo} min={ledgerCustomFrom} onChange={setLedgerCustomTo} />
      </div>}
        <div className="trade-extremes">
          <div className="trade-extremes-row trade-extremes-row-top">
            <button type="button" className="trade-extreme-card" onClick={() => focusTrade(bestTrade?.id ?? null)}>
              <span>Best Trade</span>
              <strong className="good">{bestTrade ? bestTrade.pnlLabel : 'N/A'}</strong>
              <small>{bestTrade ? `${bestTrade.symbol} | ${bestTrade.strategyName}` : 'No ledger trades yet'}</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={() => focusTrade(worstTrade?.id ?? null)}>
              <span>Worst Trade</span>
              <strong className="bad">{worstTrade ? worstTrade.pnlLabel : 'N/A'}</strong>
              <small>{worstTrade ? `${worstTrade.symbol} | ${worstTrade.strategyName}` : 'No ledger trades yet'}</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={cycleLedgerOutcomeFilter}>
              <span>Wins / Losses</span>
              <strong><b className="good">{ledgerStats.winCount}</b> / <b className="bad">{ledgerStats.lossCount}</b></strong>
              <small>{ledgerStats.openCount} ledger trades still open</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={cycleLedgerSideFilter}>
              <span>Long / Short</span>
              <strong><b className="good">{ledgerStats.longCount}</b> / <b className="bad">{ledgerStats.shortCount}</b></strong>
              <small>{ledgerSideFilter === 'all' ? 'Showing both sides' : ledgerSideFilter === 'long' ? 'LONG filter active' : 'SHORT filter active'}</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={cycleLedgerMarketFilter}>
              <span>Spot / Futures</span>
              <strong><b>{tradeRows.filter(row => row.market === 'spot').length}</b> / <b>{tradeRows.filter(row => row.market === 'futures').length}</b></strong>
              <small>{ledgerMarketFilter === 'all' ? 'Showing both venues' : ledgerMarketFilter === 'spot' ? 'Spot filter active' : 'Futures filter active'}</small>
            </button>
          </div>
          <div className="trade-extremes-row trade-extremes-row-bottom">
            <button type="button" className="trade-extreme-card" onClick={toggleOpenPnlFocus}>
              <span>Open PnL</span>
              <strong className={ledgerPnlCards.openPnl >= 0 ? 'good' : 'bad'}>{`${ledgerPnlCards.openPnl >= 0 ? '+' : ''}${ledgerPnlCards.openPnl.toFixed(2)}%`}</strong>
              <small>{ledgerStatusFilter === 'open' ? 'OPEN filter active' : 'Aggregate unrealized performance'}</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={toggleClosedPnlFocus}>
              <span>Closed PnL</span>
              <strong className={ledgerPnlCards.closedPnl >= 0 ? 'good' : 'bad'}>{`${ledgerPnlCards.closedPnl >= 0 ? '+' : ''}${ledgerPnlCards.closedPnl.toFixed(2)}%`}</strong>
              <small>{ledgerStatusFilter === 'closed' ? 'CLOSED filter active' : 'Aggregate realized performance'}</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={() => { setFocusedTradeId(null); setLedgerStatusFilter('all'); resetLedgerScroll(); }}>
              <span>Net PnL</span>
              <strong className={ledgerPnlCards.netPnl >= 0 ? 'good' : 'bad'}>{`${ledgerPnlCards.netPnl >= 0 ? '+' : ''}${ledgerPnlCards.netPnl.toFixed(2)}%`}</strong>
              <small>{ledgerPnlCards.netPnl >= 0 ? 'Net profit across open and closed trades' : 'Net loss across open and closed trades'}</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={cycleLedgerModeFilter}>
              <span>Mode</span>
              <strong>{ledgerExecutionProfileFilter === 'all' ? 'All' : formatExitModeLabel(ledgerExecutionProfileFilter)}</strong>
              <small>{ledgerExecutionProfileFilter === 'all' ? 'Showing every mode' : `${formatExitModeLabel(ledgerExecutionProfileFilter)} filter active`}</small>
            </button>
            <button type="button" className="trade-extreme-card" onClick={cycleLedgerTimeframeFilter}>
              <span>Timeframe</span>
              <strong>{ledgerTimeframeFilter === 'all' ? 'All' : ledgerTimeframeFilter}</strong>
              <small>{ledgerTimeframeFilter === 'all' ? 'Showing every timeframe' : `${ledgerTimeframeFilter} filter active`}</small>
            </button>
          </div>
        </div>
        <SignalFilterBar
          statusFilter={ledgerStatusFilter}
          sideFilter={ledgerSideFilter}
          marketFilter={ledgerMarketFilter}
          timeframeFilter={ledgerTimeframeFilter}
          executionProfileFilter={ledgerExecutionProfileFilter}
          scoreFilter={ledgerScoreFilter}
          setStatusFilter={setLedgerStatusFilter}
          setSideFilter={setLedgerSideFilter}
          setMarketFilter={setLedgerMarketFilter}
          setTimeframeFilter={setLedgerTimeframeFilter}
          setExecutionProfileFilter={setLedgerExecutionProfileFilter}
          setScoreFilter={setLedgerScoreFilter}
          counts={filterCounts}
        />
        {tradeRows.length === 0 && <p className="empty">No trades generated for this selection yet.</p>}
      {tradeRows.length > 0 && <div className="trade-ledger-shell">
        <div className="trade-ledger-toolbar">
          <div className="ledger-search-input trade-ledger-search">
            <Search size={16} />
            <input
              id="ledger-trade-search"
              type="search"
              value={ledgerTradeQuery}
              onChange={event => {
                setFocusedTradeId(null);
                setLedgerTradeQuery(event.target.value);
                resetLedgerScroll();
              }}
              placeholder="Search by trade number: T-0002B"
              spellCheck={false}
              autoComplete="off"
            />
            {ledgerTradeQuery && <button
              type="button"
              className="ledger-search-clear"
              onClick={() => {
                setLedgerTradeQuery('');
                setFocusedTradeId(null);
                resetLedgerScroll();
              }}
            >
              Clear
            </button>}
          </div>
        </div>
        <div className="trade-ledger-scroll" ref={ledgerScrollRef} onScroll={event => setLedgerScrollTop(event.currentTarget.scrollTop)}>
          <table className="trade-ledger trade-ledger-body">
            <thead>
              <tr>
                {tradeLedgerColumns.map(column => <th key={column}><LedgerHeaderCell column={column} /></th>)}
              </tr>
            </thead>
            <tbody>
              {ledgerTopSpacerHeight > 0 && <tr aria-hidden="true" className="ledger-spacer-row"><td colSpan={15} style={{ height: `${ledgerTopSpacerHeight}px` }} /></tr>}
              {visibleTradeRows.map(row => <tr key={row.id} id={`trade-row-${row.id}`} className={`${focusedTradeId === row.id ? 'focused' : ''} chartable-row`} onClick={() => setChartTrade(row)} title="Open TradingView chart">
                <td>{formatTradeLabel(row.id)}</td>
                <td><strong>{row.symbol}</strong></td>
                <td><span className="strategy-cell">{row.strategyName}</span></td>
                <td><span className={`status-pill ${row.status.toLowerCase()}`}>{row.status}</span></td>
                <td><SideBadge side={row.side} /></td>
                <td>
                  <span className="ledger-venue-cell">
                    <strong>{row.market === 'futures' ? 'Futures x1' : 'Spot'}</strong>
                  </span>
                </td>
                <td>{formatExitModeLabel(row.exitMode)}</td>
                <td>{row.timeframe}</td>
                <td>{entryTime(row.openedAt)}</td>
                <td>{formatDuration(row.openedAt, row.closedAt)}</td>
                <td>{fmt(row.entry)}</td>
                <td>{row.marketPrice ? fmt(row.marketPrice) : '-'}</td>
                <td>{formatTargetRiskRatio(row)}</td>
                <td className="ledger-score-cell"><b className={`ledger-score ${scoreTone(row.score)}`}>{row.score == null ? '-' : row.score.toFixed(1)}</b></td>
                <td className="ledger-pnl-cell"><b className={`ledger-pnl-value ${row.pnl >= 0 ? 'good' : 'bad'}`}>{row.pnlLabel}</b></td>
              </tr>)}
              {ledgerBottomSpacerHeight > 0 && <tr aria-hidden="true" className="ledger-spacer-row"><td colSpan={15} style={{ height: `${ledgerBottomSpacerHeight}px` }} /></tr>}
            </tbody>
          </table>
        </div>
      </div>}
    </div>

    {!compact && <NotificationsPanel notifications={notifications} signals={signals} onSelectTrade={focusTrade} />}
    <TradeChartModal trade={chartTrade} onClose={() => setChartTrade(null)} />
  </section>;
}

function PerformanceCharts({
  stats,
  signals,
  tickers,
  selectedStrategyId,
  range,
  onRangeChange,
  insights,
  timeframeInsights,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange
}: {
  stats: Stat[]; 
  signals: Signal[];
  tickers: Map<string, Ticker>;
  selectedStrategyId: string;
  range: PerformanceRange;
  onRangeChange: (value: PerformanceRange) => void;
  insights: InsightRow[];
  timeframeInsights: TimeframeInsight[];
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [openLeaderSections, setOpenLeaderSections] = useState<Record<string, boolean>>({
    'Timeframe Leaders': false,
    'Performance Leaders': false,
    'Direction Leaders': false
  });
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const riskMap = new Map(stats.map(stat => [stat.strategyId, stat.risk]));
  const groupedRows = new Map<string, {
    strategyId: string;
    name: string;
    risk: Risk;
    wins: number;
    losses: number;
    live: number;
    total: number;
    winRate: number;
    winLong: number;
    winShort: number;
    lossLong: number;
    lossShort: number;
    openLong: number;
    openShort: number;
  }>();
  for (const signal of signals) {
    if (selectedStrategyId !== 'all' && signal.strategyId !== selectedStrategyId) continue;
    const existing = groupedRows.get(signal.strategyId) ?? {
      strategyId: signal.strategyId,
      name: signal.strategyName,
      risk: riskMap.get(signal.strategyId) ?? 'medium',
      wins: 0,
      losses: 0,
      live: 0,
      total: 0,
      winRate: 0,
      winLong: 0,
      winShort: 0,
      lossLong: 0,
      lossShort: 0,
      openLong: 0,
      openShort: 0
    };
    existing.total += 1;
    if (signal.status === 'WIN') {
      existing.wins += 1;
      if (signal.side === 'LONG') existing.winLong += 1;
      else existing.winShort += 1;
    } else if (signal.status === 'LOSS') {
      existing.losses += 1;
      if (signal.side === 'LONG') existing.lossLong += 1;
      else existing.lossShort += 1;
    } else {
      existing.live += 1;
      if (signal.side === 'LONG') existing.openLong += 1;
      else existing.openShort += 1;
    }
    groupedRows.set(signal.strategyId, existing);
  }
  const chartRows = [...groupedRows.values()].map(row => ({
    ...row,
    closedTrades: row.wins + row.losses,
    winRate: row.wins + row.losses ? Math.round((row.wins / (row.wins + row.losses)) * 100) : 0,
    score: (insights.find(item => item.strategyId === row.strategyId)?.score) ?? 0
  })).sort((a, b) => b.score - a.score || b.winRate - a.winRate || b.closedTrades - a.closedTrades || b.total - a.total);
  const chartTotals = chartRows.reduce((acc, row) => ({
    total: acc.total + row.total,
    wins: acc.wins + row.wins,
    losses: acc.losses + row.losses,
    open: acc.open + row.live
  }), { total: 0, wins: 0, losses: 0, open: 0 });
  const strategyChartWidth = Math.max(340, Math.min(920, viewportWidth - 56));
  const bestReturn = [...insights].sort((a, b) => b.netPnl - a.netPnl)[0] ?? null;
  const bestWinRate = [...insights].filter(item => item.closed > 0).sort((a, b) => b.winRate - a.winRate)[0] ?? null;
  const mostStable = [...insights].filter(item => item.closed > 0).sort((a, b) => b.score - a.score)[0] ?? null;
  const bestLong = [...insights].filter(item => item.longCount > 0).sort((a, b) => b.longNetPnl - a.longNetPnl)[0] ?? null;
  const bestShort = [...insights].filter(item => item.shortCount > 0).sort((a, b) => b.shortNetPnl - a.shortNetPnl)[0] ?? null;
  const strongestAvg = [...insights].filter(item => item.total > 0).sort((a, b) => b.avgPnl - a.avgPnl)[0] ?? null;
  const leaderSections = [
    {
      title: 'Timeframe Leaders',
      items: timeframeInsights.map(item => ({
        label: `Best on ${item.timeframe}`,
        name: item.top?.name ?? 'No leader yet',
        value: item.top ? `${item.top.netPnl >= 0 ? '+' : ''}${item.top.netPnl.toFixed(2)}%` : 'No trades',
        tone: item.top && item.top.netPnl < 0 ? 'bad' : 'good',
        meta: item.top ? `${item.top.total} trades` : `No ${item.timeframe} trades`
      }))
    },
    {
      title: 'Performance Leaders',
      items: [
        { label: 'Highest Profit', name: bestReturn?.name ?? 'No strategy yet', value: bestReturn ? `${bestReturn.netPnl >= 0 ? '+' : ''}${bestReturn.netPnl.toFixed(2)}%` : 'N/A', tone: bestReturn && bestReturn.netPnl < 0 ? 'bad' : 'good', meta: bestReturn ? `${bestReturn.total} trades` : 'No data' },
        { label: 'Highest Accuracy', name: bestWinRate?.name ?? 'No strategy yet', value: bestWinRate ? `${bestWinRate.winRate.toFixed(0)}%` : 'N/A', tone: bestWinRate && bestWinRate.winRate < 50 ? 'bad' : 'good', meta: bestWinRate ? `${bestWinRate.closed} closed` : 'No data' },
        { label: 'Most Stable', name: mostStable?.name ?? 'No strategy yet', value: mostStable ? `${mostStable.score.toFixed(1)} score` : 'N/A', tone: 'good' as const, meta: mostStable ? `${mostStable.losses} losses` : 'No data' }
      ]
    },
    {
      title: 'Direction Leaders',
      items: [
        { label: 'Best Long', name: bestLong?.name ?? 'No strategy yet', value: bestLong ? `${bestLong.longNetPnl >= 0 ? '+' : ''}${bestLong.longNetPnl.toFixed(2)}%` : 'N/A', tone: bestLong && bestLong.longNetPnl < 0 ? 'bad' : 'good', meta: bestLong ? `${bestLong.longCount} long trades` : 'No data' },
        { label: 'Best Short', name: bestShort?.name ?? 'No strategy yet', value: bestShort ? `${bestShort.shortNetPnl >= 0 ? '+' : ''}${bestShort.shortNetPnl.toFixed(2)}%` : 'N/A', tone: bestShort && bestShort.shortNetPnl < 0 ? 'bad' : 'good', meta: bestShort ? `${bestShort.shortCount} short trades` : 'No data' },
        { label: 'Best Trade Average', name: strongestAvg?.name ?? 'No strategy yet', value: strongestAvg ? `${strongestAvg.avgPnl >= 0 ? '+' : ''}${strongestAvg.avgPnl.toFixed(2)}%` : 'N/A', tone: strongestAvg && strongestAvg.avgPnl < 0 ? 'bad' : 'good', meta: strongestAvg ? `${strongestAvg.total} total trades` : 'No data' }
      ]
    }
  ];
  return <section className="performance-charts">
    <div className="performance-chart-topbar">
      <div className="section-title compact performance-chart-title">
        <div>
          <h2>Performance Chart</h2>
        </div>
      </div>
      <div className="performance-toolbar">
        <div className="range-pills">
          {(['24h', '7d', '30d', '90d', 'all', 'custom'] as PerformanceRange[]).map(option => <button key={option} className={range === option ? 'active' : ''} onClick={() => onRangeChange(option)}>
            {getRangeLabel(option)}
          </button>)}
        </div>
        <small className="range-retention-note">Data retained for the last 90 days only.</small>
      </div>
    </div>
    {range === 'custom' && <div className="custom-range-panel">
      <CustomDateField label="From" value={customFrom} max={customTo} onChange={onCustomFromChange} />
      <CustomDateField label="To" value={customTo} min={customFrom} onChange={onCustomToChange} />
    </div>}
    <div className="leader-sections">
      {leaderSections.map(section => {
        const isOpen = openLeaderSections[section.title] ?? false;
        return <section key={section.title} className={`leader-group${isOpen ? ' open' : ''}`}>
          <button
            type="button"
            className="leader-toggle"
            onClick={() => setOpenLeaderSections(prev => ({ ...prev, [section.title]: !isOpen }))}
          >
            <div className="leader-toggle-copy">
              <h3>{section.title}</h3>
              <small>{`${section.items.length} metrics inside`}</small>
            </div>
            <span>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {isOpen && <div className="leader-list">
            {section.items.map(item => <article key={item.label} className="leader-item">
              <div className="leader-copy">
                <span>{item.label}</span>
                <strong className={item.tone}>{item.value}</strong>
                <h4>{item.name}</h4>
                <small>{item.meta}</small>
              </div>
              <div className="leader-stats">
                <b className={item.tone}>{item.label}</b>
                <small>{item.tone === 'bad' ? 'Under pressure' : 'Leading this range'}</small>
              </div>
            </article>)}
          </div>}
        </section>;
      })}
    </div>
    <div className="chart-grid">
      <div className="chart-block wide">
        <h3>Strategy Wins / Losses / Open</h3>
        <div className="chart">
          {chartRows.length === 0 ? <div className="chart-empty-state">No strategy chart data in this range.</div> : <div className="strategy-bars-canvas">
            <BarChart width={strategyChartWidth} height={300} data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} height={8} />
              <YAxis tick={false} axisLine={false} tickLine={false} width={8} />
              <Tooltip content={<StrategyChartTooltip />} cursor={{ fill: 'var(--hover)' }} />
              <Bar dataKey="wins" fill="#2fbf71" stroke="#2fbf71" fillOpacity={1} isAnimationActive={false} name="Wins" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="losses" fill="#d85b63" stroke="#d85b63" fillOpacity={1} isAnimationActive={false} name="Losses" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="live" fill="#c9a45c" stroke="#c9a45c" fillOpacity={1} isAnimationActive={false} name="Open" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </div>}
        </div>
        <div className="performance-chart-summary">
          <span>Ranked By <b>Score</b></span>
          <span>Total Trades <b>{chartTotals.total}</b></span>
          <span>Wins <b className="good">{chartTotals.wins}</b></span>
          <span>Losses <b className="bad">{chartTotals.losses}</b></span>
          <span>Open <b>{chartTotals.open}</b></span>
        </div>
      </div>
    </div>
  </section>;
}

function StrategyChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Stat & { winLong: number; winShort: number; lossLong: number; lossShort: number; openLong: number; openShort: number; closedTrades: number; score: number } }[] }) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return <div className="trade-tooltip">
    <strong>{row.name}</strong>
    <span className="tooltip-heading"><RiskBadge risk={row.risk} compact /> <b className="tooltip-total-count">{row.total}</b> total trades | {row.winRate}% win rate</span>
    <div className="tooltip-metrics">
      <small>Closed Trades <b>{row.closedTrades}</b></small>
      <small>Score <b>{row.score.toFixed(1)}</b></small>
    </div>
    <div className="tooltip-table">
      <div className="tooltip-table-head"><span>Status</span><span className="total-col">Total</span><span>Long</span><span>Short</span></div>
      <div className="tooltip-row wins"><span>Wins</span><b className="good total-col">{row.wins}</b><b className="good">{row.winLong}</b><b className="good">{row.winShort}</b></div>
      <div className="tooltip-row losses"><span>Losses</span><b className="bad total-col">{row.losses}</b><b className="bad">{row.lossLong}</b><b className="bad">{row.lossShort}</b></div>
      <div className="tooltip-row open"><span>Open</span><b className="total-col">{row.live}</b><b>{row.openLong}</b><b>{row.openShort}</b></div>
    </div>
  </div>;
}

type SignalTradeRow = Signal & {
  label: string;
  pnl: number;
  pnlLabel: string;
  score: number | null;
  marketPrice?: number;
  liquidationPrice?: number | null;
  pnlUsdt?: number | null;
  roiPct?: number | null;
  pnlSource?: string | null;
  pnlReadAt?: number | null;
  allocationAmount?: number;
  allocationPct?: number;
};

function getSignalPnl(signal: Signal, marketPrice?: number) {
  if (signal.status === 'OPEN') return marketPrice ? pnlFromPrice(signal, marketPrice) : 0;
  if (signal.status === 'WIN') return signal.closePrice ? pnlFromPrice(signal, signal.closePrice) : signal.expectedProfitPct;
  if (signal.status === 'LOSS') return signal.closePrice ? pnlFromPrice(signal, signal.closePrice) : -signal.riskPct;
  return 0;
}

function pnlFromPrice(signal: Signal, price: number) {
  return signal.side === 'LONG'
    ? ((price - signal.entry) / signal.entry) * 100
    : ((signal.entry - price) / signal.entry) * 100;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <article><div>{icon}</div><span>{label}</span><strong>{value}</strong></article>;
}

function CustomDateField({
  label,
  value,
  onChange,
  min,
  max
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.('.custom-date-field')) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!value) return;
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) setViewMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  }, [value]);

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const startWeekDay = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const minTime = min ? new Date(`${min}T00:00:00`).getTime() : -Infinity;
  const maxTime = max ? new Date(`${max}T00:00:00`).getTime() : Infinity;
  const days: { key: string; label: string; value?: string; muted?: boolean; disabled?: boolean }[] = [];

  for (let i = 0; i < startWeekDay; i++) {
    const prev = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i - startWeekDay + 1);
    days.push({ key: `prev-${i}`, label: String(prev.getDate()), muted: true, disabled: true });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const current = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    const currentValue = toDateInput(current.getTime());
    const currentTime = current.getTime();
    days.push({
      key: currentValue,
      label: String(day),
      value: currentValue,
      disabled: currentTime < minTime || currentTime > maxTime
    });
  }
  while (days.length % 7 !== 0) {
    const nextIndex = days.length - (startWeekDay + daysInMonth) + 1;
    days.push({ key: `next-${nextIndex}`, label: String(nextIndex), muted: true, disabled: true });
  }

  const selectedValue = value;
  const todayValue = toDateInput(Date.now());

  return <div className={`custom-date-field${open ? ' open' : ''}`}>
    <span>{label}</span>
    <button type="button" className="custom-date-trigger" onClick={() => setOpen(prev => !prev)}>
      <strong>{formatDateLabel(value)}</strong>
      <CalendarDays size={18} />
    </button>
    {open && <div className="custom-calendar-popover">
      <div className="calendar-header">
        <button type="button" onClick={() => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <strong>{viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" onClick={() => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="calendar-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {days.map(day => {
          const isSelected = day.value === selectedValue;
          const isToday = day.value === todayValue;
          return <button
            type="button"
            key={day.key}
            className={[
              'calendar-day',
              day.muted ? 'muted' : '',
              day.disabled ? 'disabled' : '',
              isSelected ? 'selected' : '',
              isToday ? 'today' : ''
            ].filter(Boolean).join(' ')}
            disabled={day.disabled}
            onClick={() => {
              if (!day.value) return;
              onChange(day.value);
              setOpen(false);
            }}
          >
            {day.label}
          </button>;
        })}
      </div>
    </div>}
  </div>;
}

function SideBadge({ side }: { side: Side }) {
  return <b className={`side-badge ${side.toLowerCase()}`}>{side}</b>;
}

function RiskBadge({ risk, compact = false }: { risk: Risk; compact?: boolean }) {
  return <b className={`risk-badge ${risk}${compact ? ' compact' : ''}`}>{risk === 'high' ? 'HIGH RISK' : 'MEDIUM RISK'}</b>;
}

function extractSide(text: string): Side | null {
  if (text.includes(' LONG') || text.includes('LONG ')) return 'LONG';
  if (text.includes(' SHORT') || text.includes('SHORT ')) return 'SHORT';
  return null;
}

function extractSignalId(text: string) {
  const tagged = text.match(/T-([0-9A-Z]+)/)?.[1];
  if (tagged) return parseInt(tagged, 36);
  return Number(text.match(/#(\d+)/)?.[1] ?? 0);
}

function SignalCard({ signal, ticker, risk = 'medium' }: { signal: Signal; ticker?: Ticker; risk?: Risk }) {
  const livePnl = getSignalPnl(signal, ticker?.price);
  return <article className={signal.status.toLowerCase()}>
    <header>
      <strong>#{signal.id} {signal.symbol}</strong>
      <span className="strategy-cell">{signal.strategyName}<RiskBadge risk={risk} /></span>
      <div className="signal-badges"><SideBadge side={signal.side} /><b>{signal.status}</b></div>
    </header>
    <div className="signal-grid">
      <span>Side <b>{signal.side}</b></span>
      <span>Timeframe <b>{signal.timeframe}</b></span>
      <span>Entry <b>{fmt(signal.entry)}</b></span>
      <span>Market <b>{ticker ? fmt(ticker.price) : '-'}</b></span>
      <span>Take Profit <b>{fmt(signal.takeProfit)}</b></span>
      <span>Stop Loss <b>{fmt(signal.stopLoss)}</b></span>
      <span>Live PnL <b className={livePnl >= 0 ? 'good' : 'bad'}>{livePnl >= 0 ? '+' : ''}{livePnl.toFixed(2)}%</b></span>
      <span>Expected Profit <b className="good">{signal.expectedProfitPct.toFixed(2)}%</b></span>
      <span>Risk <b className="bad">{signal.riskPct.toFixed(2)}%</b></span>
      <span>Planned Exit <b>{time(signal.plannedExitAt)}</b></span>
    </div>
    <p>{signal.reason} | Confidence {signal.confidence}%</p>
  </article>;
}

function TradeList({ title, signals, empty }: { title: string; signals: Signal[]; empty: string }) {
  return <div className="trade-list">
    <h3>{title}</h3>
    {signals.length === 0 && <p className="empty">{empty}</p>}
    {signals.slice(0, 8).map(signal => <article key={signal.id}>
      <header><strong>#{signal.id} {signal.symbol}</strong><b className={signal.status.toLowerCase()}>{signal.status}</b></header>
      <span className="trade-list-meta">{signal.strategyName} <SideBadge side={signal.side} /> {signal.timeframe}</span>
      <small>Entry {fmt(signal.entry)} | TP {fmt(signal.takeProfit)} | SL {fmt(signal.stopLoss)}</small>
    </article>)}
  </div>;
}

function SymbolChartPanel({
  symbol,
  market,
  timeframe,
  onTimeframeChange,
  onClose
}: {
  symbol: string;
  market: MarketMode;
  timeframe: Timeframe;
  onTimeframeChange: (value: Timeframe) => void;
  onClose: () => void;
}) {
  const widgetHostRef = useRef<HTMLDivElement | null>(null);
  const timeframeOptions: Timeframe[] = ['5m', '10m', '15m', '1h', '2h', '4h', '1d'];
  const intervalMap: Record<Timeframe, string> = {
    '5m': '5',
    '10m': '10',
    '15m': '15',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '1d': '1D'
  };
  const tvSymbol = market === 'futures' ? `BINANCE:${symbol}PERP` : `BINANCE:${symbol}`;

  useEffect(() => {
    if (!widgetHostRef.current) return undefined;
    widgetHostRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: intervalMap[timeframe],
      timezone: 'Asia/Riyadh',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      save_image: true,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      studies: [],
      support_host: 'https://www.tradingview.com'
    });
    widgetHostRef.current.appendChild(script);
    return () => {
      if (widgetHostRef.current) widgetHostRef.current.innerHTML = '';
    };
  }, [tvSymbol, timeframe]);

  return <div className="chart-modal-backdrop" onClick={onClose}>
    <section className="chart-modal" onClick={event => event.stopPropagation()}>
      <div className="chart-modal-head">
        <div>
          <span>{market === 'futures' ? 'Futures live chart' : 'Spot live chart'}</span>
          <strong>{symbol}</strong>
          <small>TradingView live embed</small>
        </div>
        <div className="chart-modal-actions">
          <div className="chart-toolbar-group">
            <div className="access-filter-pills">
              {timeframeOptions.map(item => <button key={item} className={timeframe === item ? 'active' : ''} onClick={() => onTimeframeChange(item)}>{item}</button>)}
            </div>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="chart-modal-grid">
        <article>
          <span>Feed</span>
          <strong>TradingView</strong>
        </article>
        <article>
          <span>Source</span>
          <strong>Binance</strong>
        </article>
        <article>
          <span>Mode</span>
          <strong>{market === 'futures' ? 'Futures' : 'Spot'}</strong>
        </article>
        <article>
          <span>History</span>
          <strong>Back-scroll enabled</strong>
        </article>
      </div>
      <div className="chart-modal-body">
        <div className="chart-block wide advanced">
          <div className="chart-live-stage tradingview-stage">
            <div className="tradingview-widget-container" ref={widgetHostRef} />
          </div>
        </div>
      </div>
    </section>
  </div>;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown render error'
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[ui] render failed:', error);
  }

  render() {
    if (this.state.error) {
      return <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#0b1118',
        color: '#f4f7fb',
        fontFamily: 'Segoe UI, Arial, sans-serif'
      }}>
        <div style={{
          width: 'min(820px, 100%)',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid rgba(255,255,255,.12)',
          background: 'rgba(17,25,36,.92)'
        }}>
          <h1 style={{ margin: '0 0 12px', fontSize: '28px' }}>UI Runtime Error</h1>
          <p style={{ margin: '0 0 10px', color: '#9db0c7' }}>The page hit a render error. Refresh after the fix or share this message.</p>
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#ff8d8d'
          }}>{this.state.error}</pre>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<RootErrorBoundary><App /></RootErrorBoundary>);
