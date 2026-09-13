use app_lib::nautilus_daemon::NautilusProcessManager;
use app_lib::nautilus_simulation::{
    AccountDto, DiagnosticQuoteDto, InstrumentDto, MarketSnapshotDto, MarketSnapshotInstrumentDto,
    MarketSnapshotSourceDto, NautilusSimulationBridge, NautilusSimulationError, OrderIntentDto,
    OrderSideDto, OrderStatusDto, OrderTypeDto, PositionSideDto, SimulationStateDto,
    TimeInForceDto,
};
use std::path::PathBuf;
use std::sync::Mutex;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .to_path_buf()
}

fn runtime_root() -> PathBuf {
    repo_root()
        .join("build")
        .join("n2c")
        .join("runtime")
        .join("nautilus-runtime")
}

fn instrument() -> InstrumentDto {
    InstrumentDto {
        venue: "SIM".to_string(),
        market_type: "perpetual".to_string(),
        symbol: "BTCUSDT-PERP".to_string(),
        base_asset: "BTC".to_string(),
        quote_asset: "USDT".to_string(),
        exchange_native_symbol: "BTCUSDT".to_string(),
        metadata: None,
    }
}

fn market_buy_intent(client_order_id: &str) -> OrderIntentDto {
    OrderIntentDto {
        client_order_id: client_order_id.to_string(),
        instrument: instrument(),
        side: OrderSideDto::Buy,
        order_type: OrderTypeDto::Market,
        quantity: "1".to_string(),
        price: None,
        time_in_force: TimeInForceDto::Gtc,
        reduce_only: false,
        post_only: false,
        strategy_id: None,
        playbook_id: None,
        setup_id: None,
        metadata: None,
    }
}

fn limit_buy_intent(client_order_id: &str, price: &str) -> OrderIntentDto {
    OrderIntentDto {
        client_order_id: client_order_id.to_string(),
        instrument: instrument(),
        side: OrderSideDto::Buy,
        order_type: OrderTypeDto::Limit,
        quantity: "1".to_string(),
        price: Some(price.to_string()),
        time_in_force: TimeInForceDto::Gtc,
        reduce_only: false,
        post_only: false,
        strategy_id: None,
        playbook_id: None,
        setup_id: None,
        metadata: None,
    }
}

fn diagnostic_quote(bid: &str, ask: &str) -> DiagnosticQuoteDto {
    DiagnosticQuoteDto {
        bid: bid.to_string(),
        ask: ask.to_string(),
        bid_size: "10".to_string(),
        ask_size: "10".to_string(),
        timestamp: 123_456_789,
    }
}

fn production_snapshot(bid: &str, ask: &str) -> MarketSnapshotDto {
    MarketSnapshotDto {
        source: MarketSnapshotSourceDto {
            venue: "BINANCE".to_string(),
            market_type: "perpetual".to_string(),
            symbol: "BTCUSDT".to_string(),
        },
        simulation_instrument: MarketSnapshotInstrumentDto {
            venue: "SIM".to_string(),
            market_type: "perpetual".to_string(),
            symbol: "BTCUSDT-PERP".to_string(),
        },
        bid: bid.to_string(),
        ask: ask.to_string(),
        bid_size: "12.3".to_string(),
        ask_size: "8.1".to_string(),
        timestamp_ms: 123_456_789,
    }
}

fn decimal_string_is_nonzero(value: &str) -> bool {
    value.chars().any(|ch| ch.is_ascii_digit() && ch != '0')
}

struct ProcessGuard<'a> {
    manager: &'a Mutex<NautilusProcessManager>,
}

impl<'a> ProcessGuard<'a> {
    fn new(manager: &'a Mutex<NautilusProcessManager>) -> Self {
        Self { manager }
    }
}

impl Drop for ProcessGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut manager) = self.manager.lock() {
            let _ = manager.stop();
        }
    }
}

