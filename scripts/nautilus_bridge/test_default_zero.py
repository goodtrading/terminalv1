import unittest
from decimal import Decimal
from simulation_core import SimulationCore, SimulationCoreConfig, PAPER_COST_POLICY
class DefaultZeroTest(unittest.TestCase):
    def test_fresh_runtime_and_fill_are_zero_cost(self):
        self.assertEqual(PAPER_COST_POLICY, dict(id="DEFAULT_ZERO", makerFeeBps=0, takerFeeBps=0, slippageBps=0))
        config = SimulationCoreConfig()
        self.assertEqual(config.maker_fee, Decimal(0))
        self.assertEqual(config.taker_fee, Decimal(0))
        core = SimulationCore()
        try:
            core.start()
            core.set_market(100000, 100001)
            core.submit_market("buy", 0.001)
            self.assertEqual(Decimal(str(core.list_fills()[0]["fee"])), Decimal(0))
            self.assertEqual(core.get_account()["fees_total"], Decimal(0))
        finally:
            core.shutdown()
