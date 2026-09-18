use crate::nautilus_daemon::{NautilusProcessManager, NautilusRequestError};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SimulationStateDto {
    Stopped,
    Running,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderSideDto {
    Buy,
    Sell,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderTypeDto {
    Market,
    Limit,
    StopMarket,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeInForceDto {
    Gtc,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderStatusDto {
    Created,
    Submitted,
    Accepted,
    Rejected,
    PartiallyFilled,
    Filled,
    CancelPending,
    Canceled,
    Expired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PositionSideDto {
    Long,
    Short,
    Flat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentDto {
    pub venue: String,
    pub market_type: String,
    pub symbol: String,
    pub base_asset: String,
    pub quote_asset: String,
    pub exchange_native_symbol: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderIntentDto {
    pub client_order_id: String,
    pub instrument: InstrumentDto,
    pub side: OrderSideDto,
    pub order_type: OrderTypeDto,
    pub quantity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_price: Option<String>,
    pub time_in_force: TimeInForceDto,
    pub reduce_only: bool,
    pub post_only: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strategy_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playbook_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub setup_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderTimestampsDto {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accepted_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rejected_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_fill_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_fill_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canceled_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expired_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderStateDto {
    pub client_order_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub venue_order_id: Option<String>,
    pub instrument: InstrumentDto,
    pub side: OrderSideDto,
    pub order_type: OrderTypeDto,
    pub quantity: String,
    pub filled_quantity: String,
    pub remaining_quantity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protection_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub average_fill_price: Option<String>,
    pub status: OrderStatusDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub timestamps: OrderTimestampsDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FillDto {
    pub fill_id: String,
    pub client_order_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub venue_order_id: Option<String>,
    pub instrument: InstrumentDto,
    pub side: OrderSideDto,
    pub price: String,
    pub quantity: String,
    pub timestamp: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fee: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fee_asset: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liquidity: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionDto {
    pub instrument: InstrumentDto,
    pub side: PositionSideDto,
    pub quantity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub average_entry_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mark_price: Option<String>,
    pub realized_pnl: String,
    pub unrealized_pnl: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fees_total: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opened_at: Option<u64>,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDto {
    pub account_id: String,
    pub venue: String,
    pub currency: String,
    pub equity: String,
    pub balance: String,
    pub available_balance: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub margin_used: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maintenance_margin: Option<String>,
    pub realized_pnl: String,
    pub unrealized_pnl: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fees_total: Option<String>,
    pub timestamp: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationStatusDto {
    pub state: SimulationStateDto,
    pub started: bool,
    pub has_simulation: bool,
    pub simulation_protocol_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quote_stream: Option<QuoteStreamStatusDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub market: Option<SimulationMarketStatusDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteStreamStatusDto {
    pub configured: bool,
    pub connected: bool,
    pub source_available: bool,
    pub thread_alive: bool,
    pub frames_received: u64,
    pub decode_errors: u64,
    pub sequence_errors: u64,
    pub reconnect_count: u64,
    pub last_sequence: Option<u64>,
    pub last_applied_at: Option<u64>,
    pub quote_age_ms: Option<u64>,
    pub last_source_timestamp: Option<u64>,
    pub last_local_applied_timestamp: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationMarketStatusDto {
    pub instrument: String,
    pub venue: String,
    pub market_type: String,
    pub best_bid: String,
    pub best_ask: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationLifecycleDto {
    pub state: SimulationStateDto,
    pub started: bool,
    pub has_simulation: bool,
    pub simulation_protocol_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub already_running: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub already_stopped: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reset: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticQuoteDto {
    pub bid: String,
    pub ask: String,
    pub bid_size: String,
    pub ask_size: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticQuoteResponseDto {
    pub diagnostic_only: bool,
    pub simulation_protocol_version: u32,
    pub state: SimulationStateDto,
    pub quote: DiagnosticQuoteDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSnapshotSourceDto {
    pub venue: String,
    pub market_type: String,
    pub symbol: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSnapshotInstrumentDto {
    pub venue: String,
    pub market_type: String,
    pub symbol: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSnapshotDto {
    pub source: MarketSnapshotSourceDto,
    pub simulation_instrument: MarketSnapshotInstrumentDto,
    pub bid: String,
    pub ask: String,
    pub bid_size: String,
    pub ask_size: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSnapshotAppliedDto {
    pub applied: bool,
    pub source_venue: String,
    pub source_market_type: String,
    pub source_symbol: String,
    pub simulation_venue: String,
    pub simulation_market_type: String,
    pub simulation_symbol: String,
    pub timestamp_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub control_plane: Option<String>,
}

#[derive(Debug, Clone)]
pub enum NautilusSimulationError {
    Transport(String),
    Protocol(String),
    RequestIdMismatch {
        expected: String,
        actual: Option<String>,
        response: String,
    },
    Daemon {
        code: String,
        message: String,
        details: Option<Value>,
    },
    Decode(String),
}

impl fmt::Display for NautilusSimulationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Transport(message) => write!(f, "transport failure: {message}"),
            Self::Protocol(message) => write!(f, "protocol failure: {message}"),
            Self::RequestIdMismatch {
                expected,
                actual,
                response,
            } => write!(
                f,
                "request id mismatch: expected {expected}, got {:?}; response={response}",
                actual
            ),
            Self::Daemon {
                code,
                message,
                details,
            } => write!(f, "daemon error {code}: {message} {:?}", details),
            Self::Decode(message) => write!(f, "decode failure: {message}"),
        }
    }
}

impl std::error::Error for NautilusSimulationError {}

impl From<NautilusRequestError> for NautilusSimulationError {
    fn from(value: NautilusRequestError) -> Self {
        match value {
            NautilusRequestError::Transport(message) => Self::Transport(message),
            NautilusRequestError::Protocol(message) => Self::Protocol(message),
            NautilusRequestError::RequestIdMismatch {
                expected,
                actual,
                response,
            } => Self::RequestIdMismatch {
                expected,
                actual,
                response,
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SimulationCommandErrorCategory {
    Daemon,
    Transport,
    Protocol,
    Simulation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationCommandError {
    pub category: SimulationCommandErrorCategory,
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl fmt::Display for SimulationCommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}:{}: {}",
            self.category_string(),
            self.code,
            self.message
        )
    }
}

impl std::error::Error for SimulationCommandError {}

impl SimulationCommandError {
    fn category_string(&self) -> &'static str {
        match self.category {
            SimulationCommandErrorCategory::Daemon => "DAEMON",
            SimulationCommandErrorCategory::Transport => "TRANSPORT",
            SimulationCommandErrorCategory::Protocol => "PROTOCOL",
            SimulationCommandErrorCategory::Simulation => "SIMULATION",
        }
    }
}

impl From<NautilusSimulationError> for SimulationCommandError {
    fn from(value: NautilusSimulationError) -> Self {
        match value {
            NautilusSimulationError::Transport(message) => {
                let is_not_running = message.contains("nautilus daemon is not running");
                Self {
                    category: if is_not_running {
                        SimulationCommandErrorCategory::Daemon
                    } else {
                        SimulationCommandErrorCategory::Transport
                    },
                    code: if is_not_running {
                        "daemon_not_running".to_string()
                    } else {
                        "transport_failure".to_string()
                    },
                    message,
                    details: None,
                }
            }
            NautilusSimulationError::Protocol(message) => Self {
                category: SimulationCommandErrorCategory::Protocol,
                code: "protocol_failure".to_string(),
                message,
                details: None,
            },
            NautilusSimulationError::RequestIdMismatch {
                expected,
                actual,
                response,
            } => Self {
                category: SimulationCommandErrorCategory::Protocol,
                code: "request_id_mismatch".to_string(),
                message: format!("expected {expected}, got {:?}", actual),
                details: Some(serde_json::json!({
                    "expected": expected,
                    "actual": actual,
                    "response": response,
                })),
            },
            NautilusSimulationError::Daemon {
                code,
                message,
                details,
            } => Self {
                category: SimulationCommandErrorCategory::Simulation,
                code,
                message,
                details,
            },
            NautilusSimulationError::Decode(message) => Self {
                category: SimulationCommandErrorCategory::Protocol,
                code: "decode_failure".to_string(),
                message,
                details: None,
            },
        }
    }
}

fn command_bridge<'a>(manager: &'a Mutex<NautilusProcessManager>) -> NautilusSimulationBridge<'a> {
    NautilusSimulationBridge::new(manager)
}

pub fn simulation_status(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<SimulationStatusDto, SimulationCommandError> {
    command_bridge(manager)
        .simulation_status()
        .map_err(Into::into)
}

pub fn simulation_force_quote_disconnect_diagnostic(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<Value, SimulationCommandError> {
    command_bridge(manager)
        .force_quote_disconnect_diagnostic()
        .map_err(Into::into)
}

pub fn simulation_start(
    manager: &Mutex<NautilusProcessManager>,
    quote_stream: Option<Value>,
) -> Result<SimulationLifecycleDto, SimulationCommandError> {
    command_bridge(manager)
        .simulation_start(quote_stream)
        .map_err(Into::into)
}

pub fn simulation_stop(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<SimulationLifecycleDto, SimulationCommandError> {
    command_bridge(manager)
        .simulation_stop()
        .map_err(Into::into)
}

pub fn simulation_reset(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<SimulationLifecycleDto, SimulationCommandError> {
    command_bridge(manager)
        .simulation_reset()
        .map_err(Into::into)
}

pub fn simulation_submit_order(
    manager: &Mutex<NautilusProcessManager>,
    intent: OrderIntentDto,
) -> Result<OrderStateDto, SimulationCommandError> {
    command_bridge(manager)
        .submit_order(intent)
        .map_err(Into::into)
}

pub fn simulation_close_position(
    manager: &Mutex<NautilusProcessManager>,
    instrument: InstrumentDto,
    quantity: Option<String>,
) -> Result<OrderStateDto, SimulationCommandError> {
    command_bridge(manager).close_position(instrument, quantity).map_err(Into::into)
}

pub fn simulation_cancel_order(
    manager: &Mutex<NautilusProcessManager>,
    client_order_id: impl Into<String>,
) -> Result<OrderStateDto, SimulationCommandError> {
    command_bridge(manager)
        .cancel_order(client_order_id)
        .map_err(Into::into)
}

pub fn simulation_replace_order(
    manager: &Mutex<NautilusProcessManager>,
    client_order_id: String,
    replacement_client_order_id: String,
    limit_price: String,
) -> Result<Value, SimulationCommandError> {
    command_bridge(manager)
        .replace_order(client_order_id, replacement_client_order_id, limit_price)
        .map_err(Into::into)
}

pub fn simulation_get_order(
    manager: &Mutex<NautilusProcessManager>,
    client_order_id: impl Into<String>,
) -> Result<OrderStateDto, SimulationCommandError> {
    command_bridge(manager)
        .get_order(client_order_id)
        .map_err(Into::into)
}

pub fn simulation_list_orders(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<Vec<OrderStateDto>, SimulationCommandError> {
    command_bridge(manager).list_orders().map_err(Into::into)
}

pub fn simulation_list_order_events(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<Vec<Value>, SimulationCommandError> {
    command_bridge(manager).list_order_events().map_err(Into::into)
}

pub fn simulation_list_fills(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<Vec<FillDto>, SimulationCommandError> {
    command_bridge(manager).list_fills().map_err(Into::into)
}

pub fn simulation_get_position(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<PositionDto, SimulationCommandError> {
    command_bridge(manager).get_position().map_err(Into::into)
}

pub fn simulation_get_account(
    manager: &Mutex<NautilusProcessManager>,
) -> Result<AccountDto, SimulationCommandError> {
    command_bridge(manager).get_account().map_err(Into::into)
}

pub fn simulation_inject_quote_diagnostic(
    manager: &Mutex<NautilusProcessManager>,
    quote: DiagnosticQuoteDto,
) -> Result<DiagnosticQuoteResponseDto, SimulationCommandError> {
    command_bridge(manager)
        .inject_quote_diagnostic(quote)
        .map_err(Into::into)
}

pub fn simulation_apply_market_snapshot(
    manager: &Mutex<NautilusProcessManager>,
    snapshot: MarketSnapshotDto,
) -> Result<MarketSnapshotAppliedDto, SimulationCommandError> {
    command_bridge(manager)
        .apply_market_snapshot(snapshot)
        .map_err(Into::into)
}

#[tauri::command]
pub fn nautilus_simulation_status(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<SimulationStatusDto, SimulationCommandError> {
    simulation_status(state.inner())
}

#[tauri::command]
pub fn nautilus_simulation_force_quote_disconnect_diagnostic(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<Value, SimulationCommandError> {
    simulation_force_quote_disconnect_diagnostic(state.inner())
}

#[tauri::command]
pub fn nautilus_simulation_start(
    state: State<'_, Mutex<NautilusProcessManager>>,
    quote_stream: Option<Value>,
) -> Result<SimulationLifecycleDto, SimulationCommandError> {
    simulation_start(state.inner(), quote_stream)
}

#[tauri::command]
pub fn nautilus_simulation_stop(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<SimulationLifecycleDto, SimulationCommandError> {
    simulation_stop(state.inner())
}

#[tauri::command]
pub fn nautilus_simulation_reset(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<SimulationLifecycleDto, SimulationCommandError> {
    simulation_reset(state.inner())
}

#[tauri::command]
pub fn nautilus_simulation_submit_order(
    state: State<'_, Mutex<NautilusProcessManager>>,
    intent: OrderIntentDto,
) -> Result<OrderStateDto, SimulationCommandError> {
    simulation_submit_order(state.inner(), intent)
}

#[tauri::command]
pub fn nautilus_simulation_close_position(
    state: State<'_, Mutex<NautilusProcessManager>>,
    instrument: InstrumentDto,
    quantity: Option<String>,
) -> Result<OrderStateDto, SimulationCommandError> {
    simulation_close_position(state.inner(), instrument, quantity)
}

#[tauri::command]
pub fn nautilus_simulation_cancel_order(
    state: State<'_, Mutex<NautilusProcessManager>>,
    client_order_id: String,
) -> Result<OrderStateDto, SimulationCommandError> {
    simulation_cancel_order(state.inner(), client_order_id)
}

#[tauri::command]
pub fn nautilus_simulation_replace_order(
    state: State<'_, Mutex<NautilusProcessManager>>,
    client_order_id: String,
    replacement_client_order_id: String,
    limit_price: String,
) -> Result<Value, SimulationCommandError> {
    simulation_replace_order(state.inner(), client_order_id, replacement_client_order_id, limit_price)
}

#[tauri::command]
pub fn nautilus_simulation_get_order(
    state: State<'_, Mutex<NautilusProcessManager>>,
    client_order_id: String,
) -> Result<OrderStateDto, SimulationCommandError> {
    simulation_get_order(state.inner(), client_order_id)
}

#[tauri::command]
pub fn nautilus_simulation_list_orders(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<Vec<OrderStateDto>, SimulationCommandError> {
    simulation_list_orders(state.inner())
}

#[tauri::command]
pub fn nautilus_simulation_list_order_events(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<Vec<Value>, SimulationCommandError> {
    simulation_list_order_events(state.inner())
}

#[tauri::command]
pub fn nautilus_simulation_list_fills(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<Vec<FillDto>, SimulationCommandError> {
    let fills = simulation_list_fills(state.inner())?;

    #[cfg(debug_assertions)]
    {
        let diagnostic_fills = fills
            .iter()
            .map(|fill| {
                serde_json::json!({
                    "fillId": fill.fill_id,
                    "clientOrderId": fill.client_order_id,
                    "venueOrderId": fill.venue_order_id,
                    "side": fill.side,
                    "price": fill.price,
                    "quantity": fill.quantity,
                    "timestamp": fill.timestamp,
                    "fee": fill.fee,
                    "feeAsset": fill.fee_asset,
                    "liquidity": fill.liquidity,
                })
            })
            .collect::<Vec<_>>();
        eprintln!(
            "[N4B_LISTFILLS] {}",
            serde_json::json!({ "count": fills.len(), "fills": diagnostic_fills })
        );
    }

    Ok(fills)
}

#[tauri::command]
pub fn nautilus_simulation_get_position(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<PositionDto, SimulationCommandError> {
    simulation_get_position(state.inner())
}

#[tauri::command]
pub fn nautilus_simulation_get_account(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<AccountDto, SimulationCommandError> {
    let account = simulation_get_account(state.inner())?;

    #[cfg(debug_assertions)]
    eprintln!(
        "[N4B_ACCOUNT] {}",
        serde_json::json!({ "feesTotal": account.fees_total })
    );

    Ok(account)
}

#[tauri::command]
pub fn nautilus_simulation_inject_quote_diagnostic(
    state: State<'_, Mutex<NautilusProcessManager>>,
    quote: DiagnosticQuoteDto,
) -> Result<DiagnosticQuoteResponseDto, SimulationCommandError> {
    simulation_inject_quote_diagnostic(state.inner(), quote)
}

#[tauri::command]
pub fn nautilus_simulation_apply_market_snapshot(
    state: State<'_, Mutex<NautilusProcessManager>>,
    snapshot: MarketSnapshotDto,
) -> Result<MarketSnapshotAppliedDto, SimulationCommandError> {
    simulation_apply_market_snapshot(state.inner(), snapshot)
}

#[derive(Debug)]
pub struct NautilusSimulationBridge<'a> {
    manager: &'a Mutex<NautilusProcessManager>,
}

impl<'a> NautilusSimulationBridge<'a> {
    pub fn new(manager: &'a Mutex<NautilusProcessManager>) -> Self {
        Self { manager }
    }

    pub fn simulation_status(&self) -> Result<SimulationStatusDto, NautilusSimulationError> {
        self.call("simulation.status", None)
    }

    pub fn force_quote_disconnect_diagnostic(&self) -> Result<Value, NautilusSimulationError> {
        self.call("simulation.force_quote_disconnect_diagnostic", None)
    }

    pub fn simulation_start(&self, quote_stream: Option<Value>) -> Result<SimulationLifecycleDto, NautilusSimulationError> {
        self.call("simulation.start", quote_stream.map(|value| serde_json::json!({"quoteStream": value})))
    }

    pub fn simulation_stop(&self) -> Result<SimulationLifecycleDto, NautilusSimulationError> {
        self.call("simulation.stop", None)
    }

    pub fn simulation_reset(&self) -> Result<SimulationLifecycleDto, NautilusSimulationError> {
        self.call("simulation.reset", None)
    }

    pub fn submit_order(
        &self,
        intent: OrderIntentDto,
    ) -> Result<OrderStateDto, NautilusSimulationError> {
        let params = serde_json::to_value(intent).map_err(|err| {
            NautilusSimulationError::Decode(format!("serialize order intent: {err}"))
        })?;
        self.call("simulation.submit_order", Some(params))
    }

    pub fn close_position(
        &self,
        instrument: InstrumentDto,
        quantity: Option<String>,
    ) -> Result<OrderStateDto, NautilusSimulationError> {
        self.call("simulation.close_position", Some(serde_json::json!({
            "instrument": instrument,
            "quantity": quantity,
        })))
    }

    pub fn cancel_order(
        &self,
        client_order_id: impl Into<String>,
    ) -> Result<OrderStateDto, NautilusSimulationError> {
        self.call(
            "simulation.cancel_order",
            Some(serde_json::json!({"clientOrderId": client_order_id.into()})),
        )
    }

    pub fn replace_order(
        &self,
        client_order_id: String,
        replacement_client_order_id: String,
        limit_price: String,
    ) -> Result<Value, NautilusSimulationError> {
        self.call("simulation.replace_order", Some(serde_json::json!({
            "clientOrderId": client_order_id,
            "replacementClientOrderId": replacement_client_order_id,
            "limitPrice": limit_price,
        })))
    }

    pub fn get_order(
        &self,
        client_order_id: impl Into<String>,
    ) -> Result<OrderStateDto, NautilusSimulationError> {
        self.call(
            "simulation.get_order",
            Some(serde_json::json!({"clientOrderId": client_order_id.into()})),
        )
    }

    pub fn list_orders(&self) -> Result<Vec<OrderStateDto>, NautilusSimulationError> {
        self.call("simulation.list_orders", None)
    }

    pub fn list_order_events(&self) -> Result<Vec<Value>, NautilusSimulationError> {
        self.call("simulation.list_order_events", None)
    }

    pub fn list_fills(&self) -> Result<Vec<FillDto>, NautilusSimulationError> {
        self.call("simulation.list_fills", None)
    }

    pub fn get_position(&self) -> Result<PositionDto, NautilusSimulationError> {
        self.call("simulation.get_position", None)
    }

    pub fn get_account(&self) -> Result<AccountDto, NautilusSimulationError> {
        self.call("simulation.get_account", None)
    }

    pub fn inject_quote_diagnostic(
        &self,
        quote: DiagnosticQuoteDto,
    ) -> Result<DiagnosticQuoteResponseDto, NautilusSimulationError> {
        let params = serde_json::to_value(quote).map_err(|err| {
            NautilusSimulationError::Decode(format!("serialize diagnostic quote: {err}"))
        })?;
        self.call("simulation.inject_quote", Some(params))
    }

    pub fn apply_market_snapshot(
        &self,
        snapshot: MarketSnapshotDto,
    ) -> Result<MarketSnapshotAppliedDto, NautilusSimulationError> {
        self.call(
            "simulation.apply_market_snapshot",
            Some(serde_json::json!({"snapshot": snapshot})),
        )
    }

    fn call<T: DeserializeOwned>(
        &self,
        op: &str,
        params: Option<Value>,
    ) -> Result<T, NautilusSimulationError> {
        let response = {
            let mut manager = self.manager.lock().map_err(|_| {
                NautilusSimulationError::Transport("nautilus manager lock poisoned".to_string())
            })?;
            manager
                .request(op, params)
                .map_err(NautilusSimulationError::from)?
        };
        Self::decode_response(response)
    }

    fn decode_response<T: DeserializeOwned>(response: Value) -> Result<T, NautilusSimulationError> {
        if response.get("ok").and_then(Value::as_bool) != Some(true) {
            return Err(Self::decode_daemon_error(&response));
        }
        let result = response.get("result").ok_or_else(|| {
            NautilusSimulationError::Protocol("daemon response missing result".to_string())
        })?;
        serde_json::from_value(result.clone()).map_err(|err| {
            NautilusSimulationError::Decode(format!(
                "failed to decode daemon result: {err}; result={result}"
            ))
        })
    }

    fn decode_daemon_error(response: &Value) -> NautilusSimulationError {
        let error = match response.get("error") {
            Some(Value::Object(error)) => error,
            _ => {
                return NautilusSimulationError::Protocol(format!(
                    "daemon returned error without error payload: {response}"
                ));
            }
        };
        let code = error
            .get("code")
            .and_then(Value::as_str)
            .unwrap_or("unknown_error")
            .to_string();
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("daemon error")
            .to_string();
        let details = error.get("details").cloned();
        NautilusSimulationError::Daemon {
            code,
            message,
            details,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display_mentions_code() {
        let error = NautilusSimulationError::Daemon {
            code: "order_not_found".to_string(),
            message: "unknown order id: missing".to_string(),
            details: None,
        };
        assert!(error.to_string().contains("order_not_found"));
    }
}
