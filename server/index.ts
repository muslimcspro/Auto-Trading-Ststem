import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import WebSocket, { WebSocketServer } from 'ws';

type Risk = 'medium' | 'high';
type Timeframe = '5m' | '10m' | '15m' | '1h' | '2h' | '4h' | '1d';
type Side = 'LONG' | 'SHORT';
type ExitMode = 'balanced' | 'quick' | 'extended';
type TradingVenue = 'spot' | 'futures';
type StrategyMarketScope = 'spot' | 'futures' | 'all';

type SymbolInfo = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  minNotional?: number;
  minQty?: number;
  stepSize?: number;
  quantityPrecision?: number;
};

type PriceTicker = {
  symbol: string;
  price: number;
  change24h: number;
  quoteVolume: number;
  eventTime: number;
};

type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

type Strategy = {
  id: string;
  name: string;
  risk: Risk;
  description: string;
  evaluate: (candles: Candle[], ticker: PriceTicker) => SignalDraft | null;
};

type SignalDraft = {
  side: Side;
  confidence: number;
  reason: string;
  rr: number;
};

type TradeSignal = SignalDraft & {
  id: number;
  market: TradingVenue;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: Timeframe;
  exitMode: ExitMode;
  entry: number;
  takeProfit: number;
  stopLoss: number;
  expectedProfitPct: number;
  riskPct: number;
  openedAt: number;
  plannedExitAt: number;
  status: 'OPEN' | 'WIN' | 'LOSS';
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
  profitProtectionArmedAt?: number;
  trailingStop?: number;
  extremePrice?: number;
};

type SignalCandidate = {
  signal: TradeSignal;
  score: number;
  market: TradingVenue;
  timeframe: Timeframe;
  candles: Candle[];
  components: {
    momentum: number;
    volume: number;
    alignment: number;
    riskReward: number;
    diversity: number;
  };
};

function countsAsOpenExecution(status?: TradeSignal['executionStatus']) {
  return status === 'live_accepted' || status === 'test_accepted';
}

type LiveExecutionRules = {
  venueMode: TradingVenue;
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

type StrategyStats = {
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

type TelegramAccountSubscription = {
  accountId: string;
  role: 'admin' | 'user';
  displayName: string;
  telegramUsername: string;
  chatId: string | null;
  notificationsEnabled: boolean;
  enabled: boolean;
  selectedStrategies: string[];
  selectedTimeframes: Timeframe[];
  selectedMarkets: TradingVenue[];
  acceptedLive: boolean;
  acceptedShadow: boolean;
  updatedAt: number;
  linkedAt: number | null;
};

type TelegramSubscriptionState = {
  subscribers: TelegramAccountSubscription[];
  lastUpdateId: number;
};

type TelegramRuntimeSettings = {
  publicChannelEnabled: boolean;
};

type HomeFearGreed = {
  value: number;
  classification: string;
  timestamp: number | null;
  yesterday: { value: number; classification: string } | null;
  lastWeek: { value: number; classification: string } | null;
  lastMonth: { value: number; classification: string } | null;
  updatedAt: number;
};

type HomeExecutionIntel = {
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

type HomeMarketCapRow = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  currentPrice: number;
  marketCap: number;
  marketCapRank: number;
  priceChange24h: number;
};

type HomeNewsRow = {
  id: string;
  title: string;
  url: string;
  publishedAt: number | null;
  source: string;
  currencies: string[];
};

const BINANCE_REST = 'https://api.binance.com';
const BINANCE_FUTURES_REST = 'https://fapi.binance.com';
const BINANCE_WS = 'wss://stream.binance.com:9443/ws/!ticker@arr';
const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/ws/!ticker@arr';
const PORT = Number(process.env.PORT ?? 8787);
const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STATE_FILE = path.join(DATA_DIR, 'trading-state.json');
const TELEGRAM_SUBSCRIBERS_FILE = path.join(DATA_DIR, 'telegram-subscribers.json');
const BINANCE_VAULT_FILE = path.join(DATA_DIR, 'binance-vault.json');
const BINANCE_VAULT_KEY_FILE = path.join(DATA_DIR, 'binance-vault.key');
const SIGNAL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const TELEGRAM_CONFIG_FILE = path.join(ROOT_DIR, 'start-system.bat');
const CANDLE_LIMIT_DEFAULT = 80;
const CANDLE_LIMIT_CHART = 240;
const SCAN_BATCH_SIZE: Record<Timeframe, number> = {
  '5m': 140,
  '10m': 120,
  '15m': 120,
  '1h': 220,
  '2h': 280,
  '4h': 360,
  '1d': 480
};
const CANDLE_CACHE_TTL_MS: Record<Timeframe, number> = {
  '5m': 15_000,
  '10m': 18_000,
  '15m': 22_000,
  '1h': 60_000,
  '2h': 120_000,
  '4h': 240_000,
  '1d': 600_000
};

function formatTradeIdLabel(id: number) {
  return `T-${Math.max(0, id).toString(36).toUpperCase().padStart(6, '0')}`;
}

function readTelegramFallbackConfig() {
  if (!fs.existsSync(TELEGRAM_CONFIG_FILE)) return {};
  const file = fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf8');
  const publicToken = file.match(/set\s+"PUBLIC_TELEGRAM_BOT_TOKEN=([^"\r\n]+)"/i)?.[1]?.trim()
    ?? file.match(/set\s+"TELEGRAM_BOT_TOKEN=([^"\r\n]+)"/i)?.[1]?.trim();
  const publicChatId = file.match(/set\s+"PUBLIC_TELEGRAM_CHAT_ID=([^"\r\n]+)"/i)?.[1]?.trim()
    ?? file.match(/set\s+"TELEGRAM_CHAT_ID=([^"\r\n]+)"/i)?.[1]?.trim();
  const publicBotUsername = file.match(/set\s+"PUBLIC_TELEGRAM_BOT_USERNAME=([^"\r\n]+)"/i)?.[1]?.trim()
    ?? (typeof publicChatId === 'string' && publicChatId.startsWith('@') ? publicChatId.replace(/^@/, '') : undefined);
  const publicInviteUrl = file.match(/set\s+"PUBLIC_TELEGRAM_INVITE_URL=([^"\r\n]+)"/i)?.[1]?.trim();
  const privateToken = file.match(/set\s+"PRIVATE_TELEGRAM_BOT_TOKEN=([^"\r\n]+)"/i)?.[1]?.trim();
  const privateBotUsername = file.match(/set\s+"PRIVATE_TELEGRAM_BOT_USERNAME=([^"\r\n]+)"/i)?.[1]?.trim();
  return { publicToken, publicChatId, publicBotUsername, publicInviteUrl, privateToken, privateBotUsername };
}

const telegramFallback = readTelegramFallbackConfig();
const PUBLIC_TELEGRAM_BOT_TOKEN = (process.env.PUBLIC_TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? telegramFallback.publicToken ?? '').trim();
const PUBLIC_TELEGRAM_CHAT_ID = (process.env.PUBLIC_TELEGRAM_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID ?? telegramFallback.publicChatId ?? '@Autotradingbot71').trim();
const PUBLIC_TELEGRAM_BOT_USERNAME = (process.env.PUBLIC_TELEGRAM_BOT_USERNAME ?? telegramFallback.publicBotUsername ?? 'Autotradingbot71').trim();
const PUBLIC_TELEGRAM_INVITE_URL = (process.env.PUBLIC_TELEGRAM_INVITE_URL ?? telegramFallback.publicInviteUrl ?? '').trim();
const PRIVATE_TELEGRAM_BOT_TOKEN = (process.env.PRIVATE_TELEGRAM_BOT_TOKEN ?? telegramFallback.privateToken ?? '').trim();
const PRIVATE_TELEGRAM_BOT_USERNAME = (process.env.PRIVATE_TELEGRAM_BOT_USERNAME ?? telegramFallback.privateBotUsername ?? '').trim();

process.on('unhandledRejection', error => {
  console.error('[runtime] unhandled rejection', error);
});

process.on('uncaughtException', error => {
  console.error('[runtime] uncaught exception', error);
});

const app = express();
app.use(express.json());
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

let symbols: SymbolInfo[] = [];
let tickers = new Map<string, PriceTicker>();
let futuresSymbols: SymbolInfo[] = [];
let futuresTickers = new Map<string, PriceTicker>();
const SUPPORTED_TIMEFRAMES: Timeframe[] = ['5m', '10m', '15m', '1h', '2h', '4h', '1d'];
let selectedStrategies = new Set<string>();
let selectedTimeframes = new Set<Timeframe>(['5m', '10m', '15m']);
let selectedExitModes = new Set<ExitMode>(['balanced']);
let selectedMarketScope: StrategyMarketScope = 'all';
let liveExecutionRules: LiveExecutionRules = {
  venueMode: 'spot',
  executionMode: 'live',
  killSwitch: false,
  ruleToggles: {
    tradingVenue: true,
    allowedDirection: true,
    executionSource: true,
    openTradeLimit: true,
    minRiskReward: true,
    cashReserve: true,
    riskPerTrade: true,
    dailyLoss: true
  },
  riskPerTrade: 1,
  maxTrades: 6,
  dailyLoss: 3,
  reserveRatio: 25,
  executionSource: 'best-single',
  allocationMethod: 'equal',
  minRiskReward: '1:2',
  customRiskReward: '1:2',
  allowedDirection: 'long-only',
  futuresLeverage: 5,
  futuresMarginMode: 'isolated',
  breakEvenEnabled: true,
  breakEvenTriggerPct: 1,
  trailingStopEnabled: true,
  trailingGapPct: 0.8,
  portfolioFloorEnabled: true,
  portfolioFloorTriggerPct: 13,
  portfolioFloorLockPct: 8
};
let liveProtectionBusy = false;
let portfolioFloorArmed = false;
let portfolioFloorPeakR = 0;
let scannerUniverse: string[] = [];
let ws: WebSocket | null = null;
let futuresWs: WebSocket | null = null;
let nextSignalId = 1;
let scanVersion = 0;
let scanRunning = false;
let dashboardCache: {
  stats: StrategyStats[];
  liveSignals: number;
  totalSignals: number;
  monitored: number;
  monitoredSpot: number;
  monitoredFutures: number;
  availableSpot: number;
  availableFutures: number;
  selectedStrategies: number;
  marketScope: StrategyMarketScope;
  exchange: string;
} | null = null;
let dashboardCacheDirty = true;
let homeFearGreedCache: { createdAt: number; payload: HomeFearGreed } | null = null;
let homeMarketCapCache: { createdAt: number; payload: HomeMarketCapRow[] } | null = null;
let homeNewsCache: { createdAt: number; payload: HomeNewsRow[] } | null = null;
let homeExecutionIntelCache: { createdAt: number; payload: HomeExecutionIntel } | null = null;
let homeFearGreedInflight: Promise<HomeFearGreed> | null = null;
let homeMarketCapInflight: Promise<HomeMarketCapRow[]> | null = null;
let homeNewsInflight: Promise<HomeNewsRow[]> | null = null;
let homeExecutionIntelInflight: Promise<HomeExecutionIntel> | null = null;
const livePortfolioCache = new Map<string, { createdAt: number; payload: unknown }>();
let binanceWalletCache: { createdAt: number; payload: BinanceWalletSummary } | null = null;
const futuresRiskControlCooldown = new Map<string, number>();

const signals: TradeSignal[] = [];
const notifications: { id: number; time: number; title: string; message: string; level: 'info' | 'win' | 'loss' }[] = [];
const candleCache = new Map<string, { fetchedAt: number; candles: Candle[] }>();
const scanCursors: Record<TradingVenue, Record<Timeframe, number>> = {
  spot: { '5m': 0, '10m': 0, '15m': 0, '1h': 0, '2h': 0, '4h': 0, '1d': 0 },
  futures: { '5m': 0, '10m': 0, '15m': 0, '1h': 0, '2h': 0, '4h': 0, '1d': 0 }
};
let telegramSubscribers: TelegramAccountSubscription[] = [];
let telegramLastUpdateId = 0;
let telegramSyncRunning = false;
let telegramRuntimeSettings: TelegramRuntimeSettings = {
  publicChannelEnabled: true
};
type BinanceConnectionScopes = {
  reading: boolean;
  spot: boolean;
  margin: boolean;
};

type BinanceVaultState = {
  connected: boolean;
  saved: boolean;
  updatedAt: number | null;
  verifiedAt: number | null;
  keyFingerprint: string | null;
  statusText: string;
  scopes: BinanceConnectionScopes;
};

type BinanceWalletBalance = {
  asset: string;
  free: number;
  locked: number;
  total: number;
  priceUsdt: number;
  valueUsdt: number;
  change24hPct: number;
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
  balances: BinanceWalletBalance[];
};

type BinanceFuturesPosition = {
  symbol?: string;
  positionAmt?: string;
  entryPrice?: string;
  breakEvenPrice?: string;
  markPrice?: string;
  unRealizedProfit?: string;
  unrealizedProfit?: string;
  liquidationPrice?: string;
  leverage?: string;
  notional?: string;
  isolatedMargin?: string;
  initialMargin?: string;
  positionInitialMargin?: string;
  positionSide?: string;
};

type BinanceFuturesTrade = {
  symbol?: string;
  orderId?: number | string;
  id?: number | string;
  price?: string;
  qty?: string;
  quoteQty?: string;
  realizedPnl?: string;
  commission?: string;
  commissionAsset?: string;
  time?: number;
};

const emptyBinanceScopes = (): BinanceConnectionScopes => ({
  reading: false,
  spot: false,
  margin: false
});

let binanceVaultState: BinanceVaultState = {
  connected: false,
  saved: false,
  updatedAt: null,
  verifiedAt: null,
  keyFingerprint: null,
  statusText: 'No Binance account connected',
  scopes: emptyBinanceScopes()
};

function ensureVaultKey() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BINANCE_VAULT_KEY_FILE)) {
    fs.writeFileSync(BINANCE_VAULT_KEY_FILE, crypto.randomBytes(32).toString('hex'));
  }
  return Buffer.from(fs.readFileSync(BINANCE_VAULT_KEY_FILE, 'utf8').trim(), 'hex');
}

function encryptSecret(payload: { apiKey: string; secretKey: string }) {
  const key = ensureVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  };
}

function fingerprintApiKey(apiKey: string) {
  const digest = crypto.createHash('sha256').update(apiKey).digest('hex').toUpperCase();
  return `${digest.slice(0, 6)}-${digest.slice(6, 12)}`;
}

function decryptSecret() {
  if (!fs.existsSync(BINANCE_VAULT_FILE)) return null;
  const key = ensureVaultKey();
  const vault = JSON.parse(fs.readFileSync(BINANCE_VAULT_FILE, 'utf8')) as {
    iv?: string;
    tag?: string;
    data?: string;
  };
  if (!vault.iv || !vault.tag || !vault.data) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(vault.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(vault.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(vault.data, 'hex')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(decrypted) as { apiKey: string; secretKey: string };
}

function signBinanceParams(secretKey: string, params: URLSearchParams) {
  return crypto.createHmac('sha256', secretKey).update(params.toString()).digest('hex');
}

async function fetchJsonDirect<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchTextDirect(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.text();
}

async function signedBinanceRequest<T>(baseUrl: string, route: string, apiKey: string, secretKey: string, query: Record<string, string> = {}) {
  const params = new URLSearchParams({
    ...query,
    timestamp: String(Date.now()),
    recvWindow: '5000'
  });
  params.set('signature', signBinanceParams(secretKey, params));
  const response = await fetch(`${baseUrl}${route}?${params.toString()}`, {
    headers: { 'X-MBX-APIKEY': apiKey }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { msg?: string } | null;
    throw new Error(payload?.msg || `Binance request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function validateBinanceConnection(apiKey: string, secretKey: string) {
  const scopes = emptyBinanceScopes();
  const errors: string[] = [];

  try {
    const account = await signedBinanceRequest<{
      canTrade?: boolean;
      permissions?: string[];
    }>(BINANCE_REST, '/api/v3/account', apiKey, secretKey);
    const permissions = new Set(account.permissions ?? []);
    scopes.reading = true;
    scopes.spot = permissions.has('SPOT') || Boolean(account.canTrade);
    scopes.margin = permissions.has('MARGIN');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Spot account validation failed.');
  }


  const enabledLabels = [
    scopes.reading && 'Enable Reading',
    (scopes.spot || scopes.margin) && 'Enable Spot & Margin Trading'
  ].filter(Boolean).join(' | ');

  return {
    connected: scopes.reading,
    scopes,
    statusText: enabledLabels ? `Verified with Binance. Permissions detected: ${enabledLabels}` : 'Keys saved locally, but Binance permissions could not be verified.',
    errorText: errors.filter(Boolean).join(' | '),
    verifiedAt: Date.now()
  };
}

type StoredBinanceVault = {
  iv?: string;
  tag?: string;
  data?: string;
  updatedAt?: number;
  verifiedAt?: number;
  keyFingerprint?: string;
  connected?: boolean;
  statusText?: string;
  scopes?: Partial<BinanceConnectionScopes>;
};

function persistBinanceVault(encrypted: ReturnType<typeof encryptSecret>, updatedAt: number, keyFingerprint: string, validation: Awaited<ReturnType<typeof validateBinanceConnection>>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BINANCE_VAULT_FILE, JSON.stringify({
    ...encrypted,
    updatedAt,
    verifiedAt: validation.verifiedAt,
    keyFingerprint,
    connected: validation.connected,
    statusText: validation.statusText,
    scopes: validation.scopes
  }, null, 2));
  binanceVaultState = {
    connected: validation.connected,
    saved: true,
    updatedAt,
    verifiedAt: validation.verifiedAt,
    keyFingerprint,
    statusText: validation.statusText,
    scopes: validation.scopes
  };
}

async function refreshBinanceVaultState() {
  const credentials = decryptSecret();
  if (!credentials) return binanceVaultState;
  const stored = JSON.parse(fs.readFileSync(BINANCE_VAULT_FILE, 'utf8')) as StoredBinanceVault;
  const encrypted = {
    iv: String(stored.iv ?? ''),
    tag: String(stored.tag ?? ''),
    data: String(stored.data ?? '')
  };
  const updatedAt = Number(stored.updatedAt) || Date.now();
  const keyFingerprint = typeof stored.keyFingerprint === 'string' && stored.keyFingerprint
    ? stored.keyFingerprint
    : fingerprintApiKey(credentials.apiKey);
  const validation = await validateBinanceConnection(credentials.apiKey, credentials.secretKey);
  persistBinanceVault(encrypted, updatedAt, keyFingerprint, validation);
  return binanceVaultState;
}

async function readBinanceWalletSummary(): Promise<BinanceWalletSummary> {
  if (binanceWalletCache && Date.now() - binanceWalletCache.createdAt < 30000) {
    return binanceWalletCache.payload;
  }
  const credentials = decryptSecret();
  if (!credentials) {
    const payload = { ok: false, connected: false, updatedAt: null, assetCount: 0, totalValueUsdt: 0, futuresTotalUsdt: 0, futuresAvailableUsdt: 0, pnl24hUsdt: 0, pnl24hPct: 0, balances: [] };
    binanceWalletCache = { createdAt: Date.now(), payload };
    return payload;
  }
  const account = await signedBinanceRequest<{
    balances?: { asset: string; free: string; locked: string }[];
  }>(BINANCE_REST, '/api/v3/account', credentials.apiKey, credentials.secretKey);
  const tickers = await fetch(`${BINANCE_REST}/api/v3/ticker/24hr`)
    .then(response => response.ok ? response.json() : [])
    .catch(() => []) as { symbol?: string; lastPrice?: string; priceChangePercent?: string }[];
  const tickerMap = new Map(tickers
    .filter(row => typeof row.symbol === 'string')
    .map(row => [row.symbol as string, {
      price: Number(row.lastPrice ?? 0),
      changePct: Number(row.priceChangePercent ?? 0)
    }]));

  const balances = (account.balances ?? [])
    .map(balance => {
      const free = Number(balance.free);
      const locked = Number(balance.locked);
      const total = free + locked;
      const asset = balance.asset;
      const priceRow = asset === 'USDT'
        ? { price: 1, changePct: 0 }
        : tickerMap.get(`${asset}USDT`) ?? { price: 0, changePct: 0 };
      const priceUsdt = priceRow.price;
      const valueUsdt = total * priceUsdt;
      return {
        asset,
        free,
        locked,
        total,
        priceUsdt,
        valueUsdt,
        change24hPct: priceRow.changePct
      };
    })
    .filter(balance => balance.total > 0)
    .sort((left, right) => right.valueUsdt - left.valueUsdt || right.total - left.total || left.asset.localeCompare(right.asset));

  const totalValueUsdt = balances.reduce((sum, balance) => sum + balance.valueUsdt, 0);
  const previousValueUsdt = balances.reduce((sum, balance) => {
    if (!balance.priceUsdt || balance.change24hPct <= -100) return sum + balance.valueUsdt;
    return sum + (balance.valueUsdt / (1 + (balance.change24hPct / 100)));
  }, 0);
  const pnl24hUsdt = totalValueUsdt - previousValueUsdt;
  const pnl24hPct = previousValueUsdt > 0 ? (pnl24hUsdt / previousValueUsdt) * 100 : 0;
  let futuresTotalUsdt = 0;
  let futuresAvailableUsdt = 0;
  try {
    const futuresAccount = await signedBinanceRequest<{ totalWalletBalance?: string; availableBalance?: string }>(BINANCE_FUTURES_REST, '/fapi/v3/account', credentials.apiKey, credentials.secretKey);
    futuresTotalUsdt = Number(futuresAccount.totalWalletBalance ?? 0);
    futuresAvailableUsdt = Number(futuresAccount.availableBalance ?? futuresAccount.totalWalletBalance ?? 0);
  } catch {
    futuresTotalUsdt = 0;
    futuresAvailableUsdt = 0;
  }

  const payload = {
    ok: true,
    connected: true,
    updatedAt: Date.now(),
    assetCount: balances.length,
    totalValueUsdt,
    futuresTotalUsdt,
    futuresAvailableUsdt,
    pnl24hUsdt,
    pnl24hPct,
    balances
  };
  binanceWalletCache = { createdAt: Date.now(), payload };
  return payload;
}

function buildHomeTickerLeaders(source: Map<string, PriceTicker>) {
  const rows = [...source.values()]
    .filter(item => item.symbol.endsWith('USDT') && Number.isFinite(item.change24h) && item.quoteVolume > 0)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, 240);
  return {
    gainers: [...rows].sort((a, b) => b.change24h - a.change24h).slice(0, 6),
    losers: [...rows].sort((a, b) => a.change24h - b.change24h).slice(0, 6)
  };
}

function buildPricesBroadcastPayload() {
  return {
    spotTop: getFeaturedTickers(tickers),
    futuresTop: getFeaturedTickers(futuresTickers),
    spotGainers: buildHomeTickerLeaders(tickers).gainers,
    spotLosers: buildHomeTickerLeaders(tickers).losers,
    futuresGainers: buildHomeTickerLeaders(futuresTickers).gainers,
    futuresLosers: buildHomeTickerLeaders(futuresTickers).losers,
    spotTotal: tickers.size,
    futuresTotal: futuresTickers.size,
    updatedAt: Date.now()
  };
}

async function getHomeFearGreed() {
  if (homeFearGreedCache && Date.now() - homeFearGreedCache.createdAt < 15 * 60_000) return homeFearGreedCache.payload;
  if (homeFearGreedInflight) return homeFearGreedInflight;
  homeFearGreedInflight = (async () => {
    type FearGreedApi = { data?: { value?: string; value_classification?: string; timestamp?: string }[] };
    const data = await fetchJsonDirect<FearGreedApi>('https://api.alternative.me/fng/?limit=31');
    const rows = data.data ?? [];
    const first = rows[0];
    const yesterday = rows[1];
    const lastWeek = rows[7];
    const lastMonth = rows[30];
    const payload: HomeFearGreed = {
      value: Number(first?.value ?? 0),
      classification: String(first?.value_classification ?? 'Unknown'),
      timestamp: first?.timestamp ? Number(first.timestamp) * 1000 : null,
      yesterday: yesterday ? { value: Number(yesterday.value ?? 0), classification: String(yesterday.value_classification ?? 'Unknown') } : null,
      lastWeek: lastWeek ? { value: Number(lastWeek.value ?? 0), classification: String(lastWeek.value_classification ?? 'Unknown') } : null,
      lastMonth: lastMonth ? { value: Number(lastMonth.value ?? 0), classification: String(lastMonth.value_classification ?? 'Unknown') } : null,
      updatedAt: Date.now()
    };
    homeFearGreedCache = { createdAt: Date.now(), payload };
    homeFearGreedInflight = null;
    return payload;
  })().catch(error => {
    homeFearGreedInflight = null;
    if (homeFearGreedCache) return homeFearGreedCache.payload;
    throw error;
  });
  return homeFearGreedInflight;
}

async function getHomeMarketCapLeaders() {
  if (homeMarketCapCache && Date.now() - homeMarketCapCache.createdAt < 5 * 60_000) return homeMarketCapCache.payload;
  if (homeMarketCapInflight) return homeMarketCapInflight;
  homeMarketCapInflight = (async () => {
    type CoinGeckoCoin = {
      id: string;
      symbol: string;
      name: string;
      image: string;
      current_price: number;
      market_cap: number;
      market_cap_rank: number;
      price_change_percentage_24h: number;
    };
    const rows = await fetchJsonDirect<CoinGeckoCoin[]>('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=6&page=1&sparkline=false&price_change_percentage=24h');
    const payload = rows.map(row => ({
      id: row.id,
      symbol: row.symbol.toUpperCase(),
      name: row.name,
      image: row.image,
      currentPrice: Number(row.current_price ?? 0),
      marketCap: Number(row.market_cap ?? 0),
      marketCapRank: Number(row.market_cap_rank ?? 0),
      priceChange24h: Number(row.price_change_percentage_24h ?? 0)
    }));
    homeMarketCapCache = { createdAt: Date.now(), payload };
    homeMarketCapInflight = null;
    return payload;
  })().catch(error => {
    homeMarketCapInflight = null;
    if (homeMarketCapCache) return homeMarketCapCache.payload;
    throw error;
  });
  return homeMarketCapInflight;
}

async function getHomeCryptoNews() {
  if (homeNewsCache && Date.now() - homeNewsCache.createdAt < 90_000) return homeNewsCache.payload;
  if (homeNewsInflight) return homeNewsInflight;
  homeNewsInflight = (async () => {
    const decodeXml = (value: string) => value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const xml = await fetchTextDirect('https://www.coindesk.com/arc/outboundfeeds/rss/');
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8);
    const payload = items.map<HomeNewsRow>((match, index) => {
      const item = match[1];
      const title = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? 'Untitled';
      const url = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '#';
      const published = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '';
      return {
        id: `coindesk-${index}-${url}`,
        title: decodeXml(title.trim()),
        url: decodeXml(url.trim()),
        publishedAt: published ? Date.parse(published) : null,
        source: 'CoinDesk',
        currencies: []
      };
    });
    homeNewsCache = { createdAt: Date.now(), payload };
    homeNewsInflight = null;
    return payload;
  })().catch(error => {
    homeNewsInflight = null;
    if (homeNewsCache) return homeNewsCache.payload;
    throw error;
  });
  return homeNewsInflight;
}

async function getHomeExecutionIntel() {
  if (homeExecutionIntelCache && Date.now() - homeExecutionIntelCache.createdAt < 60_000) return homeExecutionIntelCache.payload;
  if (homeExecutionIntelInflight) return homeExecutionIntelInflight;
  homeExecutionIntelInflight = (async () => {
    const glassnodeKey = (process.env.GLASSNODE_API_KEY ?? '').trim();
    const [globalResult, premiumResult, oiResult, klineResult, stablecoinResult] = await Promise.allSettled([
      fetchJsonDirect<{ data?: { market_cap_percentage?: { btc?: number } } }>('https://api.coingecko.com/api/v3/global'),
      fetchJsonDirect<{ lastFundingRate?: string; nextFundingTime?: number; markPrice?: string }>('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
      fetchJsonDirect<{ openInterest?: string }>('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      fetchJsonDirect<[number, string, string, string, string, string, string, string, string, string, string, string][]>(
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=25'
      ),
      glassnodeKey
        ? fetchJsonDirect<{ t?: number; v?: number }[]>(
          `https://api.glassnode.com/v1/metrics/transactions/transfers_volume_exchanges_net?a=USDT&i=24h&api_key=${encodeURIComponent(glassnodeKey)}`
        )
        : Promise.resolve([])
    ]);

    const btcDominance = globalResult.status === 'fulfilled'
      ? Number(globalResult.value.data?.market_cap_percentage?.btc ?? 0)
      : null;

    const fundingRate = premiumResult.status === 'fulfilled'
      ? Number(premiumResult.value.lastFundingRate ?? 0)
      : null;
    const nextFundingTime = premiumResult.status === 'fulfilled'
      ? Number(premiumResult.value.nextFundingTime ?? 0) || null
      : null;
    const markPrice = premiumResult.status === 'fulfilled'
      ? Number(premiumResult.value.markPrice ?? futuresTickers.get('BTCUSDT')?.price ?? 0)
      : Number(futuresTickers.get('BTCUSDT')?.price ?? 0);

    const openInterest = oiResult.status === 'fulfilled'
      ? Number(oiResult.value.openInterest ?? 0)
      : null;
    const openInterestUsd = openInterest && markPrice ? openInterest * markPrice : null;

    let volumeSurgeRatio: number | null = null;
    let volumeSurgeLabel = 'Normal';
    if (klineResult.status === 'fulfilled' && klineResult.value.length >= 2) {
      const rows = klineResult.value;
      const latestVolume = Number(rows[rows.length - 1]?.[5] ?? 0);
      const baselineRows = rows.slice(0, -1);
      const baselineAvg = baselineRows.reduce((sum, row) => sum + Number(row[5] ?? 0), 0) / Math.max(1, baselineRows.length);
      volumeSurgeRatio = baselineAvg > 0 ? latestVolume / baselineAvg : null;
      volumeSurgeLabel = volumeSurgeRatio == null
        ? 'Unavailable'
        : volumeSurgeRatio >= 2 ? 'High Surge'
          : volumeSurgeRatio >= 1.25 ? 'Elevated'
            : volumeSurgeRatio >= 0.8 ? 'Normal'
              : 'Cooling';
    }

    const breadthRows = [...tickers.values()].filter(row => row.symbol.endsWith('USDT') && row.quoteVolume > 0);
    const advancers = breadthRows.filter(row => row.change24h > 0).length;
    const decliners = breadthRows.filter(row => row.change24h < 0).length;
    const positiveRatio = breadthRows.length ? advancers / breadthRows.length : 0;

    let stablecoinFlow: HomeExecutionIntel['stablecoinFlow'];
    if (glassnodeKey && stablecoinResult.status === 'fulfilled' && Array.isArray(stablecoinResult.value) && stablecoinResult.value.length) {
      const latest = stablecoinResult.value[stablecoinResult.value.length - 1];
      stablecoinFlow = {
        source: 'glassnode',
        available: true,
        label: Number(latest.v ?? 0) >= 0 ? 'Net Exchange Inflow' : 'Net Exchange Outflow',
        valueUsd: Number(latest.v ?? 0),
        updatedAt: typeof latest.t === 'number' ? latest.t * 1000 : null
      };
    } else {
      type StablecoinCoin = {
        id: string;
        market_cap_change_24h?: number;
        last_updated?: string;
      };
      try {
        const stableRows = await fetchJsonDirect<StablecoinCoin[]>(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tether%2Cusd-coin%2Cdai%2Cethena-usde%2Cfirst-digital-usd%2Ctrue-usd&order=market_cap_desc&per_page=6&page=1&sparkline=false&price_change_percentage=24h'
        );
        const proxyValue = stableRows.reduce((sum, row) => sum + Number(row.market_cap_change_24h ?? 0), 0);
        const latestUpdatedAt = stableRows
          .map(row => row.last_updated ? Date.parse(row.last_updated) : 0)
          .filter(Boolean)
          .sort((a, b) => b - a)[0] ?? null;
        stablecoinFlow = {
          source: 'coingecko-proxy',
          available: true,
          label: proxyValue >= 0 ? 'Stablecoin expansion proxy' : 'Stablecoin contraction proxy',
          valueUsd: proxyValue,
          updatedAt: latestUpdatedAt
        };
      } catch {
        stablecoinFlow = {
          source: 'coingecko-proxy',
          available: false,
          label: 'Unavailable',
          valueUsd: null,
          updatedAt: null
        };
      }
    }

    const payload: HomeExecutionIntel = {
      btcDominance,
      fundingRate,
      nextFundingTime,
      openInterest,
      openInterestUsd,
      volumeSurgeRatio,
      volumeSurgeLabel,
      marketBreadth: {
        advancers,
        decliners,
        positiveRatio
      },
      stablecoinFlow
    };
    homeExecutionIntelCache = { createdAt: Date.now(), payload };
    homeExecutionIntelInflight = null;
    return payload;
  })().catch(error => {
    homeExecutionIntelInflight = null;
    if (homeExecutionIntelCache) return homeExecutionIntelCache.payload;
    throw error;
  });
  return homeExecutionIntelInflight;
}

