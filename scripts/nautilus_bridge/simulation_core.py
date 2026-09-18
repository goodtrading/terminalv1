from __future__ import annotations

import asyncio
import json
from pathlib import Path
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from nautilus_trader.adapters.sandbox.config import SandboxExecutionClientConfig
from nautilus_trader.adapters.sandbox.execution import SandboxExecutionClient
from nautilus_trader.backtest.models import FillModel
from nautilus_trader.backtest.models import LatencyModel
from nautilus_trader.backtest.models import MakerTakerFeeModel
from nautilus_trader.cache.cache import Cache
from nautilus_trader.common.component import MessageBus
from nautilus_trader.common.component import TestClock
from nautilus_trader.common.factories import OrderFactory
from nautilus_trader.core.uuid import UUID4
from nautilus_trader.execution.engine import ExecutionEngine
from nautilus_trader.execution.messages import CancelOrder
from nautilus_trader.execution.messages import SubmitOrder
from nautilus_trader.model import Currency
from nautilus_trader.model import InstrumentId
from nautilus_trader.model import Money
from nautilus_trader.model import Price
from nautilus_trader.model import Quantity
from nautilus_trader.model import QuoteTick
from nautilus_trader.model import Symbol
from nautilus_trader.model import TradeId
from nautilus_trader.model import TradeTick
from nautilus_trader.model import TraderId
from nautilus_trader.model import Venue
from nautilus_trader.model.enums import AccountType
from nautilus_trader.model.enums import AggressorSide
from nautilus_trader.model.enums import BookType
from nautilus_trader.model.enums import OmsType
from nautilus_trader.model.enums import OrderSide
from nautilus_trader.model.enums import TimeInForce
from nautilus_trader.model.enums import TriggerType
from nautilus_trader.model.instruments import CryptoPerpetual
from nautilus_trader.portfolio.portfolio import Portfolio

DEFAULT_TRADER_ID = "GT-SIM"
DEFAULT_STRATEGY_ID = "N3B-CORE"
DEFAULT_VENUE = "SIM"
DEFAULT_SYMBOL = "BTCUSDT-PERP"
DEFAULT_RAW_SYMBOL = "BTCUSDT"
DEFAULT_BASE_CURRENCY = "BTC"
DEFAULT_QUOTE_CURRENCY = "USDT"
DEFAULT_SETTLEMENT_CURRENCY = "USDT"
DEFAULT_PRICE_PRECISION = 2
DEFAULT_SIZE_PRECISION = 3
DEFAULT_PRICE_INCREMENT = "0.01"
DEFAULT_SIZE_INCREMENT = "0.001"
DEFAULT_STARTING_BALANCE = "100000"
# Packaged copy of the single shared policy; source checkout uses that same file.
_policy_path = Path(__file__).with_name("paperCostPolicy.json")
if not _policy_path.exists():
    _policy_path = Path(__file__).resolve().parents[2] / "shared" / "trading" / "paperCostPolicy.json"
PAPER_COST_POLICY = json.loads(_policy_path.read_text(encoding="utf-8-sig"))
if PAPER_COST_POLICY["id"] != "DEFAULT_ZERO" or any(PAPER_COST_POLICY[key] != 0 for key in ("makerFeeBps", "takerFeeBps", "slippageBps")):
    raise ValueError("Invalid DEFAULT_ZERO Paper cost policy")
DEFAULT_MAKER_FEE = str(Decimal(PAPER_COST_POLICY["makerFeeBps"]) / Decimal(10000))
DEFAULT_TAKER_FEE = str(Decimal(PAPER_COST_POLICY["takerFeeBps"]) / Decimal(10000))
DEFAULT_MARGIN_INIT = "0.05"
DEFAULT_MARGIN_MAINT = "0.025"
DEFAULT_BID_SIZE = "1000"
DEFAULT_ASK_SIZE = "1000"


class SimulationCoreError(RuntimeError):
    """Controlled error raised by the isolated simulation core."""


@dataclass(frozen=True)
class SimulationInstrumentProfile:
    venue: str = DEFAULT_VENUE
    symbol: str = DEFAULT_SYMBOL
    market_type: str = "perpetual"
    price_precision: int = DEFAULT_PRICE_PRECISION
    size_precision: int = DEFAULT_SIZE_PRECISION
    quote_currency: str = DEFAULT_QUOTE_CURRENCY

    def to_dict(self) -> dict[str, Any]:
        return {
            "venue": self.venue,
            "symbol": self.symbol,
            "market_type": self.market_type,
            "price_precision": self.price_precision,
            "size_precision": self.size_precision,
            "quote_currency": self.quote_currency,
        }


