from __future__ import annotations

import asyncio
from decimal import Decimal

from nautilus_trader.adapters.sandbox.config import SandboxExecutionClientConfig
from nautilus_trader.adapters.sandbox.execution import SandboxExecutionClient
from nautilus_trader.cache.cache import Cache
from nautilus_trader.common.component import MessageBus
from nautilus_trader.common.component import TestClock
from nautilus_trader.common.factories import OrderFactory
from nautilus_trader.core.uuid import UUID4
from nautilus_trader.execution.engine import ExecutionEngine
from nautilus_trader.execution.messages import SubmitOrder
from nautilus_trader.model.data import QuoteTick
from nautilus_trader.model.enums import AccountType
from nautilus_trader.model.enums import OmsType
from nautilus_trader.model.enums import OrderSide
from nautilus_trader.model.enums import TimeInForce
from nautilus_trader.model.identifiers import StrategyId
from nautilus_trader.model.identifiers import TraderId
from nautilus_trader.model.identifiers import Venue
from nautilus_trader.model.instruments import CryptoPerpetual
from nautilus_trader.model.objects import Price
from nautilus_trader.model.objects import Quantity
from nautilus_trader.portfolio.portfolio import Portfolio

TRADER_ID = TraderId("GT-S0")
STRATEGY_ID = StrategyId("N3B-S0")
VENUE = Venue("SIM")
ACCOUNT_CURRENCY = "USDT"
INSTRUMENT_ID = "BTCUSDT-PERP.SIM"


def enum_name(value: object) -> str:
    name = getattr(value, "name", None)
    if name is not None:
        return str(name).lower()
    return str(value).split(".")[-1].lower()


def build_instrument() -> CryptoPerpetual:
    return CryptoPerpetual.from_dict(
        {
            "id": INSTRUMENT_ID,
            "raw_symbol": "BTCUSDT-PERP",
            "base_currency": "BTC",
            "quote_currency": ACCOUNT_CURRENCY,
            "settlement_currency": ACCOUNT_CURRENCY,
            "is_inverse": False,
            "price_precision": 2,
            "size_precision": 3,
            "price_increment": "0.01",
            "size_increment": "0.001",
            "multiplier": "1",
            "lot_size": None,
            "max_quantity": None,
            "min_quantity": None,
            "max_notional": None,
            "min_notional": None,
            "max_price": None,
            "min_price": None,
            "margin_init": "0.05",
            "margin_maint": "0.025",
            "maker_fee": "0.0002",
            "taker_fee": "0.0005",
            "ts_event": 0,
            "ts_init": 0,
            "info": {"source": "n3b-s0"},
        },
    )


def snapshot(core: dict[str, object]) -> None:
    print(
        "AFTER_" + core["stage"],
        "connected=" + str(core["connected"]),
        "account=" + str(core["account_present"]),
        "instrument=" + str(core["instrument_present"]),
        "cache_order=" + str(core["order_present"]),
        "position=" + str(core["position_present"]),
        flush=True,
    )


