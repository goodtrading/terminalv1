import type {
  ExchangeConnectionState,
  ExecutionRiskGuardState,
  OrderTicketState,
} from "./executionTypes";
import { EXCHANGE_LOGO_URLS } from "./exchangeLogos";

export const BINGX_REFERRAL_URL =
  "https://bingx.com/es/partner/Goodtradingacademy";

export const DEFAULT_EXCHANGE_CONNECTIONS: ExchangeConnectionState[] = [
  {
    id: "bingx",
    name: "BingX",
    status: "not_connected",
    health: "ready",
    logoUrl: EXCHANGE_LOGO_URLS.bingx,
    rating: 4.8,
    badge: "PARTNER",
    description: "Connect via secure API · Read-only first · Trading locked",
    supportsBrokerLogin: true,
    supportsReadOnly: true,
    supportsTrading: true,
    tradingLocked: true,
    referralUrl: BINGX_REFERRAL_URL,
    brokerLoginUrl: undefined,
    brokerLoginAvailable: false,
    accountMode: "perpetual_futures",
  },
  {
    id: "binance",
    name: "Binance",
    status: "coming_soon",
    health: "coming_soon",
    logoUrl: EXCHANGE_LOGO_URLS.binance,
    rating: 4.7,
    badge: "COMING SOON",
    description: "Market data only / Coming soon",
    supportsBrokerLogin: false,
    supportsReadOnly: true,
    supportsTrading: false,
    tradingLocked: true,
    brokerLoginAvailable: false,
    accountMode: "unknown",
  },
  {
    id: "paper",
    name: "GoodTrading Paper Trading",
    status: "not_connected",
    health: "ready",
    logoUrl: EXCHANGE_LOGO_URLS.paper,
    ratingLabel: "SIM",
    badge: "PAPER",
    description: "Internal simulated broker · No real funds",
    supportsBrokerLogin: false,
    supportsReadOnly: true,
    supportsTrading: true,
    tradingLocked: false,
    brokerLoginAvailable: false,
    accountMode: "perpetual_futures",
  },
];

export const DEFAULT_ORDER_TICKET: OrderTicketState = {
  exchange: "bingx",
  symbol: "BTC-USDT",
  side: "long",
  type: "limit",
  price: "",
  size: "",
  sizeUnit: "USDT",
  leverage: "5",
  marginMode: "isolated",
  reduceOnly: false,
  postOnly: false,
  stopLoss: "",
  takeProfit: "",
};

export const DEFAULT_RISK_GUARD: ExecutionRiskGuardState = {
  liveTradingEnabled: false,
  brokerLoginAvailable: false,
  brokerSessionRequired: true,
  demoAvailable: false,
  connectedExchange: null,
  tradingLocked: true,
  confirmationRequired: true,
  maxNotionalUsdt: null,
  maxLeverage: null,
  permissions: "locked",
};