@dataclass(frozen=True)
class SimulationCoreConfig:
    trader_id: str = DEFAULT_TRADER_ID
    strategy_id: str = DEFAULT_STRATEGY_ID
    venue: str = DEFAULT_VENUE
    starting_balance: Decimal = Decimal(DEFAULT_STARTING_BALANCE)
    base_currency: str = DEFAULT_QUOTE_CURRENCY
    quote_currency: str = DEFAULT_QUOTE_CURRENCY
    default_leverage: Decimal = Decimal("10")
    maker_fee: Decimal = Decimal(DEFAULT_MAKER_FEE)
    taker_fee: Decimal = Decimal(DEFAULT_TAKER_FEE)


class SimulationCore:
    """
    GoodTrading-owned isolated simulation wrapper on top of NautilusTrader.

    This core is intentionally ephemeral and offline. It builds a synthetic
    perpetual instrument, an in-memory cache, message bus, portfolio, simulated
    exchange, and backtest execution client. All observable state comes from the
    Nautilus objects themselves.
    """

    def __init__(self, config: SimulationCoreConfig | None = None) -> None:
        self._config = config or SimulationCoreConfig()
        self._started = False
        self._clock: TestClock | None = None
        self._msgbus: MessageBus | None = None
        self._cache: Cache | None = None
        self._portfolio: Portfolio | None = None
        self._exchange: SimulatedExchange | None = None
        self._client: BacktestExecClient | None = None
        self._exec_engine: ExecutionEngine | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._factory: OrderFactory | None = None
        self._trader_id: TraderId | None = None
        self._strategy_id = None
        self._venue: Venue | None = None
        self._instrument: CryptoPerpetual | None = None
        self._instrument_profile = SimulationInstrumentProfile(venue=self._config.venue)
        self._last_quote: QuoteTick | None = None

    @property
    def started(self) -> bool:
        return self._started

    @property
    def instrument_profile(self) -> dict[str, Any]:
        return self._instrument_profile.to_dict()

    def start(self) -> None:
        if self._started:
            return

        self._clock = TestClock()
        self._trader_id = TraderId(self._config.trader_id)
        from nautilus_trader.model.identifiers import StrategyId as _StrategyId

        self._strategy_id = _StrategyId(self._config.strategy_id)
        self._venue = Venue(self._config.venue)
        self._cache = Cache()
        self._msgbus = MessageBus(trader_id=self._trader_id, clock=self._clock)
        self._portfolio = Portfolio(self._msgbus, self._cache, self._clock)
        self._factory = OrderFactory(
            self._trader_id,
            self._strategy_id,
            self._clock,
            cache=self._cache,
        )

        starting_currency = Currency.from_str(self._config.base_currency)
        starting_balances = [Money.from_decimal(self._config.starting_balance, starting_currency)]
        sandbox_config = SandboxExecutionClientConfig(
            venue=self._config.venue,
            starting_balances=[f"{self._format_decimal(self._config.starting_balance, 0)} {self._config.quote_currency}"],
            base_currency=self._config.base_currency,
            oms_type="NETTING",
            account_type="MARGIN",
            default_leverage=self._config.default_leverage,
            leverages={},
            book_type="L1_MBP",
            frozen_account=False,
            bar_execution=False,
            trade_execution=True,
            reject_stop_orders=False,
            support_gtd_orders=True,
            support_contingent_orders=True,
            use_position_ids=True,
            use_random_ids=False,
            use_reduce_only=True,
        )
        self._loop = asyncio.new_event_loop()
        self._client = SandboxExecutionClient(
            loop=self._loop,
            portfolio=self._portfolio,
            msgbus=self._msgbus,
            cache=self._cache,
            clock=self._clock,
            config=sandbox_config,
        )
        self._exchange = self._client.exchange
        self._instrument = self._build_instrument()
        self._exchange.add_instrument(self._instrument)
        self._cache.add_instrument(self._instrument)
        self._client.connect()
        self._exec_engine = ExecutionEngine(
            msgbus=self._msgbus,
            cache=self._cache,
            clock=self._clock,
        )
        self._exec_engine.register_client(self._client)
        self._exec_engine.start()
        self._started = True

    def reset(self) -> None:
        self.shutdown()
        self.start()

    def shutdown(self) -> None:
        if self._exec_engine is not None:
            try:
                self._exec_engine.stop()
            except Exception:
                pass
        if self._loop is not None:
            try:
                self._loop.close()
            except Exception:
                pass
        self._started = False
        self._clock = None
        self._msgbus = None
        self._cache = None
        self._portfolio = None
        self._exchange = None
        self._client = None
        self._factory = None
        self._trader_id = None
        self._strategy_id = None
        self._venue = None
        self._instrument = None
        self._last_quote = None
        self._exec_engine = None

    def set_market(
        self,
        bid: float | Decimal | str,
        ask: float | Decimal | str,
        *,
        bid_size: float | Decimal | str = DEFAULT_BID_SIZE,
        ask_size: float | Decimal | str = DEFAULT_ASK_SIZE,
        trade_price: float | Decimal | str | None = None,
        trade_size: float | Decimal | str = "1",
        timestamp_ns: int | None = None,
    ) -> dict[str, Any]:
        self._require_started()
        assert self._clock is not None
        assert self._exchange is not None
        assert self._instrument is not None

        if timestamp_ns is not None:
            if timestamp_ns <= 0:
                raise ValueError("timestamp_ns must be positive")
            self._clock.set_time(timestamp_ns)
        now_ns = self._next_timestamp_ns()
        quote = QuoteTick(
            instrument_id=self._instrument.id,
            bid_price=Price.from_str(self._format_decimal(bid, DEFAULT_PRICE_PRECISION)),
            ask_price=Price.from_str(self._format_decimal(ask, DEFAULT_PRICE_PRECISION)),
            bid_size=Quantity.from_str(self._format_decimal(bid_size, DEFAULT_SIZE_PRECISION)),
            ask_size=Quantity.from_str(self._format_decimal(ask_size, DEFAULT_SIZE_PRECISION)),
            ts_event=now_ns,
            ts_init=now_ns,
        )
        self._client.on_data(quote)
        self._last_quote = quote
        self._reconcile_protections_after_market_event()

        if trade_price is not None:
            trade_ts = self._next_timestamp_ns()
            aggressor = self._trade_aggressor_side(self._decimal(trade_price), quote)
            trade = TradeTick(
                instrument_id=self._instrument.id,
                price=Price.from_str(self._format_decimal(trade_price, DEFAULT_PRICE_PRECISION)),
                size=Quantity.from_str(self._format_decimal(trade_size, DEFAULT_SIZE_PRECISION)),
                aggressor_side=aggressor,
                trade_id=TradeId(f"SIM-TRADE-{trade_ts}"),
                ts_event=trade_ts,
                ts_init=trade_ts,
            )
            self._client.on_data(trade)
            self._reconcile_protections_after_market_event()

        return self.get_market()

    def _reconcile_protections_after_market_event(self) -> None:
        """Cancel stale/OCO sibling protections after native trigger handling.

        This runs synchronously after Nautilus processes the market event. The
        daemon holds STATE_LOCK for both this callback and every simulation
        mutation, so a sibling cannot trigger between the protective fill and
        this canonical cancellation pass.
        """
        if self.get_position() is not None:
            return
        protection_orders = [
            order for order in self.list_orders()
            if any(str(tag) in {"GT_PROTECTION=STOP_LOSS", "GT_PROTECTION=TAKE_PROFIT"} for tag in order.get("tags", []))
        ]
        for order in protection_orders:
            status = str(order.get("status", "")).upper()
            remaining = Decimal(str(order.get("remaining_quantity", "0")))
            if status in {"CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"} and remaining > 0:
                self.cancel(order["client_order_id"])

    def submit_market(
        self,
        side: str | OrderSide,
        quantity: float | Decimal | str,
        *,
        reduce_only: bool = False,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        order = self._submit_order(
            order_type="market",
            side=side,
            quantity=quantity,
            price=None,
            reduce_only=reduce_only,
            post_only=False,
            client_order_id=client_order_id,
        )
        return order

    def submit_limit(
        self,
        side: str | OrderSide,
        quantity: float | Decimal | str,
        price: float | Decimal | str,
        *,
        post_only: bool = False,
        reduce_only: bool = False,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        order = self._submit_order(
            order_type="limit",
            side=side,
            quantity=quantity,
            price=price,
            post_only=post_only,
            reduce_only=reduce_only,
            client_order_id=client_order_id,
        )
        return order

    def submit_stop_market(
        self,
        side: str | OrderSide,
        quantity: float | Decimal | str,
        trigger_price: float | Decimal | str,
        *,
        reduce_only: bool = True,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        if not reduce_only:
            raise SimulationCoreError("protective stop-market orders must be reduce-only")
        position = self.get_position()
        if position is None:
            raise SimulationCoreError("protective stop requires an open position")
        expected_side = "sell" if str(position["side"]).lower() == "long" else "buy"
        if str(side).lower() != expected_side:
            raise SimulationCoreError("protective stop side must reduce the open position")
        if Decimal(str(quantity)) > Decimal(str(position["quantity"])):
            raise SimulationCoreError("protective stop quantity exceeds open position")
        return self._submit_order(
            order_type="stop_market",
            side=side,
            quantity=quantity,
            price=trigger_price,
            post_only=False,
            reduce_only=True,
            tags=["GT_PROTECTION=STOP_LOSS"],
            client_order_id=client_order_id,
        )

    def submit_take_profit_limit(
        self,
        side: str | OrderSide,
        quantity: float | Decimal | str,
        price: float | Decimal | str,
        *,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        position = self.get_position()
        if position is None:
            raise SimulationCoreError("protective take-profit requires an open position")
        expected_side = "sell" if str(position["side"]).lower() == "long" else "buy"
        if str(side).lower() != expected_side:
            raise SimulationCoreError("protective take-profit side must reduce the open position")
        if Decimal(str(quantity)) > Decimal(str(position["quantity"])):
            raise SimulationCoreError("protective take-profit quantity exceeds open position")
        return self._submit_order(
            order_type="limit", side=side, quantity=quantity, price=price,
            post_only=False, reduce_only=True, tags=["GT_PROTECTION=TAKE_PROFIT"],
            client_order_id=client_order_id,
        )

    def cancel(self, order_id: str | dict[str, Any]) -> dict[str, Any]:
        self._require_started()
        assert self._client is not None
        assert self._exec_engine is not None
        assert self._cache is not None
        assert self._strategy_id is not None
        assert self._trader_id is not None
        assert self._instrument is not None

        client_order_id = self._coerce_order_id(order_id)
        order = self._find_order(client_order_id)
        if order is None:
            raise SimulationCoreError(f"unknown order id: {client_order_id}")
        if order.is_canceled:
            raise SimulationCoreError(f"order already canceled: {client_order_id}")
        if order.is_closed:
            raise SimulationCoreError(f"order already filled: {client_order_id}")

        command = CancelOrder(
            trader_id=self._trader_id,
            strategy_id=self._strategy_id,
            instrument_id=self._instrument.id,
            client_order_id=client_order_id,
            venue_order_id=order.venue_order_id,
            command_id=UUID4(),
            ts_init=self._next_timestamp_ns(),
        )
        self._exec_engine.execute(command)
        cancelled = self._find_order(client_order_id)
        if cancelled is None:
            raise SimulationCoreError(f"cancelled order vanished unexpectedly: {client_order_id}")
        return self._order_snapshot(cancelled)

    def get_order(self, order_id: str | dict[str, Any]) -> dict[str, Any]:
        self._require_started()
        assert self._cache is not None
        order = self._find_order(self._coerce_order_id(order_id))
        if order is None:
            raise SimulationCoreError(f"unknown order id: {order_id}")
        return self._order_snapshot(order)

    def get_orders(self) -> list[dict[str, Any]]:
        self._require_started()
        assert self._cache is not None
        assert self._instrument is not None
        return [self._order_snapshot(order) for order in self._cache.orders_open(venue=self._venue, instrument_id=self._instrument.id)]

    def list_orders(self) -> list[dict[str, Any]]:
        self._require_started()
        assert self._cache is not None
        assert self._instrument is not None
        return [self._order_snapshot(order) for order in self._cache.orders(venue=self._venue, instrument_id=self._instrument.id)]

    def list_order_events(self) -> list[dict[str, Any]]:
        """Expose factual native order events without deriving lifecycle state."""
        self._require_started()
        assert self._cache is not None
        assert self._venue is not None
        assert self._instrument is not None
        events: list[dict[str, Any]] = []
        for order in self._cache.orders(venue=self._venue, instrument_id=self._instrument.id):
            order_tags = list(getattr(order, "tags", None) or [])
            for event in getattr(order, "events", ()):
                native_id = getattr(event, "id", None)
                if native_id is None or not str(native_id).strip():
                    raise SimulationCoreError("order event is missing factual native id")
                ts_event = getattr(event, "ts_event", None)
                ts_init = getattr(event, "ts_init", None)
                if ts_event is None or ts_init is None:
                    raise SimulationCoreError("order event is missing factual nanosecond timestamp")

                def decimal_text(value: Any | None, *, preserve_scale: bool = False) -> str | None:
                    if value is None:
                        return None
                    if preserve_scale:
                        return str(value)
                    return str(value.as_decimal()) if hasattr(value, "as_decimal") else str(value)

                def text(value: Any | None) -> str | None:
                    if value is None:
                        return None
                    result = str(value)
                    return result if result else None

                def enum_text(value: Any | None) -> str | None:
                    if value is None:
                        return None
                    result = self._enum_name(value)
                    return result.upper() if result is not None else None

                event_tags = list(getattr(event, "tags", None) or [])
                reduce_only = getattr(event, "reduce_only", None)
                reduce_only_source = "EVENT_FACTUAL" if isinstance(reduce_only, bool) else "NOT_AVAILABLE"
                if reduce_only_source == "NOT_AVAILABLE":
                    order_reduce_only = getattr(order, "is_reduce_only", None)
                    if isinstance(order_reduce_only, bool):
                        reduce_only = order_reduce_only
                        reduce_only_source = "ORDER_FACTUAL"

                tags = event_tags if event_tags else order_tags
                tags_source = "EVENT_FACTUAL" if event_tags else ("ORDER_FACTUAL" if order_tags else "NOT_AVAILABLE")

                def relation(name: str) -> str | None:
                    value = getattr(event, name, None)
                    if value is None:
                        value = getattr(order, name, None)
                    return text(value)

                def order_value(name: str) -> Any | None:
                    return getattr(order, name, None)

                event_side = getattr(event, "order_side", None) or getattr(event, "side", None) or order_value("side")
                event_order_type = getattr(event, "order_type", None) or order_value("order_type")
                event_quantity = getattr(event, "quantity", None) or getattr(event, "last_qty", None) or order_value("quantity")
                event_price = getattr(event, "price", None) or getattr(event, "last_px", None) or order_value("price")
                event_trigger_price = getattr(event, "trigger_price", None) or order_value("trigger_price")

                events.append({
                    "event_id": str(native_id),
                    "event_type": type(event).__name__,
                    "ts_event_ns": int(ts_event),
                    "ts_init_ns": int(ts_init),
                    "venue_order_id": text(getattr(event, "venue_order_id", None) or order_value("venue_order_id")),
                    "client_order_id": text(getattr(event, "client_order_id", None) or order_value("client_order_id")),
                    "trade_id": text(getattr(event, "trade_id", None)),
                    "position_id": text(getattr(event, "position_id", None) or order_value("position_id")),
                    "side": enum_text(event_side),
                    "order_type": enum_text(event_order_type),
                    "quantity": decimal_text(event_quantity, preserve_scale=True),
                    "price": decimal_text(event_price),
                    "trigger_price": decimal_text(event_trigger_price, preserve_scale=True),
                    "liquidity_side": enum_text(getattr(event, "liquidity_side", None)),
                    "reduce_only": reduce_only,
                    "reduce_only_source": reduce_only_source,
                    "tags": tags,
                    "tags_source": tags_source,
                    "contingency_type": enum_text(getattr(event, "contingency_type", None) or getattr(order, "contingency_type", None)),
                    "order_list_id": relation("order_list_id"),
                    "linked_order_ids": [str(item) for item in (getattr(event, "linked_order_ids", None) or getattr(order, "linked_order_ids", None) or ())],
                    "parent_order_id": relation("parent_order_id"),
                    "reason": text(getattr(event, "reason", None)),
                })
        return events

    def list_fills(self) -> list[dict[str, Any]]:
        """Expose Nautilus execution events as the canonical fill read model."""
        self._require_started()
        assert self._cache is not None
        assert self._venue is not None
        assert self._instrument is not None
        fills: list[dict[str, Any]] = []
        for order in self._cache.orders(venue=self._venue, instrument_id=self._instrument.id):
            for event in getattr(order, "events", ()):
                last_qty = getattr(event, "last_qty", None)
                last_px = getattr(event, "last_px", None)
                if last_qty is None or last_px is None:
                    continue
                quantity = self._event_decimal(last_qty)
                price = self._event_decimal(last_px)
                if quantity <= 0 or price <= 0:
                    continue
                ts_event = getattr(event, "ts_event", None)
                if ts_event is None:
                    raise SimulationCoreError("fill event is missing ts_event")
                trade_id = getattr(event, "trade_id", None)
                if trade_id is None or not str(trade_id).strip():
                    raise SimulationCoreError("fill event is missing factual trade_id/fill_id")
                fill_id = str(trade_id)
                commission = getattr(event, "commission", None)
                fee_asset = getattr(getattr(commission, "currency", None), "code", None)
                fills.append({
                    "fill_id": fill_id,
                    "client_order_id": str(order.client_order_id),
                    "venue_order_id": str(order.venue_order_id) if getattr(order, "venue_order_id", None) is not None else None,
                    "instrument_id": str(order.instrument_id),
                    "side": self._enum_name(order.side),
                    "price": price,
                    "quantity": quantity,
                    "timestamp": int(ts_event),
                    "fee": self._event_decimal(commission) if commission is not None else None,
                    "fee_asset": fee_asset,
                    "liquidity": self._enum_name_or_none(getattr(event, "liquidity_side", None)),
                })
        return fills

    def get_position(self) -> dict[str, Any] | None:
        self._require_started()
        assert self._cache is not None
        assert self._instrument is not None
        positions = self._cache.positions_open(venue=self._venue, instrument_id=self._instrument.id)
        if not positions:
            return None
        return self._position_snapshot(positions[0])

    def get_instrument(self) -> dict[str, Any]:
        self._require_started()
        assert self._instrument is not None
        return {
            "venue": self._venue.value if self._venue is not None else None,
            "symbol": self._instrument.symbol.value if hasattr(self._instrument.symbol, "value") else str(self._instrument.symbol),
            "market_type": self._instrument.type_string_c() if hasattr(self._instrument, "type_string_c") else "perpetual",
            "base_asset": self._instrument.base_currency.code,
            "quote_asset": self._instrument.quote_currency.code,
            "exchange_native_symbol": self._instrument.raw_symbol.value if hasattr(self._instrument.raw_symbol, "value") else str(self._instrument.raw_symbol),
        }

    def get_account(self) -> dict[str, Any]:
        self._require_started()
        assert self._cache is not None
        assert self._portfolio is not None
        assert self._instrument is not None
        assert self._clock is not None
        account = self._cache.account_for_venue(self._venue)
        if account is None:
            raise SimulationCoreError("simulation account is not available")
        balance = account.balance(account.base_currency)
        base_currency = account.base_currency
        realized_map = self._portfolio.realized_pnls(self._venue, target_currency=base_currency)
        realized_money = realized_map.get(base_currency) if realized_map else None
        position = self.get_position()
        unrealized = Decimal(str(position["unrealized_pnl"])) if position is not None else Decimal("0")
        realized = realized_money.as_decimal() if realized_money is not None else Decimal("0")
        fees_total = self._fees_total()
        total = balance.total.as_decimal()
        return {
            "started": self._started,
            "venue": self._venue.value if self._venue is not None else None,
            "account_id": account.id.value,
            "timestamp": self._clock.timestamp_ns(),
            "instrument": self.instrument_profile,
            "account_type": "margin" if account.is_margin_account else "cash",
            "base_currency": account.base_currency.code if account.base_currency is not None else None,
            "balance_total": total,
            "balance_free": balance.free.as_decimal(),
            "balance_locked": balance.locked.as_decimal(),
            "equity": total + unrealized,
            "realized_pnl": realized,
            "unrealized_pnl": unrealized,
            "fees_total": fees_total,
        }

    def get_market(self) -> dict[str, Any]:
        self._require_started()
        if self._last_quote is None:
            return {"quote": None}
        return {
            "quote": {
                "instrument_id": str(self._last_quote.instrument_id),
                "bid": self._last_quote.bid_price.as_decimal(),
                "ask": self._last_quote.ask_price.as_decimal(),
                "bid_size": self._last_quote.bid_size.as_decimal(),
                "ask_size": self._last_quote.ask_size.as_decimal(),
                "ts_event": self._last_quote.ts_event,
            }
        }

    def _build_instrument(self) -> CryptoPerpetual:
        return CryptoPerpetual.from_dict(
            {
                "id": f"{DEFAULT_SYMBOL}.{self._config.venue}",
                "raw_symbol": DEFAULT_RAW_SYMBOL,
                "base_currency": DEFAULT_BASE_CURRENCY,
                "quote_currency": DEFAULT_QUOTE_CURRENCY,
                "settlement_currency": DEFAULT_SETTLEMENT_CURRENCY,
                "is_inverse": False,
                "price_precision": DEFAULT_PRICE_PRECISION,
                "size_precision": DEFAULT_SIZE_PRECISION,
                "price_increment": DEFAULT_PRICE_INCREMENT,
                "size_increment": DEFAULT_SIZE_INCREMENT,
                "multiplier": "1",
                "lot_size": "1",
                "max_quantity": None,
                "min_quantity": None,
                "max_notional": None,
                "min_notional": None,
                "max_price": None,
                "min_price": None,
                "margin_init": DEFAULT_MARGIN_INIT,
                "margin_maint": DEFAULT_MARGIN_MAINT,
                "maker_fee": str(self._config.maker_fee),
                "taker_fee": str(self._config.taker_fee),
                "ts_event": 0,
                "ts_init": 0,
                "tick_scheme_name": None,
                "info": {},
            }
        )

    def _submit_order(
        self,
        *,
        order_type: str,
        side: str | OrderSide,
        quantity: float | Decimal | str,
        price: float | Decimal | str | None,
        post_only: bool,
        reduce_only: bool,
        client_order_id: str | None = None,
        tags: list[str] | None = None,
    ) -> dict[str, Any]:
        self._require_started()
        assert self._client is not None
        assert self._exec_engine is not None
        assert self._factory is not None
        assert self._strategy_id is not None
        assert self._trader_id is not None
        assert self._instrument is not None

        order_side = self._coerce_side(side)
        qty = self._quantity(quantity)
        if qty.raw <= 0:
            raise ValueError("quantity must be positive")

        if order_type == "market":
            order = self._factory.market(
                instrument_id=self._instrument.id,
                order_side=order_side,
                quantity=qty,
                time_in_force=TimeInForce.GTC,
                reduce_only=reduce_only,
                client_order_id=self._coerce_client_order_id(client_order_id),
            )
        elif order_type == "limit":
            if price is None:
                raise ValueError("limit orders require a price")
            px = self._price(price)
            if px.raw <= 0:
                raise ValueError("limit orders require a positive price")
            order = self._factory.limit(
                instrument_id=self._instrument.id,
                order_side=order_side,
                quantity=qty,
                price=px,
                time_in_force=TimeInForce.GTC,
                post_only=post_only,
                reduce_only=reduce_only,
                tags=tags,
                client_order_id=self._coerce_client_order_id(client_order_id),
            )
        elif order_type == "stop_market":
            if price is None:
                raise ValueError("stop-market orders require a trigger price")
            trigger = self._price(price)
            if trigger.raw <= 0:
                raise ValueError("stop-market orders require a positive trigger price")
            order = self._factory.stop_market(
                instrument_id=self._instrument.id,
                order_side=order_side,
                quantity=qty,
                trigger_price=trigger,
                trigger_type=TriggerType.BID_ASK,
                time_in_force=TimeInForce.GTC,
                reduce_only=reduce_only,
                tags=tags,
                client_order_id=self._coerce_client_order_id(client_order_id),
            )
        else:
            raise SimulationCoreError(f"unsupported order type: {order_type}")

        submit = SubmitOrder(
            trader_id=self._trader_id,
            strategy_id=self._strategy_id,
            order=order,
            command_id=UUID4(),
            ts_init=self._next_timestamp_ns(),
        )
        self._exec_engine.execute(submit)
        cached = self._find_order(order.client_order_id)
        return self._order_snapshot(cached if cached is not None else order)

    def _replay_market_fill(self, quantity: float | Decimal | str) -> None:
        assert self._client is not None
        if self._last_quote is None:
            return
        trade_ts = self._next_timestamp_ns()
        midpoint = (self._last_quote.bid_price.as_decimal() + self._last_quote.ask_price.as_decimal()) / Decimal("2")
        trade = TradeTick(
            instrument_id=self._last_quote.instrument_id,
            price=Price.from_str(self._format_decimal(midpoint, DEFAULT_PRICE_PRECISION)),
            size=Quantity.from_str(self._format_decimal(quantity, DEFAULT_SIZE_PRECISION)),
            aggressor_side=AggressorSide.NO_AGGRESSOR,
            trade_id=TradeId(f"SIM-TRADE-{trade_ts}"),
            ts_event=trade_ts,
            ts_init=trade_ts,
        )
        self._client.on_data(trade)
        self._last_quote = QuoteTick(
            instrument_id=self._last_quote.instrument_id,
            bid_price=self._last_quote.bid_price,
            ask_price=self._last_quote.ask_price,
            bid_size=self._last_quote.bid_size,
            ask_size=self._last_quote.ask_size,
            ts_event=trade_ts,
            ts_init=trade_ts,
        )

    def _order_snapshot(self, order: Any) -> dict[str, Any]:
        price = order.price.as_decimal() if getattr(order, "price", None) is not None else None
        filled_qty = order.filled_qty.as_decimal() if getattr(order, "filled_qty", None) is not None else Decimal("0")
        remaining_qty = order.leaves_qty.as_decimal() if getattr(order, "leaves_qty", None) is not None else Decimal("0")
        average_fill_price = Decimal(str(order.avg_px)) if filled_qty > 0 and getattr(order, "avg_px", None) is not None else None
        return {
            "client_order_id": str(order.client_order_id),
            "venue_order_id": str(order.venue_order_id) if getattr(order, "venue_order_id", None) is not None else None,
            "instrument_id": str(order.instrument_id),
            "side": self._enum_name(order.side),
            "status": self._enum_name(order.status),
            "order_type": self._enum_name(order.order_type),
            "quantity": order.quantity.as_decimal(),
            "filled_quantity": filled_qty,
            "remaining_quantity": remaining_qty,
            "average_fill_price": average_fill_price,
            "price": price,
            "trigger_price": order.trigger_price.as_decimal() if getattr(order, "trigger_price", None) is not None else None,
            "tags": list(order.tags) if getattr(order, "tags", None) is not None else [],
            "time_in_force": self._enum_name(order.time_in_force),
            "timestamps": {
                "created_at": int(getattr(order, "ts_init", 0)),
                "submitted_at": int(getattr(order, "ts_submitted", 0)) or None,
                "accepted_at": int(getattr(order, "ts_accepted", 0)) or None,
                "updated_at": int(getattr(order, "ts_last", 0) or getattr(order, "ts_closed", 0) or getattr(order, "ts_accepted", 0) or getattr(order, "ts_submitted", 0) or getattr(order, "ts_init", 0)),
                "canceled_at": int(getattr(order, "ts_closed", 0)) if self._enum_name(order.status) == "canceled" else None,
            },
        }

    def _find_order(self, client_order_id: Any) -> Any | None:
        assert self._cache is not None
        assert self._venue is not None
        assert self._instrument is not None
        order = self._cache.order(client_order_id)
        if order is not None:
            return order
        for candidate in self._cache.orders(venue=self._venue, instrument_id=self._instrument.id):
            if getattr(candidate, "client_order_id", None) == client_order_id:
                return candidate
        return None

    def _position_snapshot(self, position: Any) -> dict[str, Any]:
        mark_price = self._mark_price()
        unrealized = position.unrealized_pnl(mark_price) if mark_price is not None else None
        realized = position.realized_pnl
        unrealized_value = unrealized.as_decimal() if hasattr(unrealized, "as_decimal") else Decimal(str(unrealized)) if unrealized is not None else Decimal("0")
        realized_value = realized.as_decimal() if hasattr(realized, "as_decimal") else Decimal(str(realized))
        avg_entry = getattr(position, "avg_px_open", None)
        avg_entry_value = Decimal(str(avg_entry)) if avg_entry is not None else None
        opened_at = int(getattr(position, "ts_init", 0)) or None
        assert self._clock is not None
        return {
            "instrument_id": str(position.instrument_id),
            "side": self._enum_name(position.side),
            "quantity": position.quantity.as_decimal(),
            "average_entry_price": avg_entry_value,
            "mark_price": mark_price.as_decimal() if mark_price is not None else None,
            "realized_pnl": realized_value,
            "unrealized_pnl": unrealized_value,
            "fees_total": self._fees_total(),
            "opened_at": opened_at,
            "updated_at": self._clock.timestamp_ns(),
        }

    def _mark_price(self) -> Price | None:
        if self._last_quote is None:
            return None
        midpoint = (self._last_quote.bid_price.as_decimal() + self._last_quote.ask_price.as_decimal()) / Decimal("2")
        return Price.from_str(self._format_decimal(midpoint, DEFAULT_PRICE_PRECISION))

    def _trade_aggressor_side(self, trade_price: Decimal, quote: QuoteTick) -> AggressorSide:
        midpoint = (quote.bid_price.as_decimal() + quote.ask_price.as_decimal()) / Decimal("2")
        return AggressorSide.BUYER if trade_price >= midpoint else AggressorSide.SELLER

    def _fees_total(self) -> Decimal:
        if self._cache is None or self._venue is None or self._instrument is None:
            return Decimal("0")
        fees = Decimal("0")
        for order in self._cache.orders(venue=self._venue, instrument_id=self._instrument.id):
            for event in order.events:
                commission = getattr(event, "commission", None)
                if commission is not None:
                    fees += Decimal(str(commission.as_decimal() if hasattr(commission, "as_decimal") else commission))
        return fees

    def _event_decimal(self, value: Any) -> Decimal:
        return Decimal(str(value.as_decimal() if hasattr(value, "as_decimal") else value))

    def _coerce_order_id(self, order_id: str | dict[str, Any]) -> Any:
        if isinstance(order_id, dict):
            order_id = order_id.get("client_order_id") or order_id.get("id")
        if order_id is None:
            raise SimulationCoreError("order id is required")
        from nautilus_trader.model.identifiers import ClientOrderId

        return ClientOrderId(str(order_id))

    def _coerce_client_order_id(self, client_order_id: str | None) -> Any | None:
        if client_order_id is None:
            return None
        from nautilus_trader.model.identifiers import ClientOrderId

        return ClientOrderId(str(client_order_id))

    def _coerce_side(self, side: str | OrderSide) -> OrderSide:
        if isinstance(side, OrderSide):
            return side
        normalized = str(side).strip().lower()
        if normalized in {"buy", "long"}:
            return OrderSide.BUY
        if normalized in {"sell", "short"}:
            return OrderSide.SELL
        raise ValueError(f"unsupported side: {side}")

    def _price(self, value: float | Decimal | str) -> Price:
        return Price.from_str(self._format_decimal(value, DEFAULT_PRICE_PRECISION))

    def _quantity(self, value: float | Decimal | str) -> Quantity:
        return Quantity.from_str(self._format_decimal(value, DEFAULT_SIZE_PRECISION))

    def _decimal(self, value: float | Decimal | str) -> Decimal:
        return value if isinstance(value, Decimal) else Decimal(str(value))

    def _format_decimal(self, value: float | Decimal | str, precision: int) -> str:
        quantized = self._decimal(value).quantize(Decimal(10) ** -precision)
        return format(quantized, f".{precision}f")

    def _enum_name(self, value: Any) -> str:
        name = getattr(value, "name", None)
        if name is not None:
            return str(name).lower()
        return str(value).split(".")[-1].lower()

    def _enum_name_or_none(self, value: Any) -> str | None:
        return None if value is None else self._enum_name(value)

    def _require_started(self) -> None:
        if not self._started:
            raise SimulationCoreError("simulation not started")

    def _next_timestamp_ns(self) -> int:
        assert self._clock is not None
        ts = self._clock.timestamp_ns()
        self._clock.set_time(ts + 1)
        return ts


__all__ = [
    "DEFAULT_BID_SIZE",
    "DEFAULT_ASK_SIZE",
    "SimulationCore",
    "SimulationCoreConfig",
    "SimulationCoreError",
    "SimulationInstrumentProfile",
]
