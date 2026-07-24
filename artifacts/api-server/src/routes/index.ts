import { Router, type IRouter } from "express";
import healthRouter from "./health";
import userRouter from "./user";
import walletsRouter from "./wallets";
import transactionsRouter from "./transactions";
import ratesRouter from "./rates";
import countriesRouter from "./countries";

const router: IRouter = Router();

router.use(healthRouter);
router.use(userRouter);
router.use(walletsRouter);
router.use(transactionsRouter);
router.use(ratesRouter);
router.use(countriesRouter);

export default router;