async function signedBinanceMutableRequest<T>(baseUrl: string, route: string, apiKey: string, secretKey: string, params: Record<string, string>) {
  const search = new URLSearchParams({
    ...params,
    timestamp: String(Date.now()),
    recvWindow: '5000'
  });
  search.set('signature', signBinanceParams(secretKey, search));
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: search.toString()
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { msg?: string } | null;
    throw new Error(payload?.msg || `Binance mutable request failed (${response.status})`);
  }
  return response.json().catch(() => ({} as T)) as Promise<T>;
}

function buildLiveExecutionRulesPatch(input: Partial<LiveExecutionRules>): LiveExecutionRules {
  return {
    venueMode: (input.venueMode === 'futures' ? 'futures' : 'spot') as TradingVenue,
    executionMode: input.executionMode === 'live' ? 'live' : 'test',
    killSwitch: input.killSwitch !== false,
    ruleToggles: {
      tradingVenue: input.ruleToggles?.tradingVenue !== false,
      allowedDirection: input.ruleToggles?.allowedDirection !== false,
      executionSource: input.ruleToggles?.executionSource !== false,
      openTradeLimit: input.ruleToggles?.openTradeLimit !== false,
      minRiskReward: input.ruleToggles?.minRiskReward !== false,
      cashReserve: input.ruleToggles?.cashReserve !== false,
      riskPerTrade: input.ruleToggles?.riskPerTrade !== false,
      dailyLoss: input.ruleToggles?.dailyLoss !== false
    },
    riskPerTrade: Math.max(0.1, Math.min(10, toFiniteNumber(input.riskPerTrade, liveExecutionRules.riskPerTrade))),
    maxTrades: Math.max(1, Math.min(999, Math.floor(toFiniteNumber(input.maxTrades, liveExecutionRules.maxTrades)))),
    dailyLoss: Math.max(0, Math.min(30, toFiniteNumber(input.dailyLoss, liveExecutionRules.dailyLoss))),
    reserveRatio: Math.max(0, Math.min(95, toFiniteNumber(input.reserveRatio, liveExecutionRules.reserveRatio))),
    executionSource: input.executionSource === 'top-2' || input.executionSource === 'top-4' || input.executionSource === 'custom' ? input.executionSource : 'best-single' as const,
    allocationMethod: 'equal' as const,
    minRiskReward: input.minRiskReward === '1:1' || input.minRiskReward === '1:3' || input.minRiskReward === '1:4' || input.minRiskReward === 'custom' ? input.minRiskReward : '1:2' as const,
    customRiskReward: String(input.customRiskReward ?? liveExecutionRules.customRiskReward ?? '1:2'),
    allowedDirection: input.allowedDirection === 'both' || input.allowedDirection === 'short-only' ? input.allowedDirection : 'long-only' as const,
    futuresLeverage: Math.max(1, Math.min(20, Math.floor(toFiniteNumber(input.futuresLeverage, liveExecutionRules.futuresLeverage)))),
    futuresMarginMode: (input.futuresMarginMode === 'cross' ? 'cross' : 'isolated') as 'isolated' | 'cross',
    breakEvenEnabled: input.breakEvenEnabled !== false,
    breakEvenTriggerPct: Math.max(0.1, Math.min(50, toFiniteNumber(input.breakEvenTriggerPct, liveExecutionRules.breakEvenTriggerPct))),
    trailingStopEnabled: input.trailingStopEnabled !== false,
    trailingGapPct: Math.max(0.1, Math.min(20, toFiniteNumber(input.trailingGapPct, liveExecutionRules.trailingGapPct))),
    portfolioFloorEnabled: input.portfolioFloorEnabled !== false,
    portfolioFloorTriggerPct: Math.max(0.1, Math.min(200, toFiniteNumber(input.portfolioFloorTriggerPct, liveExecutionRules.portfolioFloorTriggerPct))),
    portfolioFloorLockPct: Math.max(0, Math.min(200, toFiniteNumber(input.portfolioFloorLockPct, liveExecutionRules.portfolioFloorLockPct)))
  };
}

