import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, exchangeRatesTable, settingsTable } from "@workspace/db";
import { GetExchangeRatesQueryParams, GetExchangeRatesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/rates", async (req, res): Promise<void> => {
  const params = GetExchangeRatesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { from, to } = params.data;

  // Load both currencies from DB
  const [fromRow] = await db.select().from(exchangeRatesTable).where(eq(exchangeRatesTable.currencyCode, from));
  const toCurrency = to ?? "USD";
  const [toRow] = await db.select().from(exchangeRatesTable).where(eq(exchangeRatesTable.currencyCode, toCurrency));

  if (!fromRow) {
    res.status(400).json({ error: `Unsupported currency: ${from}` });
    return;
  }
  if (!toRow) {
    res.status(400).json({ error: `Unsupported currency: ${toCurrency}` });
    return;
  }

  const fromRateToUsd = parseFloat(fromRow.rateToUsd);
  const toRateToUsd = parseFloat(toRow.rateToUsd);

  // Load fee settings
  const feeRows = await db.select().from(settingsTable)
    .where(
      // fetch all three keys in one query
      eq(settingsTable.key, "fee_mode")
    );
  const allFeeRows = await db.select().from(settingsTable);
  const feeMap: Record<string, string> = {};
  for (const r of allFeeRows) feeMap[r.key] = r.value;

  const feeMode = feeMap["fee_mode"] || "percent";

  // Convert: from → USD → to
  const rate = toRateToUsd / fromRateToUsd;
  const inverseRate = fromRateToUsd / toRateToUsd;

  let fee = 0;
  let feeAmount = 0;
  let feeFixed = 0;

  if (feeMode === "fixed") {
    feeFixed = feeMap["send_fee_fixed"] ? parseFloat(feeMap["send_fee_fixed"]) : 0;
    feeFixed = isNaN(feeFixed) ? 0 : feeFixed;
    fee = 0;
    feeAmount = feeFixed;
  } else {
    // percent mode
    const globalFee = feeMap["send_fee_percent"] ? parseFloat(feeMap["send_fee_percent"]) : NaN;
    fee = !isNaN(globalFee) && globalFee >= 0 ? globalFee : parseFloat(toRow.feePercent);
    feeAmount = (fee / 100) * (1 / fromRateToUsd);
  }

  const result = {
    from,
    to: toCurrency,
    rate: Math.round(rate * 100000) / 100000,
    fee,
    feeAmount: Math.round(feeAmount * 100) / 100,
    inverseRate: Math.round(inverseRate * 100000) / 100000,
  };

  res.json(GetExchangeRatesResponse.parse(result));
});

export default router;
