import { Router, type IRouter } from "express";
import { db, countriesTable } from "@workspace/db";
import { GetSupportedCountriesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/countries", async (req, res): Promise<void> => {
  const rows = await db.select().from(countriesTable).orderBy(countriesTable.name);
  const parsed = rows.map((c) => ({
    ...c,
    transferFee: parseFloat(c.transferFee),
  }));
  res.json(GetSupportedCountriesResponse.parse(parsed));
});

export default router;