function getRankedStrategyIds() {
  return getStats()
    .map(stat => ({
      strategyId: stat.strategyId,
      score: stat.wins * 3 - stat.losses * 2 + stat.winRate * 0.2 + stat.live * 0.1,
      count: stat.total
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.strategyId.localeCompare(b.strategyId))
    .map(item => item.strategyId);
}

function getSymbolRules(symbol: string, market: TradingVenue) {
  const source = market === 'futures' ? futuresSymbols : symbols;
  return source.find(item => item.symbol === symbol) ?? null;
}

function decimalPlacesFromStep(stepSize?: number, quantityPrecision?: number) {
  if (typeof quantityPrecision === 'number' && Number.isFinite(quantityPrecision)) {
    return Math.max(0, Math.min(12, Math.floor(quantityPrecision)));
  }
  if (!stepSize || !Number.isFinite(stepSize) || stepSize <= 0) return 8;
  const step = stepSize.toString();
  if (step.includes('e-')) return Math.max(0, Math.min(12, Number(step.split('e-')[1]) || 8));
  const decimals = step.includes('.') ? step.split('.')[1].replace(/0+$/, '').length : 0;
  return Math.max(0, Math.min(12, decimals));
}

function formatBinanceQuantity(quantity: number, rules: SymbolInfo | null) {
  const stepSize = rules?.stepSize && rules.stepSize > 0 ? rules.stepSize : 0.001;
  const minQty = rules?.minQty && rules.minQty > 0 ? rules.minQty : stepSize;
  const precision = decimalPlacesFromStep(stepSize, rules?.quantityPrecision);
  const steppedQuantity = Math.floor((quantity + Number.EPSILON) / stepSize) * stepSize;
  const normalizedQuantity = Number(steppedQuantity.toFixed(precision));
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    throw new Error('Calculated Binance quantity is invalid.');
  }
  if (normalizedQuantity < minQty) {
    throw new Error(`Binance Min Qty ${minQty}`);
  }
  return {
    quantity: normalizedQuantity,
    formatted: normalizedQuantity.toFixed(precision).replace(/\.?0+$/, '')
  };
}

function buildFuturesOrderQuantity(signal: TradeSignal, orderNotional: number) {
  const rules = getSymbolRules(signal.symbol, 'futures');
  const rawQuantity = Math.max(0, orderNotional / Math.max(signal.entry, 0.00000001));
  const normalized = formatBinanceQuantity(rawQuantity, rules);
  if (rules?.minNotional && normalized.quantity * signal.entry < rules.minNotional) {
    throw new Error(`Binance Min Notional ${rules.minNotional.toFixed(2)} USDT`);
  }
  return normalized.formatted;
}

function buildFuturesCloseQuantity(position: BinanceFuturesPosition) {
  const symbol = String(position.symbol ?? '');
  const rawQuantity = Math.abs(Number(position.positionAmt ?? 0));
  const normalized = formatBinanceQuantity(rawQuantity, getSymbolRules(symbol, 'futures'));
  return normalized.formatted;
}

function positionKey(symbol: string, side: Side) {
  return `${symbol}:${side}`;
}

async function readOpenFuturesPositions() {
  const credentials = decryptSecret();
  if (!credentials || !binanceVaultState.connected) return new Map<string, BinanceFuturesPosition>();
  const rows = await signedBinanceRequest<BinanceFuturesPosition[]>(BINANCE_FUTURES_REST, '/fapi/v3/positionRisk', credentials.apiKey, credentials.secretKey);
  const positions = new Map<string, BinanceFuturesPosition>();
  for (const row of rows) {
    const symbol = String(row.symbol ?? '');
    const amount = Number(row.positionAmt ?? 0);
    if (!symbol || !Number.isFinite(amount) || amount === 0) continue;
    const positionSide = String(row.positionSide ?? '').toUpperCase();
    const side: Side = positionSide === 'LONG' || positionSide === 'SHORT'
      ? positionSide as Side
      : amount > 0 ? 'LONG' : 'SHORT';
    positions.set(positionKey(symbol, side), row);
  }
  return positions;
}

function getFuturesPositionMetrics(signal: TradeSignal, positions: Map<string, BinanceFuturesPosition>) {
  if (signal.market !== 'futures') return null;
  const position = positions.get(positionKey(signal.symbol, signal.side));
  if (!position) return null;
  const entry = Number(position.entryPrice ?? 0);
  const breakEven = Number(position.breakEvenPrice ?? 0);
  const markPrice = Number(position.markPrice ?? 0);
  const pnlUsdt = Number(position.unRealizedProfit ?? position.unrealizedProfit ?? 0);
  const liquidationPrice = Number(position.liquidationPrice ?? 0);
  const leverage = Math.max(1, Number(position.leverage ?? signal.executionLeverage ?? liveExecutionRules.futuresLeverage) || 1);
  const initialMargin = Number(position.initialMargin ?? position.positionInitialMargin ?? 0);
  const isolatedMargin = Number(position.isolatedMargin ?? 0);
  const signedNotional = Number(position.notional ?? 0);
  const notional = Math.abs(signedNotional);
  const marginBase = initialMargin > 0 ? initialMargin : isolatedMargin > 0 ? isolatedMargin : notional > 0 ? notional / leverage : 0;
  const roiPct = marginBase > 0 ? (pnlUsdt / marginBase) * 100 : 0;
  return {
    entry: breakEven > 0 ? breakEven : entry,
    marketPrice: markPrice > 0 ? markPrice : null,
    liquidationPrice: liquidationPrice > 0 ? liquidationPrice : null,
    pnlUsdt,
    roiPct,
    leverage,
    notional,
    signedNotional,
    marginBase
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readBinanceClosedFuturesPnl(signal: TradeSignal, closeOrderId: string, marginBase: number | null) {
  const credentials = decryptSecret();
  if (!credentials || !binanceVaultState.connected || !closeOrderId) return null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await delay(500);
    const trades = await signedBinanceRequest<BinanceFuturesTrade[]>(
      BINANCE_FUTURES_REST,
      '/fapi/v1/userTrades',
      credentials.apiKey,
      credentials.secretKey,
      {
        symbol: signal.symbol,
        orderId: closeOrderId,
        limit: '1000'
      }
    ).catch(() => []);
    const realizedPnl = trades.reduce((sum, trade) => {
      const value = Number(trade.realizedPnl ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    if (trades.length > 0 || attempt === 5) {
      const roiPct = marginBase && marginBase > 0 ? (realizedPnl / marginBase) * 100 : null;
      return {
        realizedPnl,
        roiPct,
        readAt: Date.now(),
        source: `Binance userTrades order ${closeOrderId}`,
        tradeCount: trades.length
      };
    }
  }
  return null;
}

function applyBinanceClosedPnl(signal: TradeSignal, reading: Awaited<ReturnType<typeof readBinanceClosedFuturesPnl>>) {
  if (!reading) return;
  signal.binanceRealizedPnlUsdt = reading.realizedPnl;
  signal.binanceRoiPct = reading.roiPct ?? undefined;
  signal.binancePnlReadAt = reading.readAt;
  signal.binancePnlSource = reading.source;
  if (reading.realizedPnl > 0) signal.status = 'WIN';
  if (reading.realizedPnl < 0) signal.status = 'LOSS';
  signal.executionNotes = Array.from(new Set([
    ...(signal.executionNotes ?? []),
    `Binance PnL read: ${reading.realizedPnl >= 0 ? '+' : ''}${reading.realizedPnl.toFixed(4)} USDT`
  ]));
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function signalOpenPnlPct(signal: TradeSignal, price: number) {
  return Number.isFinite(price) && price > 0 ? percent(signal.entry, price, signal.side) : 0;
}

function signalOpenR(signal: TradeSignal, price: number) {
  const risk = Math.max(Math.abs(signal.riskPct), 0.0001);
  return signalOpenPnlPct(signal, price) / risk;
}

function dynamicBreakEvenTriggerR(signal: TradeSignal) {
  const risk = Math.max(Math.abs(signal.riskPct), 0.0001);
  const reward = Math.max(Math.abs(signal.expectedProfitPct), risk);
  const rewardQuality = reward / (reward + risk);
  return clampNumber(rewardQuality, 0.55, 1);
}

function breakEvenStopPrice(signal: TradeSignal, entry: number) {
  const feeBufferPct = 0.06;
  return signal.side === 'LONG'
    ? entry * (1 + feeBufferPct / 100)
    : entry * (1 - feeBufferPct / 100);
}

function dynamicTrailingGapPct(signal: TradeSignal, price: number) {
  const ticker = futuresTickers.get(signal.symbol);
  const risk = Math.max(Math.abs(signal.riskPct), 0.0001);
  const reward = Math.max(Math.abs(signal.expectedProfitPct), risk);
  const volatilityAllowance = ticker ? Math.abs(ticker.change24h) * 0.035 : 0;
  const baseGap = Math.max(risk * 0.65, reward * 0.18, volatilityAllowance);
  const progressR = signalOpenR(signal, price);
  const relaxedGap = progressR < 1.5 ? Math.max(baseGap, risk * 0.85) : baseGap;
  const maturedGap = progressR >= 3 ? relaxedGap * 0.75 : progressR >= 2 ? relaxedGap * 0.88 : relaxedGap;
  return clampNumber(maturedGap, risk * 0.35, reward * 0.65);
}

function getDynamicPortfolioFloor(active: { signal: TradeSignal; metrics: NonNullable<ReturnType<typeof getFuturesPositionMetrics>> }[]) {
  const weighted = active.reduce((acc, item) => {
    const price = item.metrics.marketPrice ?? 0;
    const weight = Math.max(item.metrics.marginBase, item.metrics.notional, 0);
    const openR = signalOpenR(item.signal, price);
    return {
      weightedR: acc.weightedR + openR * weight,
      weight: acc.weight + weight
    };
  }, { weightedR: 0, weight: 0 });
  const portfolioR = weighted.weight > 0 ? weighted.weightedR / weighted.weight : 0;
  const armR = active.length >= 2 ? 1 : dynamicBreakEvenTriggerR(active[0].signal) + 0.35;
  const givebackRatio = portfolioFloorPeakR >= 2.5 ? 0.68 : portfolioFloorPeakR >= 1.5 ? 0.58 : 0.45;
  const floorR = Math.max(0.35, portfolioFloorPeakR * givebackRatio);
  return { portfolioR, armR, floorR };
}

async function closeFuturesPosition(signal: TradeSignal, position: BinanceFuturesPosition, reason: string) {
  const credentials = decryptSecret();
  if (!credentials) throw new Error('Missing Binance credentials.');
  const amount = Number(position.positionAmt ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return false;
  const metrics = getFuturesPositionMetrics(signal, new Map([[positionKey(signal.symbol, signal.side), position]]));
  const positionSide = String(position.positionSide ?? '').toUpperCase();
  const params: Record<string, string> = {
    symbol: signal.symbol,
    side: amount > 0 ? 'SELL' : 'BUY',
    type: 'MARKET',
    quantity: buildFuturesCloseQuantity(position)
  };
  if (positionSide === 'LONG' || positionSide === 'SHORT') {
    params.positionSide = positionSide;
  } else {
    params.reduceOnly = 'true';
  }
  const closeOrder = await signedBinanceMutableRequest<{ orderId?: number | string }>(BINANCE_FUTURES_REST, '/fapi/v1/order', credentials.apiKey, credentials.secretKey, params);
  const closeOrderId = closeOrder.orderId != null ? String(closeOrder.orderId) : '';
  signal.status = signal.status === 'OPEN'
    ? reason.toLowerCase().includes('stop') ? 'LOSS' : 'WIN'
    : signal.status;
  signal.closedAt = Date.now();
  signal.closePrice = Number(position.markPrice ?? 0) || signal.closePrice;
  signal.binanceCloseOrderId = closeOrderId || signal.binanceCloseOrderId;
  applyBinanceClosedPnl(signal, await readBinanceClosedFuturesPnl(signal, closeOrderId, metrics?.marginBase ?? null));
  signal.executionNotes = Array.from(new Set([...(signal.executionNotes ?? []), `Binance protection closed: ${reason}`]));
  invalidateComputedCaches();
  saveState();
  broadcast('signalClosed', signal);
  const payload = buildSignalCloseNotificationPayload(signal, reason);
  void notify(payload.title, payload.message, payload.level);
  void deliverPrivateTelegramSignalClose(signal, reason);
  return true;
}

async function closeRawFuturesPosition(position: BinanceFuturesPosition) {
  const credentials = decryptSecret();
  if (!credentials) throw new Error('Missing Binance credentials.');
  if (!binanceVaultState.connected) throw new Error('Binance connection is not verified.');
  const symbol = String(position.symbol ?? '');
  const amount = Number(position.positionAmt ?? 0);
  if (!symbol || !Number.isFinite(amount) || amount === 0) return false;
  const positionSide = String(position.positionSide ?? '').toUpperCase();
  const params: Record<string, string> = {
    symbol,
    side: amount > 0 ? 'SELL' : 'BUY',
    type: 'MARKET',
    quantity: buildFuturesCloseQuantity(position)
  };
  if (positionSide === 'LONG' || positionSide === 'SHORT') {
    params.positionSide = positionSide;
  } else {
    params.reduceOnly = 'true';
  }
  const closeOrder = await signedBinanceMutableRequest<{ orderId?: number | string }>(BINANCE_FUTURES_REST, '/fapi/v1/order', credentials.apiKey, credentials.secretKey, params);
  return { closed: true, closeOrderId: closeOrder.orderId != null ? String(closeOrder.orderId) : '' };
}

async function closeAllOpenFuturesPositions(reason: string) {
  const positions = await readOpenFuturesPositions();
  const closed: string[] = [];
  const failed: { symbol: string; message: string }[] = [];
  for (const [key, position] of positions) {
    const symbol = String(position.symbol ?? key);
    try {
      const closeResult = await closeRawFuturesPosition(position);
      if (!closeResult) continue;
      closed.push(key);
      const amount = Number(position.positionAmt ?? 0);
      const side: Side = amount > 0 ? 'LONG' : 'SHORT';
      const signal = signals.find(item =>
        item.market === 'futures'
        && item.executionStatus === 'live_accepted'
        && item.status === 'OPEN'
        && item.symbol === symbol
        && item.side === side
      );
      if (signal) {
        const metrics = getFuturesPositionMetrics(signal, new Map([[positionKey(signal.symbol, signal.side), position]]));
        signal.status = reason.toLowerCase().includes('kill') ? 'LOSS' : signalOpenPnlPct(signal, Number(position.markPrice ?? 0)) >= 0 ? 'WIN' : 'LOSS';
        signal.closedAt = Date.now();
        signal.closePrice = Number(position.markPrice ?? 0) || signal.closePrice;
        signal.binanceCloseOrderId = closeResult.closeOrderId || signal.binanceCloseOrderId;
        applyBinanceClosedPnl(signal, await readBinanceClosedFuturesPnl(signal, closeResult.closeOrderId, metrics?.marginBase ?? null));
        signal.executionNotes = Array.from(new Set([...(signal.executionNotes ?? []), `Binance manual close: ${reason}`]));
        const payload = buildSignalCloseNotificationPayload(signal, reason);
        void notify(payload.title, payload.message, payload.level);
        void deliverPrivateTelegramSignalClose(signal, reason);
      }
    } catch (error) {
      failed.push({ symbol, message: error instanceof Error ? error.message : 'Close order failed.' });
    }
  }
  if (closed.length > 0) {
    invalidateComputedCaches();
    saveState();
    broadcast('dashboard', getDashboardPayload());
  }
  return { closed, failed };
}

async function monitorLiveFuturesProtection() {
  if (liveProtectionBusy) return;
  if (!binanceVaultState.connected || liveExecutionRules.executionMode !== 'live') return;
  const liveSignals = signals.filter(signal => signal.market === 'futures' && signal.executionStatus === 'live_accepted' && signal.status === 'OPEN');
  if (liveSignals.length === 0) {
    portfolioFloorArmed = false;
    portfolioFloorPeakR = 0;
    return;
  }
  liveProtectionBusy = true;
  try {
    const positions = await readOpenFuturesPositions();
    const active = liveSignals
      .map(signal => ({ signal, position: positions.get(positionKey(signal.symbol, signal.side)), metrics: getFuturesPositionMetrics(signal, positions) }))
      .filter((item): item is { signal: TradeSignal; position: BinanceFuturesPosition; metrics: NonNullable<ReturnType<typeof getFuturesPositionMetrics>> } => Boolean(item.position && item.metrics?.marketPrice));

    if (active.length === 0) return;

    if (liveExecutionRules.killSwitch) {
      for (const item of active) {
        await closeFuturesPosition(item.signal, item.position, 'Kill Switch emergency close');
      }
      portfolioFloorArmed = false;
      portfolioFloorPeakR = 0;
      return;
    }

    if (liveExecutionRules.portfolioFloorEnabled) {
      const portfolioFloor = getDynamicPortfolioFloor(active);
      if (portfolioFloor.portfolioR >= portfolioFloor.armR) {
        portfolioFloorArmed = true;
        portfolioFloorPeakR = Math.max(portfolioFloorPeakR, portfolioFloor.portfolioR);
      }
      if (portfolioFloorArmed && portfolioFloor.portfolioR <= portfolioFloor.floorR) {
        for (const item of active) {
          await closeFuturesPosition(item.signal, item.position, `Dynamic portfolio floor ${portfolioFloor.portfolioR.toFixed(2)}R`);
        }
        portfolioFloorArmed = false;
        portfolioFloorPeakR = 0;
        return;
      }
    }

    for (const { signal, position, metrics } of active) {
      const price = metrics.marketPrice ?? 0;
      const hitStop = signal.side === 'LONG' ? price <= signal.stopLoss : price >= signal.stopLoss;
      if (hitStop) {
        await closeFuturesPosition(signal, position, 'Stop Loss');
        continue;
      }

      const openR = signalOpenR(signal, price);
      if (liveExecutionRules.breakEvenEnabled && openR >= dynamicBreakEvenTriggerR(signal) && !signal.profitProtectionArmedAt) {
        signal.profitProtectionArmedAt = Date.now();
        signal.trailingStop = breakEvenStopPrice(signal, metrics.entry);
        signal.extremePrice = price;
        saveState();
      }

      const hitTarget = signal.side === 'LONG' ? price >= signal.takeProfit : price <= signal.takeProfit;
      if (hitTarget && !liveExecutionRules.trailingStopEnabled) {
        await closeFuturesPosition(signal, position, 'Take Profit');
        continue;
      }
      if (hitTarget && liveExecutionRules.trailingStopEnabled && !signal.profitProtectionArmedAt) {
        signal.profitProtectionArmedAt = Date.now();
        signal.trailingStop = breakEvenStopPrice(signal, metrics.entry);
        signal.extremePrice = price;
      }

      if (!signal.profitProtectionArmedAt) continue;
      signal.extremePrice = signal.side === 'LONG'
        ? Math.max(signal.extremePrice ?? price, price)
        : Math.min(signal.extremePrice ?? price, price);
      const gap = liveExecutionRules.trailingStopEnabled ? dynamicTrailingGapPct(signal, price) : 0;
      const proposedStop = signal.side === 'LONG'
        ? Math.max(breakEvenStopPrice(signal, metrics.entry), (signal.extremePrice ?? price) * (1 - gap / 100))
        : Math.min(breakEvenStopPrice(signal, metrics.entry), (signal.extremePrice ?? price) * (1 + gap / 100));
      signal.trailingStop = typeof signal.trailingStop === 'number'
        ? signal.side === 'LONG' ? Math.max(signal.trailingStop, proposedStop) : Math.min(signal.trailingStop, proposedStop)
        : proposedStop;
      const hitProtectedStop = signal.side === 'LONG' ? price <= signal.trailingStop : price >= signal.trailingStop;
      saveState();
      if (hitProtectedStop) {
        await closeFuturesPosition(signal, position, liveExecutionRules.trailingStopEnabled ? 'Trailing Stop' : 'Break-even Lock');
      }
    }
  } catch (error) {
    console.error('[live-protection] monitor failed:', error);
  } finally {
    liveProtectionBusy = false;
  }
}

function normalizeBrokerFailureMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('margin is insufficient')) return 'Insufficient Futures Margin';
  if (lower.includes('position risk control') || lower.includes('reduce-only')) return 'Binance Symbol Risk Control';
  if (lower.includes('precision is over')) return 'Binance Quantity Precision';
  return message;
}

function rememberBrokerRiskControl(symbol: string, message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('position risk control') || lower.includes('reduce-only')) {
    futuresRiskControlCooldown.set(symbol, Date.now() + 6 * 60 * 60 * 1000);
  }
}

async function evaluateExecutionCandidate(signal: TradeSignal) {
  const rules = liveExecutionRules;
  const isTestMode = rules.executionMode === 'test';
  const failedRules: string[] = [];
  const riskControlUntil = futuresRiskControlCooldown.get(signal.symbol) ?? 0;
  if (signal.market === 'futures' && riskControlUntil > Date.now()) failedRules.push('Binance Symbol Risk Control');
  if (riskControlUntil && riskControlUntil <= Date.now()) futuresRiskControlCooldown.delete(signal.symbol);
  if (rules.killSwitch) failedRules.push('Kill Switch');
  if (rules.ruleToggles.tradingVenue && signal.market !== rules.venueMode) failedRules.push('Trading Venue');
  if (rules.ruleToggles.allowedDirection && rules.allowedDirection === 'long-only' && signal.side !== 'LONG') failedRules.push('Allowed Direction');
  if (rules.ruleToggles.allowedDirection && rules.allowedDirection === 'short-only' && signal.side !== 'SHORT') failedRules.push('Allowed Direction');
  const rankedStrategyIds = getRankedStrategyIds();
  const allowedStrategyIds = rules.executionSource === 'best-single'
    ? new Set(rankedStrategyIds.slice(0, 1))
    : rules.executionSource === 'top-2'
      ? new Set(rankedStrategyIds.slice(0, 2))
      : rules.executionSource === 'top-4'
        ? new Set(selectedStrategies)
        : new Set(selectedStrategies);
  if (rules.ruleToggles.executionSource && allowedStrategyIds.size > 0 && !allowedStrategyIds.has(signal.strategyId)) failedRules.push('Execution Source');
  const openSignals = signals.filter(item =>
    item.status === 'OPEN'
    && item.market === signal.market
    && countsAsOpenExecution(item.executionStatus)
  );
  if (openSignals.some(item => item.symbol === signal.symbol)) failedRules.push('Symbol Already Open');
  const unlimitedOpenTrades = rules.maxTrades >= 999;
  if (rules.ruleToggles.openTradeLimit && !unlimitedOpenTrades && openSignals.length >= rules.maxTrades) failedRules.push('Open Trade Limit');
  const rewardMultiple = signal.riskPct > 0 ? signal.expectedProfitPct / signal.riskPct : Infinity;
  if (rules.ruleToggles.minRiskReward && rewardMultiple < getRiskRewardMultiplier(rules.minRiskReward, rules.customRiskReward)) failedRules.push('Minimum Risk/Reward');
  const symbolRules = getSymbolRules(signal.symbol, signal.market);
  let wallet: BinanceWalletSummary = { ok: false, connected: false, updatedAt: null, assetCount: 0, totalValueUsdt: 0, futuresTotalUsdt: 0, futuresAvailableUsdt: 0, pnl24hUsdt: 0, pnl24hPct: 0, balances: [] };
  let capital = 0;
  let availableCapital = 0;
  let orderNotional = 0;
  if (!isTestMode) {
    wallet = await readBinanceWalletSummary();
    const leverage = signal.market === 'futures'
      ? Math.max(1, Math.min(20, Math.floor(rules.futuresLeverage)))
      : 1;
    const executableCapital = signal.market === 'spot'
      ? wallet.totalValueUsdt
      : wallet.futuresAvailableUsdt * leverage;
    capital = signal.market === 'spot' ? wallet.totalValueUsdt : wallet.futuresTotalUsdt;
    availableCapital = Math.max(0, executableCapital * (1 - rules.reserveRatio / 100) * 0.96);
    if (rules.ruleToggles.cashReserve && availableCapital <= 0) failedRules.push('Cash Reserve %');
    const liveSlotCount = unlimitedOpenTrades
      ? Math.max(1, openSignals.length + 1)
      : Math.max(1, rules.maxTrades - openSignals.length);
    const riskSizedNotional = signal.riskPct > 0 ? (capital * (rules.riskPerTrade / 100)) / (signal.riskPct / 100) : availableCapital / liveSlotCount;
    const slotNotional = availableCapital / liveSlotCount;
    orderNotional = Math.max(0, Math.min(availableCapital, rules.allocationMethod === 'equal' ? slotNotional : riskSizedNotional));
    if (rules.ruleToggles.riskPerTrade && !(orderNotional > 0)) failedRules.push('Risk Per Trade %');
  }
  if (isTestMode) {
    const exchangeFloor = symbolRules?.minNotional ?? (signal.market === 'futures' ? 10 : 5);
    const quantityFloor = signal.market === 'futures'
      ? Math.max(signal.entry * Math.max(symbolRules?.minQty ?? 0.001, 0.001), exchangeFloor)
      : exchangeFloor;
    orderNotional = Math.max(orderNotional, quantityFloor);
  }
  if (!isTestMode && symbolRules?.minNotional && orderNotional < symbolRules.minNotional) failedRules.push(`Binance Min Notional ${symbolRules.minNotional.toFixed(2)} USDT`);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const closedToday = signals.filter(item =>
    item.market === signal.market
    && item.status !== 'OPEN'
    && countsAsOpenExecution(item.executionStatus)
    && (item.closedAt ?? item.openedAt) >= todayStart.getTime()
  );
  const dailyPnlPct = closedToday.reduce((sum, item) => {
    if (typeof item.closePrice !== 'number') return sum;
    return sum + percent(item.entry, item.closePrice, item.side);
  }, 0);
  if (rules.ruleToggles.dailyLoss && rules.dailyLoss > 0 && dailyPnlPct <= -Math.abs(rules.dailyLoss)) failedRules.push('Daily Loss Limit %');
  return { failedRules: Array.from(new Set(failedRules)), orderNotional, wallet };
}

async function submitBinanceTestOrder(signal: TradeSignal, orderNotional: number) {
  const credentials = decryptSecret();
  if (!credentials) throw new Error('Missing Binance credentials.');
  if (!binanceVaultState.connected) throw new Error('Binance connection is not verified.');
  if (signal.market === 'spot') {
    if (signal.side !== 'LONG') throw new Error('Spot execution only supports LONG signals.');
    await signedBinanceMutableRequest(BINANCE_REST, '/api/v3/order/test', credentials.apiKey, credentials.secretKey, {
      symbol: signal.symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: orderNotional.toFixed(2)
    });
    return;
  }
  await signedBinanceMutableRequest(BINANCE_FUTURES_REST, '/fapi/v1/order/test', credentials.apiKey, credentials.secretKey, {
    symbol: signal.symbol,
    side: signal.side === 'LONG' ? 'BUY' : 'SELL',
    type: 'MARKET',
    quantity: buildFuturesOrderQuantity(signal, orderNotional)
  });
}

async function applyFuturesAccountSettings(signal: TradeSignal) {
  const credentials = decryptSecret();
  if (!credentials) throw new Error('Missing Binance credentials.');
  if (signal.market !== 'futures') return;
  const leverage = Math.max(1, Math.min(20, Math.floor(liveExecutionRules.futuresLeverage)));
  const marginType = liveExecutionRules.futuresMarginMode === 'cross' ? 'CROSSED' : 'ISOLATED';
  try {
    await signedBinanceMutableRequest(BINANCE_FUTURES_REST, '/fapi/v1/marginType', credentials.apiKey, credentials.secretKey, {
      symbol: signal.symbol,
      marginType
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (!message.includes('no need to change margin type')) throw error;
  }
  await signedBinanceMutableRequest(BINANCE_FUTURES_REST, '/fapi/v1/leverage', credentials.apiKey, credentials.secretKey, {
    symbol: signal.symbol,
    leverage: String(leverage)
  });
}

async function submitBinanceLiveOrder(signal: TradeSignal, orderNotional: number) {
  const credentials = decryptSecret();
  if (!credentials) throw new Error('Missing Binance credentials.');
  if (!binanceVaultState.connected) throw new Error('Binance connection is not verified.');
  if (signal.market === 'spot') {
    if (signal.side !== 'LONG') throw new Error('Spot execution only supports LONG signals.');
    await signedBinanceMutableRequest(BINANCE_REST, '/api/v3/order', credentials.apiKey, credentials.secretKey, {
      symbol: signal.symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: orderNotional.toFixed(2)
    });
    return;
  }
  await applyFuturesAccountSettings(signal);
  await signedBinanceMutableRequest(BINANCE_FUTURES_REST, '/fapi/v1/order', credentials.apiKey, credentials.secretKey, {
    symbol: signal.symbol,
    side: signal.side === 'LONG' ? 'BUY' : 'SELL',
    type: 'MARKET',
    quantity: buildFuturesOrderQuantity(signal, orderNotional)
  });
}

async function applyExecutionPipeline(signal: TradeSignal) {
  signal.executionMode = liveExecutionRules.executionMode;
  signal.executionLeverage = signal.market === 'futures' ? liveExecutionRules.futuresLeverage : null;
  signal.executionMarginMode = signal.market === 'futures' ? liveExecutionRules.futuresMarginMode : null;
  signal.executionVenueLabel = signal.market === 'futures'
    ? `Futures ${liveExecutionRules.futuresLeverage}x`
    : 'Spot';
  if (!binanceVaultState.connected) {
    signal.executionStatus = 'pending';
    signal.executionNotes = ['Public signal generated. Binance portfolio execution is idle until an admin account is connected.'];
    return;
  }
  let result: Awaited<ReturnType<typeof evaluateExecutionCandidate>>;
  try {
    result = await evaluateExecutionCandidate(signal);
  } catch (error) {
    signal.executionStatus = liveExecutionRules.executionMode === 'live' ? 'live_failed' : 'test_failed';
    signal.executionNotes = [error instanceof Error ? error.message : 'Execution candidate evaluation failed.'];
    return;
  }
  if (result.failedRules.length > 0) {
    signal.executionStatus = result.failedRules.includes('Kill Switch') ? 'blocked' : 'rejected';
    signal.executionNotes = result.failedRules;
    return;
  }
  signal.executionStatus = 'pending';
  try {
    if (liveExecutionRules.executionMode === 'live') {
      await submitBinanceLiveOrder(signal, result.orderNotional);
      signal.executionStatus = 'live_accepted';
      signal.executionNotes = [`Binance LIVE order accepted in ${signal.market.toUpperCase()} mode.`];
      return;
    }
    await submitBinanceTestOrder(signal, result.orderNotional);
    signal.executionStatus = 'test_accepted';
    signal.executionNotes = [`Binance test order accepted in ${signal.market.toUpperCase()} mode.`];
  } catch (error) {
    signal.executionStatus = liveExecutionRules.executionMode === 'live' ? 'live_failed' : 'test_failed';
    const rawMessage = error instanceof Error ? error.message : liveExecutionRules.executionMode === 'live' ? 'Binance live order failed.' : 'Binance test order failed.';
    rememberBrokerRiskControl(signal.symbol, rawMessage);
    signal.executionNotes = [normalizeBrokerFailureMessage(rawMessage)];
  }
}

function loadBinanceVault() {
  if (!fs.existsSync(BINANCE_VAULT_FILE)) return;
  try {
    const vault = JSON.parse(fs.readFileSync(BINANCE_VAULT_FILE, 'utf8')) as StoredBinanceVault;
    const scopes = { ...emptyBinanceScopes(), ...(vault.scopes ?? {}) };
    binanceVaultState = {
      connected: Boolean(vault.connected),
      saved: true,
      updatedAt: Number(vault.updatedAt) || Date.now(),
      verifiedAt: Number(vault.verifiedAt) || null,
      keyFingerprint: typeof vault.keyFingerprint === 'string' ? vault.keyFingerprint : null,
      statusText: typeof vault.statusText === 'string'
        ? vault.statusText
        : (Boolean(vault.connected) ? 'Verified with Binance' : 'Keys saved locally, verification pending'),
      scopes
    };
  } catch {
    binanceVaultState = {
      connected: false,
      saved: false,
      updatedAt: null,
      verifiedAt: null,
      keyFingerprint: null,
      statusText: 'No Binance account connected',
      scopes: emptyBinanceScopes()
    };
  }
}

function saveBinanceVault(apiKey: string, secretKey: string, validation: ReturnType<typeof validateBinanceConnection> extends Promise<infer T> ? T : never) {
  const encrypted = encryptSecret({ apiKey, secretKey });
  const updatedAt = Date.now();
  persistBinanceVault(encrypted, updatedAt, fingerprintApiKey(apiKey), validation);
}

function clearBinanceVault() {
  if (fs.existsSync(BINANCE_VAULT_FILE)) fs.unlinkSync(BINANCE_VAULT_FILE);
  binanceVaultState = {
    connected: false,
    saved: false,
    updatedAt: null,
    verifiedAt: null,
    keyFingerprint: null,
    statusText: 'No Binance account connected',
    scopes: emptyBinanceScopes()
  };
}

type TelegramCardData = {
  idLabel: string;
  symbol: string;
  side: Side | 'UNKNOWN';
  statusLabel: string;
  marketLabel: string;
  directionLabel: string;
  duration: string;
  takeProfitPct?: string;
  stopLossPct?: string;
  pnl?: string;
  pnlUsdt?: string;
  netPnl?: string;
  priceLabel?: string;
  priceValue?: string;
  strategy: string;
  timeframe: string;
  entry?: string;
  takeProfit?: string;
  stopLoss?: string;
  confidence?: string;
  closeText?: string;
};

type TelegramApiResponse = {
  ok: boolean;
  description?: string;
  error_code?: number;
};

type TelegramDeliveryResult = {
  ok: boolean;
  message: string;
};

function normalizeTelegramUsername(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/^@+/, '').toLowerCase();
}

function normalizeMarketList(value: unknown): TradingVenue[] {
  if (!Array.isArray(value)) return ['spot', 'futures'];
  const next = Array.from(new Set(value.filter((item): item is TradingVenue => item === 'spot' || item === 'futures')));
  return next.length > 0 ? next : ['spot', 'futures'];
}

function normalizeTimeframeList(value: unknown): Timeframe[] {
  if (!Array.isArray(value)) return [...SUPPORTED_TIMEFRAMES];
  const next = Array.from(new Set(value.filter((item): item is Timeframe => SUPPORTED_TIMEFRAMES.includes(item))));
  return next.length > 0 ? next : [...SUPPORTED_TIMEFRAMES];
}

function saveTelegramSubscribers() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload: TelegramSubscriptionState = {
    subscribers: telegramSubscribers,
    lastUpdateId: telegramLastUpdateId
  };
  fs.writeFileSync(TELEGRAM_SUBSCRIBERS_FILE, JSON.stringify(payload, null, 2));
}

function loadTelegramSubscribers() {
  if (!fs.existsSync(TELEGRAM_SUBSCRIBERS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(TELEGRAM_SUBSCRIBERS_FILE, 'utf8')) as Partial<TelegramSubscriptionState>;
    telegramSubscribers = Array.isArray(data.subscribers)
      ? data.subscribers.map((item): TelegramAccountSubscription => ({
        accountId: String(item.accountId ?? ''),
        role: item.role === 'admin' ? 'admin' : 'user',
        displayName: String(item.displayName ?? 'Member'),
        telegramUsername: normalizeTelegramUsername(item.telegramUsername),
        chatId: typeof item.chatId === 'string' && item.chatId.trim() ? item.chatId.trim() : null,
        notificationsEnabled: item.notificationsEnabled !== false,
        enabled: item.enabled !== false,
        selectedStrategies: Array.isArray(item.selectedStrategies) ? item.selectedStrategies.filter((strategyId): strategyId is string => typeof strategyId === 'string' && strategyId.trim().length > 0) : [],
        selectedTimeframes: normalizeTimeframeList(item.selectedTimeframes),
        selectedMarkets: normalizeMarketList(item.selectedMarkets),
        acceptedLive: item.acceptedLive !== false,
        acceptedShadow: item.acceptedShadow !== false,
        updatedAt: Number(item.updatedAt) || Date.now(),
        linkedAt: typeof item.linkedAt === 'number' ? item.linkedAt : null
      })).filter(item => item.accountId)
      : [];
    telegramLastUpdateId = Number(data.lastUpdateId) || 0;
    hydrateTelegramChatIdsByUsername();
  } catch (error) {
    console.error('[telegram] failed to load subscriber state:', error);
  }
}

function hydrateTelegramChatIdsByUsername() {
  const knownChatIds = new Map<string, { chatId: string; linkedAt: number | null }>();
  for (const subscriber of telegramSubscribers) {
    if (subscriber.telegramUsername && subscriber.chatId) {
      knownChatIds.set(subscriber.telegramUsername, { chatId: subscriber.chatId, linkedAt: subscriber.linkedAt });
    }
  }
  let changed = false;
  for (const subscriber of telegramSubscribers) {
    if (subscriber.chatId || !subscriber.telegramUsername) continue;
    const known = knownChatIds.get(subscriber.telegramUsername);
    if (!known) continue;
    subscriber.chatId = known.chatId;
    subscriber.linkedAt = known.linkedAt ?? Date.now();
    changed = true;
  }
  if (changed) saveTelegramSubscribers();
}

function upsertTelegramSubscribers(payload: Partial<TelegramAccountSubscription>[]) {
  const next = new Map(telegramSubscribers.map(item => [item.accountId, item]));
  for (const entry of payload) {
    const accountId = String(entry.accountId ?? '').trim();
    if (!accountId) continue;
    const current = next.get(accountId);
    const telegramUsername = normalizeTelegramUsername(entry.telegramUsername ?? current?.telegramUsername);
    next.set(accountId, {
      accountId,
      role: entry.role === 'admin' ? 'admin' : current?.role === 'admin' ? 'admin' : 'user',
      displayName: String(entry.displayName ?? current?.displayName ?? 'Member'),
      telegramUsername,
      chatId: typeof entry.chatId === 'string'
        ? (entry.chatId.trim() || null)
        : (current?.telegramUsername !== telegramUsername ? null : current?.chatId ?? null),
      notificationsEnabled: entry.notificationsEnabled ?? current?.notificationsEnabled ?? true,
      enabled: entry.enabled ?? current?.enabled ?? true,
      selectedStrategies: Array.isArray(entry.selectedStrategies)
        ? entry.selectedStrategies.filter((strategyId): strategyId is string => typeof strategyId === 'string' && strategyId.trim().length > 0)
        : current?.selectedStrategies ?? [],
      selectedTimeframes: Array.isArray(entry.selectedTimeframes)
        ? normalizeTimeframeList(entry.selectedTimeframes)
        : current?.selectedTimeframes ?? [...SUPPORTED_TIMEFRAMES],
      selectedMarkets: Array.isArray(entry.selectedMarkets)
        ? normalizeMarketList(entry.selectedMarkets)
        : current?.selectedMarkets ?? ['spot', 'futures'],
      acceptedLive: entry.acceptedLive ?? current?.acceptedLive ?? true,
      acceptedShadow: entry.acceptedShadow ?? current?.acceptedShadow ?? true,
      updatedAt: Date.now(),
      linkedAt: current?.linkedAt ?? null
    });
  }
  telegramSubscribers = [...next.values()].sort((a, b) => a.role.localeCompare(b.role) || a.displayName.localeCompare(b.displayName));
  hydrateTelegramChatIdsByUsername();
  saveTelegramSubscribers();
}

async function syncTelegramSubscribersFromBot() {
  if (!PRIVATE_TELEGRAM_BOT_TOKEN || telegramSyncRunning) return;
  telegramSyncRunning = true;
  try {
    const offset = telegramLastUpdateId > 0 ? telegramLastUpdateId + 1 : undefined;
    const response = await fetch(`https://api.telegram.org/bot${PRIVATE_TELEGRAM_BOT_TOKEN}/getUpdates${offset ? `?offset=${offset}&timeout=1` : '?timeout=1'}`);
    const body = await response.json().catch(() => null) as { ok?: boolean; result?: any[]; description?: string } | null;
    if (!response.ok || !body?.ok || !Array.isArray(body.result)) {
      throw new Error(body?.description || `Telegram getUpdates failed (${response.status})`);
    }
    let changed = false;
    for (const update of body.result) {
      telegramLastUpdateId = Math.max(telegramLastUpdateId, Number(update.update_id) || 0);
      const message = update.message ?? update.edited_message ?? update.channel_post ?? null;
      if (!message?.chat?.id) continue;
      const username = normalizeTelegramUsername(message.from?.username ?? message.chat?.username);
      if (!username) continue;
      const chatId = String(message.chat.id);
      const matches = telegramSubscribers.filter(item => item.telegramUsername === username);
      if (matches.length === 0) continue;
      for (const match of matches) {
        if (match.chatId === chatId) continue;
        match.chatId = chatId;
        match.linkedAt = Date.now();
        changed = true;
        console.log(`[telegram] linked ${match.role}:${match.accountId} -> ${username} (${chatId})`);
      }
    }
    hydrateTelegramChatIdsByUsername();
    if (changed || body.result.length > 0) saveTelegramSubscribers();
  } catch (error) {
    console.error('[telegram] sync failed:', error);
  } finally {
    telegramSyncRunning = false;
  }
}

function shouldSendPrivateTelegramTradeEvent(signal: TradeSignal, subscriber: TelegramAccountSubscription) {
  if (!subscriber.notificationsEnabled || !subscriber.enabled || !subscriber.chatId) return false;
  if (!subscriber.selectedMarkets.includes(signal.market)) return false;
  if (!subscriber.selectedTimeframes.includes(signal.timeframe)) return false;
  if (subscriber.selectedStrategies.length > 0 && !subscriber.selectedStrategies.includes(signal.strategyId)) return false;
  if (signal.executionStatus === 'live_accepted') return subscriber.acceptedLive;
  if (signal.executionStatus === 'test_accepted') return subscriber.acceptedShadow;
  return false;
}

function buildSignalNotificationPayload(signal: TradeSignal) {
  const venue = signal.market === 'futures' ? `FUTURES x${Math.max(1, signal.executionLeverage ?? liveExecutionRules.futuresLeverage)}` : 'SPOT';
  return {
    title: `New Signal ${formatTradeIdLabel(signal.id)}`,
    message: `${venue} | ${signal.symbol} ${signal.side} | Direction ENTRY | Entry price ${formatDisplayNumber(signal.entry)} | TP ${signal.expectedProfitPct.toFixed(2)}% | SL -${signal.riskPct.toFixed(2)}% | Duration -- | Execution ${signal.executionStatus ?? 'pending'}`
  };
}

function buildSignalCloseNotificationPayload(signal: TradeSignal, closeText?: string, includeUsdtPnl = true) {
  const level: 'win' | 'loss' = signal.status === 'LOSS' ? 'loss' : 'win';
  const closePrice = signal.closePrice ?? (signal.status === 'LOSS' ? signal.stopLoss : signal.takeProfit);
  const pnl = percent(signal.entry, closePrice, signal.side);
  const venue = signal.market === 'futures' ? `FUTURES x${Math.max(1, signal.executionLeverage ?? liveExecutionRules.futuresLeverage)}` : 'SPOT';
  const netPnl = calculate24hNetPnl(signal);
  return {
    title: `Signal Closed ${formatTradeIdLabel(signal.id)}`,
    message: `${venue} | ${signal.symbol} ${signal.side} | Direction ${closeText ?? (level === 'loss' ? 'Stop Loss' : 'Take Profit')} | Closed price ${formatDisplayNumber(closePrice)} | TP ${signal.expectedProfitPct.toFixed(2)}% | SL -${signal.riskPct.toFixed(2)}% | Duration ${formatTradeDuration(signal.openedAt, signal.closedAt)} | PnL ${pnl.toFixed(2)}% | 24h Net PnL ${netPnl.toFixed(2)}%${includeUsdtPnl && signal.executionMode === 'live' && signal.binanceRealizedPnlUsdt != null ? ` | PnL USDT ${formatUsdt(signal.binanceRealizedPnlUsdt)}` : ''}`,
    level
  };
}

async function deliverPrivateTelegramSignal(signal: TradeSignal) {
  if (!PRIVATE_TELEGRAM_BOT_TOKEN) return;
  const recipients = telegramSubscribers.filter(subscriber => shouldSendPrivateTelegramTradeEvent(signal, subscriber));
  if (recipients.length === 0) return;
  const payload = buildSignalNotificationPayload(signal);
  const deliveredChatIds = new Set<string>();
  for (const recipient of recipients) {
    if (!recipient.chatId || deliveredChatIds.has(recipient.chatId)) continue;
    deliveredChatIds.add(recipient.chatId);
    await sendPrivateTelegramNotification(payload.title, payload.message, 'info', recipient.chatId ?? undefined);
  }
}

async function deliverPrivateTelegramSignalClose(signal: TradeSignal, closeText?: string) {
  if (!PRIVATE_TELEGRAM_BOT_TOKEN) return;
  const recipients = telegramSubscribers.filter(subscriber => shouldSendPrivateTelegramTradeEvent(signal, subscriber));
  if (recipients.length === 0) return;
  const payload = buildSignalCloseNotificationPayload(signal, closeText, true);
  const deliveredChatIds = new Set<string>();
  for (const recipient of recipients) {
    if (!recipient.chatId || deliveredChatIds.has(recipient.chatId)) continue;
    deliveredChatIds.add(recipient.chatId);
    await sendPrivateTelegramNotification(payload.title, payload.message, payload.level, recipient.chatId ?? undefined);
  }
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return;
  const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as { signals?: TradeSignal[]; notifications?: typeof notifications; nextSignalId?: number; selectedStrategies?: string[]; selectedTimeframes?: Timeframe[]; selectedExitMode?: ExitMode; selectedExitModes?: ExitMode[]; selectedMarketScope?: StrategyMarketScope; liveExecutionRules?: Partial<LiveExecutionRules>; telegramRuntimeSettings?: Partial<TelegramRuntimeSettings> };
  const signalRetentionStart = Date.now() - SIGNAL_RETENTION_MS;
  signals.push(...(data.signals ?? []).filter(signal => signal.openedAt >= signalRetentionStart));
  notifications.push(...(data.notifications ?? []));
  let repairedState = false;
  if (Array.isArray(data.selectedStrategies)) selectedStrategies = new Set(data.selectedStrategies.filter(id => strategies.some(strategy => strategy.id === id)));
  if (Array.isArray(data.selectedTimeframes)) selectedTimeframes = new Set(data.selectedTimeframes.filter((timeframe): timeframe is Timeframe => SUPPORTED_TIMEFRAMES.includes(timeframe)));
  const normalizedExitModes = Array.isArray(data.selectedExitModes)
    ? data.selectedExitModes.map((mode: string) => mode === 'precision' ? 'quick' : mode === 'runner' ? 'extended' : mode === 'adaptive' ? 'balanced' : mode).filter((mode): mode is ExitMode => mode === 'quick' || mode === 'extended' || mode === 'balanced')
    : [];
  if (normalizedExitModes.length > 0) {
    selectedExitModes = new Set(normalizedExitModes);
  } else if (data.selectedExitMode === 'quick' || data.selectedExitMode === 'extended' || data.selectedExitMode === 'balanced') {
    selectedExitModes = new Set([data.selectedExitMode]);
  } else if (data.selectedExitMode === 'precision') {
    selectedExitModes = new Set(['quick']);
  } else if (data.selectedExitMode === 'runner') {
    selectedExitModes = new Set(['extended']);
  } else if (data.selectedExitMode === 'adaptive') {
    selectedExitModes = new Set(['balanced']);
  }
  if (data.selectedMarketScope === 'spot' || data.selectedMarketScope === 'futures' || data.selectedMarketScope === 'all') {
    selectedMarketScope = data.selectedMarketScope;
  }
  if (data.liveExecutionRules) {
    liveExecutionRules = {
      ...liveExecutionRules,
      ...data.liveExecutionRules,
      ruleToggles: {
        ...liveExecutionRules.ruleToggles,
        ...data.liveExecutionRules.ruleToggles
      },
      venueMode: data.liveExecutionRules.venueMode === 'futures' ? 'futures' : 'spot',
      executionMode: data.liveExecutionRules.executionMode === 'live' ? 'live' : 'test',
      killSwitch: data.liveExecutionRules.killSwitch !== false,
      executionSource: data.liveExecutionRules.executionSource === 'top-2' || data.liveExecutionRules.executionSource === 'top-4' || data.liveExecutionRules.executionSource === 'custom' ? data.liveExecutionRules.executionSource : 'best-single',
      allocationMethod: 'equal',
      minRiskReward: data.liveExecutionRules.minRiskReward === '1:1' || data.liveExecutionRules.minRiskReward === '1:3' || data.liveExecutionRules.minRiskReward === '1:4' || data.liveExecutionRules.minRiskReward === 'custom' ? data.liveExecutionRules.minRiskReward : '1:2',
      allowedDirection: data.liveExecutionRules.allowedDirection === 'both' || data.liveExecutionRules.allowedDirection === 'short-only' ? data.liveExecutionRules.allowedDirection : 'long-only',
      futuresMarginMode: data.liveExecutionRules.futuresMarginMode === 'cross' ? 'cross' : 'isolated',
      breakEvenEnabled: data.liveExecutionRules.breakEvenEnabled !== false,
      breakEvenTriggerPct: Math.max(0.1, Math.min(50, toFiniteNumber(data.liveExecutionRules.breakEvenTriggerPct, liveExecutionRules.breakEvenTriggerPct))),
      trailingStopEnabled: data.liveExecutionRules.trailingStopEnabled !== false,
      trailingGapPct: Math.max(0.1, Math.min(20, toFiniteNumber(data.liveExecutionRules.trailingGapPct, liveExecutionRules.trailingGapPct))),
      portfolioFloorEnabled: data.liveExecutionRules.portfolioFloorEnabled !== false,
      portfolioFloorTriggerPct: Math.max(0.1, Math.min(200, toFiniteNumber(data.liveExecutionRules.portfolioFloorTriggerPct, liveExecutionRules.portfolioFloorTriggerPct))),
      portfolioFloorLockPct: Math.max(0, Math.min(200, toFiniteNumber(data.liveExecutionRules.portfolioFloorLockPct, liveExecutionRules.portfolioFloorLockPct)))
    };
  }
  if (data.telegramRuntimeSettings) {
    telegramRuntimeSettings = {
      publicChannelEnabled: data.telegramRuntimeSettings.publicChannelEnabled !== false
    };
  }
  for (const signal of signals) {
    if (!signal.executionMode) {
      signal.executionMode = liveExecutionRules.executionMode;
      repairedState = true;
    }
    if (signal.executionLeverage == null) {
      signal.executionLeverage = signal.market === 'futures' ? liveExecutionRules.futuresLeverage : null;
      repairedState = true;
    }
    if (signal.executionMarginMode == null) {
      signal.executionMarginMode = signal.market === 'futures' ? liveExecutionRules.futuresMarginMode : null;
      repairedState = true;
    }
    const desiredVenueLabel = signal.market === 'futures'
      ? `Futures ${signal.executionLeverage ?? liveExecutionRules.futuresLeverage}x`
      : 'Spot';
    if (signal.executionVenueLabel !== desiredVenueLabel) {
      signal.executionVenueLabel = desiredVenueLabel;
      repairedState = true;
    }
    if (!signal.executionStatus) {
      signal.executionStatus = signal.status === 'OPEN'
      ? 'pending'
      : liveExecutionRules.executionMode === 'live'
        ? 'live_accepted'
        : 'test_accepted';
      repairedState = true;
    }
  }
  for (const notification of notifications) {
    const legacyId = notification.title.match(/#(\d+)/)?.[1];
    if (!legacyId) continue;
    const normalizedTitle = notification.title.replace(/#\d+/, formatTradeIdLabel(Number(legacyId)));
    if (normalizedTitle !== notification.title) {
      notification.title = normalizedTitle;
      repairedState = true;
    }
  }
  nextSignalId = Math.max(data.nextSignalId ?? nextSignalId, (signals.at(0)?.id ?? 0) + 1, ...signals.map(signal => signal.id + 1), 1);
  if (repairedState) saveState();
}

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const signalRetentionStart = Date.now() - SIGNAL_RETENTION_MS;
  const retainedSignals = signals.filter(signal => signal.openedAt >= signalRetentionStart);
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    signals: retainedSignals,
    notifications: notifications.slice(0, 200),
    nextSignalId,
    selectedStrategies: [...selectedStrategies],
    selectedTimeframes: [...selectedTimeframes],
    selectedExitModes: [...selectedExitModes],
    selectedMarketScope,
    liveExecutionRules,
    telegramRuntimeSettings
  }, null, 2));
}

function invalidateComputedCaches() {
  dashboardCacheDirty = true;
  livePortfolioCache.clear();
  binanceWalletCache = null;
}

const percent = (from: number, to: number, side: Side) =>
  side === 'LONG' ? ((to - from) / from) * 100 : ((from - to) / from) * 100;

const QUALITY_GATE = {
  minScore: 60,
  minRewardMultiple: 2,
  minConfidence: 68,
  minAlignment: 0.6
};

const STRATEGY_PAUSE_RULE = {
  minClosedTrades: 30,
  minWinRate: 45,
  maxNetLossPct: -10
};

let spotLongMarketGateCache: { checkedAt: number; allowed: boolean } | null = null;

function getRangeStartForKey(range: string, customFrom?: string) {
  const now = Date.now();
  if (range === '24h') return now - 24 * 60 * 60 * 1000;
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  if (range === '90d') return now - 90 * 24 * 60 * 60 * 1000;
  if (range === 'custom' && customFrom) return new Date(`${customFrom}T00:00:00`).getTime() || 0;
  return 0;
}

function getRangeEndForKey(range: string, customTo?: string) {
  if (range === 'custom' && customTo) return new Date(`${customTo}T23:59:59.999`).getTime() || Date.now();
  return Date.now();
}

const toFiniteNumber = (value: unknown, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const getRiskRewardMultiplier = (rule: LiveExecutionRules['minRiskReward'], customRiskReward: string) => {
  const raw = rule === 'custom' ? customRiskReward : rule;
  const reward = Number(String(raw).split(':')[1] ?? '2');
  return Number.isFinite(reward) && reward > 0 ? reward : 2;
};

const sma = (values: number[], period: number) => {
  if (values.length < period) return 0;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
};

const ema = (values: number[], period: number) => {
  if (values.length < period) return 0;
  const multiplier = 2 / (period + 1);
  let value = sma(values.slice(0, period), period);
  for (const price of values.slice(period)) {
    value = (price - value) * multiplier + value;
  }
  return value;
};

const rsi = (closes: number[], period = 14) => {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
};

const atr = (candles: Candle[], period = 14) => {
  if (candles.length <= period) return candles.at(-1)?.close ?? 0;
  const trs = candles.slice(-period).map((c, index, arr) => {
    const previous = index === 0 ? candles[candles.length - period - 1] : arr[index - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - previous.close), Math.abs(c.low - previous.close));
  });
  return trs.reduce((a, b) => a + b, 0) / trs.length;
};

function recentSwingHigh(candles: Candle[], lookback: number) {
  const scoped = candles.slice(-lookback);
  return scoped.length ? Math.max(...scoped.map(candle => candle.high)) : candles.at(-1)?.high ?? 0;
}

function recentSwingLow(candles: Candle[], lookback: number) {
  const scoped = candles.slice(-lookback);
  return scoped.length ? Math.min(...scoped.map(candle => candle.low)) : candles.at(-1)?.low ?? 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSignalGenerationLockMs(timeframe: Timeframe) {
  if (timeframe === '5m') return 5 * 60_000;
  if (timeframe === '10m') return 10 * 60_000;
  if (timeframe === '15m') return 15 * 60_000;
  if (timeframe === '1h') return 60 * 60_000;
  if (timeframe === '2h') return 120 * 60_000;
  if (timeframe === '4h') return 240 * 60_000;
  return 24 * 60 * 60_000;
}

function pickExitMode(strategyId: string, draft: SignalDraft, timeframe: Timeframe, candles: Candle[], enabledModes: Set<ExitMode>) {
  const modes = [...enabledModes];
  if (modes.length === 0) return 'balanced' as ExitMode;
  if (modes.length === 1) return modes[0]!;

  const entry = candles.at(-1)?.close ?? 0;
  const recentMove = Math.abs((candles.at(-1)?.close ?? 0) - (candles.at(-10)?.close ?? candles.at(0)?.close ?? 0));
  const trendStrength = entry > 0 ? recentMove / entry : 0;
  const volatilityRatio = atr(candles, 14) / Math.max(entry * 0.0025, 0.0000001);
  const confidenceScore = clamp((draft.confidence - 60) / 20, 0, 1);
  const momentumScore = clamp((trendStrength / 0.02) * 0.55 + (volatilityRatio / 2.2) * 0.2 + confidenceScore * 0.25, 0, 1);
  const quickLean = strategyId === 'momentum-scalp' || strategyId === 'rsi-reversion' || timeframe === '5m';
  const extendedLean = strategyId === 'atr-expansion' || strategyId === 'volume-breakout' || strategyId === 'micro-squeeze' || strategyId === 'bear-trend-short';

  if (enabledModes.has('extended') && (extendedLean || (draft.rr >= 2.1 && momentumScore >= 0.58))) {
    return 'extended' as ExitMode;
  }
  if (enabledModes.has('quick') && (quickLean || draft.rr <= 1.7 || momentumScore <= 0.42)) {
    return 'quick' as ExitMode;
  }
  if (enabledModes.has('balanced')) return 'balanced' as ExitMode;
  if (enabledModes.has('extended') && momentumScore >= 0.48) return 'extended' as ExitMode;
  if (enabledModes.has('quick')) return 'quick' as ExitMode;
  return modes[0]!;
}

function buildAdvancedExitPlan(strategyId: string, draft: SignalDraft, ticker: PriceTicker, timeframe: Timeframe, candles: Candle[], exitMode: ExitMode) {
  const entry = ticker.price;
  const baseAtr = Math.max(atr(candles, 14), entry * 0.0032);
  const compressionAtr = Math.max(atr(candles.slice(-28), 10), entry * 0.0028);
  const localHigh = recentSwingHigh(candles.slice(0, -1), 24);
  const localLow = recentSwingLow(candles.slice(0, -1), 24);
  const broaderHigh = recentSwingHigh(candles.slice(0, -1), 48);
  const broaderLow = recentSwingLow(candles.slice(0, -1), 48);
  const timeframeProfitFloorPct = ({
    '5m': 0.8,
    '10m': 1.0,
    '15m': 1.2,
    '1h': 1.7,
    '2h': 2.2,
    '4h': 3.0,
    '1d': 4.5
  } as const)[timeframe];

  const profiles: Record<string, { stopAtr: number; targetAtr: number; rrFloor: number; profitFloorPct: number; structureBuffer: number }> = {
    'volume-breakout': { stopAtr: 0.95, targetAtr: 2.8, rrFloor: 2.2, profitFloorPct: 1.2, structureBuffer: 0.0015 },
    'liquidity-sweep': { stopAtr: 0.85, targetAtr: 2.3, rrFloor: 2.0, profitFloorPct: 1.0, structureBuffer: 0.0012 },
    'vwap-proxy': { stopAtr: 0.9, targetAtr: 2.0, rrFloor: 1.9, profitFloorPct: 0.9, structureBuffer: 0.001 },
    'range-flip': { stopAtr: 0.88, targetAtr: 2.1, rrFloor: 1.95, profitFloorPct: 0.95, structureBuffer: 0.001 },
    'pullback-21': { stopAtr: 0.82, targetAtr: 2.0, rrFloor: 1.9, profitFloorPct: 0.9, structureBuffer: 0.001 },
    'ema-trend-rider': { stopAtr: 0.92, targetAtr: 2.25, rrFloor: 2.0, profitFloorPct: 1.0, structureBuffer: 0.001 },
    'macd-proxy': { stopAtr: 0.92, targetAtr: 2.15, rrFloor: 1.95, profitFloorPct: 0.95, structureBuffer: 0.001 },
    'momentum-scalp': { stopAtr: 0.78, targetAtr: 1.85, rrFloor: 1.75, profitFloorPct: 0.75, structureBuffer: 0.0008 },
    'atr-expansion': { stopAtr: 1.05, targetAtr: 3.1, rrFloor: 2.35, profitFloorPct: 1.35, structureBuffer: 0.0018 },
    'bear-trend-short': { stopAtr: 0.95, targetAtr: 2.55, rrFloor: 2.1, profitFloorPct: 1.1, structureBuffer: 0.0012 },
    'micro-squeeze': { stopAtr: 0.82, targetAtr: 2.7, rrFloor: 2.15, profitFloorPct: 1.0, structureBuffer: 0.0015 },
    'rsi-reversion': { stopAtr: 0.72, targetAtr: 1.95, rrFloor: 1.75, profitFloorPct: 0.8, structureBuffer: 0.001 }
  };

  const profile = profiles[strategyId] ?? { stopAtr: 0.9, targetAtr: 2.1, rrFloor: 1.9, profitFloorPct: timeframeProfitFloorPct, structureBuffer: 0.001 };
  const modeProfiles: Record<ExitMode, { targetBands: Record<Timeframe, [number, number]>; riskBands: Record<Timeframe, [number, number]>; rrCap?: number; rrFloorBoost: number; timeBias: number }> = {
    quick: {
      targetBands: {
        '5m': [1.0, 1.85],
        '10m': [1.15, 2.0],
        '15m': [1.25, 2.15],
        '1h': [1.7, 2.8],
        '2h': [2.1, 3.4],
        '4h': [2.8, 4.3],
        '1d': [4.0, 6.2]
      },
      riskBands: {
        '5m': [0.42, 0.82],
        '10m': [0.5, 0.92],
        '15m': [0.58, 1.02],
        '1h': [0.72, 1.18],
        '2h': [0.9, 1.45],
        '4h': [1.15, 1.9],
        '1d': [1.5, 2.6]
      },
      rrCap: 2.25,
      rrFloorBoost: 0.04,
      timeBias: 0.92
    },
    balanced: {
      targetBands: {
        '5m': [1.25, 3.4],
        '10m': [1.5, 4.8],
        '15m': [1.9, 6.4],
        '1h': [2.8, 8.5],
        '2h': [3.6, 10.5],
        '4h': [4.8, 13.5],
        '1d': [7.0, 18.0]
      },
      riskBands: {
        '5m': [0.5, 1.0],
        '10m': [0.62, 1.16],
        '15m': [0.72, 1.32],
        '1h': [0.95, 1.65],
        '2h': [1.18, 2.0],
        '4h': [1.45, 2.45],
        '1d': [1.9, 3.1]
      },
      rrFloorBoost: 0.1,
      timeBias: 1
    },
    extended: {
      targetBands: {
        '5m': [4.8, 8.5],
        '10m': [6.0, 11.5],
        '15m': [7.5, 15.0],
        '1h': [9.5, 18.5],
        '2h': [12.0, 24.0],
        '4h': [16.0, 30.0],
        '1d': [22.0, 42.0]
      },
      riskBands: {
        '5m': [0.82, 1.55],
        '10m': [0.98, 1.9],
        '15m': [1.12, 2.25],
        '1h': [1.35, 2.7],
        '2h': [1.7, 3.2],
        '4h': [2.1, 4.0],
        '1d': [2.8, 5.5]
      },
      rrFloorBoost: 0.22,
      timeBias: 1.15
    }
  };
  const modeProfile = modeProfiles[exitMode];
  const targetBands = modeProfile.targetBands[timeframe];
  const riskBands = modeProfile.riskBands[timeframe];
  const trendStrength = clamp(Math.abs(candles.at(-1)!.close - candles.at(-12)!.close) / Math.max(entry * 0.01, baseAtr * 2.4), 0, 1);
  const volatilityState = clamp(baseAtr / Math.max(entry * 0.003, compressionAtr), 0.65, 1.45);
  const confidenceState = clamp((draft.confidence - 55) / 25, 0, 1);
  const compositeState = clamp((trendStrength * 0.45) + (confidenceState * 0.35) + ((volatilityState - 0.65) / 0.8) * 0.2, 0, 1);
  const profitFloorPct = Math.max(profile.profitFloorPct, timeframeProfitFloorPct, targetBands[0]);
  const rrFloor = Math.max(
    modeProfile.rrCap ? Math.min(profile.rrFloor, modeProfile.rrCap) : profile.rrFloor,
    draft.rr
  ) + modeProfile.rrFloorBoost;

  const envelopeExitPlan = (rawStopLoss: number, rawTakeProfit: number) => {
    const rawRiskPct = Math.abs(percent(entry, rawStopLoss, draft.side));
    const rawTargetPct = Math.abs(percent(entry, rawTakeProfit, draft.side));
    const targetMin = targetBands[0] + ((targetBands[1] - targetBands[0]) * compositeState * 0.22);
    const targetMax = exitMode === 'quick'
      ? targetBands[1]
      : targetBands[0] + ((targetBands[1] - targetBands[0]) * (0.58 + compositeState * 0.42));
    const riskMin = riskBands[0];
    const riskMax = riskBands[0] + ((riskBands[1] - riskBands[0]) * (0.35 + (1 - compositeState) * 0.65));
    const normalizedRiskPct = clamp(rawRiskPct || riskMin, riskMin, riskMax);
    const rrDrivenTargetPct = normalizedRiskPct * rrFloor;
    const structureAwareTargetPct = Math.max(rawTargetPct * modeProfile.timeBias, rrDrivenTargetPct);
    const normalizedTargetPct = clamp(structureAwareTargetPct, targetMin, targetMax);
    if (draft.side === 'LONG') {
      return {
        stopLoss: entry * (1 - normalizedRiskPct / 100),
        takeProfit: entry * (1 + normalizedTargetPct / 100)
      };
    }
    return {
      stopLoss: entry * (1 + normalizedRiskPct / 100),
      takeProfit: entry * (1 - normalizedTargetPct / 100)
    };
  };

  if (draft.side === 'LONG') {
    const structureStop = localLow > 0 && localLow < entry ? localLow * (1 - profile.structureBuffer) : entry - compressionAtr * profile.stopAtr;
    const atrStop = entry - baseAtr * profile.stopAtr;
    const stopLoss = Math.min(structureStop, atrStop);
    const stopDistance = Math.max(entry * 0.0025, entry - stopLoss);
    const floorTarget = entry * (1 + profitFloorPct / 100);
    const rrTarget = entry + stopDistance * rrFloor;
    const atrTarget = entry + Math.max(baseAtr, compressionAtr) * profile.targetAtr;
    const structureTarget = broaderHigh > entry ? broaderHigh * (1 + profile.structureBuffer * 0.5) : atrTarget;
    const takeProfit = Math.max(floorTarget, rrTarget, atrTarget, structureTarget);
    return envelopeExitPlan(stopLoss, takeProfit);
  }

  const structureStop = localHigh > entry ? localHigh * (1 + profile.structureBuffer) : entry + compressionAtr * profile.stopAtr;
  const atrStop = entry + baseAtr * profile.stopAtr;
  const stopLoss = Math.max(structureStop, atrStop);
  const stopDistance = Math.max(entry * 0.0025, stopLoss - entry);
  const floorTarget = entry * (1 - profitFloorPct / 100);
  const rrTarget = entry - stopDistance * rrFloor;
  const atrTarget = entry - Math.max(baseAtr, compressionAtr) * profile.targetAtr;
  const structureTarget = broaderLow > 0 && broaderLow < entry ? broaderLow * (1 - profile.structureBuffer * 0.5) : atrTarget;
  const takeProfit = Math.min(floorTarget, rrTarget, atrTarget, structureTarget);
  return envelopeExitPlan(stopLoss, takeProfit);
}

const strategies: Strategy[] = [
  { id: 'ema-trend-rider', name: 'EMA Trend Rider', risk: 'medium', description: 'Moving average alignment with clear volume momentum.', evaluate: (c, t) => {
    const closes = c.map(x => x.close);
    if (sma(closes, 9) > sma(closes, 21) && rsi(closes) > 54 && t.change24h > 0.8) return { side: 'LONG', confidence: 71, rr: 1.8, reason: 'EMA9 is above EMA21 with positive RSI momentum' };
    return null;
  }},
  { id: 'rsi-reversion', name: 'RSI Mean Reversion', risk: 'medium', description: 'Reversal setup from oversold or overbought RSI zones.', evaluate: (c) => {
    const value = rsi(c.map(x => x.close));
    if (value < 28) return { side: 'LONG', confidence: 66, rr: 1.5, reason: 'RSI is in an oversold zone' };
    if (value > 76) return { side: 'SHORT', confidence: 64, rr: 1.4, reason: 'RSI is in an overbought zone' };
    return null;
  }},
  { id: 'volume-breakout', name: 'Volume Breakout', risk: 'high', description: 'Short-range breakout with strong volume expansion.', evaluate: (c) => {
    const last = c.at(-1)!;
    const high = Math.max(...c.slice(-24, -1).map(x => x.high));
    const avgVol = sma(c.slice(-24, -1).map(x => x.volume), 20);
    if (last.close > high && last.volume > avgVol * 1.8) return { side: 'LONG', confidence: 74, rr: 2.2, reason: 'Resistance breakout confirmed by strong volume' };
    return null;
  }},
  { id: 'range-flip', name: 'Range Flip', risk: 'medium', description: 'Former short-term resistance acting as support.', evaluate: (c) => {
    const last = c.at(-1)!;
    const prevHigh = Math.max(...c.slice(-18, -2).map(x => x.high));
    if (c.at(-2)!.close > prevHigh && last.low <= prevHigh && last.close > prevHigh) return { side: 'LONG', confidence: 68, rr: 1.7, reason: 'Successful retest after breakout' };
    return null;
  }},
  { id: 'momentum-scalp', name: 'Momentum Scalp', risk: 'high', description: 'Fast momentum move on short candles.', evaluate: (c, t) => {
    const closes = c.map(x => x.close);
    if (closes.at(-1)! > closes.at(-4)! * 1.006 && t.quoteVolume > 500000) return { side: 'LONG', confidence: 69, rr: 1.6, reason: 'Short-term momentum with solid liquidity' };
    return null;
  }},
  { id: 'atr-expansion', name: 'ATR Expansion', risk: 'high', description: 'Range expansion after a compressed volatility phase.', evaluate: (c) => {
    const recentAtr = atr(c.slice(-18), 14);
    const olderAtr = atr(c.slice(-45, -18), 14);
    if (olderAtr && recentAtr > olderAtr * 1.45) return { side: c.at(-1)!.close > c.at(-5)!.close ? 'LONG' : 'SHORT', confidence: 67, rr: 2.0, reason: 'ATR expansion after a quiet period' };
    return null;
  }},
  { id: 'pullback-21', name: 'Pullback 21', risk: 'medium', description: 'Price pullback toward the 21-period average before continuation.', evaluate: (c) => {
    const closes = c.map(x => x.close);
    const m21 = sma(closes, 21);
    const last = c.at(-1)!;
    if (sma(closes, 9) > m21 && last.low <= m21 && last.close > m21) return { side: 'LONG', confidence: 70, rr: 1.8, reason: 'Pullback held near the 21-period average' };
    return null;
  }},
  { id: 'bear-trend-short', name: 'Bear Trend Short', risk: 'high', description: 'Short setup during a clear bearish trend.', evaluate: (c, t) => {
    const closes = c.map(x => x.close);
    if (sma(closes, 9) < sma(closes, 21) && rsi(closes) < 43 && t.change24h < -1) return { side: 'SHORT', confidence: 70, rr: 1.9, reason: 'Bearish trend with negative momentum' };
    return null;
  }},
  { id: 'micro-squeeze', name: 'Micro Squeeze', risk: 'high', description: 'Tight price compression before a potential expansion move.', evaluate: (c) => {
    const ranges = c.slice(-12).map(x => (x.high - x.low) / x.close);
    const tight = ranges.every(x => x < 0.006);
    if (tight && c.at(-1)!.volume > sma(c.map(x => x.volume), 20) * 1.4) return { side: c.at(-1)!.close > c.at(-2)!.close ? 'LONG' : 'SHORT', confidence: 63, rr: 2.3, reason: 'Price compression with rising volume' };
    return null;
  }},
  { id: 'vwap-proxy', name: 'VWAP Proxy', risk: 'medium', description: 'Approximate VWAP reclaim setup.', evaluate: (c) => {
    const vwap = c.slice(-48).reduce((a, x) => a + x.close * x.volume, 0) / Math.max(1, c.slice(-48).reduce((a, x) => a + x.volume, 0));
    if (c.at(-2)!.close < vwap && c.at(-1)!.close > vwap) return { side: 'LONG', confidence: 65, rr: 1.6, reason: 'Approximate VWAP reclaim' };
    return null;
  }},
  { id: 'liquidity-sweep', name: 'Liquidity Sweep', risk: 'high', description: 'Local low sweep followed by a close back above it.', evaluate: (c) => {
    const last = c.at(-1)!;
    const priorLow = Math.min(...c.slice(-20, -1).map(x => x.low));
    if (last.low < priorLow && last.close > priorLow) return { side: 'LONG', confidence: 68, rr: 2.1, reason: 'Local low sweep with a bullish close' };
    return null;
  }},
  { id: 'macd-proxy', name: 'MACD Proxy Shift', risk: 'medium', description: 'Momentum shift through moving-average spread.', evaluate: (c) => {
    const closes = c.map(x => x.close);
    const fast = sma(closes, 12);
    const slow = sma(closes, 26);
    if (fast > slow && closes.at(-1)! > sma(closes, 50)) return { side: 'LONG', confidence: 67, rr: 1.7, reason: 'Momentum shifted above the long average' };
    return null;
  }}
];

function broadcast(type: string, payload: unknown) {
  const data = JSON.stringify({ type, payload });
  wss.clients.forEach(client => client.readyState === WebSocket.OPEN && client.send(data));
}

async function notify(title: string, message: string, level: 'info' | 'win' | 'loss' = 'info') {
  const item = { id: Date.now(), time: Date.now(), title, message, level };
  notifications.unshift(item);
  notifications.splice(100);
  saveState();
  broadcast('notification', item);
  const publicDelivery = await sendPublicTelegramNotification(title, message, level);
  if (!publicDelivery.ok && telegramRuntimeSettings.publicChannelEnabled) {
    console.error('[telegram] public notification failed:', publicDelivery.message);
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getFeaturedTickers(source: Map<string, PriceTicker>) {
  return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'].map(symbol => source.get(symbol)).filter(Boolean);
}

function formatDisplayNumber(value: number | string | undefined, digits = 6) {
  if (value === undefined) return '--';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return typeof value === 'string' && value.trim() ? value : '--';
  if (Math.abs(numeric) >= 1000) return numeric.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(numeric) >= 1) return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return numeric.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: digits });
}

function formatPercent(value: number | string | undefined, digits = 2) {
  if (value === undefined) return '--';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace('%', ''));
  if (!Number.isFinite(numeric)) return typeof value === 'string' ? value : '--';
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(digits)}%`;
}

function formatTradeDuration(start: number | undefined, end: number | undefined) {
  if (!start || !end || end < start) return '--';
  const totalMinutes = Math.max(0, Math.floor((end - start) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatUsdt(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

function extractSignalScore(reason: string) {
  const score = Number(reason.match(/\bScore\s+(-?\d+(?:\.\d+)?)/i)?.[1]);
  return Number.isFinite(score) ? score : null;
}

function scoreToneFromReason(reason: string) {
  const score = extractSignalScore(reason);
  if (score == null) return 'unscored';
  if (score >= 60) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

function scoreMatchesFilter(signal: TradeSignal, filter: string) {
  return filter === 'all' || scoreToneFromReason(signal.reason) === filter;
}

function parseTelegramCardData(title: string, message: string, level: 'info' | 'win' | 'loss'): TelegramCardData {
  const chunks = message.split('|').map(part => part.trim()).filter(Boolean);
  const tradeId = title.match(/T-[0-9A-Z]+/)?.[0] ?? '#--';
  const market = chunks[0]?.toUpperCase() ?? '--';
  const symbolAndSide = chunks[1] ?? '';
  const symbolAndSideParts = symbolAndSide.split(/\s+/).filter(Boolean);
  const symbol = symbolAndSideParts[0] ?? (market.startsWith('SPOT') || market.startsWith('FUTURES') ? 'UNKNOWN' : market);
  const side = symbolAndSideParts.includes('LONG') ? 'LONG' : symbolAndSideParts.includes('SHORT') ? 'SHORT' : 'UNKNOWN';
  const direction = chunks.find(part => part.startsWith('Direction '))?.replace('Direction ', '')
    ?? chunks.find(part => part.startsWith('Closed '))?.replace('Closed ', '')
    ?? (level === 'info' ? 'ENTRY' : level === 'loss' ? 'Stop Loss' : 'Take Profit');
  const duration = chunks.find(part => part.startsWith('Duration '))?.replace('Duration ', '') ?? '--';
  const entryPrice = chunks.find(part => part.startsWith('Entry price '))?.replace('Entry price ', '');
  const closedPrice = chunks.find(part => part.startsWith('Closed price '))?.replace('Closed price ', '');
  return {
    idLabel: tradeId,
    symbol,
    side,
    statusLabel: level === 'win' ? 'WIN' : level === 'loss' ? 'LOSS' : 'ENTRY',
    marketLabel: market,
    directionLabel: direction,
    duration,
    takeProfitPct: chunks.find(part => part.startsWith('TP '))?.replace('TP ', ''),
    stopLossPct: chunks.find(part => part.startsWith('SL '))?.replace('SL ', ''),
    pnl: formatPercent(chunks.find(part => part.startsWith('PnL '))?.replace('PnL ', '')),
    pnlUsdt: chunks.find(part => part.startsWith('PnL USDT '))?.replace('PnL USDT ', ''),
    netPnl: formatPercent(
      chunks.find(part => part.startsWith('24h Net PnL '))?.replace('24h Net PnL ', '')
        ?? chunks.find(part => part.startsWith('Net PnL '))?.replace('Net PnL ', '')
        ?? lookup24hNetPnlLabel(tradeId)
    ),
    priceLabel: closedPrice ? 'Closed price' : 'Entry price',
    priceValue: closedPrice ?? entryPrice ?? '--',
    strategy: '',
    timeframe: '',
    entry: '',
    takeProfit: '',
    stopLoss: '',
    confidence: '',
    closeText: ''
  };
}

function formatTelegramCaption(card: TelegramCardData) {
  const channelLine = PUBLIC_TELEGRAM_INVITE_URL
    ? `📣 <b>Public Channel on Telegram Link</b> ${escapeHtml(PUBLIC_TELEGRAM_INVITE_URL)}`
    : null;
  const priceLabel = card.priceLabel ?? (card.statusLabel === 'ENTRY' ? 'Entry price' : 'Closed price');
  return [
    `#️⃣ <b>Trade:</b> ${escapeHtml(card.idLabel)}`,
    `🪙 <b>Coin:</b> ${escapeHtml(card.symbol)}`,
    `💵 <b>${escapeHtml(priceLabel)}:</b> ${escapeHtml(card.priceValue ?? '--')}`,
    `🏛️ <b>Market:</b> ${escapeHtml(card.marketLabel)}`,
    `${card.side === 'LONG' ? '🟢' : card.side === 'SHORT' ? '🟠' : '🔵'} <b>Side:</b> ${escapeHtml(card.side)}`,
    `${card.statusLabel === 'WIN' ? '✅' : card.statusLabel === 'LOSS' ? '❌' : '🔵'} <b>Status:</b> ${escapeHtml(card.statusLabel)}`,
    `🎯 <b>TP:</b> ${escapeHtml(card.takeProfitPct ?? '--')}`,
    `🛑 <b>SL:</b> ${escapeHtml(card.stopLossPct ?? '--')}`,
    `⏱️ <b>Duration:</b> ${escapeHtml(card.duration)}`,
    card.pnlUsdt ? `💰 <b>PnL:</b> ${escapeHtml(card.pnlUsdt)}` : card.pnl ? `📈 <b>PnL:</b> ${escapeHtml(card.pnl)}` : '',
    card.netPnl ? `📊 <b>24h Net PnL:</b> ${escapeHtml(card.netPnl)}` : '',
    '',
    ...(channelLine ? [channelLine, ''] : []),
    `✨ <b>Auto Trading System By Muslim Alramadhan</b> ✨`
  ].filter((line): line is string => line !== null).join('\n');
}
async function generateTelegramCard(card: TelegramCardData, level: 'info' | 'win' | 'loss', audience: 'public' | 'private' = 'public') {
  {
  const canvasWidth = 1280;
  const canvasHeight = 720;
  const isPrivatePremium = audience === 'private';
  const isLong = card.side === 'LONG';
  const isShort = card.side === 'SHORT';
  const isWin = card.statusLabel === 'WIN' || level === 'win';
  const isLoss = card.statusLabel === 'LOSS' || level === 'loss';
  const sideAccent = isLong ? '#00D18F' : isShort ? '#FF7A1A' : '#38BDF8';
  const sideDark = isLong ? '#062B20' : isShort ? '#321807' : '#082438';
  const resultAccent = isWin ? '#00D18F' : isLoss ? '#FF365C' : '#38BDF8';
  const resultDark = isWin ? '#062B20' : isLoss ? '#330A16' : '#082438';
  const priceLabel = card.priceLabel ?? (card.statusLabel === 'ENTRY' ? 'Entry price' : 'Closed price');
  const priceText = card.priceValue ?? '--';
  const pnlText = card.pnl ?? '--';
  const usdtText = card.pnlUsdt;
  const netPnlText = card.netPnl ?? '--';
  const statusText = card.statusLabel === 'ENTRY' ? 'ENTRY' : card.statusLabel;
  const symbolFont = card.symbol.length > 13 ? 56 : card.symbol.length > 10 ? 64 : 76;
  const priceFont = priceText.length > 13 ? 34 : 40;
  const pnlFont = (usdtText ?? pnlText).length > 13 ? 42 : 52;
  const premiumBadge = isPrivatePremium
    ? `<g transform="translate(492 154)">
        <rect x="0" y="0" width="296" height="38" rx="19" fill="#1B1510" stroke="#F5C86A" stroke-width="2"/>
        <path d="M28 12 L36 22 L46 12 L54 22 L62 12 L58 29 H32 Z" fill="#F5C86A"/>
        <text x="83" y="26" font-size="18" font-weight="950" fill="#F8E7B0" font-family="Segoe UI, Arial, sans-serif">PRIVATE PREMIUM</text>
      </g>`
    : '';
  const premiumFrame = isPrivatePremium
    ? `<rect x="48" y="42" width="1184" height="636" rx="25" fill="none" stroke="#F5C86A" stroke-width="3" stroke-opacity="0.52"/>
       <path d="M80 184 H1200" stroke="#F5C86A" stroke-width="2" stroke-opacity="0.28"/>
       <path d="M1008 72 L1180 72 L1180 84 L1022 84 Z" fill="#F5C86A" opacity="0.18"/>`
    : '';
  const sideArrow = isLong
    ? `<path d="M74 150 L74 76 L42 76 L112 12 L182 76 L150 76 L150 150 Z" fill="${sideAccent}"/>`
    : isShort
      ? `<path d="M74 12 L150 12 L150 86 L182 86 L112 150 L42 86 L74 86 Z" fill="${sideAccent}"/>`
      : `<circle cx="112" cy="82" r="58" fill="none" stroke="${sideAccent}" stroke-width="16"/><path d="M112 44 V88 L146 110" stroke="${sideAccent}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  const resultMark = isWin
    ? `<path d="M46 94 L86 134 L176 38" fill="none" stroke="${resultAccent}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>`
    : isLoss
      ? `<path d="M58 42 L166 150 M166 42 L58 150" fill="none" stroke="${resultAccent}" stroke-width="24" stroke-linecap="round"/>`
      : `<circle cx="112" cy="92" r="58" fill="none" stroke="${resultAccent}" stroke-width="18"/>
         <path d="M112 52 V98 L148 120" stroke="${resultAccent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  const svg = `
  <svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#05070A"/>
        <stop offset="46%" stop-color="#0B1117"/>
        <stop offset="100%" stop-color="#10151C"/>
      </linearGradient>
      <linearGradient id="sideGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${sideAccent}" stop-opacity="0.48"/>
        <stop offset="48%" stop-color="${sideDark}"/>
        <stop offset="100%" stop-color="#080B0F"/>
      </linearGradient>
      <linearGradient id="resultGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${resultAccent}" stop-opacity="0.45"/>
        <stop offset="50%" stop-color="${resultDark}"/>
        <stop offset="100%" stop-color="#080B0F"/>
      </linearGradient>
      <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${sideAccent}"/>
        <stop offset="52%" stop-color="#F5C86A"/>
        <stop offset="100%" stop-color="${resultAccent}"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.72"/>
      </filter>
      <filter id="glow">
        <feGaussianBlur stdDeviation="12" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#bg)"/>
    <path d="M0 92 H1280 M0 628 H1280" stroke="#1B2430" stroke-width="2"/>
    <path d="M0 94 H1280" stroke="url(#line)" stroke-width="6"/>
    <path d="M0 626 H1280" stroke="url(#line)" stroke-width="6"/>

    <rect x="42" y="36" width="1196" height="648" rx="28" fill="#090E13" stroke="#202A35" stroke-width="2" filter="url(#shadow)"/>
    <rect x="70" y="64" width="1140" height="592" rx="20" fill="#0B1117" stroke="#1B2530" stroke-width="2"/>
    ${premiumFrame}

    <text x="100" y="118" font-size="20" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">TRADE</text>
    <text x="100" y="152" font-size="34" font-weight="950" fill="#F8E7B0" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.idLabel)}</text>
    <text x="640" y="137" text-anchor="middle" font-size="${symbolFont}" font-weight="950" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)}</text>
    <text x="1180" y="118" text-anchor="end" font-size="20" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">MARKET</text>
    <text x="1180" y="152" text-anchor="end" font-size="32" font-weight="950" fill="#F8E7B0" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.marketLabel)}</text>
    ${premiumBadge}

    <g transform="translate(96 196)">
      <rect x="0" y="0" width="336" height="292" rx="22" fill="url(#sideGrad)" stroke="${sideAccent}" stroke-width="4"/>
      <circle cx="168" cy="104" r="92" fill="${sideAccent}" opacity="0.10" filter="url(#glow)"/>
      <g transform="translate(56 28)">${sideArrow}</g>
      <rect x="20" y="188" width="296" height="86" rx="16" fill="#071017" opacity="0.82" stroke="${sideAccent}" stroke-opacity="0.34"/>
      <text x="168" y="230" text-anchor="middle" font-size="38" font-weight="950" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.side)}</text>
      <text x="168" y="258" text-anchor="middle" font-size="16" font-weight="900" fill="#D6DEE8" font-family="Segoe UI, Arial, sans-serif">${isLong ? 'BUY PRESSURE' : isShort ? 'SELL PRESSURE' : 'SIGNAL'}</text>
    </g>

    <g transform="translate(474 196)">
      <rect x="0" y="0" width="332" height="292" rx="22" fill="#0D141C" stroke="#263241" stroke-width="2"/>
      <text x="32" y="48" font-size="18" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(priceLabel).toUpperCase()}</text>
      <text x="32" y="96" font-size="${priceFont}" font-weight="950" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(priceText)}</text>
      <path d="M32 124 H300" stroke="#243140" stroke-width="2"/>
      <text x="32" y="168" font-size="24" font-weight="950" fill="#00D18F" font-family="Segoe UI, Arial, sans-serif">TP ${escapeSvg(card.takeProfitPct ?? '--')}</text>
      <text x="190" y="168" font-size="24" font-weight="950" fill="#FF365C" font-family="Segoe UI, Arial, sans-serif">SL ${escapeSvg(card.stopLossPct ?? '--')}</text>
      <path d="M32 194 H300" stroke="#243140" stroke-width="2"/>
      <text x="32" y="234" font-size="20" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">Duration</text>
      <text x="292" y="234" text-anchor="end" font-size="28" font-weight="950" fill="#F8E7B0" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.duration)}</text>
      <text x="32" y="272" font-size="20" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">PnL</text>
      <text x="292" y="272" text-anchor="end" font-size="28" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>
    </g>

    <g transform="translate(848 196)">
      <rect x="0" y="0" width="336" height="292" rx="22" fill="url(#resultGrad)" stroke="${resultAccent}" stroke-width="4"/>
      <circle cx="168" cy="96" r="86" fill="${resultAccent}" opacity="0.10" filter="url(#glow)"/>
      <g transform="translate(56 16)">${resultMark}</g>
      <rect x="20" y="188" width="296" height="86" rx="16" fill="#071017" opacity="0.82" stroke="${resultAccent}" stroke-opacity="0.34"/>
      <text x="168" y="226" text-anchor="middle" font-size="38" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(statusText)}</text>
      <text x="168" y="260" text-anchor="middle" font-size="${Math.min(pnlFont, 30)}" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(usdtText ?? pnlText)}</text>
    </g>

    <g transform="translate(96 526)">
      <rect x="0" y="0" width="1088" height="72" rx="18" fill="#0D141C" stroke="#263241" stroke-width="2"/>
      <text x="34" y="31" font-size="18" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">Coin</text>
      <text x="34" y="58" font-size="24" font-weight="950" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)}</text>
      <text x="289" y="31" font-size="18" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">Market</text>
      <text x="289" y="58" font-size="24" font-weight="950" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.marketLabel)}</text>
      <text x="544" y="31" font-size="18" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">Side</text>
      <text x="544" y="58" font-size="24" font-weight="950" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.side)}</text>
      <text x="799" y="31" font-size="18" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">Status</text>
      <text x="799" y="58" font-size="24" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(statusText)}</text>
      <text x="974" y="31" font-size="18" font-weight="900" fill="#8EA0B5" font-family="Segoe UI, Arial, sans-serif">24h Net PnL</text>
      <text x="974" y="58" font-size="24" font-weight="950" fill="${netPnlText.startsWith('-') ? '#FF365C' : '#00D18F'}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(netPnlText)}</text>
    </g>

    <text x="640" y="640" text-anchor="middle" font-size="24" font-weight="950" fill="#F8E7B0" font-family="Segoe UI, Arial, sans-serif">Auto Trading System By Muslim Alramadhan</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
  }

  const width = 1280;
  const height = 720;
  const statusText = card.statusLabel === 'ENTRY' ? 'ENTRY' : card.statusLabel;
  {
    const imageWidth = 1280;
    const imageHeight = 640;
    const pnlText = card.pnlUsdt ?? card.pnl ?? '--';
    const isLong = card.side === 'LONG';
    const isShort = card.side === 'SHORT';
    const sideAccent = isLong ? '#17d982' : isShort ? '#ff6a38' : '#61a8ff';
    const sideDeep = isLong ? '#031a10' : isShort ? '#241007' : '#071828';
    const resultAccent = level === 'win' ? '#17d982' : level === 'loss' ? '#ff3655' : '#61a8ff';
    const resultDeep = level === 'win' ? '#031a10' : level === 'loss' ? '#26070e' : '#071828';
    const marketText = card.marketLabel || '--';
    const symbolFont = card.symbol.length > 12 ? 54 : card.symbol.length > 9 ? 62 : 72;
    const sideWord = escapeSvg(card.side);
    const sideGlyph = isLong
      ? `<path d="M168 44 L286 238 H218 V312 H118 V238 H50 Z" fill="${sideAccent}"/>
         <path d="M168 44 L286 238 H218 V312 H118 V238 H50 Z" fill="none" stroke="#9cffd0" stroke-opacity="0.28" stroke-width="8"/>`
      : isShort
        ? `<path d="M168 312 L50 118 H118 V44 H218 V118 H286 Z" fill="${sideAccent}"/>
           <path d="M168 312 L50 118 H118 V44 H218 V118 H286 Z" fill="none" stroke="#ffc0a8" stroke-opacity="0.25" stroke-width="8"/>`
        : `<circle cx="168" cy="178" r="98" fill="none" stroke="${sideAccent}" stroke-width="20"/>
           <path d="M168 98 V190 L224 222" fill="none" stroke="${sideAccent}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`;
    const resultGlyph = level === 'win'
      ? `<path d="M78 196 L136 254 L270 92" fill="none" stroke="${resultAccent}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`
      : level === 'loss'
        ? `<path d="M88 86 L260 258 M260 86 L88 258" fill="none" stroke="${resultAccent}" stroke-width="38" stroke-linecap="round"/>`
        : `<circle cx="174" cy="172" r="104" fill="none" stroke="${resultAccent}" stroke-width="22"/>
           <path d="M174 94 V182 L236 218" fill="none" stroke="${resultAccent}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`;
    const svg = `
  <svg width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#020407"/>
        <stop offset="45%" stop-color="#06100f"/>
        <stop offset="100%" stop-color="#10131a"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#6b4918"/>
        <stop offset="50%" stop-color="#f2c66b"/>
        <stop offset="100%" stop-color="#6b4918"/>
      </linearGradient>
      <linearGradient id="sideBox" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${sideAccent}" stop-opacity="0.32"/>
        <stop offset="56%" stop-color="${sideDeep}"/>
        <stop offset="100%" stop-color="#07100c"/>
      </linearGradient>
      <linearGradient id="resultBox" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${resultAccent}" stop-opacity="0.28"/>
        <stop offset="56%" stop-color="${resultDeep}"/>
        <stop offset="100%" stop-color="#0b0b0f"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="44%" r="60%">
        <stop offset="0%" stop-color="#24372e" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#020407" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.75"/>
      </filter>
      <filter id="neon">
        <feGaussianBlur stdDeviation="7" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <rect width="${imageWidth}" height="${imageHeight}" fill="url(#canvas)"/>
    <rect width="${imageWidth}" height="${imageHeight}" fill="url(#glow)"/>

    <rect x="36" y="30" width="1208" height="580" rx="30" fill="#030909" stroke="url(#gold)" stroke-width="4" filter="url(#shadow)"/>
    <rect x="58" y="52" width="1164" height="536" rx="22" fill="none" stroke="#253320" stroke-width="2"/>
    <path d="M74 102 C98 102 108 90 108 68 M1206 102 C1182 102 1172 90 1172 68 M74 538 C98 538 108 550 108 572 M1206 538 C1182 538 1172 550 1172 572" stroke="#d5aa58" stroke-width="3" fill="none"/>

    <rect x="88" y="78" width="208" height="76" rx="18" fill="#0e1111" stroke="#9b7434" stroke-width="2"/>
    <circle cx="118" cy="116" r="21" fill="#1a1710" stroke="#f2c66b" stroke-width="3"/>
    <path d="M118 100 L124 112 L137 113 L127 122 L130 136 L118 128 L106 136 L109 122 L99 113 L112 112 Z" fill="#f2c66b"/>
    <text x="154" y="111" font-size="20" font-weight="950" fill="#e2c174" font-family="Segoe UI, Arial, sans-serif">TRADE</text>
    <text x="154" y="141" font-size="25" font-weight="950" fill="#fff0c4" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.idLabel)}</text>

    <text x="640" y="112" text-anchor="middle" font-size="${symbolFont}" font-weight="950" fill="#f2c66b" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)}</text>
    <path d="M500 148 H582 M698 148 H780" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/>
    <rect x="594" y="132" width="92" height="32" rx="3" fill="#0e1111" stroke="#9b7434" stroke-width="2" transform="skewX(-22)"/>
    <text x="640" y="157" text-anchor="middle" font-size="22" font-weight="950" fill="#e2c174" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(marketText)}</text>

    <g transform="translate(92 190)">
      <rect x="0" y="0" width="354" height="300" rx="18" fill="url(#sideBox)" stroke="${sideAccent}" stroke-width="3"/>
      <rect x="18" y="18" width="318" height="210" rx="14" fill="#07110e" opacity="0.64"/>
      <circle cx="177" cy="126" r="104" fill="${sideAccent}" opacity="0.12" filter="url(#neon)"/>
      <g transform="translate(9 14) scale(0.95)">${sideGlyph}</g>
      <text x="177" y="268" text-anchor="middle" font-size="54" font-weight="950" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${sideWord}</text>
    </g>

    <g transform="translate(488 210)">
      <rect x="0" y="0" width="304" height="260" rx="18" fill="#0a0d10" stroke="#3a2d1b" stroke-width="2"/>
      <path d="M36 67 H268 M36 128 H268 M36 189 H268" stroke="#28323a" stroke-width="2"/>
      <circle cx="46" cy="40" r="14" fill="#101c14" stroke="#d7b669"/>
      <text x="80" y="49" font-size="24" font-weight="950" fill="#e2c174" font-family="Segoe UI, Arial, sans-serif">TP:</text>
      <text x="184" y="49" font-size="25" font-weight="950" fill="#17d982" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.takeProfitPct ?? '--')}</text>
      <circle cx="46" cy="101" r="14" fill="#251014" stroke="#d7b669"/>
      <text x="80" y="110" font-size="24" font-weight="950" fill="#e2c174" font-family="Segoe UI, Arial, sans-serif">SL:</text>
      <text x="184" y="110" font-size="25" font-weight="950" fill="#ff3655" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.stopLossPct ?? '--')}</text>
      <circle cx="46" cy="162" r="14" fill="#13181d" stroke="#d7b669"/>
      <text x="80" y="171" font-size="24" font-weight="950" fill="#e2c174" font-family="Segoe UI, Arial, sans-serif">Duration:</text>
      <text x="214" y="171" font-size="25" font-weight="950" fill="#f4e6bd" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.duration)}</text>
      <circle cx="46" cy="223" r="14" fill="#13181d" stroke="#d7b669"/>
      <text x="80" y="232" font-size="24" font-weight="950" fill="#e2c174" font-family="Segoe UI, Arial, sans-serif">PnL:</text>
      <text x="184" y="232" font-size="25" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>
    </g>

    <g transform="translate(836 190)">
      <rect x="0" y="0" width="354" height="300" rx="18" fill="url(#resultBox)" stroke="${resultAccent}" stroke-width="3"/>
      <rect x="18" y="18" width="318" height="210" rx="14" fill="#0b0d11" opacity="0.62"/>
      <circle cx="177" cy="124" r="106" fill="${resultAccent}" opacity="0.10" filter="url(#neon)"/>
      <g transform="translate(18 18) scale(0.92)">${resultGlyph}</g>
      <text x="177" y="214" text-anchor="middle" font-size="50" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(statusText)}</text>
      <rect x="74" y="232" width="206" height="52" rx="9" fill="#12090c" stroke="${resultAccent}" stroke-width="2"/>
      <text x="177" y="270" text-anchor="middle" font-size="36" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>
    </g>

    <rect x="148" y="526" width="984" height="46" rx="12" fill="#0c0f10" stroke="#9b7434" stroke-width="2"/>
    <circle cx="306" cy="549" r="17" fill="#20190e" stroke="#d7b669" stroke-width="2"/>
    <path d="M306 536 L311 546 L322 547 L314 554 L317 565 L306 559 L295 565 L298 554 L290 547 L301 546 Z" fill="#d7b669"/>
    <text x="640" y="558" text-anchor="middle" font-size="23" font-weight="950" fill="#e2c174" font-family="Segoe UI, Arial, sans-serif">Auto Trading System By Muslim Alramadhan</text>
  </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  {
    const imageWidth = 1280;
    const imageHeight = 700;
    const pnlText = card.pnlUsdt ?? card.pnl ?? '--';
    const sideAccent = card.side === 'LONG' ? '#16d477' : card.side === 'SHORT' ? '#ff5b35' : '#5fa8ff';
    const sidePanel = card.side === 'LONG' ? '#082817' : card.side === 'SHORT' ? '#2a1209' : '#0b1d31';
    const resultAccent = level === 'win' ? '#16d477' : level === 'loss' ? '#ff334d' : '#5fa8ff';
    const resultPanel = level === 'win' ? '#082817' : level === 'loss' ? '#29070d' : '#0b1d31';
    const marketText = card.marketLabel || '--';
    const sideIcon = card.side === 'LONG'
      ? `<g opacity="0.98">
           <path d="M96 78 C62 48 50 18 58 8 C92 24 118 48 139 80 C161 66 199 66 221 80 C242 48 268 24 302 8 C310 18 298 48 264 78 C278 101 274 137 248 166 L216 204 H144 L112 166 C86 137 82 101 96 78 Z" fill="${sideAccent}"/>
           <path d="M134 111 L179 170 L224 111 Z" fill="#042015" opacity="0.42"/>
           <circle cx="142" cy="112" r="8" fill="#04110c"/><circle cx="218" cy="112" r="8" fill="#04110c"/>
           <path d="M151 151 C166 162 194 162 209 151" stroke="#04110c" stroke-width="8" stroke-linecap="round" fill="none"/>
         </g>`
      : card.side === 'SHORT'
        ? `<g opacity="0.98">
             <path d="M94 72 L180 28 L266 72 L286 150 L226 222 H134 L74 150 Z" fill="${sideAccent}"/>
             <path d="M90 72 L50 42 L60 108 Z M270 72 L310 42 L300 108 Z" fill="${sideAccent}" opacity="0.82"/>
             <path d="M130 126 H156 L143 146 Z M204 126 H230 L217 146 Z" fill="#190805"/>
             <path d="M148 178 C166 165 194 165 212 178" stroke="#190805" stroke-width="9" stroke-linecap="round" fill="none"/>
           </g>`
        : `<circle cx="180" cy="126" r="86" fill="none" stroke="${sideAccent}" stroke-width="24"/><path d="M180 66 V130 L224 162" stroke="${sideAccent}" stroke-width="20" stroke-linecap="round" fill="none"/>`;
    const resultIcon = level === 'win'
      ? `<path d="M78 150 L132 204 L252 70" fill="none" stroke="${resultAccent}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`
      : level === 'loss'
        ? `<g opacity="0.98">
             <path d="M74 70 L150 28 L226 70 L244 142 L192 204 H108 L56 142 Z" fill="${resultAccent}"/>
             <path d="M72 70 L38 44 L48 102 Z M228 70 L262 44 L252 102 Z" fill="${resultAccent}" opacity="0.82"/>
             <path d="M106 116 H130 L118 135 Z M170 116 H194 L182 135 Z" fill="#1a0509"/>
             <path d="M120 166 C136 154 164 154 180 166" stroke="#1a0509" stroke-width="8" stroke-linecap="round" fill="none"/>
           </g>`
        : `<circle cx="150" cy="120" r="84" fill="none" stroke="${resultAccent}" stroke-width="22"/><path d="M150 62 V128 L196 158" stroke="${resultAccent}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    const svg = `
  <svg width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#060b10"/>
        <stop offset="55%" stop-color="#020807"/>
        <stop offset="100%" stop-color="#10161d"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#6d4d1d"/>
        <stop offset="48%" stop-color="#f0c76c"/>
        <stop offset="100%" stop-color="#6d4d1d"/>
      </linearGradient>
      <linearGradient id="sidePanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${sideAccent}" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="${sidePanel}" stop-opacity="1"/>
      </linearGradient>
      <linearGradient id="resultPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${resultAccent}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${resultPanel}" stop-opacity="1"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.72"/>
      </filter>
      <filter id="softGlow">
        <feGaussianBlur stdDeviation="10" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${imageWidth}" height="${imageHeight}" fill="url(#bg)"/>
    <rect x="34" y="32" width="1212" height="636" rx="30" fill="#030b0b" stroke="url(#gold)" stroke-width="4" filter="url(#shadow)"/>
    <rect x="54" y="52" width="1172" height="596" rx="24" fill="none" stroke="#27331f" stroke-width="2"/>
    <path d="M74 106 C96 106 106 94 106 74 M1174 106 C1152 106 1142 94 1142 74 M74 594 C96 594 106 606 106 626 M1174 594 C1152 594 1142 606 1142 626" stroke="#d1a85a" stroke-width="3" fill="none"/>
    <path d="M56 170 H78 M56 226 H78 M56 282 H78 M56 338 H78 M56 394 H78 M56 450 H78 M56 506 H78 M1202 170 H1224 M1202 226 H1224 M1202 282 H1224 M1202 338 H1224 M1202 394 H1224 M1202 450 H1224 M1202 506 H1224" stroke="#72511f" stroke-width="3" stroke-linecap="round"/>

    <rect x="86" y="74" width="220" height="78" rx="18" fill="#111313" stroke="#9b7737" stroke-width="2"/>
    <circle cx="116" cy="113" r="22" fill="#1b1b16" stroke="#f0c76c" stroke-width="3"/>
    <path d="M116 96 L122 108 L135 109 L125 118 L128 132 L116 124 L104 132 L107 118 L97 109 L110 108 Z" fill="#f0c76c"/>
    <text x="154" y="108" font-size="21" font-weight="950" fill="#dec073" font-family="Segoe UI, Arial, sans-serif">TRADE</text>
    <text x="154" y="138" font-size="26" font-weight="950" fill="#fff0bd" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.idLabel)}</text>

    <text x="640" y="118" text-anchor="middle" font-size="66" font-weight="950" fill="#f0c76c" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)}</text>
    <path d="M506 154 H586 M694 154 H774" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/>
    <path d="M594 154 L612 140 H668 L686 154 L668 168 H612 Z" fill="#10100d" stroke="#a27b35" stroke-width="3"/>
    <text x="640" y="163" text-anchor="middle" font-size="24" font-weight="950" fill="#dec073" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(marketText)}</text>

    <rect x="92" y="194" width="360" height="344" rx="22" fill="url(#sidePanel)" stroke="${sideAccent}" stroke-width="3"/>
    <rect x="112" y="214" width="320" height="260" rx="16" fill="#06100d" opacity="0.62"/>
    <circle cx="272" cy="344" r="104" fill="${sideAccent}" opacity="0.13" filter="url(#softGlow)"/>
    <g transform="translate(92, 224) scale(0.9)">${sideIcon}</g>
    <text x="272" y="502" text-anchor="middle" font-size="58" font-weight="950" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.side)}</text>

    <rect x="490" y="220" width="326" height="296" rx="20" fill="#0a0f13" stroke="#352b1b" stroke-width="2"/>
    <path d="M526 294 H782 M526 358 H782 M526 422 H782" stroke="#26313a" stroke-width="2"/>
    <circle cx="536" cy="262" r="15" fill="#142015" stroke="#d7b667"/>
    <text x="566" y="271" font-size="24" font-weight="950" fill="#dec073" font-family="Segoe UI, Arial, sans-serif">TP:</text>
    <text x="672" y="271" font-size="25" font-weight="950" fill="#16d477" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.takeProfitPct ?? '--')}</text>
    <circle cx="536" cy="326" r="15" fill="#261013" stroke="#d7b667"/>
    <text x="566" y="335" font-size="24" font-weight="950" fill="#dec073" font-family="Segoe UI, Arial, sans-serif">SL:</text>
    <text x="672" y="335" font-size="25" font-weight="950" fill="#ff334d" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.stopLossPct ?? '--')}</text>
    <circle cx="536" cy="390" r="15" fill="#14191f" stroke="#d7b667"/>
    <text x="566" y="399" font-size="24" font-weight="950" fill="#dec073" font-family="Segoe UI, Arial, sans-serif">Duration:</text>
    <text x="704" y="399" font-size="25" font-weight="950" fill="#f6e8bd" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.duration)}</text>
    <circle cx="536" cy="454" r="15" fill="#14191f" stroke="#d7b667"/>
    <text x="566" y="463" font-size="24" font-weight="950" fill="#dec073" font-family="Segoe UI, Arial, sans-serif">PnL:</text>
    <text x="672" y="463" font-size="25" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>

    <rect x="854" y="194" width="360" height="344" rx="22" fill="url(#resultPanel)" stroke="${resultAccent}" stroke-width="3"/>
    <rect x="874" y="214" width="320" height="260" rx="16" fill="#0a0c10" opacity="0.58"/>
    <g transform="translate(884, 226) scale(0.95)">${resultIcon}</g>
    <text x="1034" y="410" text-anchor="middle" font-size="52" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(statusText)}</text>
    <rect x="922" y="430" width="224" height="64" rx="10" fill="#170a0d" stroke="${resultAccent}" stroke-width="2" opacity="0.98"/>
    <text x="1034" y="476" text-anchor="middle" font-size="42" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>

    <rect x="146" y="588" width="988" height="54" rx="14" fill="#0d1011" stroke="#a27b35" stroke-width="2"/>
    <circle cx="306" cy="615" r="18" fill="#211b10" stroke="#d7b667" stroke-width="2"/>
    <path d="M306 602 L311 611 L321 612 L313 619 L316 629 L306 623 L296 629 L299 619 L291 612 L301 611 Z" fill="#d7b667"/>
    <text x="640" y="626" text-anchor="middle" font-size="24" font-weight="950" fill="#dec073" font-family="Segoe UI, Arial, sans-serif">Auto Trading System By Muslim Alramadhan</text>
  </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  {
    const pnlText = card.pnlUsdt ?? card.pnl ?? '--';
    const isLong = card.side === 'LONG';
    const sideAccent = isLong ? '#16d477' : card.side === 'SHORT' ? '#ff5f2e' : '#5fa8ff';
    const sideGlow = isLong ? '#0c9f5b' : card.side === 'SHORT' ? '#cf381f' : '#2f6cbd';
    const sidePanel = isLong ? '#062116' : card.side === 'SHORT' ? '#251006' : '#081829';
    const resultAccent = level === 'win' ? '#16d477' : level === 'loss' ? '#f03848' : '#5fa8ff';
    const resultPanel = level === 'win' ? '#062116' : level === 'loss' ? '#2a0910' : '#081829';
    const resultLabel = level === 'win' ? 'PROFIT' : level === 'loss' ? 'RISK' : 'LIVE';
    const marketText = card.marketLabel || '--';
    const tpText = card.takeProfitPct ?? '--';
    const slText = card.stopLossPct ?? '--';
    const sideAnimal = isLong
      ? `<path d="M86 78 C48 48 36 20 42 6 C78 22 104 44 128 78 C148 68 180 68 200 78 C224 44 250 22 286 6 C292 20 280 48 242 78 C260 104 258 140 230 172 L204 204 H124 L98 172 C70 140 68 104 86 78 Z" fill="${sideAccent}" opacity="0.96"/>
         <path d="M126 122 L164 174 L202 122 Z" fill="#0a1a12" opacity="0.42"/>
         <circle cx="130" cy="110" r="8" fill="#03100b"/><circle cx="198" cy="110" r="8" fill="#03100b"/>
         <path d="M138 154 C154 164 174 164 190 154" stroke="#03100b" stroke-width="8" stroke-linecap="round" fill="none"/>`
      : card.side === 'SHORT'
        ? `<path d="M88 52 L164 18 L240 52 L258 132 L206 206 H122 L70 132 Z" fill="${sideAccent}" opacity="0.96"/>
           <path d="M82 52 L48 24 L58 90 Z M246 52 L280 24 L270 90 Z" fill="${sideAccent}" opacity="0.82"/>
           <path d="M118 112 H146 L132 134 Z M182 112 H210 L196 134 Z" fill="#170805"/>
           <path d="M132 164 C152 150 176 150 196 164" stroke="#170805" stroke-width="9" stroke-linecap="round" fill="none"/>`
        : `<circle cx="164" cy="112" r="84" fill="none" stroke="${sideAccent}" stroke-width="24"/>
           <path d="M164 58 V122 L208 154" stroke="${sideAccent}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    const resultAnimal = level === 'win'
      ? `<path d="M66 156 L124 214 L246 74" fill="none" stroke="${resultAccent}" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
         <circle cx="156" cy="138" r="120" fill="none" stroke="${resultAccent}" stroke-width="10" opacity="0.25"/>`
      : level === 'loss'
        ? `<path d="M88 52 L164 18 L240 52 L258 132 L206 206 H122 L70 132 Z" fill="${resultAccent}" opacity="0.96"/>
           <path d="M82 52 L48 24 L58 90 Z M246 52 L280 24 L270 90 Z" fill="${resultAccent}" opacity="0.82"/>
           <path d="M118 112 H146 L132 134 Z M182 112 H210 L196 134 Z" fill="#17060a"/>
           <path d="M130 166 C152 150 176 150 198 166" stroke="#17060a" stroke-width="9" stroke-linecap="round" fill="none"/>`
        : `<circle cx="164" cy="118" r="102" fill="none" stroke="${resultAccent}" stroke-width="18" opacity="0.9"/>
           <path d="M164 54 V128 L216 164" stroke="${resultAccent}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#020509"/>
        <stop offset="48%" stop-color="#071018"/>
        <stop offset="100%" stop-color="#0d141c"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#5d4017"/>
        <stop offset="45%" stop-color="#f0c66f"/>
        <stop offset="100%" stop-color="#5d4017"/>
      </linearGradient>
      <radialGradient id="centerGlow" cx="50%" cy="46%" r="58%">
        <stop offset="0%" stop-color="#243140" stop-opacity="0.46"/>
        <stop offset="100%" stop-color="#020509" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sideWash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${sideGlow}" stop-opacity="0.58"/>
        <stop offset="100%" stop-color="${sidePanel}" stop-opacity="1"/>
      </linearGradient>
      <linearGradient id="resultWash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${resultAccent}" stop-opacity="0.36"/>
        <stop offset="100%" stop-color="${resultPanel}" stop-opacity="1"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.7"/>
      </filter>
      <filter id="glow">
        <feGaussianBlur stdDeviation="9" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#canvas)"/>
    <rect width="${width}" height="${height}" fill="url(#centerGlow)"/>

    <rect x="34" y="34" width="1212" height="652" rx="30" fill="#050a0f" stroke="url(#gold)" stroke-width="4" filter="url(#shadow)"/>
    <rect x="54" y="54" width="1172" height="612" rx="22" fill="none" stroke="#2c2415" stroke-width="2"/>
    <path d="M56 100 C72 100 78 92 78 78 M1202 100 C1186 100 1180 92 1180 78 M56 620 C72 620 78 628 78 642 M1202 620 C1186 620 1180 628 1180 642" stroke="#d5aa55" stroke-width="3" fill="none"/>
    <path d="M52 174 H72 M52 230 H72 M52 286 H72 M52 342 H72 M52 398 H72 M52 454 H72 M52 510 H72 M1208 174 H1228 M1208 230 H1228 M1208 286 H1228 M1208 342 H1228 M1208 398 H1228 M1208 454 H1228 M1208 510 H1228" stroke="#5d4017" stroke-width="3" stroke-linecap="round"/>

    <rect x="78" y="72" width="218" height="78" rx="18" fill="#101313" stroke="#8b682b" stroke-width="2"/>
    <circle cx="108" cy="111" r="20" fill="#1b1c18" stroke="#e4b866" stroke-width="2"/>
    <path d="M108 95 L113 106 L125 107 L116 115 L119 127 L108 120 L97 127 L100 115 L91 107 L103 106 Z" fill="#e4b866"/>
    <text x="142" y="104" font-size="18" font-weight="950" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">TRADE</text>
    <text x="142" y="134" font-size="24" font-weight="950" fill="#fff2bf" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.idLabel)}</text>

    <text x="640" y="116" text-anchor="middle" font-size="68" font-weight="950" fill="#f0c66f" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)}</text>
    <path d="M452 146 H560 M720 146 H828" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/>
    <path d="M590 146 L604 136 H676 L690 146 L676 156 H604 Z" fill="#111613" stroke="#8b682b" stroke-width="2"/>
    <text x="640" y="156" text-anchor="middle" font-size="23" font-weight="950" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(marketText)}</text>

    <rect x="82" y="194" width="356" height="342" rx="22" fill="url(#sideWash)" stroke="${sideAccent}" stroke-width="3"/>
    <rect x="100" y="212" width="320" height="306" rx="18" fill="#06100d" opacity="0.46"/>
    <circle cx="260" cy="338" r="118" fill="${sideAccent}" opacity="0.15" filter="url(#glow)"/>
    <g transform="translate(102, 218) scale(0.96)">${sideAnimal}</g>
    <text x="260" y="498" text-anchor="middle" font-size="60" font-weight="950" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.side)}</text>

    <rect x="478" y="218" width="324" height="294" rx="22" fill="#090f14" stroke="#332918" stroke-width="2"/>
    <path d="M512 292 H768 M512 356 H768 M512 420 H768" stroke="#1d2731" stroke-width="2"/>
    <circle cx="524" cy="260" r="15" fill="#16251c" stroke="#d8bd77"/>
    <text x="552" y="268" font-size="24" font-weight="900" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">TP:</text>
    <text x="660" y="268" font-size="25" font-weight="950" fill="#16d477" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(tpText)}</text>
    <circle cx="524" cy="324" r="15" fill="#251015" stroke="#d8bd77"/>
    <text x="552" y="332" font-size="24" font-weight="900" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">SL:</text>
    <text x="660" y="332" font-size="25" font-weight="950" fill="#f03848" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(slText)}</text>
    <circle cx="524" cy="388" r="15" fill="#171b21" stroke="#d8bd77"/>
    <text x="552" y="396" font-size="24" font-weight="900" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">DURATION:</text>
    <text x="706" y="396" font-size="25" font-weight="950" fill="#f8ecd2" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.duration)}</text>
    <circle cx="524" cy="452" r="15" fill="#171b21" stroke="#d8bd77"/>
    <text x="552" y="460" font-size="24" font-weight="900" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">PnL:</text>
    <text x="660" y="460" font-size="25" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>

    <rect x="842" y="194" width="356" height="342" rx="22" fill="url(#resultWash)" stroke="${resultAccent}" stroke-width="3"/>
    <rect x="860" y="212" width="320" height="306" rx="18" fill="#0b0d11" opacity="0.42"/>
    <text x="1020" y="254" text-anchor="middle" font-size="23" font-weight="950" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">${resultLabel}</text>
    <g transform="translate(862, 238) scale(0.96)">${resultAnimal}</g>
    <text x="1020" y="432" text-anchor="middle" font-size="62" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(statusText)}</text>
    <text x="1020" y="492" text-anchor="middle" font-size="50" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>

    <rect x="134" y="584" width="1012" height="54" rx="17" fill="#0c1012" stroke="#8b682b" stroke-width="2"/>
    <circle cx="298" cy="611" r="18" fill="#201b10" stroke="#d8bd77"/>
    <path d="M298 598 L302 607 L312 608 L304 615 L307 625 L298 619 L289 625 L292 615 L284 608 L294 607 Z" fill="#d8bd77"/>
    <text x="640" y="622" text-anchor="middle" font-size="23" font-weight="950" fill="#d8bd77" font-family="Segoe UI, Arial, sans-serif">Auto Trading System By Muslim Alramadhan</text>
  </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  const pnlText = card.pnlUsdt ?? card.pnl ?? '';
  const isLong = card.side === 'LONG';
  const sideAccent = isLong ? '#22d37f' : card.side === 'SHORT' ? '#f97316' : '#58aefe';
  const sideDark = isLong ? '#06291d' : card.side === 'SHORT' ? '#301707' : '#10263f';
  const resultAccent = level === 'win' ? '#22d37f' : level === 'loss' ? '#ef334f' : '#58aefe';
  const resultDark = level === 'win' ? '#06291d' : level === 'loss' ? '#330b14' : '#10263f';
  const animalLabel = isLong ? 'BULL' : card.side === 'SHORT' ? 'BEAR' : 'SIGNAL';
  const sideAnimal = isLong
    ? `<path d="M92 94 C54 58 36 24 42 8 C72 28 94 50 112 76 C134 62 170 62 192 76 C210 50 232 28 262 8 C268 24 250 58 212 94 C218 112 214 136 198 154 L174 180 H130 L106 154 C90 136 86 112 92 94 Z" fill="${sideAccent}" opacity="0.95"/>
       <path d="M124 118 L146 144 L168 118 Z" fill="#06120d" opacity="0.45"/>
       <circle cx="126" cy="104" r="8" fill="#06120d"/><circle cx="166" cy="104" r="8" fill="#06120d"/>`
    : `<path d="M78 68 C104 22 188 22 214 68 L250 42 C252 86 234 118 216 138 C206 178 178 202 146 202 C114 202 86 178 76 138 C58 118 40 86 42 42 Z" fill="${sideAccent}" opacity="0.95"/>
       <path d="M106 112 H132 L120 134 Z M160 112 H186 L172 134 Z" fill="#150906"/>
       <path d="M124 162 C138 174 154 174 168 162" stroke="#150906" stroke-width="9" stroke-linecap="round" fill="none"/>`;
  const resultAnimal = level === 'win'
    ? `<path d="M78 152 L128 202 L236 84" fill="none" stroke="${resultAccent}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`
    : level === 'loss'
      ? `<path d="M84 70 C110 26 190 26 216 70 L252 46 C254 86 236 120 218 140 C208 178 178 202 150 202 C118 202 90 178 80 140 C62 120 44 86 46 46 Z" fill="${resultAccent}" opacity="0.95"/>
         <path d="M110 112 H136 L122 134 Z M164 112 H190 L176 134 Z" fill="#17060a"/>
         <path d="M116 166 C136 152 166 152 186 166" stroke="#17060a" stroke-width="10" stroke-linecap="round" fill="none"/>`
      : `<circle cx="150" cy="126" r="82" fill="none" stroke="${resultAccent}" stroke-width="24"/><path d="M150 74 L150 136 L196 164" fill="none" stroke="${resultAccent}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`;
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#03070b"/>
        <stop offset="54%" stop-color="#071016"/>
        <stop offset="100%" stop-color="#0d151d"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#7b5a25"/>
        <stop offset="42%" stop-color="#e4b85d"/>
        <stop offset="100%" stop-color="#7b5a25"/>
      </linearGradient>
      <radialGradient id="centerGlow" cx="50%" cy="46%" r="58%">
        <stop offset="0%" stop-color="#233143" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#03070b" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.7"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#canvas)"/>
    <rect width="${width}" height="${height}" fill="url(#centerGlow)"/>

    <rect x="34" y="34" width="1212" height="652" rx="28" fill="#060d12" stroke="url(#gold)" stroke-width="4" filter="url(#shadow)"/>
    <path d="M58 58 H154 M1126 58 H1222 M58 662 H154 M1126 662 H1222" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/>
    <path d="M58 58 V154 M1222 58 V154 M58 566 V662 M1222 566 V662" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/>

    <rect x="72" y="74" width="210" height="70" rx="18" fill="#0d151b" stroke="#6f5224" stroke-width="2"/>
    <text x="118" y="104" font-size="18" font-weight="900" fill="#d9b467" font-family="Segoe UI, Arial, sans-serif">TRADE</text>
    <text x="118" y="132" font-size="24" font-weight="950" fill="#f6e8bd" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.idLabel)}</text>
    <circle cx="96" cy="109" r="18" fill="#1c2430" stroke="#d9b467"/><text x="96" y="118" text-anchor="middle" font-size="22" fill="#d9b467" font-family="Segoe UI, Arial, sans-serif">★</text>

    <text x="640" y="122" text-anchor="middle" font-size="68" font-weight="950" fill="#f6d98b" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)}</text>
    <path d="M438 152 H842" stroke="url(#gold)" stroke-width="3"/>
    <text x="640" y="184" text-anchor="middle" font-size="28" font-weight="900" fill="#d7c08a" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.marketLabel)}</text>

    <rect x="92" y="214" width="350" height="330" rx="20" fill="${sideDark}" stroke="#164f34" stroke-width="3"/>
    <g transform="translate(126, 242) scale(0.95)">${sideAnimal}</g>
    <text x="267" y="490" text-anchor="middle" font-size="58" font-weight="950" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.side)}</text>

    <rect x="486" y="234" width="308" height="258" rx="18" fill="#091219" stroke="#253443" stroke-width="2"/>
    <text x="528" y="286" font-size="24" font-weight="900" fill="#d8bf75" font-family="Segoe UI, Arial, sans-serif">🎯 TP:</text>
    <text x="672" y="286" font-size="24" font-weight="950" fill="#22d37f" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.takeProfitPct ?? '--')}</text>
    <text x="528" y="346" font-size="24" font-weight="900" fill="#d8bf75" font-family="Segoe UI, Arial, sans-serif">🛑 SL:</text>
    <text x="672" y="346" font-size="24" font-weight="950" fill="#ff4269" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.stopLossPct ?? '--')}</text>
    <text x="528" y="406" font-size="24" font-weight="900" fill="#d8bf75" font-family="Segoe UI, Arial, sans-serif">⏱ TIME:</text>
    <text x="696" y="406" font-size="24" font-weight="950" fill="#f6e8bd" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.duration)}</text>
    <text x="528" y="466" font-size="24" font-weight="900" fill="#d8bf75" font-family="Segoe UI, Arial, sans-serif">📈 PnL:</text>
    <text x="690" y="466" font-size="24" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText || '--')}</text>

    <rect x="838" y="214" width="350" height="330" rx="20" fill="${resultDark}" stroke="${level === 'loss' ? '#671524' : level === 'win' ? '#16643f' : '#1e4c77'}" stroke-width="3"/>
    <g transform="translate(930, 242) scale(0.95)">${resultAnimal}</g>
    <text x="1013" y="430" text-anchor="middle" font-size="58" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(statusText)}</text>
    ${pnlText ? `<text x="1013" y="492" text-anchor="middle" font-size="50" font-weight="950" fill="${resultAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(pnlText)}</text>` : ''}

    <rect x="92" y="594" width="1096" height="54" rx="16" fill="#0b1218" stroke="#6f5224" stroke-width="2"/>
    <text x="640" y="629" text-anchor="middle" font-size="24" font-weight="900" fill="#d9b467" font-family="Segoe UI, Arial, sans-serif">Auto Trading System By Muslim Alramadhan</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
  /*
  const width = 1280;
  const height = 720;
  const accent = level === 'win' ? '#26d07c' : level === 'loss' ? '#f05f78' : '#66b6ff';
  const accentGlow = level === 'win' ? '#123828' : level === 'loss' ? '#391723' : '#163450';
  const sideAccent = card.side === 'LONG' ? '#2ad883' : card.side === 'SHORT' ? '#ff8a3d' : '#66b6ff';
  const sideSurface = card.side === 'LONG' ? '#102b1f' : card.side === 'SHORT' ? '#312014' : '#14253f';
  const statusSurface = level === 'win' ? '#122d22' : level === 'loss' ? '#341722' : '#17314e';
  const signalValue = card.pnl ?? card.entry ?? '--';
  const primaryStatus = card.statusLabel === 'NEW' ? 'ENTRY' : card.statusLabel;
  const summaryValueLabel = primaryStatus === 'ENTRY' ? 'Entry Price' : 'Closed Result';
  const confidenceWidth = card.confidence ? Math.max(96, Math.min(300, Number.parseInt(card.confidence, 10) * 3 || 150)) : 150;
  const details = [
    { label: 'Strategy', value: card.strategy, x: 620, y: 284, w: 270 },
    { label: 'Timeframe', value: card.timeframe, x: 914, y: 284, w: 270 },
    { label: 'Entry', value: card.entry ?? '--', x: 620, y: 418, w: 270 },
    { label: 'Take Profit', value: card.takeProfit ?? '--', x: 914, y: 418, w: 270 },
    { label: 'Stop Loss', value: card.stopLoss ?? '--', x: 620, y: 552, w: 270 },
    { label: 'Confidence', value: card.confidence ?? '--', x: 914, y: 552, w: 270 }
  ];
  const detailBlocks = details.map(({ label, value, x, y, w }) => {
    const isStrategy = label === 'Strategy';
    const valueFontSize = isStrategy ? 24 : 30;
    return `
    <g transform="translate(${x}, ${y})">
      <rect x="0" y="0" width="${w}" height="106" rx="24" fill="#10192a" stroke="#213652"/>
      <text x="24" y="34" font-size="18" fill="#7f95b3" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(label)}</text>
      <text x="24" y="74" font-size="${valueFontSize}" font-weight="700" fill="#f5f7fb" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(value)}</text>
      <rect x="24" y="86" width="${Math.min(170, Math.max(82, String(value).length * 11))}" height="4" rx="2" fill="${accent}" opacity="0.82"/>
    </g>
  `;
  }).join('');
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#060d18"/>
        <stop offset="45%" stop-color="#0a1321"/>
        <stop offset="100%" stop-color="#0e1728"/>
      </linearGradient>
      <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#101c2f"/>
        <stop offset="100%" stop-color="#0b1423"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${accent}"/>
        <stop offset="50%" stop-color="#7dd3fc"/>
        <stop offset="100%" stop-color="${sideAccent}"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#030812" flood-opacity="0.45"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#canvas)"/>
    <circle cx="196" cy="138" r="240" fill="${accentGlow}" opacity="0.8"/>
    <circle cx="1120" cy="160" r="180" fill="#101b31" opacity="0.95"/>
    <circle cx="1070" cy="610" r="250" fill="#08111f" opacity="0.92"/>
    <rect x="32" y="32" width="${width - 64}" height="${height - 64}" rx="38" fill="#0a1220" stroke="#1d304d" filter="url(#softShadow)"/>
    <rect x="32" y="32" width="${width - 64}" height="6" rx="3" fill="url(#edge)"/>

    <g transform="translate(60, 60)">
      <rect x="0" y="0" width="520" height="600" rx="34" fill="url(#hero)" stroke="#223657"/>
      <rect x="0" y="0" width="520" height="600" rx="34" fill="none" stroke="${accent}" opacity="0.18"/>
      <text x="54" y="86" font-size="22" fill="#8aa2c1" font-family="Segoe UI, Arial, sans-serif">Crypto Trading System</text>
      <text x="54" y="142" font-size="36" font-weight="700" fill="#f6f8fb" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)}</text>
      <text x="54" y="176" font-size="20" fill="#9db3cd" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.idLabel)}</text>

      <g transform="translate(54, 218)">
        <rect x="0" y="0" width="186" height="88" rx="28" fill="${sideSurface}" stroke="${sideAccent}"/>
        <text x="93" y="56" text-anchor="middle" font-size="42" font-weight="900" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.side)}</text>
      </g>

      <g transform="translate(258, 218)">
        <rect x="0" y="0" width="208" height="88" rx="28" fill="${statusSurface}" stroke="${accent}"/>
        <text x="104" y="56" text-anchor="middle" font-size="42" font-weight="900" fill="${accent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(primaryStatus)}</text>
      </g>

      <text x="54" y="382" font-size="22" fill="#7f95b3" font-family="Segoe UI, Arial, sans-serif">${summaryValueLabel}</text>
      <text x="54" y="466" font-size="88" font-weight="900" fill="${accent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(signalValue)}</text>
      <text x="54" y="514" font-size="16" fill="#8ea4c0" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.strategy)}</text>

      <rect x="54" y="548" width="330" height="12" rx="6" fill="#162337"/>
      <rect x="54" y="548" width="${confidenceWidth}" height="12" rx="6" fill="url(#edge)"/>
      <text x="54" y="592" font-size="18" fill="#90a6c2" font-family="Segoe UI, Arial, sans-serif">Confidence ${escapeSvg(card.confidence ?? '--')}</text>
    </g>

    <text x="620" y="98" font-size="22" fill="#7e96b5" font-family="Segoe UI, Arial, sans-serif">Broadcast Elite</text>
    <text x="620" y="144" font-size="44" font-weight="800" fill="#f5f7fb" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.symbol)} Signal Snapshot</text>

    <g transform="translate(620, 186)">
      <rect x="0" y="0" width="564" height="64" rx="26" fill="#0f1829" stroke="#223657"/>
      <rect x="18" y="14" width="184" height="36" rx="18" fill="${sideSurface}" stroke="${sideAccent}"/>
      <text x="110" y="38" text-anchor="middle" font-size="22" font-weight="800" fill="${sideAccent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.side)}</text>
      <rect x="220" y="14" width="204" height="36" rx="18" fill="${statusSurface}" stroke="${accent}"/>
      <text x="322" y="38" text-anchor="middle" font-size="22" font-weight="800" fill="${accent}" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(primaryStatus)}</text>
      <text x="536" y="39" text-anchor="end" font-size="19" fill="#96acc7" font-family="Segoe UI, Arial, sans-serif">${escapeSvg(card.idLabel)} | ${escapeSvg(card.timeframe)}</text>
    </g>

    ${detailBlocks}

    <g transform="translate(620, 36)">
      <rect x="0" y="0" width="564" height="6" rx="3" fill="url(#edge)"/>
    </g>

  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
  */
}

