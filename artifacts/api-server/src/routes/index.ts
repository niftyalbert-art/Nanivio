import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import userRouter from "./user";
import walletsRouter from "./wallets";
import transactionsRouter from "./transactions";
import ratesRouter from "./rates";
import countriesRouter from "./countries";
import paymentMethodsRouter from "./payment-methods";
import depositsRouter from "./deposits";
import withdrawalsRouter from "./withdrawals";
import adminRouter from "./admin";
import ticketsRouter from "./tickets";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(userRouter);
router.use(walletsRouter);
router.use(transactionsRouter);
router.use(ratesRouter);
router.use(countriesRouter);
router.use(paymentMethodsRouter);
router.use(depositsRouter);
router.use(withdrawalsRouter);
router.use(adminRouter);
router.use(ticketsRouter);
router.use(settingsRouter);

export default router;
