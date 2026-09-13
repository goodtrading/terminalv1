use app_lib::nautilus_daemon::NautilusProcessManager;
use app_lib::nautilus_simulation::{
    simulation_apply_market_snapshot, simulation_cancel_order, simulation_get_account,
    simulation_get_order, simulation_get_position, simulation_inject_quote_diagnostic,
    simulation_reset, simulation_start, simulation_status, simulation_stop,
    simulation_submit_order, AccountDto, DiagnosticQuoteDto, InstrumentDto, MarketSnapshotDto,
    MarketSnapshotInstrumentDto, MarketSnapshotSourceDto, OrderIntentDto, OrderSideDto,
    OrderStatusDto, OrderTypeDto, PositionSideDto, SimulationCommandErrorCategory,
    SimulationStateDto, TimeInForceDto,
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

fn started_manager() -> Mutex<NautilusProcessManager> {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));
    manager
        .lock()
        .expect("manager lock")
        .start()
        .expect("manager start");
    manager
}

fn decimal_string_is_nonzero(value: &str) -> bool {
    value.chars().any(|ch| ch.is_ascii_digit() && ch != '0')
}

#[test]
fn simulation_commands_require_started_daemon() {
    let manager = Mutex::new(NautilusProcessManager::with_packaged_runtime_root(
        runtime_root(),
    ));

    let error = simulation_get_account(&manager).expect_err("daemon should be required");
    assert_eq!(error.category, SimulationCommandErrorCategory::Daemon);
    assert_eq!(error.code, "daemon_not_running");
    assert!(error.message.contains("not running"));
}

#[test]
fn lifecycle_commands_use_existing_daemon_owner() {
    let manager = started_manager();

    let status = simulation_status(&manager).expect("status");
    assert_eq!(status.state, SimulationStateDto::Stopped);
    assert!(!status.started);
    assert!(!status.has_simulation);

    let started = simulation_start(&manager).expect("start");
    assert_eq!(started.state, SimulationStateDto::Running);
    assert!(started.started);

    let started_again = simulation_start(&manager).expect("idempotent start");
    assert_eq!(started_again.state, SimulationStateDto::Running);
    assert_eq!(started_again.already_running, Some(true));

    let stopped = simulation_stop(&manager).expect("stop");
    assert_eq!(stopped.state, SimulationStateDto::Stopped);
    assert_eq!(stopped.already_stopped, Some(false));

    let reset = simulation_reset(&manager).expect("reset");
    assert_eq!(reset.state, SimulationStateDto::Running);
    assert_eq!(reset.reset, Some(true));
}