async function sendTelegramNotificationViaBot(botToken: string | undefined, targetChatId: string | undefined, title: string, message: string, level: 'info' | 'win' | 'loss', audience: 'public' | 'private' = 'public'): Promise<TelegramDeliveryResult> {
  if (!botToken) return { ok: false, message: 'Telegram bot token is missing.' };
  if (!targetChatId) return { ok: false, message: 'Telegram chat id is missing.' };
  if (/^https?:\/\/t\.me\/\+/.test(targetChatId) || /^t\.me\/\+/.test(targetChatId)) {
    return { ok: false, message: 'Telegram private invite links cannot be used as Bot API chat_id. Add the bot as channel admin and use the numeric channel id that starts with -100, or use a public @channel username.' };
  }
  const resolvedChatId: string = targetChatId;
  const card = parseTelegramCardData(title, message, level);
  const caption = formatTelegramCaption(card);
  let photoErrorMessage = '';
  try {
    const image = await generateTelegramCard(card, level, audience);
    const form = new FormData();
    form.set('chat_id', resolvedChatId);
    form.set('caption', caption);
    form.set('parse_mode', 'HTML');
    form.set('disable_web_page_preview', 'true');
    const pngBytes = new Uint8Array(image);
    form.set('photo', new Blob([pngBytes], { type: 'image/png' }), `signal-${card.idLabel.replace('#', '')}.png`);
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: form
    });
    const body = await response.json().catch(async () => ({ ok: false, description: await response.text().catch(() => 'Unable to read Telegram response body') })) as TelegramApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram sendPhoto failed (${response.status}${body.error_code ? `/${body.error_code}` : ''}): ${body.description ?? 'Unknown Telegram API error'}`);
    }
    return { ok: true, message: 'Telegram photo delivered.' };
  } catch (error) {
    photoErrorMessage = error instanceof Error ? error.message : 'Telegram sendPhoto failed.';
    console.error('[telegram] sendPhoto failed, falling back to sendMessage:', error);
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: resolvedChatId,
        text: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const body = await response.json().catch(async () => ({ ok: false, description: await response.text().catch(() => 'Unable to read Telegram response body') })) as TelegramApiResponse;
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram sendMessage failed (${response.status}${body.error_code ? `/${body.error_code}` : ''}): ${body.description ?? 'Unknown Telegram API error'}`);
    }
    return { ok: true, message: `Telegram message delivered after photo fallback. Photo error: ${photoErrorMessage}` };
  } catch (error) {
    console.error('[telegram] sendMessage failed:', error);
    const messageError = error instanceof Error ? error.message : 'Telegram sendMessage failed.';
    return { ok: false, message: `${messageError}${photoErrorMessage ? ` Photo fallback reason: ${photoErrorMessage}` : ''}` };
  }
}

