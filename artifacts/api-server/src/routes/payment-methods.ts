import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentMethodsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/payment-methods", async (req, res): Promise<void> => {
  const methods = await db
    .select()
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.isActive, true))
    .orderBy(paymentMethodsTable.id);

  res.json(methods);
});

export default router;
