import unittest
from simulation_core import SimulationCore
class ProtectionTouchTest(unittest.TestCase):
    def test_exact_bid_ask_touch_for_both_sides_and_protections(self):
        for side,kind in [(s,k) for s in ('long','short') for k in ('TP','SL')]:
            with self.subTest(side=side,kind=kind):
                core=SimulationCore()
                try:
                    core.start();core.set_market(99999,100001)
                    core.submit_market('buy' if side=='long' else 'sell',0.001)
                    exit_side='sell' if side=='long' else 'buy'
                    above=(side=='long') == (kind=='TP')
                    level=100100 if above else 99900
                    order=(core.submit_take_profit_limit if kind=='TP' else core.submit_stop_market)(exit_side,0.001,level)
                    if side=='long':
                        near_bid=level-1 if above else level+1
                        core.set_market(near_bid,near_bid+2)
                        self.assertEqual(core.get_order(order['client_order_id'])['status'],'accepted')
                        core.set_market(level,level+2)
                    else:
                        near_ask=level-1 if above else level+1
                        core.set_market(near_ask-2,near_ask)
                        self.assertEqual(core.get_order(order['client_order_id'])['status'],'accepted')
                        core.set_market(level-2,level)
                    self.assertEqual(core.get_order(order['client_order_id'])['status'],'filled')
                    self.assertIsNone(core.get_position())
                finally: core.shutdown()