async function sendPublicTelegramNotification(title: string, message: string, level: 'info' | 'win' | 'loss') {
  if (!telegramRuntimeSettings.publicChannelEnabled) return { ok: false, message: 'Public Telegram channel alerts are disabled.' };
  return sendTelegramNotificationViaBot(PUBLIC_TELEGRAM_BOT_TOKEN, PUBLIC_TELEGRAM_CHAT_ID, title, message, level, 'public');
}

async function sendPrivateTelegramNotification(title: string, message: string, level: 'info' | 'win' | 'loss', chatIdOverride?: string) {
  return sendTelegramNotificationViaBot(PRIVATE_TELEGRAM_BOT_TOKEN, chatIdOverride, title, message, level, 'private');
}

async function sendTelegramNotification(title: string, message: string, level: 'info' | 'win' | 'loss', chatIdOverride?: string) {
  return sendTelegramNotificationViaBot(PUBLIC_TELEGRAM_BOT_TOKEN, chatIdOverride ?? PUBLIC_TELEGRAM_CHAT_ID, title, message, level, 'public');
}

function formatTelegramMessage(title: string, message: string, level: 'info' | 'win' | 'loss') {
  const status = level === 'win' ? 'PROFIT CLOSED' : level === 'loss' ? 'LOSS CLOSED' : 'NEW SIGNAL';
  const icon = level === 'win' ? '✅' : level === 'loss' ? '🔻' : '📡';
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replace(/\|/g, '\n');
  return [
    `${icon} <b>${status}</b>`,
    `<b>${safeTitle}</b>`,
    '',
    `<pre>${safeMessage}</pre>`,
    '',
    `<i>Crypto Trading System • Binance Live Feed</i>`
  ].join('\n');
}

