import { Router, type IRouter } from "express";
import { getAlerts } from "../lib/store";

const router: IRouter = Router();

router.get("/alerts", (req, res) => {
  const statusParam = req.query["status"] as string | undefined;
  const limitParam = req.query["limit"] as string | undefined;

  const status =
    statusParam === "active" || statusParam === "executed"
      ? statusParam
      : undefined;

  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50;

  const alerts = getAlerts(status, limit);
  const allAlerts = getAlerts(undefined, 200);
  const activeCount = allAlerts.filter((a) => a.status === "active").length;

  res.setHeader("Cache-Control", "no-store");
  res.json({
    alerts,
    total: allAlerts.length,
    activeCount,
  });
});

export default router;