#[test]
fn packaged_lifecycle_round_trip_uses_packaged_runtime() {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));
    manager
        .lock()
        .expect("manager lock")
        .start()
        .expect("manager start");
    let _guard = ProcessGuard::new(&manager);
    let bridge = NautilusSimulationBridge::new(&manager);

    let status = bridge.simulation_status().expect("status");
    assert_eq!(status.state, SimulationStateDto::Stopped);
    assert!(!status.started);
    assert!(!status.has_simulation);
    assert_eq!(status.simulation_protocol_version, 1);

    let started = bridge.simulation_start().expect("start");
    assert_eq!(started.state, SimulationStateDto::Running);
    assert!(started.started);
    assert!(started.already_running.is_none());

    let started_again = bridge.simulation_start().expect("idempotent start");
    assert_eq!(started_again.state, SimulationStateDto::Running);
    assert!(started_again.already_running == Some(true));

    let stopped = bridge.simulation_stop().expect("stop");
    assert_eq!(stopped.state, SimulationStateDto::Stopped);
    assert!(stopped.already_stopped == Some(false));

    let stopped_again = bridge.simulation_stop().expect("idempotent stop");
    assert_eq!(stopped_again.state, SimulationStateDto::Stopped);
    assert!(stopped_again.already_stopped == Some(true));

    let reset = bridge.simulation_reset().expect("reset");
    assert_eq!(reset.state, SimulationStateDto::Running);
    assert_eq!(reset.reset, Some(true));
    assert_eq!(reset.simulation_protocol_version, 1);
}

#[test]
fn market_round_trip_preserves_decimal_strings() {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));
    manager
        .lock()
        .expect("manager lock")
        .start()
        .expect("manager start");
    let _guard = ProcessGuard::new(&manager);
    let bridge = NautilusSimulationBridge::new(&manager);

    bridge.simulation_start().expect("simulation start");
    let quote = diagnostic_quote("99999", "100001");
    let quote_ack = bridge.inject_quote_diagnostic(quote).expect("inject quote");
    assert!(quote_ack.diagnostic_only);
    assert_eq!(quote_ack.simulation_protocol_version, 1);

    let order = bridge
        .submit_order(market_buy_intent("gt-market-bridge-1"))
        .expect("market submit");
    assert_eq!(order.status, OrderStatusDto::Filled);
    assert_eq!(order.quantity, "1");
    assert_eq!(order.filled_quantity, "1");
    assert_eq!(order.remaining_quantity, "0");
    assert_eq!(order.average_fill_price.as_deref(), Some("100001.0"));

    let fetched = bridge.get_order("gt-market-bridge-1").expect("get order");
    assert_eq!(fetched.status, OrderStatusDto::Filled);
    assert_eq!(fetched.average_fill_price.as_deref(), Some("100001.0"));

    let position = bridge.get_position().expect("position");
    assert_eq!(position.side, PositionSideDto::Long);
    assert_eq!(position.quantity, "1");
    assert_eq!(position.average_entry_price.as_deref(), Some("100001.0"));

    let account: AccountDto = bridge.get_account().expect("account");
    assert!(account
        .fees_total
        .as_deref()
        .is_some_and(decimal_string_is_nonzero));
}

#[test]
fn production_market_snapshot_round_trip_fills_market_order_at_snapshot_ask() {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));
    manager
        .lock()
        .expect("manager lock")
        .start()
        .expect("manager start");
    let _guard = ProcessGuard::new(&manager);
    let bridge = NautilusSimulationBridge::new(&manager);

    bridge.simulation_start().expect("simulation start");
    let applied = bridge
        .apply_market_snapshot(production_snapshot("99999.50", "100000.00"))
        .expect("apply production snapshot");
    assert!(applied.applied);
    assert_eq!(applied.source_venue, "BINANCE");
    assert_eq!(applied.source_symbol, "BTCUSDT");
    assert_eq!(applied.simulation_symbol, "BTCUSDT-PERP");
    assert_eq!(applied.timestamp_ms, 123_456_789);
    assert_eq!(
        applied.control_plane.as_deref(),
        Some("PRODUCTION_LOW_RATE_CONTROL_SNAPSHOT")
    );

    let position = bridge.get_position().expect("position after snapshot");
    assert_eq!(position.side, PositionSideDto::Flat);
    assert_eq!(position.quantity, "0");

    let order = bridge
        .submit_order(market_buy_intent("gt-market-production-1"))
        .expect("market submit");
    assert_eq!(order.status, OrderStatusDto::Filled);
    assert_eq!(order.average_fill_price.as_deref(), Some("100000.0"));
}