async function loadSymbols() {
  const response = await fetch(`${BINANCE_REST}/api/v3/exchangeInfo`);
  const data = await response.json() as {
    symbols: (SymbolInfo & {
      quantityPrecision?: number;
      filters?: { filterType?: string; minNotional?: string; notional?: string; minQty?: string; stepSize?: string }[];
    })[];
  };
  symbols = data.symbols
    .filter(s => s.status === 'TRADING')
    .map(symbol => {
      const notionalFilter = symbol.filters?.find(filter => filter.filterType === 'NOTIONAL' || filter.filterType === 'MIN_NOTIONAL');
      const lotSizeFilter = symbol.filters?.find(filter => filter.filterType === 'LOT_SIZE');
      return {
        symbol: symbol.symbol,
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
        status: symbol.status,
        minNotional: Number(notionalFilter?.minNotional ?? notionalFilter?.notional ?? 0) || undefined,
        minQty: Number(lotSizeFilter?.minQty ?? 0) || undefined,
        stepSize: Number(lotSizeFilter?.stepSize ?? 0) || undefined,
        quantityPrecision: Number.isFinite(symbol.quantityPrecision) ? symbol.quantityPrecision : undefined
      };
    });
  scannerUniverse = symbols.map(s => s.symbol);
  invalidateComputedCaches();
}

async function loadFuturesSymbols() {
  const response = await fetch(`${BINANCE_FUTURES_REST}/fapi/v1/exchangeInfo`);
  const data = await response.json() as {
    symbols: (SymbolInfo & {
      contractType?: string;
      quantityPrecision?: number;
      filters?: { filterType?: string; minNotional?: string; notional?: string; minQty?: string; stepSize?: string }[];
    })[];
  };
  futuresSymbols = data.symbols
    .filter(symbol => symbol.status === 'TRADING' && symbol.quoteAsset === 'USDT')
    .map(symbol => {
      const notionalFilter = symbol.filters?.find(filter => filter.filterType === 'NOTIONAL' || filter.filterType === 'MIN_NOTIONAL');
      const lotSizeFilter = symbol.filters?.find(filter => filter.filterType === 'MARKET_LOT_SIZE')
        ?? symbol.filters?.find(filter => filter.filterType === 'LOT_SIZE');
      return {
        symbol: symbol.symbol,
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
        status: symbol.status,
        minNotional: Number(notionalFilter?.minNotional ?? notionalFilter?.notional ?? 0) || undefined,
        minQty: Number(lotSizeFilter?.minQty ?? 0) || undefined,
        stepSize: Number(lotSizeFilter?.stepSize ?? 0) || undefined,
        quantityPrecision: Number.isFinite(symbol.quantityPrecision) ? symbol.quantityPrecision : undefined
      };
    });
}

async function fetchCandles(symbol: string, interval: Timeframe, market: TradingVenue, limit = CANDLE_LIMIT_DEFAULT): Promise<Candle[]> {
  const safeLimit = Math.max(50, Math.min(CANDLE_LIMIT_CHART, Math.floor(limit)));
  const key = `${market}:${symbol}:${interval}:${safeLimit}`;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CANDLE_CACHE_TTL_MS[interval]) return cached.candles;
  const realInterval = interval === '10m' ? '5m' : interval;
  const baseUrl = market === 'futures' ? BINANCE_FUTURES_REST : BINANCE_REST;
  const path = market === 'futures' ? '/fapi/v1/klines' : '/api/v3/klines';
  const rawLimit = interval === '10m' ? Math.min(CANDLE_LIMIT_CHART, safeLimit * 2) : safeLimit;
  const response = await fetch(`${baseUrl}${path}?symbol=${symbol}&interval=${realInterval}&limit=${rawLimit}`);
  const rows = await response.json() as unknown[][];
  let candles = rows.map(r => ({
    openTime: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    closeTime: Number(r[6])
  }));
  if (interval === '10m') {
    candles = candles.reduce<Candle[]>((acc, cur, i) => {
      if (i % 2 === 0) acc.push({ ...cur });
      else {
        const prev = acc.at(-1)!;
        prev.high = Math.max(prev.high, cur.high);
        prev.low = Math.min(prev.low, cur.low);
        prev.close = cur.close;
        prev.volume += cur.volume;
        prev.closeTime = cur.closeTime;
      }
      return acc;
    }, []);
  }
  candleCache.set(key, { fetchedAt: Date.now(), candles });
  return candles;
}

function buildSignal(strategy: Strategy, draft: SignalDraft, ticker: PriceTicker, timeframe: Timeframe, candles: Candle[], exitMode: ExitMode, market: TradingVenue): TradeSignal | null {
  const entry = ticker.price;
  const { takeProfit, stopLoss } = buildAdvancedExitPlan(strategy.id, draft, ticker, timeframe, candles, exitMode);
  const durationMinutes = exitMode === 'quick'
    ? ({
      '5m': 18,
      '10m': 28,
      '15m': 40,
      '1h': 180,
      '2h': 360,
      '4h': 720,
      '1d': 2160
    } as const)[timeframe]
    : exitMode === 'extended'
      ? ({
        '5m': 90,
        '10m': 150,
        '15m': 210,
        '1h': 960,
        '2h': 1680,
        '4h': 2880,
        '1d': 7200
      } as const)[timeframe]
      : ({
        '5m': 30,
        '10m': 45,
        '15m': 60,
        '1h': 360,
        '2h': 720,
        '4h': 1440,
        '1d': 4320
      } as const)[timeframe];
  return {
    ...draft,
    id: nextSignalId++,
    market,
    strategyId: strategy.id,
    strategyName: strategy.name,
    symbol: ticker.symbol,
    timeframe,
    exitMode,
    entry,
    takeProfit,
    stopLoss,
    expectedProfitPct: Math.abs(percent(entry, takeProfit, draft.side)),
    riskPct: Math.abs(percent(entry, stopLoss, draft.side)),
    openedAt: Date.now(),
    plannedExitAt: Date.now() + durationMinutes * 60_000,
    status: 'OPEN'
  };
}

function higherTimeframeFor(timeframe: Timeframe): Timeframe | null {
  if (timeframe === '5m' || timeframe === '10m') return '15m';
  if (timeframe === '15m') return '1h';
  if (timeframe === '1h') return '4h';
  if (timeframe === '2h') return '4h';
  if (timeframe === '4h') return '1d';
  return null;
}

function clampScore(value: number) {
  return clamp(value, 0, 1);
}

function normalizeReturns(candles: Candle[], size = 18) {
  const sample = candles.slice(-(size + 1));
  const returns: number[] = [];
  for (let index = 1; index < sample.length; index += 1) {
    const previous = sample[index - 1]!.close;
    const current = sample[index]!.close;
    returns.push((current - previous) / Math.max(previous, 0.00000001));
  }
  return returns;
}

function correlation(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  if (size < 6) return 0;
  const leftSlice = left.slice(-size);
  const rightSlice = right.slice(-size);
  const leftMean = leftSlice.reduce((sum, value) => sum + value, 0) / size;
  const rightMean = rightSlice.reduce((sum, value) => sum + value, 0) / size;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < size; index += 1) {
    const leftValue = leftSlice[index]! - leftMean;
    const rightValue = rightSlice[index]! - rightMean;
    numerator += leftValue * rightValue;
    leftVariance += leftValue ** 2;
    rightVariance += rightValue ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  if (!denominator) return 0;
  return numerator / denominator;
}

