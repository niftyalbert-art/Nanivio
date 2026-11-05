import { createHash } from 'node:crypto';

// Mainnet contract published by Tether. Never accept a contract supplied by a client.
export const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest();

export function tronAddressHex(address: string): string {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) throw new Error('A valid TRON mainnet receiving address is required.');
  let value = 0n;
  for (const character of address) value = value * 58n + BigInt(ALPHABET.indexOf(character));
  const bytes = Buffer.from(value.toString(16).padStart(50, '0'), 'hex');
  if (bytes.length !== 25 || bytes[0] !== 0x41 ||
      !sha256(sha256(bytes.subarray(0, 21))).subarray(0, 4).equals(bytes.subarray(21))) {
    throw new Error('The TRON address checksum is invalid.');
  }
  return bytes.subarray(1, 21).toString('hex');
}

export function usdtAmount(units: string | bigint): string {
  const value = BigInt(units);
  if (value < 0n) throw new Error('USDT units cannot be negative.');
  return `${value / 1_000_000n}.${String(value % 1_000_000n).padStart(6, '0')}`;
}

export type TronProof = {
  transactionId: string; logIndex: number; blockNumber: number; blockTimestamp: number;
  receivingAddress: string; tokenContract: string; amountUnits: string;
};

export function verifyTronReceipt(
  receipt: any, transactionId: string, receivingAddress: string, amountUnits: string,
): TronProof {
  if (!/^[a-fA-F0-9]{64}$/.test(transactionId) || receipt?.id?.toLowerCase() !== transactionId.toLowerCase()) {
    throw new Error('No matching solidified TRON transaction was found.');
  }
  if (receipt.receipt?.result !== 'SUCCESS' ||
      !Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber <= 0 ||
      !Number.isSafeInteger(receipt.blockTimeStamp) || receipt.blockTimeStamp <= 0) {
    throw new Error('The TRON transaction is not a successful solidified contract transfer.');
  }
  const destination = tronAddressHex(receivingAddress);
  const contract = tronAddressHex(TRON_USDT_CONTRACT);
  const index = (Array.isArray(receipt.log) ? receipt.log : []).findIndex((log: any) =>
    String(log.address).toLowerCase().replace(/^41(?=[a-f0-9]{40}$)/, '') === contract &&
    log.topics?.length === 3 &&
    String(log.topics[0]).toLowerCase() === TRANSFER_TOPIC &&
    /^[a-fA-F0-9]{64}$/.test(log.topics[1]) &&
    /^0{24}[a-fA-F0-9]{40}$/.test(log.topics[2]) &&
    String(log.topics[2]).slice(-40).toLowerCase() === destination &&
    /^[a-fA-F0-9]{64}$/.test(log.data) && BigInt(`0x${log.data}`) === BigInt(amountUnits));
  if (index < 0) throw new Error('This transaction does not pay the exact invoice amount in official TRON USDT to the invoice address.');
  return {
    transactionId: transactionId.toLowerCase(), logIndex: index,
    blockNumber: receipt.blockNumber, blockTimestamp: receipt.blockTimeStamp,
    receivingAddress, tokenContract: TRON_USDT_CONTRACT, amountUnits,
  };
}

export class TronReader {
  constructor(private readonly request: typeof fetch = fetch) {}

  private async json(path: string, body?: unknown): Promise<any> {
    const response = await this.request(`https://api.trongrid.io${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error('TRON verification is temporarily unavailable. Do not send another payment.');
    return response.json();
  }

  async proof(transactionId: string, receivingAddress: string, amountUnits: string) {
    // A FullNode receipt or indexer history alone is NOT finality evidence.
    const receipt = await this.json('/walletsolidity/gettransactioninfobyid', { value: transactionId });
    return verifyTronReceipt(receipt, transactionId, receivingAddress, amountUnits);
  }

  async candidates(receivingAddress: string, amountUnits: string, since: number): Promise<string[]> {
    const query = new URLSearchParams({
      only_confirmed: 'true', only_to: 'true', limit: '200',
      contract_address: TRON_USDT_CONTRACT, min_timestamp: String(since), order_by: 'block_timestamp,desc',
    });
    const result = await this.json(`/v1/accounts/${encodeURIComponent(receivingAddress)}/transactions/trc20?${query}`);
    if (result.success !== true || !Array.isArray(result.data)) {
      throw new Error('TRON transfer history is unavailable. Keep your invoice and transaction ID.');
    }
    // Indexer results are discovery hints only. Every candidate gets a Solidity receipt check.
    return [...new Set<string>(result.data.filter((row: any) =>
      row.to === receivingAddress && row.value === amountUnits &&
      row.token_info?.address === TRON_USDT_CONTRACT && /^[a-fA-F0-9]{64}$/.test(row.transaction_id),
    ).map((row: any) => row.transaction_id))].slice(0, 5);
  }
}