#[test]
fn limit_cancel_and_fill_round_trips_are_typed() {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));
    manager
        .lock()
        .expect("manager lock")
        .start()
        .expect("manager start");
    let _guard = ProcessGuard::new(&manager);
    let bridge = NautilusSimulationBridge::new(&manager);

    bridge.simulation_start().expect("simulation start");
    bridge
        .inject_quote_diagnostic(diagnostic_quote("99999", "100001"))
        .expect("initial quote");

    let working = bridge
        .submit_order(limit_buy_intent("gt-limit-bridge-1", "99900"))
        .expect("limit submit");
    assert_eq!(working.status, OrderStatusDto::Accepted);

    bridge
        .inject_quote_diagnostic(diagnostic_quote("99899", "99900"))
        .expect("trigger quote");

    let filled = bridge.get_order("gt-limit-bridge-1").expect("filled order");
    assert_eq!(filled.status, OrderStatusDto::Filled);
    assert_eq!(filled.average_fill_price.as_deref(), Some("99900.0"));

    let limit_position = bridge.get_position().expect("position");
    assert_eq!(limit_position.side, PositionSideDto::Long);
    assert_eq!(limit_position.quantity, "1");

    bridge
        .simulation_reset()
        .expect("reset before cancel scenario");
    bridge
        .inject_quote_diagnostic(diagnostic_quote("99999", "100001"))
        .expect("cancel quote");

    let cancel_working = bridge
        .submit_order(limit_buy_intent("gt-cancel-bridge-1", "99900"))
        .expect("limit submit for cancel");
    assert_eq!(cancel_working.status, OrderStatusDto::Accepted);

    let canceled = bridge
        .cancel_order("gt-cancel-bridge-1")
        .expect("cancel order");
    assert_eq!(canceled.status, OrderStatusDto::Canceled);

    bridge
        .inject_quote_diagnostic(diagnostic_quote("99899", "99900"))
        .expect("post-cancel quote");

    let canceled_again = bridge
        .get_order("gt-cancel-bridge-1")
        .expect("canceled order lookup");
    assert_eq!(canceled_again.status, OrderStatusDto::Canceled);

    let flat_position = bridge.get_position().expect("flat position");
    assert_eq!(flat_position.side, PositionSideDto::Flat);
    assert_eq!(flat_position.quantity, "0");
}

#[test]
fn reset_restores_state_and_old_order_queries_fail_structurally() {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));
    manager
        .lock()
        .expect("manager lock")
        .start()
        .expect("manager start");
    let _guard = ProcessGuard::new(&manager);
    let bridge = NautilusSimulationBridge::new(&manager);

    bridge.simulation_start().expect("simulation start");
    bridge
        .inject_quote_diagnostic(diagnostic_quote("99999", "100001"))
        .expect("market quote");
    bridge
        .submit_order(market_buy_intent("gt-reset-bridge-1"))
        .expect("market submit");
    let reset = bridge.simulation_reset().expect("reset");
    assert_eq!(reset.state, SimulationStateDto::Running);
    assert_eq!(reset.reset, Some(true));

    let position = bridge.get_position().expect("position after reset");
    assert_eq!(position.side, PositionSideDto::Flat);
    assert_eq!(position.quantity, "0");

    let account = bridge.get_account().expect("account after reset");
    assert_eq!(account.realized_pnl, "0");
    assert_eq!(account.unrealized_pnl, "0");

    let old_order = bridge.get_order("gt-reset-bridge-1");
    match old_order {
        Err(NautilusSimulationError::Daemon { code, .. }) => {
            assert_eq!(code, "order_not_found");
        }
        other => panic!("expected old order lookup to fail, got {other:?}"),
    }
}

#[test]
fn structured_daemon_errors_are_preserved_and_process_remains_healthy() {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));
    manager
        .lock()
        .expect("manager lock")
        .start()
        .expect("manager start");
    let _guard = ProcessGuard::new(&manager);
    let bridge = NautilusSimulationBridge::new(&manager);

    bridge.simulation_start().expect("simulation start");

    let bad_limit = bridge.submit_order(OrderIntentDto {
        client_order_id: "gt-bad-limit-bridge-1".to_string(),
        instrument: instrument(),
        side: OrderSideDto::Buy,
        order_type: OrderTypeDto::Limit,
        quantity: "1".to_string(),
        price: None,
        time_in_force: TimeInForceDto::Gtc,
        reduce_only: false,
        post_only: false,
        strategy_id: None,
        playbook_id: None,
        setup_id: None,
        metadata: None,
    });
    match bad_limit {
        Err(NautilusSimulationError::Daemon { code, .. }) => {
            assert_eq!(code, "contract_validation_error");
        }
        other => panic!("expected contract validation error, got {other:?}"),
    }

    let missing_order = bridge.get_order("missing-order-id");
    match missing_order {
        Err(NautilusSimulationError::Daemon { code, .. }) => {
            assert_eq!(code, "order_not_found");
        }
        other => panic!("expected order_not_found, got {other:?}"),
    }

    bridge.simulation_stop().expect("simulation stop");
    let not_started = bridge.submit_order(market_buy_intent("gt-stopped-bridge-1"));
    match not_started {
        Err(NautilusSimulationError::Daemon { code, .. }) => {
            assert_eq!(code, "simulation_not_started");
        }
        other => panic!("expected simulation_not_started, got {other:?}"),
    }
}
