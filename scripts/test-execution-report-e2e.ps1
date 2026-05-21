$base = "http://localhost:5000"
$ErrorActionPreference = "Stop"

function Invoke-Json($Method, $Uri, $Body = $null) {
  $params = @{
    Uri     = "$base$Uri"
    Method  = $Method
    TimeoutSec = 30
  }
  if ($Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Compress)
  }
  return Invoke-RestMethod @params
}

Write-Host "`n=== 1. Reset paper + empty execution report ===" -ForegroundColor Cyan
Invoke-Json POST "/api/paper/reset" | Out-Null
$r0 = Invoke-Json GET "/api/reports/execution"
Write-Host "empty=$($r0.empty) trades=$($r0.trades.Count) score=$($r0.summary.executionQualityScore)"

Write-Host "`n=== 2. Small market long ===" -ForegroundColor Cyan
$market = @{
  symbol = "BTC-USDT"
  side = "long"
  type = "market"
  size = "50"
  sizeUnit = "USDT"
  leverage = "5"
  marginMode = "isolated"
  reduceOnly = $false
  postOnly = $false
}
$submit = Invoke-Json POST "/api/paper/submit" $market
Write-Host "submit success=$($submit.success) msg=$($submit.message)"

Write-Host "`n=== 3. Execution report after market ===" -ForegroundColor Cyan
$r1 = Invoke-Json GET "/api/reports/execution"
Write-Host "empty=$($r1.empty) totalTrades=$($r1.summary.totalTrades) openPosition=$($r1.summary.openPosition)"
Write-Host "trades:"
$r1.trades | ForEach-Object { Write-Host "  $($_.time) $($_.direction) $($_.setup) status=$($_.status) entry=$($_.entry)" }

Write-Host "`n=== 4. Close position ===" -ForegroundColor Cyan
$close = Invoke-Json POST "/api/paper/close-position"
Write-Host "close: $($close.message)"

Write-Host "`n=== 5. Report after close ===" -ForegroundColor Cyan
$r2 = Invoke-Json GET "/api/reports/execution"
Write-Host "realizedPnL=$($r2.summary.realizedPnlUsdt) score=$($r2.summary.executionQualityScore) grade=$($r2.summary.grade)"
Write-Host "winRate=$($r2.summary.winRate) avgR=$($r2.summary.avgR)"
Write-Host "diagnostics main=$($r2.diagnostics.mainIssue)"
Write-Host "diagnostics best=$($r2.diagnostics.bestBehavior)"
if ($r2.diagnostics.warning) { Write-Host "warning=$($r2.diagnostics.warning)" }
Write-Host "bestTrade: $($r2.bestTrade.setup) r=$($r2.bestTrade.r) pnl=$($r2.bestTrade.pnlUsdt)"
Write-Host "worstTrade: $($r2.worstTrade.setup) r=$($r2.worstTrade.r) pnl=$($r2.worstTrade.pnlUsdt)"

Write-Host "`n=== 6. Limit order + cancel ===" -ForegroundColor Cyan
$limit = @{
  symbol = "BTC-USDT"
  side = "long"
  type = "limit"
  price = "1"
  size = "25"
  sizeUnit = "USDT"
  leverage = "5"
  marginMode = "isolated"
  reduceOnly = $false
  postOnly = $false
}
$limSubmit = Invoke-Json POST "/api/paper/submit" $limit
Write-Host "limit submit success=$($limSubmit.success) orderId=$($limSubmit.order.id)"

$orders = Invoke-Json GET "/api/paper/orders"
$oid = $orders.orders[0].id
Write-Host "open orders=$($orders.orders.Count) id=$oid"

if ($oid) {
  Invoke-Json POST "/api/paper/orders/$oid/cancel" | Out-Null
  Write-Host "cancelled order $oid"
}

Write-Host "`n=== 7. Report after cancel ===" -ForegroundColor Cyan
$r3 = Invoke-Json GET "/api/reports/execution"
Write-Host "totalTrades=$($r3.summary.totalTrades) score=$($r3.summary.executionQualityScore)"
Write-Host "discipline=$($r3.profile.discipline) timing=$($r3.profile.timing)"
Write-Host "cancel rows:"
$r3.trades | Where-Object { $_.status -eq "cancelled" } | ForEach-Object {
  Write-Host "  $($_.time) $($_.mistakes)"
}
Write-Host "diagnostics main=$($r3.diagnostics.mainIssue)"
if ($r3.diagnostics.warning) { Write-Host "warning=$($r3.diagnostics.warning)" }

Write-Host "`n=== DONE ===" -ForegroundColor Green
