import { Router, type IRouter } from "express";
import { getMarketState } from "../lib/store";

const router: IRouter = Router();

router.get("/market/state", (_req, res) => {
  const state = getMarketState();
  res.setHeader("Cache-Control", "no-store");
  res.json(state);
});

export default router;