async function scoreSignalCandidate(signal: TradeSignal, candles: Candle[], ticker: PriceTicker, market: TradingVenue, timeframe: Timeframe) {
  const closes = candles.map(candle => candle.close);
  const direction = signal.side === 'LONG' ? 1 : -1;
  const emaFast = sma(closes, 9);
  const emaSlow = sma(closes, 21);
  const shortMove = percent(closes.at(-6) ?? signal.entry, closes.at(-1) ?? signal.entry, signal.side);
  const momentumBlend = (
    clampScore((((emaFast - emaSlow) / Math.max(signal.entry * 0.01, 0.00000001)) * direction + 1) / 2) * 0.55
    + clampScore((shortMove + 1.6) / 3.2) * 0.45
  );

  const avgVolume = sma(candles.slice(-24).map(candle => candle.volume), 20);
  const latestVolume = candles.at(-1)?.volume ?? avgVolume;
  const volumeImpulse = clampScore((latestVolume / Math.max(avgVolume, 0.00000001) - 0.85) / 1.35);
  const tickerLiquidity = clampScore((Math.log10(Math.max(ticker.quoteVolume, 1)) - 5.2) / 2.2);
  const volumeScore = (volumeImpulse * 0.7) + (tickerLiquidity * 0.3);

  const higherTimeframe = higherTimeframeFor(timeframe);
  let alignmentScore = 0.55;
  if (higherTimeframe) {
    const higherCandles = await fetchCandles(signal.symbol, higherTimeframe, market).catch(() => []);
    if (higherCandles.length >= 30) {
      const higherCloses = higherCandles.map(candle => candle.close);
      const higherFast = sma(higherCloses, 9);
      const higherSlow = sma(higherCloses, 21);
      const higherRsi = rsi(higherCloses);
      const slopeSignal = ((higherFast - higherSlow) / Math.max(signal.entry * 0.012, 0.00000001)) * direction;
      const rsiSignal = signal.side === 'LONG'
        ? clampScore((higherRsi - 48) / 20)
        : clampScore((52 - higherRsi) / 20);
      alignmentScore = clampScore((clampScore((slopeSignal + 1) / 2) * 0.65) + (rsiSignal * 0.35));
    }
  }

  const realizedRr = signal.expectedProfitPct / Math.max(signal.riskPct, 0.00000001);
  const riskRewardScore = clampScore((realizedRr - 1) / 2.4);

  const score = (
    momentumBlend * 0.35
    + volumeScore * 0.20
    + alignmentScore * 0.25
    + riskRewardScore * 0.20
  ) * 100;

  return {
    score,
    components: {
      momentum: momentumBlend,
      volume: volumeScore,
      alignment: alignmentScore,
      riskReward: riskRewardScore,
      diversity: 0
    }
  };
}

function hasOpenSameDirectionSignal(symbol: string, market: TradingVenue, side: Side) {
  return signals.some(signal =>
    signal.symbol === symbol
    && signal.market === market
    && signal.side === side
    && signal.status === 'OPEN'
    && countsAsOpenExecution(signal.executionStatus)
  );
}

function closedSignalPnl(signal: TradeSignal) {
  if (signal.status === 'WIN') return signal.closePrice ? percent(signal.entry, signal.closePrice, signal.side) : signal.expectedProfitPct;
  if (signal.status === 'LOSS') return signal.closePrice ? percent(signal.entry, signal.closePrice, signal.side) : -signal.riskPct;
  return 0;
}

function openSignalPnl(signal: TradeSignal) {
  const ticker = (signal.market === 'futures' ? futuresTickers : tickers).get(signal.symbol);
  if (!ticker) return 0;
  return percent(signal.entry, ticker.price, signal.side);
}

function signalNetPnl(signal: TradeSignal) {
  return signal.status === 'OPEN' ? openSignalPnl(signal) : closedSignalPnl(signal);
}

function getSignalNetPnlTimestamp(signal: TradeSignal) {
  return signal.status === 'OPEN' ? signal.openedAt : signal.closedAt ?? signal.openedAt;
}

function calculate24hNetPnl(currentSignal?: TradeSignal) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const byId = new Map<number, TradeSignal>();
  for (const signal of signals) byId.set(signal.id, signal);
  if (currentSignal) byId.set(currentSignal.id, currentSignal);
  return [...byId.values()]
    .filter(signal => getSignalNetPnlTimestamp(signal) >= cutoff)
    .reduce((sum, signal) => sum + signalNetPnl(signal), 0);
}

function lookup24hNetPnlLabel(idLabel: string) {
  const normalized = idLabel.trim().toUpperCase();
  const currentSignal = signals.find(signal => formatTradeIdLabel(signal.id).toUpperCase() === normalized);
  if (!currentSignal && normalized === '#--') return undefined;
  const netPnl = calculate24hNetPnl(currentSignal);
  return `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}%`;
}

function isStrategyTemporarilyPaused(strategyId: string) {
  const closed = signals
    .filter(signal => signal.strategyId === strategyId && signal.status !== 'OPEN')
    .slice(0, STRATEGY_PAUSE_RULE.minClosedTrades);
  if (closed.length < STRATEGY_PAUSE_RULE.minClosedTrades) return false;
  const wins = closed.filter(signal => signal.status === 'WIN').length;
  const winRate = (wins / closed.length) * 100;
  const netPnl = closed.reduce((sum, signal) => sum + closedSignalPnl(signal), 0);
  return winRate < STRATEGY_PAUSE_RULE.minWinRate || netPnl <= STRATEGY_PAUSE_RULE.maxNetLossPct;
}

function passesQualityGate(candidate: SignalCandidate) {
  const rewardMultiple = candidate.signal.riskPct > 0
    ? candidate.signal.expectedProfitPct / candidate.signal.riskPct
    : Infinity;
  return candidate.score >= QUALITY_GATE.minScore
    && rewardMultiple >= QUALITY_GATE.minRewardMultiple
    && candidate.signal.confidence >= QUALITY_GATE.minConfidence
    && candidate.components.alignment >= QUALITY_GATE.minAlignment;
}

function isMacroUptrend(candles: Candle[]) {
  if (candles.length < 50) return false;
  const closes = candles.map(candle => candle.close);
  const lastClose = closes.at(-1) ?? 0;
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  return lastClose > ema21 && ema21 > ema50;
}

async function isSpotLongMarketSupportive() {
  if (spotLongMarketGateCache && Date.now() - spotLongMarketGateCache.checkedAt < 5 * 60_000) {
    return spotLongMarketGateCache.allowed;
  }
  const [btcCandles, ethCandles] = await Promise.all([
    fetchCandles('BTCUSDT', '1h', 'spot', 80).catch(() => []),
    fetchCandles('ETHUSDT', '1h', 'spot', 80).catch(() => [])
  ]);
  const allowed = isMacroUptrend(btcCandles) || isMacroUptrend(ethCandles);
  spotLongMarketGateCache = { checkedAt: Date.now(), allowed };
  return allowed;
}

function rankCandidatesWithDiversity(candidates: SignalCandidate[]) {
  const openSignals = signals.filter(signal => signal.status === 'OPEN' && countsAsOpenExecution(signal.executionStatus));
  const selected: SignalCandidate[] = [];
  const pool = [...candidates];
  while (pool.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index]!;
      const directionalOpenConflict = openSignals.some(open =>
        open.market === candidate.market
        && open.symbol === candidate.signal.symbol
        && open.side === candidate.signal.side
      );
      let correlationPenalty = 0;
      const compareAgainst = [...selected, ...openSignals.map(signal => ({
        signal,
        score: 0,
        market: signal.market,
        timeframe: signal.timeframe,
        candles: [] as Candle[],
        components: { momentum: 0, volume: 0, alignment: 0, riskReward: 0, diversity: 0 }
      }))].filter(item => item.market === candidate.market);
      for (const peer of compareAgainst) {
        if (peer.signal.symbol === candidate.signal.symbol) continue;
        if (peer.candles.length === 0) continue;
        correlationPenalty = Math.max(correlationPenalty, Math.max(0, correlation(normalizeReturns(candidate.candles), normalizeReturns(peer.candles))));
      }
      const diversityBonus = directionalOpenConflict ? -18 : selected.some(item => item.signal.symbol === candidate.signal.symbol) ? -10 : 4;
      const totalScore = candidate.score + diversityBonus - (correlationPenalty * 12);
      candidate.components.diversity = clampScore((diversityBonus + 18) / 24);
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestIndex = index;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]!);
  }
  return selected;
}

async function scanMarket() {
  if (scanRunning || selectedStrategies.size === 0 || selectedTimeframes.size === 0) return;
  scanRunning = true;
  const version = scanVersion;
  const active = strategies.filter(s => selectedStrategies.has(s.id));
  try {
    const scanVenue = async (market: TradingVenue, source: Map<string, PriceTicker>) => {
      if (market === 'spot' && !(await isSpotLongMarketSupportive())) {
        console.log('[scan] spot long gate blocked: BTC/ETH 1h trend is not above EMA21/EMA50');
        return;
      }
      const universe = getRotatingScanUniverse(source);
      for (const timeframe of selectedTimeframes) {
        if (version !== scanVersion || selectedStrategies.size === 0) return;
        const { batch, nextCursor } = getScanBatch(universe, scanCursors[market][timeframe], SCAN_BATCH_SIZE[timeframe]);
        scanCursors[market][timeframe] = nextCursor;
        const rawCandidates: SignalCandidate[] = [];
        let evaluatedStrategies = 0;
        for (const ticker of batch) {
          if (version !== scanVersion || selectedStrategies.size === 0) return;
          const candles = await fetchCandles(ticker.symbol, timeframe, market).catch(() => []);
          if (version !== scanVersion || selectedStrategies.size === 0) return;
          if (candles.length < 50) continue;
          const signalLockMs = getSignalGenerationLockMs(timeframe);
          const hasRecentSameDirectionSignal = (side: Side) => signals.some(signal =>
            signal.symbol === ticker.symbol
            && signal.market === market
            && signal.side === side
            && signal.status === 'OPEN'
            && (Date.now() - signal.openedAt) < signalLockMs
          );
          for (const strategy of active) {
            if (version !== scanVersion || selectedStrategies.size === 0 || !selectedStrategies.has(strategy.id)) return;
            if (isStrategyTemporarilyPaused(strategy.id)) continue;
            evaluatedStrategies += 1;
            const draft = strategy.evaluate(candles, ticker);
            if (!draft) continue;
            if (market === 'spot' && draft.side !== 'LONG') continue;
            if (hasRecentSameDirectionSignal(draft.side) || hasOpenSameDirectionSignal(ticker.symbol, market, draft.side)) continue;
            const exitMode = pickExitMode(strategy.id, draft, timeframe, candles, selectedExitModes);
            const signal = buildSignal(strategy, draft, ticker, timeframe, candles, exitMode, market);
            if (!signal) continue;
            const score = await scoreSignalCandidate(signal, candles, ticker, market, timeframe);
            const candidate: SignalCandidate = {
              signal,
              score: score.score,
              market,
              timeframe,
              candles,
              components: score.components
            };
            if (!passesQualityGate(candidate)) continue;
            rawCandidates.push(candidate);
          }
        }
        const winnersBySymbolSide = new Map<string, SignalCandidate>();
        for (const candidate of rawCandidates) {
          const key = `${candidate.market}:${candidate.signal.symbol}:${candidate.signal.side}`;
          const current = winnersBySymbolSide.get(key);
          if (!current || candidate.score > current.score) winnersBySymbolSide.set(key, candidate);
        }
        const rankedCandidates = rankCandidatesWithDiversity([...winnersBySymbolSide.values()]);
        console.log(`[scan] market=${market} timeframe=${timeframe} batch=${batch.length} strategies=${evaluatedStrategies} raw=${rawCandidates.length} winners=${winnersBySymbolSide.size} ranked=${rankedCandidates.length}`);
        for (const candidate of rankedCandidates) {
          if (hasOpenSameDirectionSignal(candidate.signal.symbol, candidate.market, candidate.signal.side)) continue;
          candidate.signal.reason = `${candidate.signal.reason} | Score ${candidate.score.toFixed(1)} | Momentum ${(candidate.components.momentum * 100).toFixed(0)} | Volume ${(candidate.components.volume * 100).toFixed(0)} | Alignment ${(candidate.components.alignment * 100).toFixed(0)} | RR ${(candidate.components.riskReward * 100).toFixed(0)}`;
          await applyExecutionPipeline(candidate.signal);
          signals.unshift(candidate.signal);
          invalidateComputedCaches();
          saveState();
          broadcast('signal', candidate.signal);
          const payload = buildSignalNotificationPayload(candidate.signal);
          await notify(payload.title, payload.message, 'info');
          await deliverPrivateTelegramSignal(candidate.signal);
        }
      }
    };
    if (selectedMarketScope === 'spot' || selectedMarketScope === 'all') await scanVenue('spot', tickers);
    if (selectedMarketScope === 'futures' || selectedMarketScope === 'all') await scanVenue('futures', futuresTickers);
  } finally {
    scanRunning = false;
  }
}

function getRotatingScanUniverse(source: Map<string, PriceTicker>) {
  return [...source.values()]
    .filter(ticker => ticker.symbol.endsWith('USDT'))
    .sort((left, right) => right.quoteVolume - left.quoteVolume || left.symbol.localeCompare(right.symbol));
}

function getScanBatch<T>(items: T[], cursor: number, size: number) {
  if (items.length === 0) return { batch: [] as T[], nextCursor: 0 };
  const start = Math.max(0, cursor % items.length);
  if (items.length <= size) return { batch: items, nextCursor: 0 };
  const batch: T[] = [];
  for (let index = 0; index < size; index += 1) {
    batch.push(items[(start + index) % items.length]);
  }
  return {
    batch,
    nextCursor: (start + size) % items.length
  };
}

async function verifyTelegramDelivery() {
  if (!PUBLIC_TELEGRAM_BOT_TOKEN) {
    console.warn('[telegram] public verification skipped: bot token missing');
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${PUBLIC_TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(PUBLIC_TELEGRAM_CHAT_ID)}`);
    const body = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.description || `Telegram verification failed (${response.status})`);
    }
    console.log(`[telegram] verified public chat ${PUBLIC_TELEGRAM_CHAT_ID}`);
  } catch (error) {
    console.error('[telegram] public verification failed:', error);
  }
}

async function verifyPrivateTelegramBot() {
  if (!PRIVATE_TELEGRAM_BOT_TOKEN) {
    console.warn('[telegram] private bot verification skipped: bot token missing');
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${PRIVATE_TELEGRAM_BOT_TOKEN}/getMe`);
    const body = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.description || `Telegram private bot verification failed (${response.status})`);
    }
    console.log(`[telegram] verified private bot @${PRIVATE_TELEGRAM_BOT_USERNAME || 'unknown'}`);
  } catch (error) {
    console.error('[telegram] private bot verification failed:', error);
  }
}

async function resetPrivateTelegramWebhook() {
  if (!PRIVATE_TELEGRAM_BOT_TOKEN) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${PRIVATE_TELEGRAM_BOT_TOKEN}/deleteWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false })
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.description || `Telegram deleteWebhook failed (${response.status})`);
    }
    console.log('[telegram] private bot webhook cleared for getUpdates polling');
  } catch (error) {
    console.error('[telegram] private bot webhook reset failed:', error);
  }
}

function updateOpenSignals() {
  for (const signal of signals.filter(s => s.status === 'OPEN')) {
    const ticker = (signal.market === 'futures' ? futuresTickers : tickers).get(signal.symbol);
    if (!ticker) continue;
    const hitStop = signal.side === 'LONG' ? ticker.price <= signal.stopLoss : ticker.price >= signal.stopLoss;
    const hitTarget = signal.side === 'LONG' ? ticker.price >= signal.takeProfit : ticker.price <= signal.takeProfit;
    if (hitStop) {
      signal.status = 'LOSS';
      signal.closedAt = Date.now();
      signal.closePrice = signal.stopLoss;
      const pnl = percent(signal.entry, signal.stopLoss, signal.side);
      invalidateComputedCaches();
      saveState();
      broadcast('signalClosed', signal);
      const payload = buildSignalCloseNotificationPayload(signal, 'with loss');
      void notify(payload.title, payload.message, payload.level);
      void deliverPrivateTelegramSignalClose(signal, 'with loss');
      continue;
    }

    if (hitTarget && !signal.profitProtectionArmedAt) {
      signal.profitProtectionArmedAt = Date.now();
      signal.extremePrice = ticker.price;
      const trailGapPct = Math.max(signal.riskPct * 0.4, signal.expectedProfitPct * 0.2);
      signal.trailingStop = signal.side === 'LONG'
        ? Math.max(signal.entry, ticker.price * (1 - trailGapPct / 100))
        : Math.min(signal.entry, ticker.price * (1 + trailGapPct / 100));
    }

    if (signal.profitProtectionArmedAt) {
      const trailGapPct = Math.max(signal.riskPct * 0.4, signal.expectedProfitPct * 0.2);
      signal.extremePrice = signal.side === 'LONG'
        ? Math.max(signal.extremePrice ?? ticker.price, ticker.price)
        : Math.min(signal.extremePrice ?? ticker.price, ticker.price);
      const proposedTrailingStop = signal.side === 'LONG'
        ? Math.max(signal.entry, (signal.extremePrice ?? ticker.price) * (1 - trailGapPct / 100))
        : Math.min(signal.entry, (signal.extremePrice ?? ticker.price) * (1 + trailGapPct / 100));
      signal.trailingStop = typeof signal.trailingStop === 'number'
        ? (signal.side === 'LONG' ? Math.max(signal.trailingStop, proposedTrailingStop) : Math.min(signal.trailingStop, proposedTrailingStop))
        : proposedTrailingStop;
      const hitTrailingStop = signal.side === 'LONG'
        ? ticker.price <= (signal.trailingStop ?? signal.entry)
        : ticker.price >= (signal.trailingStop ?? signal.entry);
      if (!hitTrailingStop) continue;
      signal.status = 'WIN';
      signal.closedAt = Date.now();
      signal.closePrice = signal.trailingStop ?? ticker.price;
      const pnl = percent(signal.entry, signal.closePrice, signal.side);
      invalidateComputedCaches();
      saveState();
      broadcast('signalClosed', signal);
      const payload = buildSignalCloseNotificationPayload(signal, 'with protected profit');
      void notify(payload.title, payload.message, payload.level);
      void deliverPrivateTelegramSignalClose(signal, 'with protected profit');
      continue;
    }

    if (!hitTarget) continue;
    signal.status = 'WIN';
    signal.closedAt = Date.now();
    signal.closePrice = signal.takeProfit;
    const pnl = percent(signal.entry, signal.closePrice, signal.side);
    invalidateComputedCaches();
    saveState();
    broadcast('signalClosed', signal);
    const payload = buildSignalCloseNotificationPayload(signal, 'with profit');
    void notify(payload.title, payload.message, payload.level);
    void deliverPrivateTelegramSignalClose(signal, 'with profit');
  }
}

function getStats(): StrategyStats[] {
  return strategies.map(strategy => {
    const own = signals.filter(s => s.strategyId === strategy.id);
    const wins = own.filter(s => s.status === 'WIN').length;
    const losses = own.filter(s => s.status === 'LOSS').length;
    const live = own.filter(s => s.status === 'OPEN' && countsAsOpenExecution(s.executionStatus)).length;
    const closed = wins + losses;
    return {
      strategyId: strategy.id,
      name: strategy.name,
      risk: strategy.risk,
      wins,
      losses,
      live,
      total: own.length,
      winRate: closed ? Math.round((wins / closed) * 100) : 0,
      winLong: own.filter(s => s.status === 'WIN' && s.side === 'LONG').length,
      winShort: own.filter(s => s.status === 'WIN' && s.side === 'SHORT').length,
      lossLong: own.filter(s => s.status === 'LOSS' && s.side === 'LONG').length,
      lossShort: own.filter(s => s.status === 'LOSS' && s.side === 'SHORT').length,
      openLong: own.filter(s => s.status === 'OPEN' && s.side === 'LONG' && countsAsOpenExecution(s.executionStatus)).length,
      openShort: own.filter(s => s.status === 'OPEN' && s.side === 'SHORT' && countsAsOpenExecution(s.executionStatus)).length
    };
  });
}

function getDashboardPayload() {
  if (!dashboardCacheDirty && dashboardCache) return dashboardCache;
  const monitoredSpot = selectedMarketScope === 'futures' ? 0 : symbols.length;
  const monitoredFutures = selectedMarketScope === 'spot' ? 0 : futuresSymbols.length;
  dashboardCache = {
    stats: getStats(),
    liveSignals: signals.filter(s => s.status === 'OPEN' && countsAsOpenExecution(s.executionStatus)).length,
    totalSignals: signals.length,
    monitored: monitoredSpot + monitoredFutures,
    monitoredSpot,
    monitoredFutures,
    availableSpot: symbols.length,
    availableFutures: futuresSymbols.length,
    selectedStrategies: selectedStrategies.size,
    marketScope: selectedMarketScope,
    exchange: selectedMarketScope === 'spot'
      ? 'Binance Spot live stream'
      : selectedMarketScope === 'futures'
        ? 'Binance Futures live stream'
        : 'Binance Spot + Futures live stream'
  };
  dashboardCacheDirty = false;
  return dashboardCache;
}

function connectBinance() {
  ws?.close();
  ws = new WebSocket(BINANCE_WS);
  ws.on('message', raw => {
    const rows = JSON.parse(raw.toString()) as { s: string; c: string; P: string; q: string; E: number }[];
    for (const row of rows) {
      tickers.set(row.s, { symbol: row.s, price: Number(row.c), change24h: Number(row.P), quoteVolume: Number(row.q), eventTime: row.E });
    }
    broadcast('prices', buildPricesBroadcastPayload());
    updateOpenSignals();
  });
  ws.on('close', () => setTimeout(connectBinance, 3000));
  ws.on('error', () => ws?.close());
}

function connectBinanceFutures() {
  futuresWs?.close();
  futuresWs = new WebSocket(BINANCE_FUTURES_WS);
  futuresWs.on('message', raw => {
    const rows = JSON.parse(raw.toString()) as { s: string; c: string; P: string; q: string; E: number }[];
    for (const row of rows) {
      futuresTickers.set(row.s, {
        symbol: row.s,
        price: Number(row.c),
        change24h: Number(row.P),
        quoteVolume: Number(row.q),
        eventTime: row.E
      });
    }
    broadcast('prices', buildPricesBroadcastPayload());
    updateOpenSignals();
  });
  futuresWs.on('close', () => setTimeout(connectBinanceFutures, 3000));
  futuresWs.on('error', () => futuresWs?.close());
}

async function pollTickersFallback() {
  const response = await fetch(`${BINANCE_REST}/api/v3/ticker/24hr`).catch(() => null);
  if (!response?.ok) return;
  const rows = await response.json() as { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; closeTime: number }[];
  for (const row of rows) {
    tickers.set(row.symbol, {
      symbol: row.symbol,
      price: Number(row.lastPrice),
      change24h: Number(row.priceChangePercent),
      quoteVolume: Number(row.quoteVolume),
      eventTime: row.closeTime
    });
  }
  broadcast('prices', buildPricesBroadcastPayload());
  updateOpenSignals();
}

async function pollFuturesTickersFallback() {
  const response = await fetch(`${BINANCE_FUTURES_REST}/fapi/v1/ticker/24hr`).catch(() => null);
  if (!response?.ok) return;
  const rows = await response.json() as { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; closeTime: number }[];
  for (const row of rows) {
    futuresTickers.set(row.symbol, {
      symbol: row.symbol,
      price: Number(row.lastPrice),
      change24h: Number(row.priceChangePercent),
      quoteVolume: Number(row.quoteVolume),
      eventTime: row.closeTime
    });
  }
  broadcast('prices', buildPricesBroadcastPayload());
  updateOpenSignals();
}

