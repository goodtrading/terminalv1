export interface BingxLiveExecutionFlags {
  liveTradingEnabled: boolean;
  apiTradingEnabled: boolean;
  orderSubmitEnabled: boolean;
  marketOrdersAllowed: boolean;
  killSwitchActive: boolean;
}

export interface BingxLoginStatusResponse {
  exchange: "bingx";
  brokerLoginAvailable: boolean;
  brokerLoginUrl: string | null;
  callbackUrl: string | null;
  demoAvailable: boolean;
  liveTradingEnabled: boolean;
  apiConnectionEnabled?: boolean;
  liveExecutionFlags: BingxLiveExecutionFlags;
  message: string;
}

export interface BingxCallbackResult {
  success: boolean;
  code?: string;
  message: string;
  redirectUrl?: string;
}
