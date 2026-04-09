import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketRouter from "./market";
import alertsRouter from "./alerts";
import terminalRouter from "./terminal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketRouter);
router.use(alertsRouter);
router.use(terminalRouter);

export default router;
