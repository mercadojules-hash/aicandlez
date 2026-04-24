import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import signalsRouter from "./signals.js";
import tradesRouter from "./trades.js";
import portfolioRouter from "./portfolio.js";
import settingsRouter from "./settings.js";
import logsRouter from "./logs.js";
import backtestRouter from "./backtest.js";
import candlesRouter from "./candles.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(signalsRouter);
router.use(tradesRouter);
router.use(portfolioRouter);
router.use(settingsRouter);
router.use(logsRouter);
router.use(backtestRouter);
router.use(candlesRouter);

export default router;
