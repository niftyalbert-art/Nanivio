import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
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

export default router;