#[test]
fn market_limit_cancel_and_reset_commands_round_trip() {
    let manager = started_manager();

    simulation_start(&manager).expect("simulation start");
    simulation_inject_quote_diagnostic(&manager, diagnostic_quote("99999", "100001"))
        .expect("initial quote");

    let market_order = simulation_submit_order(&manager, market_buy_intent("gt-market-cmd-1"))
        .expect("market order");
    assert_eq!(market_order.status, OrderStatusDto::Filled);
    assert_eq!(market_order.average_fill_price.as_deref(), Some("100001.0"));

    let market_position = simulation_get_position(&manager).expect("position");
    assert_eq!(market_position.side, PositionSideDto::Long);
    assert_eq!(market_position.quantity, "1");

    let market_account: AccountDto = simulation_get_account(&manager).expect("account");
    assert!(market_account
        .fees_total
        .as_deref()
        .is_some_and(decimal_string_is_nonzero));

    simulation_reset(&manager).expect("reset before limit");
    simulation_inject_quote_diagnostic(&manager, diagnostic_quote("99999", "100001"))
        .expect("limit quote");

    let working_limit =
        simulation_submit_order(&manager, limit_buy_intent("gt-limit-cmd-1", "99900"))
            .expect("limit working");
    assert_eq!(working_limit.status, OrderStatusDto::Accepted);

    simulation_inject_quote_diagnostic(&manager, diagnostic_quote("99899", "99900"))
        .expect("trigger quote");
    let filled_limit = simulation_get_order(&manager, "gt-limit-cmd-1").expect("filled order");
    assert_eq!(filled_limit.status, OrderStatusDto::Filled);
    assert_eq!(filled_limit.average_fill_price.as_deref(), Some("99900.0"));

    simulation_reset(&manager).expect("reset before cancel");
    simulation_inject_quote_diagnostic(&manager, diagnostic_quote("99999", "100001"))
        .expect("cancel quote");

    let working_cancel =
        simulation_submit_order(&manager, limit_buy_intent("gt-cancel-cmd-1", "99900"))
            .expect("cancel working");
    assert_eq!(working_cancel.status, OrderStatusDto::Accepted);

    let canceled = simulation_get_order(&manager, "gt-cancel-cmd-1").expect("working order lookup");
    assert_eq!(canceled.status, OrderStatusDto::Accepted);

    let canceled_order =
        simulation_cancel_order(&manager, "gt-cancel-cmd-1").expect("cancel order");
    assert_eq!(canceled_order.status, OrderStatusDto::Canceled);

    simulation_inject_quote_diagnostic(&manager, diagnostic_quote("99899", "99900"))
        .expect("post cancel quote");
    let post_cancel =
        simulation_get_order(&manager, "gt-cancel-cmd-1").expect("post-cancel lookup");
    assert_eq!(post_cancel.status, OrderStatusDto::Canceled);

    let flat_position = simulation_get_position(&manager).expect("flat position");
    assert_eq!(flat_position.side, PositionSideDto::Flat);
    assert_eq!(flat_position.quantity, "0");
}

#[test]
fn production_market_snapshot_requires_started_simulation() {
    let manager = started_manager();

    let error =
        simulation_apply_market_snapshot(&manager, production_snapshot("99999.50", "100000.00"))
            .expect_err("snapshot should require running simulation");
    assert_eq!(error.category, SimulationCommandErrorCategory::Simulation);
    assert_eq!(error.code, "simulation_not_started");
}

#[test]
fn production_market_snapshot_round_trip_keeps_position_flat_until_order() {
    let manager = started_manager();

    simulation_start(&manager).expect("simulation start");
    let applied =
        simulation_apply_market_snapshot(&manager, production_snapshot("99999.50", "100000.00"))
            .expect("production snapshot");
    assert!(applied.applied);
    assert_eq!(applied.source_venue, "BINANCE");
    assert_eq!(applied.source_symbol, "BTCUSDT");
    assert_eq!(applied.simulation_symbol, "BTCUSDT-PERP");
    assert_eq!(applied.timestamp_ms, 123_456_789);

    let position = simulation_get_position(&manager).expect("position after snapshot");
    assert_eq!(position.side, PositionSideDto::Flat);
    assert_eq!(position.quantity, "0");

    let market_order = simulation_submit_order(&manager, market_buy_intent("gt-market-snapshot-1"))
        .expect("market order");
    assert_eq!(market_order.status, OrderStatusDto::Filled);
    assert_eq!(market_order.average_fill_price.as_deref(), Some("100000.0"));
}

#[test]
fn engine_stop_closes_simulation_first_and_subsequent_commands_fail_cleanly() {
    let manager = started_manager();

    simulation_start(&manager).expect("simulation start");
    simulation_inject_quote_diagnostic(&manager, diagnostic_quote("99999", "100001"))
        .expect("quote");
    simulation_submit_order(&manager, market_buy_intent("gt-stop-cmd-1")).expect("market submit");

    let stopped = manager
        .lock()
        .expect("manager lock")
        .stop()
        .expect("engine stop");
    assert_eq!(
        stopped.state,
        app_lib::nautilus_daemon::NautilusProcessState::Stopped
    );

    let error = simulation_get_account(&manager).expect_err("after stop should fail");
    assert_eq!(error.category, SimulationCommandErrorCategory::Daemon);
    assert_eq!(error.code, "daemon_not_running");
}
