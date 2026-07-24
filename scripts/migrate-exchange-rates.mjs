import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Create exchange_rates table
await client.query(`
  CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    currency_code TEXT NOT NULL UNIQUE,
    rate_to_usd NUMERIC(20, 8) NOT NULL,
    fee_percent NUMERIC(6, 2) NOT NULL DEFAULT 3,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`);

// Seed with current hardcoded rates
const rates = [
  { code: "AED",  rate: 3.6725,  fee: 2.5 },
  { code: "USD",  rate: 1.0,     fee: 0   },
  { code: "GHS",  rate: 15.2,    fee: 3.0 },
  { code: "PHP",  rate: 56.8,    fee: 2.0 },
  { code: "INR",  rate: 83.5,    fee: 1.5 },
  { code: "NGN",  rate: 1540.0,  fee: 4.0 },
  { code: "KES",  rate: 129.5,   fee: 2.5 },
  { code: "EUR",  rate: 0.926,   fee: 1.5 },
  { code: "GBP",  rate: 0.787,   fee: 2.0 },
  { code: "PKR",  rate: 278.5,   fee: 3.0 },
  { code: "BDT",  rate: 110.2,   fee: 2.5 },
  { code: "LKR",  rate: 322.5,   fee: 3.5 },
  { code: "TZS",  rate: 2650.0,  fee: 4.0 },
  { code: "UGX",  rate: 3850.0,  fee: 4.0 },
  { code: "ZAR",  rate: 18.5,    fee: 2.0 },
  { code: "MAD",  rate: 10.1,    fee: 2.5 },
  { code: "EGP",  rate: 31.5,    fee: 3.0 },
  { code: "XOF",  rate: 607.0,   fee: 4.0 },
  { code: "MXN",  rate: 17.2,    fee: 2.0 },
  { code: "BRL",  rate: 5.1,     fee: 2.0 },
  { code: "THB",  rate: 35.8,    fee: 2.0 },
  { code: "MYR",  rate: 4.7,     fee: 2.0 },
  { code: "SGD",  rate: 1.35,    fee: 1.5 },
  { code: "CAD",  rate: 1.36,    fee: 1.5 },
  { code: "AUD",  rate: 1.54,    fee: 1.5 },
  { code: "NZD",  rate: 1.64,    fee: 2.0 },
  { code: "JPY",  rate: 151.5,   fee: 2.0 },
  { code: "CNY",  rate: 7.24,    fee: 2.5 },
  { code: "HKD",  rate: 7.83,    fee: 1.5 },
  { code: "USDT", rate: 1.0,     fee: 1.0 },
];

for (const r of rates) {
  await client.query(`
    INSERT INTO exchange_rates (currency_code, rate_to_usd, fee_percent)
    VALUES ($1, $2, $3)
    ON CONFLICT (currency_code) DO NOTHING;
  `, [r.code, r.rate, r.fee]);
}

await client.end();
console.log("✓ exchange_rates table created and seeded with", rates.length, "currencies");
