import { Router, type IRouter } from "express";
import { GetExchangeRatesQueryParams, GetExchangeRatesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Base exchange rates (all relative to USD)
const FROM_USD: Record<string, number> = {
  AED: 3.6725, USD: 1, GHS: 15.2, PHP: 56.8, INR: 83.5, NGN: 1540,
  KES: 129.5, EUR: 0.926, GBP: 0.787, PKR: 278.5, BDT: 110.2, LKR: 322.5,
  TZS: 2650, UGX: 3850, ZAR: 18.5, MAD: 10.1, EGP: 31.5, XOF: 607,
  MXN: 17.2, BRL: 5.1, THB: 35.8, MYR: 4.7, SGD: 1.35, CAD: 1.36,
  AUD: 1.54, NZD: 1.64, JPY: 151.5, CNY: 7.24, HKD: 7.83, USDT: 1.0,
};

const FEES: Record<string, number> = {
  AED: 2.5, GHS: 3.0, PHP: 2.0, INR: 1.5, NGN: 4.0, KES: 2.5,
  EUR: 1.5, GBP: 2.0, PKR: 3.0, BDT: 2.5, LKR: 3.5, TZS: 4.0,
  UGX: 4.0, ZAR: 2.0, MAD: 2.5, EGP: 3.0, XOF: 4.0, MXN: 2.0,
  BRL: 2.0, THB: 2.0, MYR: 2.0, SGD: 1.5, CAD: 1.5, AUD: 1.5,
  NZD: 2.0, JPY: 2.0, CNY: 2.5, HKD: 1.5, USDT: 1.0, USD: 0,
};

router.get("/rates", async (req, res): Promise<void> => {
  const params = GetExchangeRatesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { from, to } = params.data;
  const fromRate = FROM_USD[from];
  if (!fromRate) {
    res.status(400).json({ error: `Unsupported currency: ${from}` });
    return;
  }

  const toCurrency = to ?? "USD";
  const toRate = FROM_USD[toCurrency];
  if (!toRate) {
    res.status(400).json({ error: `Unsupported currency: ${toCurrency}` });
    return;
  }

  // Convert: from → USD → to
  const rate = toRate / fromRate;
  const inverseRate = fromRate / toRate;
  const fee = FEES[toCurrency] ?? 3.0;
  // Fee is expressed in the from-currency equivalent of a USD fee
  const feeAmount = fee / fromRate;

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
