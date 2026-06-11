export type DesktopAssetOption = {
  id: string;
  label: string;
  enabled: boolean;
  comingSoon?: boolean;
};

export const DESKTOP_ASSET_CATALOG: DesktopAssetOption[] = [
  { id: "btc", label: "BTC", enabled: true },
  { id: "eth", label: "ETH", enabled: false, comingSoon: true },
  { id: "nasdaq", label: "NASDAQ", enabled: false, comingSoon: true },
  { id: "sp500", label: "SP500", enabled: false, comingSoon: true },
  { id: "xauusd", label: "XAUUSD", enabled: false, comingSoon: true },
];

export const ACTIVE_DESKTOP_ASSET_ID = "btc";

export function getActiveDesktopAsset(): DesktopAssetOption {
  return (
    DESKTOP_ASSET_CATALOG.find((asset) => asset.id === ACTIVE_DESKTOP_ASSET_ID) ??
    DESKTOP_ASSET_CATALOG[0]
  );
}