app.get('/api/symbols', (_req, res) => res.json({ symbols, count: symbols.length }));
app.get('/api/tickers', (_req, res) => res.json({ tickers: [...tickers.values()], count: tickers.size }));
app.get('/api/futures-symbols', (_req, res) => res.json({ symbols: futuresSymbols, count: futuresSymbols.length }));
app.get('/api/futures-tickers', (_req, res) => res.json({ tickers: [...futuresTickers.values()], count: futuresTickers.size }));
app.get('/api/chart', async (req, res) => {
  try {
    const symbol = String(req.query.symbol ?? '').trim().toUpperCase();
    const interval = String(req.query.interval ?? '15m').trim() as Timeframe;
    const market = req.query.market === 'futures' ? 'futures' : 'spot';
    const limit = Number(req.query.limit ?? CANDLE_LIMIT_CHART);
    if (!symbol) {
      res.status(400).json({ ok: false, message: 'symbol is required' });
      return;
    }
    if (!SUPPORTED_TIMEFRAMES.includes(interval)) {
      res.status(400).json({ ok: false, message: 'unsupported interval' });
      return;
    }
    const candles = await fetchCandles(symbol, interval, market, limit);
    res.json({ ok: true, symbol, market, interval, candles });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'chart fetch failed' });
  }
});
app.get('/api/strategies', (_req, res) => res.json({ strategies, selected: [...selectedStrategies], timeframes: [...selectedTimeframes], exitModes: [...selectedExitModes], marketScope: selectedMarketScope }));
app.post('/api/strategies/select', (req, res) => {
  selectedStrategies = new Set((req.body.strategyIds ?? []).filter((id: string) => strategies.some(s => s.id === id)));
  selectedTimeframes = new Set((req.body.timeframes ?? ['5m', '10m', '15m']).filter((x: Timeframe) => SUPPORTED_TIMEFRAMES.includes(x)));
  selectedMarketScope = req.body.marketScope === 'spot' || req.body.marketScope === 'futures' || req.body.marketScope === 'all' ? req.body.marketScope : selectedMarketScope;
  const requestedExitModes = Array.isArray(req.body.exitModes) ? req.body.exitModes : [req.body.exitMode].filter(Boolean);
  const normalizedExitModes = requestedExitModes
    .map((mode: string) => mode === 'precision' ? 'quick' : mode === 'runner' ? 'extended' : mode === 'adaptive' ? 'balanced' : mode)
    .filter((mode: string): mode is ExitMode => mode === 'quick' || mode === 'extended' || mode === 'balanced');
  selectedExitModes = new Set(normalizedExitModes.length > 0 ? normalizedExitModes : ['balanced']);
  scanVersion++;
  invalidateComputedCaches();
  saveState();
  res.json({ ok: true, selected: [...selectedStrategies], timeframes: [...selectedTimeframes], exitModes: [...selectedExitModes], marketScope: selectedMarketScope });
});
app.get('/api/live-rules', (_req, res) => {
  res.json({ ok: true, rules: liveExecutionRules });
});
app.get('/api/portfolio/live-summary', async (req, res) => {
  try {
    const range = String(req.query.range ?? '24h');
    const customFrom = typeof req.query.customFrom === 'string' ? req.query.customFrom : undefined;
    const customTo = typeof req.query.customTo === 'string' ? req.query.customTo : undefined;
    const statusFilter = req.query.status === 'open' || req.query.status === 'closed' || req.query.status === 'win' || req.query.status === 'loss' ? req.query.status : 'all';
    const sideFilter = req.query.side === 'long' || req.query.side === 'short' ? req.query.side : 'all';
    const marketFilter = req.query.market === 'spot' || req.query.market === 'futures' ? req.query.market : 'all';
    const timeframeFilter = typeof req.query.timeframe === 'string' && SUPPORTED_TIMEFRAMES.includes(req.query.timeframe as Timeframe) ? req.query.timeframe as Timeframe : 'all';
    const modeFilter = req.query.mode === 'quick' || req.query.mode === 'balanced' || req.query.mode === 'extended' ? req.query.mode : 'all';
    const scoreFilter = req.query.score === 'green' || req.query.score === 'yellow' || req.query.score === 'red' || req.query.score === 'unscored' ? req.query.score : 'all';
    const acceptedKind = req.query.acceptedKind === 'live' || req.query.acceptedKind === 'test' ? req.query.acceptedKind : 'all';
    const rejectedKind = req.query.rejectedKind === 'live' || req.query.rejectedKind === 'test' ? req.query.rejectedKind : 'all';
    const cacheKey = JSON.stringify({
      summaryOnly: true,
      range, customFrom, customTo, statusFilter, sideFilter, marketFilter, timeframeFilter, modeFilter, scoreFilter, acceptedKind, rejectedKind,
      signalVersion: `${signals.length}:${signals[0]?.id ?? 0}:${signals[0]?.closedAt ?? 0}:${liveExecutionRules.executionMode}:${liveExecutionRules.maxTrades}:${liveExecutionRules.executionSource}:${liveExecutionRules.venueMode}:${liveExecutionRules.allowedDirection}`
    });
    const cached = livePortfolioCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < 1200) {
      res.json(cached.payload);
      return;
    }

    const rangeStart = getRangeStartForKey(range, customFrom);
    const rangeEnd = getRangeEndForKey(range, customTo);
    const acceptedStatuses = new Set<NonNullable<TradeSignal['executionStatus']>>(['live_accepted', 'test_accepted']);
    const futuresPositions = marketFilter === 'spot' ? new Map<string, BinanceFuturesPosition>() : await readOpenFuturesPositions().catch(() => new Map<string, BinanceFuturesPosition>());
    const hasLiveFuturesPosition = (signal: TradeSignal) =>
      signal.executionStatus === 'live_accepted'
      && signal.market === 'futures'
      && futuresPositions.has(positionKey(signal.symbol, signal.side));
    const effectiveLiveStatus = (signal: TradeSignal): TradeSignal['status'] =>
      hasLiveFuturesPosition(signal) ? 'OPEN' : signal.status;
    const statusMatches = (signal: TradeSignal) => {
      const status = effectiveLiveStatus(signal);
      return statusFilter === 'all'
        || (statusFilter === 'open' && status === 'OPEN')
        || (statusFilter === 'closed' && status !== 'OPEN')
        || (statusFilter === 'win' && status === 'WIN')
        || (statusFilter === 'loss' && status === 'LOSS');
    };
    const sideMatches = (signal: TradeSignal) =>
      sideFilter === 'all'
      || (sideFilter === 'long' && signal.side === 'LONG')
      || (sideFilter === 'short' && signal.side === 'SHORT');
    const inRange = (signal: TradeSignal) => {
      const stamp = signal.closedAt ?? signal.openedAt;
      return stamp >= rangeStart && stamp <= rangeEnd;
    };
    const marketMatches = (signal: TradeSignal) => marketFilter === 'all' || signal.market === marketFilter;
    const timeframeMatches = (signal: TradeSignal) => timeframeFilter === 'all' || signal.timeframe === timeframeFilter;
    const modeMatches = (signal: TradeSignal) => modeFilter === 'all' || signal.exitMode === modeFilter;
    const acceptedKindMatches = (signal: TradeSignal) =>
      acceptedKind === 'all'
      || (acceptedKind === 'live' && signal.executionStatus === 'live_accepted')
      || (acceptedKind === 'test' && signal.executionStatus === 'test_accepted');
    const rejectedKindMatches = (signal: TradeSignal) =>
      rejectedKind === 'all'
      || (rejectedKind === 'live' && (signal.executionStatus === 'live_failed' || (signal.executionStatus === 'rejected' && liveExecutionRules.executionMode === 'live')))
      || (rejectedKind === 'test' && (signal.executionStatus === 'test_failed' || signal.executionStatus === 'blocked' || signal.executionStatus === 'pending' || (signal.executionStatus === 'rejected' && liveExecutionRules.executionMode !== 'live')));
    const marketPriceFor = (signal: TradeSignal) => signal.market === 'futures' ? futuresTickers.get(signal.symbol)?.price : tickers.get(signal.symbol)?.price;
    const pnlFor = (signal: TradeSignal) => percent(signal.entry, typeof signal.closePrice === 'number' ? signal.closePrice : (marketPriceFor(signal) ?? signal.entry), signal.side);

    const generatedBase = signals.filter(signal =>
      inRange(signal)
      && marketMatches(signal)
      && timeframeMatches(signal)
      && modeMatches(signal)
    );
    const acceptedAnalyticsBeforeScore = generatedBase.filter(signal =>
      statusMatches(signal)
      && sideMatches(signal)
      && acceptedStatuses.has(signal.executionStatus ?? 'pending')
    );
    const acceptedAnalyticsBase = acceptedAnalyticsBeforeScore.filter(signal => scoreMatchesFilter(signal, scoreFilter));
    const acceptedBase = acceptedAnalyticsBase.filter(signal => acceptedKindMatches(signal));
    const rejectedBase = generatedBase.filter(signal =>
      !acceptedStatuses.has(signal.executionStatus ?? 'pending')
      && scoreMatchesFilter(signal, scoreFilter)
      && rejectedKindMatches(signal)
    );
    const openPnl = acceptedAnalyticsBase.filter(signal => signal.status === 'OPEN').reduce((sum, signal) => sum + pnlFor(signal), 0);
    const closedPnl = acceptedAnalyticsBase.filter(signal => signal.status !== 'OPEN').reduce((sum, signal) => sum + pnlFor(signal), 0);
    const wallet = await readBinanceWalletSummary();
    const currentCapital = marketFilter === 'futures' ? wallet.futuresTotalUsdt : wallet.totalValueUsdt;
    const startingBalance = currentCapital - (closedPnl / 100) * currentCapital;
    const scoreBase = acceptedAnalyticsBeforeScore;
    const filterCounts = {
      statusAll: acceptedAnalyticsBase.filter(signal => sideMatches(signal)).length,
      open: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) === 'OPEN').length,
      closed: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) !== 'OPEN').length,
      win: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) === 'WIN').length,
      loss: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) === 'LOSS').length,
      sideAll: acceptedAnalyticsBase.filter(signal => statusMatches(signal)).length,
      long: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && signal.side === 'LONG').length,
      short: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && signal.side === 'SHORT').length,
      marketAll: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && sideMatches(signal)).length,
      spot: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && sideMatches(signal) && signal.market === 'spot').length,
      futures: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && sideMatches(signal) && signal.market === 'futures').length,
      scoreAll: scoreBase.length,
      scoreGreen: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'green').length,
      scoreYellow: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'yellow').length,
      scoreRed: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'red').length,
      unscored: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'unscored').length
    };
    const payload = {
      ok: true,
      summary: {
        startingBalance,
        currentCapital,
        openPnl,
        closedPnl,
        netPnl: openPnl + closedPnl,
        generatedCount: generatedBase.length,
        acceptedCount: acceptedBase.length,
        rejectedCount: rejectedBase.length,
        openCount: acceptedAnalyticsBase.filter(signal => signal.status === 'OPEN').length,
        closedCount: acceptedAnalyticsBase.filter(signal => signal.status !== 'OPEN').length,
        longCount: acceptedAnalyticsBase.filter(signal => signal.side === 'LONG').length,
        shortCount: acceptedAnalyticsBase.filter(signal => signal.side === 'SHORT').length,
        spotCount: acceptedAnalyticsBase.filter(signal => signal.market === 'spot').length,
        futuresCount: acceptedAnalyticsBase.filter(signal => signal.market === 'futures').length
      },
      filterCounts
    };
    livePortfolioCache.set(cacheKey, { createdAt: Date.now(), payload });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to build live portfolio summary.' });
  }
});
app.get('/api/portfolio/live-ledger', async (req, res) => {
  try {
    const range = String(req.query.range ?? '24h');
    const customFrom = typeof req.query.customFrom === 'string' ? req.query.customFrom : undefined;
    const customTo = typeof req.query.customTo === 'string' ? req.query.customTo : undefined;
    const statusFilter = req.query.status === 'open' || req.query.status === 'closed' || req.query.status === 'win' || req.query.status === 'loss' ? req.query.status : 'all';
    const sideFilter = req.query.side === 'long' || req.query.side === 'short' ? req.query.side : 'all';
    const marketFilter = req.query.market === 'spot' || req.query.market === 'futures' ? req.query.market : 'all';
    const timeframeFilter = typeof req.query.timeframe === 'string' && SUPPORTED_TIMEFRAMES.includes(req.query.timeframe as Timeframe) ? req.query.timeframe as Timeframe : 'all';
    const modeFilter = req.query.mode === 'quick' || req.query.mode === 'balanced' || req.query.mode === 'extended' ? req.query.mode : 'all';
    const scoreFilter = req.query.score === 'green' || req.query.score === 'yellow' || req.query.score === 'red' || req.query.score === 'unscored' ? req.query.score : 'all';
    const acceptedKind = req.query.acceptedKind === 'live' || req.query.acceptedKind === 'test' ? req.query.acceptedKind : 'all';
    const rejectedKind = req.query.rejectedKind === 'live' || req.query.rejectedKind === 'test' ? req.query.rejectedKind : 'all';
    const sharedQuery = String(req.query.query ?? '').trim().toUpperCase();
    const acceptedQuery = String(req.query.acceptedQuery ?? sharedQuery).trim().toUpperCase();
    const rejectedQuery = String(req.query.rejectedQuery ?? sharedQuery).trim().toUpperCase();
    const cacheKey = JSON.stringify({
      range, customFrom, customTo, statusFilter, sideFilter, marketFilter, timeframeFilter, modeFilter, scoreFilter, acceptedKind, rejectedKind, acceptedQuery, rejectedQuery,
      signalVersion: `${signals.length}:${signals[0]?.id ?? 0}:${signals[0]?.closedAt ?? 0}:${liveExecutionRules.executionMode}:${liveExecutionRules.maxTrades}:${liveExecutionRules.executionSource}:${liveExecutionRules.venueMode}:${liveExecutionRules.allowedDirection}`
    });
    const cached = livePortfolioCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < 1200) {
      res.json(cached.payload);
      return;
    }

    const rangeStart = getRangeStartForKey(range, customFrom);
    const rangeEnd = getRangeEndForKey(range, customTo);
    const acceptedStatuses = new Set<NonNullable<TradeSignal['executionStatus']>>(['live_accepted', 'test_accepted']);
    const futuresPositions = marketFilter === 'spot' ? new Map<string, BinanceFuturesPosition>() : await readOpenFuturesPositions().catch(() => new Map<string, BinanceFuturesPosition>());
    const wallet = await readBinanceWalletSummary();
    const hasLiveFuturesPosition = (signal: TradeSignal) =>
      signal.executionStatus === 'live_accepted'
      && signal.market === 'futures'
      && futuresPositions.has(positionKey(signal.symbol, signal.side));
    const effectiveLiveStatus = (signal: TradeSignal): TradeSignal['status'] =>
      hasLiveFuturesPosition(signal) ? 'OPEN' : signal.status;
    const statusMatches = (signal: TradeSignal) => {
      const status = effectiveLiveStatus(signal);
      return statusFilter === 'all'
        || (statusFilter === 'open' && status === 'OPEN')
        || (statusFilter === 'closed' && status !== 'OPEN')
        || (statusFilter === 'win' && status === 'WIN')
        || (statusFilter === 'loss' && status === 'LOSS');
    };
    const sideMatches = (signal: TradeSignal) =>
      sideFilter === 'all'
      || (sideFilter === 'long' && signal.side === 'LONG')
      || (sideFilter === 'short' && signal.side === 'SHORT');
    const acceptedQueryMatches = (signal: TradeSignal) => {
      const tradeLabel = formatTradeIdLabel(signal.id).toUpperCase();
      return !acceptedQuery || tradeLabel.includes(acceptedQuery) || String(signal.id).includes(acceptedQuery.replace(/^T-?/, ''));
    };
    const rejectedQueryMatches = (signal: TradeSignal) => {
      const tradeLabel = formatTradeIdLabel(signal.id).toUpperCase();
      return !rejectedQuery || tradeLabel.includes(rejectedQuery) || String(signal.id).includes(rejectedQuery.replace(/^T-?/, ''));
    };
    const inRange = (signal: TradeSignal) => {
      const stamp = signal.closedAt ?? signal.openedAt;
      return stamp >= rangeStart && stamp <= rangeEnd;
    };
    const marketMatches = (signal: TradeSignal) => marketFilter === 'all' || signal.market === marketFilter;
    const timeframeMatches = (signal: TradeSignal) => timeframeFilter === 'all' || signal.timeframe === timeframeFilter;
    const modeMatches = (signal: TradeSignal) => modeFilter === 'all' || signal.exitMode === modeFilter;
    const acceptedKindMatches = (signal: TradeSignal) =>
      acceptedKind === 'all'
      || (acceptedKind === 'live' && signal.executionStatus === 'live_accepted')
      || (acceptedKind === 'test' && signal.executionStatus === 'test_accepted');
    const rejectedKindMatches = (signal: TradeSignal) =>
      rejectedKind === 'all'
      || (rejectedKind === 'live' && (signal.executionStatus === 'live_failed' || (signal.executionStatus === 'rejected' && liveExecutionRules.executionMode === 'live')))
      || (rejectedKind === 'test' && (signal.executionStatus === 'test_failed' || signal.executionStatus === 'blocked' || signal.executionStatus === 'pending' || (signal.executionStatus === 'rejected' && liveExecutionRules.executionMode !== 'live')));
    const marketPriceFor = (signal: TradeSignal) => signal.market === 'futures' ? futuresTickers.get(signal.symbol)?.price : tickers.get(signal.symbol)?.price;
    const mapRow = (signal: TradeSignal) => {
      const binancePosition = signal.executionStatus === 'live_accepted'
        ? getFuturesPositionMetrics(signal, futuresPositions)
        : null;
      const status = effectiveLiveStatus(signal);
      const entry = binancePosition?.entry ?? signal.entry;
      const marketPrice = binancePosition?.marketPrice ?? marketPriceFor(signal);
      const closedBinancePnlUsdt = status === 'OPEN' ? null : signal.binanceRealizedPnlUsdt ?? null;
      const closedBinanceRoiPct = status === 'OPEN' ? null : signal.binanceRoiPct ?? null;
      const pnl = closedBinanceRoiPct
        ?? binancePosition?.roiPct
        ?? percent(signal.entry, typeof signal.closePrice === 'number' ? signal.closePrice : (marketPrice ?? signal.entry), signal.side);
      const pnlUsdt = closedBinancePnlUsdt ?? binancePosition?.pnlUsdt ?? null;
      const roiPct = closedBinanceRoiPct ?? binancePosition?.roiPct ?? null;
      const capitalForSignal = signal.market === 'futures'
        ? wallet.futuresTotalUsdt
        : wallet.totalValueUsdt;
      const openAcceptedForMarket = signals.filter(item =>
        item.market === signal.market
        && countsAsOpenExecution(item.executionStatus)
        && item.status === 'OPEN'
      ).length;
      const allocationSlotCount = liveExecutionRules.maxTrades >= 999
        ? Math.max(1, openAcceptedForMarket)
        : Math.max(1, liveExecutionRules.maxTrades);
      const allocationAmount = binancePosition?.signedNotional ?? (capitalForSignal > 0 ? capitalForSignal / allocationSlotCount : 0);
      const allocationPct = binancePosition?.notional != null && capitalForSignal > 0
        ? (binancePosition.notional / capitalForSignal) * 100
        : allocationSlotCount > 0 ? 100 / allocationSlotCount : 0;
      return {
        id: signal.id,
        label: formatTradeIdLabel(signal.id),
        symbol: signal.symbol,
        strategyName: signal.strategyName,
        status,
        executionStatus: signal.executionStatus ?? 'pending',
        side: signal.side,
        market: signal.market,
        venueLabel: signal.market === 'futures' ? `Futures x${Math.max(1, signal.executionLeverage ?? liveExecutionRules.futuresLeverage)}` : 'Spot',
        exitMode: signal.exitMode,
        timeframe: signal.timeframe,
        openedAt: signal.openedAt,
        closedAt: status === 'OPEN' ? null : signal.closedAt ?? null,
        entry,
        marketPrice: marketPrice ?? null,
        liquidationPrice: binancePosition?.liquidationPrice ?? null,
        expectedProfitPct: signal.expectedProfitPct,
        riskPct: signal.riskPct,
        pnl,
        pnlUsdt,
        roiPct,
        pnlSource: signal.binancePnlSource ?? null,
        pnlReadAt: signal.binancePnlReadAt ?? null,
        pnlLabel: pnlUsdt == null
          ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`
          : `${pnlUsdt >= 0 ? '+' : ''}${pnlUsdt.toFixed(2)} USDT\n${roiPct != null && roiPct >= 0 ? '+' : ''}${(roiPct ?? 0).toFixed(2)}%`,
        score: extractSignalScore(signal.reason),
        failedRules: signal.executionNotes?.length ? signal.executionNotes : [signal.executionStatus ?? 'pending'],
        allocationAmount,
        allocationPct
      };
    };

    const generatedBase = signals.filter(signal =>
      inRange(signal)
      && marketMatches(signal)
      && timeframeMatches(signal)
      && modeMatches(signal)
    );
    const acceptedAnalyticsBeforeScore = generatedBase.filter(signal =>
      statusMatches(signal)
      && sideMatches(signal)
      && acceptedStatuses.has(signal.executionStatus ?? 'pending')
    );
    const acceptedAnalyticsBase = acceptedAnalyticsBeforeScore.filter(signal => scoreMatchesFilter(signal, scoreFilter));
    const acceptedFiltered = acceptedAnalyticsBase.filter(signal =>
      acceptedKindMatches(signal)
      && acceptedQueryMatches(signal)
    );
    const acceptedRows = acceptedFiltered.map(mapRow).sort((a, b) => b.openedAt - a.openedAt);
    const rejectedFiltered = generatedBase.filter(signal =>
      !acceptedStatuses.has(signal.executionStatus ?? 'pending')
      && scoreMatchesFilter(signal, scoreFilter)
      && rejectedKindMatches(signal)
      && rejectedQueryMatches(signal)
    );
    const rejectedRows = rejectedFiltered.map(mapRow).sort((a, b) => b.openedAt - a.openedAt);
    const analyticsRows = acceptedAnalyticsBase.map(mapRow);
    const ledgerStatsSource = analyticsRows;
    const openPnl = analyticsRows.filter(row => row.status === 'OPEN').reduce((sum, row) => sum + row.pnl, 0);
    const closedPnl = analyticsRows.filter(row => row.status !== 'OPEN').reduce((sum, row) => sum + row.pnl, 0);
    const currentCapital = marketFilter === 'futures'
      ? wallet.futuresTotalUsdt
      : wallet.totalValueUsdt;
    const startingBalance = currentCapital - (closedPnl / 100) * currentCapital;
    const scoreBase = acceptedAnalyticsBeforeScore;
    const filterCounts = {
      statusAll: acceptedAnalyticsBase.filter(signal => sideMatches(signal)).length,
      open: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) === 'OPEN').length,
      closed: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) !== 'OPEN').length,
      win: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) === 'WIN').length,
      loss: acceptedAnalyticsBase.filter(signal => sideMatches(signal) && effectiveLiveStatus(signal) === 'LOSS').length,
      sideAll: acceptedAnalyticsBase.filter(signal => statusMatches(signal)).length,
      long: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && signal.side === 'LONG').length,
      short: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && signal.side === 'SHORT').length,
      marketAll: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && sideMatches(signal)).length,
      spot: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && sideMatches(signal) && signal.market === 'spot').length,
      futures: acceptedAnalyticsBase.filter(signal => statusMatches(signal) && sideMatches(signal) && signal.market === 'futures').length,
      scoreAll: scoreBase.length,
      scoreGreen: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'green').length,
      scoreYellow: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'yellow').length,
      scoreRed: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'red').length,
      unscored: scoreBase.filter(signal => scoreToneFromReason(signal.reason) === 'unscored').length
    };
    const payload = {
      ok: true,
      summary: {
        startingBalance,
        currentCapital,
        openPnl,
        closedPnl,
        netPnl: openPnl + closedPnl,
        generatedCount: generatedBase.length,
        acceptedCount: acceptedRows.length,
        rejectedCount: rejectedRows.length,
        openCount: ledgerStatsSource.filter(row => row.status === 'OPEN').length,
        closedCount: ledgerStatsSource.filter(row => row.status !== 'OPEN').length,
        bestTrade: ledgerStatsSource.reduce<typeof ledgerStatsSource[number] | null>((best, row) => !best || row.pnl > best.pnl ? row : best, null),
        worstTrade: ledgerStatsSource.reduce<typeof ledgerStatsSource[number] | null>((worst, row) => !worst || row.pnl < worst.pnl ? row : worst, null),
        longCount: ledgerStatsSource.filter(row => row.side === 'LONG').length,
        shortCount: ledgerStatsSource.filter(row => row.side === 'SHORT').length,
        spotCount: ledgerStatsSource.filter(row => row.market === 'spot').length,
        futuresCount: ledgerStatsSource.filter(row => row.market === 'futures').length
      },
      filterCounts,
      accepted: {
        total: acceptedRows.length,
        page: 1,
        pageSize: acceptedRows.length,
        rows: acceptedRows
      },
      rejected: {
        total: rejectedRows.length,
        rows: rejectedRows
      }
    };
    livePortfolioCache.set(cacheKey, { createdAt: Date.now(), payload });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to build live portfolio ledger.' });
  }
});
app.post('/api/live-rules', (req, res) => {
  const requested = req.body ?? {};
  const wantsLiveMode = requested.executionMode === 'live';
  if (wantsLiveMode && requested.liveActivationConfirmed !== true) {
    return res.status(400).json({ ok: false, message: 'Live mode requires explicit confirmation.' });
  }
  liveExecutionRules = buildLiveExecutionRulesPatch(requested);
  saveState();
  res.json({ ok: true, rules: liveExecutionRules });
});
app.post('/api/dashboard/reset', (_req, res) => {
  scanVersion++;
  signals.splice(0, signals.length);
  notifications.splice(0, notifications.length);
  nextSignalId = 1;
  invalidateComputedCaches();
  saveState();
  broadcast('dashboard', getDashboardPayload());
  res.json({ ok: true });
});
app.get('/api/signals', (_req, res) => res.json({ signals }));
app.get('/api/notifications', (_req, res) => res.json({ notifications }));
app.get('/api/dashboard', (_req, res) => res.json(getDashboardPayload()));
app.get('/api/home-intel', async (_req, res) => {
  try {
    const [fearGreedResult, marketCapResult, newsResult, executionIntelResult] = await Promise.allSettled([
      getHomeFearGreed(),
      getHomeMarketCapLeaders(),
      getHomeCryptoNews(),
      getHomeExecutionIntel()
    ]);
    const fearGreed = fearGreedResult.status === 'fulfilled'
      ? fearGreedResult.value
      : { value: 50, classification: 'Unavailable', timestamp: null, yesterday: null, lastWeek: null, lastMonth: null, updatedAt: Date.now() };
    const marketCap = marketCapResult.status === 'fulfilled' ? marketCapResult.value : [];
    const news = newsResult.status === 'fulfilled' ? newsResult.value : [];
    const executionIntel = executionIntelResult.status === 'fulfilled'
      ? executionIntelResult.value
      : {
        btcDominance: null,
        fundingRate: null,
        nextFundingTime: null,
        openInterest: null,
        openInterestUsd: null,
        volumeSurgeRatio: null,
        volumeSurgeLabel: 'Unavailable',
        marketBreadth: { advancers: 0, decliners: 0, positiveRatio: 0 },
        stablecoinFlow: { source: 'coingecko-proxy', available: false, label: 'Unavailable', valueUsd: null, updatedAt: null }
      };
    const spotLeaders = buildHomeTickerLeaders(tickers);
    const futuresLeaders = buildHomeTickerLeaders(futuresTickers);
    res.json({
      ok: true,
      fearGreed,
      marketCap,
      news,
      executionIntel,
      binance: {
        spotGainers: spotLeaders.gainers,
        spotLosers: spotLeaders.losers,
        futuresGainers: futuresLeaders.gainers,
        futuresLosers: futuresLeaders.losers
      },
      updatedAt: Date.now(),
      diagnostics: {
        fearGreed: fearGreedResult.status,
        marketCap: marketCapResult.status,
        news: newsResult.status,
        executionIntel: executionIntelResult.status
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to build home intel feed.' });
  }
});
app.get('/api/telegram/subscribers', (_req, res) => {
  res.json({
    ok: true,
    subscribers: telegramSubscribers.map(subscriber => ({
      ...subscriber,
      linked: Boolean(subscriber.chatId)
    }))
  });
});
app.get('/api/telegram/config', (_req, res) => {
  res.json({
    ok: true,
    publicChannelEnabled: telegramRuntimeSettings.publicChannelEnabled,
    publicChannelChatId: PUBLIC_TELEGRAM_CHAT_ID,
    publicChannelInviteUrl: PUBLIC_TELEGRAM_INVITE_URL,
    publicBotUsername: PUBLIC_TELEGRAM_BOT_USERNAME,
    publicBotConfigured: Boolean(PUBLIC_TELEGRAM_BOT_TOKEN && PUBLIC_TELEGRAM_CHAT_ID),
    privateBotUsername: PRIVATE_TELEGRAM_BOT_USERNAME,
    privateBotConfigured: Boolean(PRIVATE_TELEGRAM_BOT_TOKEN && PRIVATE_TELEGRAM_BOT_USERNAME)
  });
});
app.post('/api/telegram/public-channel', async (req, res) => {
  telegramRuntimeSettings.publicChannelEnabled = req.body?.enabled !== false;
  saveState();
  const delivery = telegramRuntimeSettings.publicChannelEnabled
    ? await sendPublicTelegramNotification(
      `New Signal ${formatTradeIdLabel(0)}`,
      'SPOT | BTCUSDT LONG | Direction ENTRY | Entry price 68,420.50 | TP 2.63% | SL -1.05% | Duration -- | Execution live_accepted',
      'info'
    )
    : { ok: true, message: 'Public Telegram channel alerts disabled.' };
  res.json({
    ok: true,
    publicChannelEnabled: telegramRuntimeSettings.publicChannelEnabled,
    delivery
  });
});
app.post('/api/telegram/subscribers/sync', (req, res) => {
  const subscribers = Array.isArray(req.body?.subscribers) ? req.body.subscribers : [];
  upsertTelegramSubscribers(subscribers);
  res.json({
    ok: true,
    subscribers: telegramSubscribers.map(subscriber => ({
      ...subscriber,
      linked: Boolean(subscriber.chatId)
    }))
  });
});
app.post('/api/telegram/subscribers/refresh', async (_req, res) => {
  await syncTelegramSubscribersFromBot();
  res.json({
    ok: true,
    subscribers: telegramSubscribers.map(subscriber => ({
      ...subscriber,
      linked: Boolean(subscriber.chatId)
    }))
  });
});
app.post('/api/telegram/test', async (_req, res) => {
  try {
    const title = `New Signal ${formatTradeIdLabel(0)}`;
    const message = 'SPOT | BTCUSDT LONG | Direction ENTRY | Entry price 68,420.50 | TP 2.63% | SL -1.05% | Duration -- | Execution live_accepted';
    const delivery = await sendPublicTelegramNotification(title, message, 'info');
    if (!delivery.ok) {
      res.status(502).json({ ok: false, message: delivery.message });
      return;
    }
    res.json({ ok: true, message: delivery.message });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Telegram test failed.' });
  }
});
app.post('/api/telegram/test/private', async (req, res) => {
  try {
    const accountId = String(req.body?.accountId ?? '').trim();
    const subscriber = telegramSubscribers.find(item => item.accountId === accountId);
    if (!subscriber?.chatId) {
      res.status(400).json({ ok: false, message: 'This account is not linked to Telegram yet.' });
      return;
    }
    const testNetPnlValue = calculate24hNetPnl();
    const testNetPnl = `${testNetPnlValue >= 0 ? '+' : ''}${testNetPnlValue.toFixed(2)}%`;
    const title = `Signal Closed ${formatTradeIdLabel(0)}`;
    const message = `FUTURES x1 | BTCUSDT LONG | Direction Take Profit | Closed price 76,040.01 | TP 2.63% | SL -1.05% | Duration 8h 38m | PnL 4.15% | 24h Net PnL ${testNetPnl}`;
    const delivery = await sendPrivateTelegramNotification(title, message, 'win', subscriber.chatId);
    if (!delivery.ok) {
      res.status(502).json({ ok: false, message: delivery.message });
      return;
    }
    res.json({ ok: true, message: `Private Telegram test sent to ${subscriber.displayName}.` });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Private Telegram test failed.' });
  }
});
app.get('/api/binance/connection', async (_req, res) => {
  if (!fs.existsSync(BINANCE_VAULT_FILE)) {
    res.json(binanceVaultState);
    return;
  }
  try {
    const next = await refreshBinanceVaultState();
    res.json(next);
  } catch {
    res.json(binanceVaultState);
  }
});
app.get('/api/binance/wallet', async (_req, res) => {
  try {
    const wallet = await readBinanceWalletSummary();
    res.json(wallet);
  } catch (error) {
    res.status(400).json({
      ok: false,
      connected: false,
      updatedAt: null,
      assetCount: 0,
      totalValueUsdt: 0,
      futuresTotalUsdt: 0,
      futuresAvailableUsdt: 0,
      pnl24hUsdt: 0,
      pnl24hPct: 0,
      balances: [],
      message: error instanceof Error ? error.message : 'Unable to read Binance wallet.'
    });
  }
});
app.post('/api/binance/futures/close-all', async (_req, res) => {
  try {
    const result = await closeAllOpenFuturesPositions('Close All Futures');
    binanceWalletCache = null;
    res.json({ ok: result.failed.length === 0, closedCount: result.closed.length, failedCount: result.failed.length, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to close Binance Futures positions.' });
  }
});
app.post('/api/binance/connection', async (req, res) => {
  const apiKey = String(req.body.apiKey ?? '').trim();
  const secretKey = String(req.body.secretKey ?? '').trim();
  if (!apiKey || !secretKey) {
    res.status(400).json({ ok: false, message: 'API key and secret key are required.' });
    return;
  }
  try {
    const validation = await validateBinanceConnection(apiKey, secretKey);
    if (!validation.connected) {
      res.status(400).json({
        ok: false,
        message: validation.errorText || 'Binance permissions could not be verified.',
        ...binanceVaultState,
        scopes: validation.scopes
      });
      return;
    }
    saveBinanceVault(apiKey, secretKey, validation);
    res.json({ ok: true, message: validation.statusText, ...binanceVaultState });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Binance validation failed.'
    });
  }
});
app.delete('/api/binance/connection', (_req, res) => {
  clearBinanceVault();
  res.json({ ok: true, ...binanceVaultState });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api(?:\/|$)|\/stream(?:\/|$)|\/healthz$).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

async function runStartupStep(label: string, task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    console.error(`[startup] ${label} failed`, error);
  }
}

async function initializeRuntime() {
  loadState();
  loadTelegramSubscribers();
  loadBinanceVault();
  console.log(`[telegram] public channel ${PUBLIC_TELEGRAM_BOT_TOKEN ? `configured for ${PUBLIC_TELEGRAM_CHAT_ID}` : 'not configured'}`);
  console.log(`[telegram] private bot ${PRIVATE_TELEGRAM_BOT_TOKEN ? `configured as @${PRIVATE_TELEGRAM_BOT_USERNAME || 'unknown'}` : 'not configured'}`);
  await runStartupStep('public telegram verification', verifyTelegramDelivery);
  await runStartupStep('private telegram verification', verifyPrivateTelegramBot);
  await runStartupStep('private telegram webhook reset', resetPrivateTelegramWebhook);
  await runStartupStep('telegram subscriber sync', syncTelegramSubscribersFromBot);
  await runStartupStep('spot symbols load', loadSymbols);
  await runStartupStep('futures symbols load', loadFuturesSymbols);
  connectBinance();
  connectBinanceFutures();
  await runStartupStep('spot ticker poll', pollTickersFallback);
  await runStartupStep('futures ticker poll', pollFuturesTickersFallback);
  await runStartupStep('market scan', scanMarket);
  setInterval(pollTickersFallback, 5000);
  setInterval(pollFuturesTickersFallback, 5000);
  setInterval(monitorLiveFuturesProtection, 5000);
  setInterval(scanMarket, 60_000);
  setInterval(syncTelegramSubscribersFromBot, 15000);
  setInterval(() => broadcast('dashboard', getDashboardPayload()), 5000);
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  void initializeRuntime();
});