def main() -> int:
    clock = TestClock()
    cache = Cache()
    msgbus = MessageBus(trader_id=TRADER_ID, clock=clock)
    portfolio = Portfolio(msgbus, cache, clock)

    instrument = build_instrument()
    cache.add_instrument(instrument)

    sandbox_config = SandboxExecutionClientConfig(
        venue=str(VENUE),
        starting_balances=[f"100000 {ACCOUNT_CURRENCY}"],
        base_currency=ACCOUNT_CURRENCY,
        oms_type="NETTING",
        account_type="MARGIN",
        default_leverage=Decimal("10"),
        leverages={},
        book_type="L1_MBP",
        frozen_account=False,
        bar_execution=False,
        trade_execution=True,
        reject_stop_orders=True,
        support_gtd_orders=True,
        support_contingent_orders=True,
        use_position_ids=True,
        use_random_ids=False,
        use_reduce_only=True,
    )

    loop = asyncio.new_event_loop()
    client = SandboxExecutionClient(
        loop=loop,
        portfolio=portfolio,
        msgbus=msgbus,
        cache=cache,
        clock=clock,
        config=sandbox_config,
    )
    engine = ExecutionEngine(msgbus=msgbus, cache=cache, clock=clock)
    engine.register_client(client)
    engine.start()
    client.connect()

    order_factory = OrderFactory(TRADER_ID, STRATEGY_ID, clock, cache=cache)
    order = order_factory.market(
        instrument_id=instrument.id,
        order_side=OrderSide.BUY,
        quantity=Quantity.from_str("1.000"),
        time_in_force=TimeInForce.GTC,
    )

    print("ORDER_INITIAL=" + enum_name(order.status), flush=True)
    print(
        "BEFORE_SUBMIT",
        "connected=" + str(client.is_connected),
        "account_present=" + str(cache.account_for_venue(VENUE) is not None),
        "instrument_present=" + str(cache.instrument(instrument.id) is not None),
        "exchange_instruments=" + str(len(list(client.exchange.cache.instruments(venue=VENUE)))),
        flush=True,
    )

    quote = QuoteTick(
        instrument_id=instrument.id,
        bid_price=Price.from_str("99999.00"),
        ask_price=Price.from_str("100001.00"),
        bid_size=Quantity.from_str("1000.000"),
        ask_size=Quantity.from_str("1000.000"),
        ts_event=clock.timestamp_ns(),
        ts_init=clock.timestamp_ns(),
    )
    print("STAGE quote", flush=True)
    client.on_data(quote)

    command = SubmitOrder(
        trader_id=TRADER_ID,
        strategy_id=STRATEGY_ID,
        order=order,
        command_id=UUID4(),
        ts_init=clock.timestamp_ns(),
    )
    print("STAGE submit", flush=True)
    engine.execute(command)

    cached_order = cache.order(order.client_order_id)
    positions = list(cache.positions_open(venue=VENUE, instrument_id=instrument.id))
    account = cache.account_for_venue(VENUE)
    matching_engine = client.exchange.get_matching_engine(instrument.id)

    print("AFTER_SUBMIT", flush=True)
    print("order status=" + enum_name(cached_order.status if cached_order is not None else order.status), flush=True)
    print("exchange open orders=" + str(len(matching_engine.get_open_orders())), flush=True)
    print("cache orders=" + str(len(list(cache.orders_open(venue=VENUE, instrument_id=instrument.id)))), flush=True)
    print("positions=" + str(len(positions)), flush=True)
    print("account present=" + str(account is not None), flush=True)

    if cached_order is None or enum_name(cached_order.status) != "filled" or not positions:
        print("SANDBOX_SMOKE=BLOCKED", flush=True)
        print("FINAL_STAGE=" + enum_name(cached_order.status if cached_order is not None else order.status), flush=True)
        print("CLIENT_CONNECTED=" + str(client.is_connected), flush=True)
        print("ORDER_IN_CACHE=" + str(cached_order is not None), flush=True)
        print("ORDER_IN_EXCHANGE=" + str(matching_engine.order_exists(order.client_order_id)), flush=True)
        print("ACCOUNT_EXISTS=" + str(account is not None), flush=True)
        print("POSITION_EXISTS=" + str(bool(positions)), flush=True)
        return 1

    position = positions[0]
    print("SANDBOX_SMOKE=PASS", flush=True)
    print("ORDER_STATUS=FILLED", flush=True)
    print("POSITION_SIDE=" + enum_name(position.side), flush=True)
    print("POSITION_QTY=" + str(position.quantity.as_decimal()), flush=True)
    print("FILL_PRICE=" + str(cached_order.avg_px), flush=True)
    print("ACCOUNT_BALANCE=" + str(account.balance(account.base_currency).total.as_decimal()) if account is not None else "ACCOUNT_BALANCE=None", flush=True)
    print("AFTER_MARKET_PROCESS order status=" + enum_name(cached_order.status), flush=True)
    print("AFTER_MARKET_PROCESS position=" + enum_name(position.side), flush=True)

    loop.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
