import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

export const EVM_CHAIN_CONFIG: Record<
  string,
  {
    chainId: number;
    rpcUrls: string[];
    nativeSymbol: string;
    wrappedNative: string;
    v2Router?: string;
    explorerTx: string;
  }
> = {
  ethereum: {
    chainId: 1,
    rpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://cloudflare-eth.com'],
    nativeSymbol: 'ETH',
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    v2Router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    explorerTx: 'https://etherscan.io/tx/',
  },
  bsc: {
    chainId: 56,
    rpcUrls: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'],
    nativeSymbol: 'BNB',
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    v2Router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    explorerTx: 'https://bscscan.com/tx/',
  },
  base: {
    chainId: 8453,
    rpcUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
    nativeSymbol: 'ETH',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    v2Router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    explorerTx: 'https://basescan.org/tx/',
  },
  arbitrum: {
    chainId: 42161,
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
    nativeSymbol: 'ETH',
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    v2Router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    explorerTx: 'https://arbiscan.io/tx/',
  },
};

export function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

export function hexToBytes(hex: string): Uint8Array {
  let clean = stripHexPrefix(hex).trim();
  if (!clean) return new Uint8Array(0);
  if (clean.length % 2 === 1) clean = '0' + clean;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

export function bigIntToMinBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0);
  let hex = value.toString(16);
  if (hex.length % 2 === 1) hex = '0' + hex;
  return hexToBytes(hex);
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function deriveEvmAddressFromPrivateKey(privHex: string): string {
  const priv = hexToBytes(privHex);
  const pubUncompressed = secp256k1.getPublicKey(priv, false);
  const addrBytes = keccak_256(pubUncompressed.slice(1)).slice(-20);
  return '0x' + bytesToHex(addrBytes);
}

export type RlpItem = Uint8Array | RlpItem[];

export function rlpEncode(item: RlpItem): Uint8Array {
  if (Array.isArray(item)) {
    const encoded = concatBytes(...item.map((x) => rlpEncode(x)));
    return concatBytes(encodeLength(encoded.length, 0xc0), encoded);
  }
  if (item.length === 1 && item[0]! < 0x80) {
    return item;
  }
  return concatBytes(encodeLength(item.length, 0x80), item);
}

function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) {
    return new Uint8Array([len + offset]);
  }
  const lenBytes = bigIntToMinBytes(BigInt(len));
  return concatBytes(new Uint8Array([offset + 55 + lenBytes.length]), lenBytes);
}

export interface Eip1559TxInput {
  chainId: number;
  nonce: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  to: string;
  valueWei: bigint;
  dataHex?: string;
}

export function signEip1559Transaction(privHex: string, tx: Eip1559TxInput): {
  rawTxHex: string;
  txHash: string;
  from: string;
} {
  const priv = hexToBytes(privHex);
  const from = deriveEvmAddressFromPrivateKey(privHex);
  const payloadFields: RlpItem[] = [
    bigIntToMinBytes(BigInt(tx.chainId)),
    bigIntToMinBytes(tx.nonce),
    bigIntToMinBytes(tx.maxPriorityFeePerGas),
    bigIntToMinBytes(tx.maxFeePerGas),
    bigIntToMinBytes(tx.gasLimit),
    tx.to ? hexToBytes(tx.to) : new Uint8Array(0),
    bigIntToMinBytes(tx.valueWei),
    tx.dataHex ? hexToBytes(tx.dataHex) : new Uint8Array(0),
    [], // accessList
  ];

  const unsignedEncoded = concatBytes(new Uint8Array([0x02]), rlpEncode(payloadFields));
  const digest = keccak_256(unsignedEncoded);
  const sig = secp256k1.sign(digest, priv, { prehash: false, lowS: true, format: 'recovered' });
  const yParity = sig[0]!;
  const r = stripLeadingZeros(sig.slice(1, 33));
  const s = stripLeadingZeros(sig.slice(33, 65));

  const signedEncoded = concatBytes(
    new Uint8Array([0x02]),
    rlpEncode([...payloadFields, yParity === 0 ? new Uint8Array(0) : new Uint8Array([yParity]), r, s])
  );
  const txHash = '0x' + bytesToHex(keccak_256(signedEncoded));
  return { rawTxHex: '0x' + bytesToHex(signedEncoded), txHash, from };
}

function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  return bytes.slice(i);
}

export function buildV2SwapExactEthForTokensCalldata(
  minAmountOut: bigint,
  path: [string, string],
  recipient: string,
  deadlineSec: bigint
): string {
  // selector: swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) = 0xb6f9de95
  const padUint = (v: bigint) => v.toString(16).padStart(64, '0');
  const padAddr = (a: string) => stripHexPrefix(a).toLowerCase().padStart(64, '0');
  return (
    '0xb6f9de95' +
    padUint(minAmountOut) +
    padUint(128n) + // dynamic offset to path (4 * 32)
    padAddr(recipient) +
    padUint(deadlineSec) +
    padUint(BigInt(path.length)) +
    padAddr(path[0]) +
    padAddr(path[1])
  );
}

export function buildErc20ApproveCalldata(spender: string, amount: bigint): string {
  // selector: approve(address,uint256) = 0x095ea7b3
  const padAddr = (a: string) => stripHexPrefix(a).toLowerCase().padStart(64, '0');
  const padUint = (v: bigint) => v.toString(16).padStart(64, '0');
  return '0x095ea7b3' + padAddr(spender) + padUint(amount);
}

export function buildV2SwapExactTokensForEthCalldata(
  amountIn: bigint,
  minAmountOut: bigint,
  path: [string, string],
  recipient: string,
  deadlineSec: bigint
): string {
  // selector: swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256) = 0x791ac947
  const padUint = (v: bigint) => v.toString(16).padStart(64, '0');
  const padAddr = (a: string) => stripHexPrefix(a).toLowerCase().padStart(64, '0');
  return (
    '0x791ac947' +
    padUint(amountIn) +
    padUint(minAmountOut) +
    padUint(160n) + // dynamic offset to path (5 * 32)
    padAddr(recipient) +
    padUint(deadlineSec) +
    padUint(BigInt(path.length)) +
    padAddr(path[0]) +
    padAddr(path[1])
  );
}

export async function fetchErc20BalanceAndAllowance(
  chainIdName: string,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<{ balance: bigint; allowance: bigint }> {
  const cfg = EVM_CHAIN_CONFIG[chainIdName.toLowerCase()];
  if (!cfg) return { balance: 0n, allowance: 0n };
  const padAddr = (a: string) => stripHexPrefix(a).toLowerCase().padStart(64, '0');
  const balData = '0x70a08231' + padAddr(ownerAddress);
  const allowData = '0xdd62ed3e' + padAddr(ownerAddress) + padAddr(spenderAddress);
  const [balHex, allowHex] = await Promise.all([
    evmRpcCall<string>(cfg.rpcUrls, 'eth_call', [{ to: tokenAddress, data: balData }, 'latest']).catch(() => '0x0'),
    evmRpcCall<string>(cfg.rpcUrls, 'eth_call', [{ to: tokenAddress, data: allowData }, 'latest']).catch(() => '0x0'),
  ]);
  const toBig = (h: string) => {
    try {
      return h && h !== '0x' ? BigInt(h) : 0n;
    } catch {
      return 0n;
    }
  };
  return { balance: toBig(balHex), allowance: toBig(allowHex) };
}

async function evmRpcCall<T = unknown>(rpcUrls: string[], method: string, params: unknown[]): Promise<T> {
  let lastErr = 'RPC error';
  for (const url of rpcUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(7000),
      });
      const json = (await res.json().catch(() => ({}))) as { result?: T; error?: { message?: string } };
      if (json.error) {
        lastErr = json.error.message || method;
        continue;
      }
      if (json.result !== undefined) return json.result;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'RPC fetch failed';
    }
  }
  throw new Error(lastErr);
}

export async function signAndBroadcastEvmTx(opts: {
  chainIdName: string;
  privateKeyHex: string;
  to: string;
  valueWei: bigint;
  dataHex?: string;
  gasLimitOverride?: bigint;
}): Promise<{ txHash: string; explorerUrl: string; chainId: number }> {
  const cfg = EVM_CHAIN_CONFIG[opts.chainIdName.toLowerCase()];
  if (!cfg) throw new Error(`Unsupported EVM chain: ${opts.chainIdName}`);

  const from = deriveEvmAddressFromPrivateKey(opts.privateKeyHex);
  const [nonceHex, gasPriceHex] = await Promise.all([
    evmRpcCall<string>(cfg.rpcUrls, 'eth_getTransactionCount', [from, 'pending']),
    evmRpcCall<string>(cfg.rpcUrls, 'eth_gasPrice', []),
  ]);

  const nonce = BigInt(nonceHex || '0x0');
  const gasPrice = BigInt(gasPriceHex || '0x3b9aca00');
  const priorityFee = gasPrice > 2_000_000_000n ? gasPrice / 5n : 100_000_000n;
  const maxFee = gasPrice + priorityFee * 2n;

  let gasLimit = opts.gasLimitOverride ?? (opts.dataHex && opts.dataHex !== '0x' ? 260_000n : 21_000n);
  if (!opts.gasLimitOverride && opts.dataHex && opts.dataHex !== '0x') {
    try {
      const estHex = await evmRpcCall<string>(cfg.rpcUrls, 'eth_estimateGas', [
        {
          from,
          to: opts.to,
          value: '0x' + opts.valueWei.toString(16),
          data: opts.dataHex,
        },
      ]);
      const est = BigInt(estHex || '0x0');
      if (est > 21_000n) gasLimit = (est * 125n) / 100n;
    } catch {
      /* keep safe default */
    }
  }

  const signed = signEip1559Transaction(opts.privateKeyHex, {
    chainId: cfg.chainId,
    nonce,
    maxPriorityFeePerGas: priorityFee,
    maxFeePerGas: maxFee,
    gasLimit,
    to: opts.to,
    valueWei: opts.valueWei,
    dataHex: opts.dataHex,
  });

  const sentHash = await evmRpcCall<string>(cfg.rpcUrls, 'eth_sendRawTransaction', [signed.rawTxHex]);
  const finalHash = sentHash || signed.txHash;
  return {
    txHash: finalHash,
    explorerUrl: `${cfg.explorerTx}${finalHash}`,
    chainId: cfg.chainId,
  };
}

// =========================================================================
// Canonical MsgPack + Official Hyperliquid L1 Agent EIP-712 Signer
// =========================================================================

const TEXT_ENCODER = new TextEncoder();

export function msgpackEncode(value: unknown): Uint8Array {
  if (value === null || value === undefined) return new Uint8Array([0xc0]);
  if (typeof value === 'boolean') return new Uint8Array([value ? 0xc3 : 0xc2]);
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= 0 && value <= 0x7f) return new Uint8Array([value]);
      if (value < 0 && value >= -32) return new Uint8Array([0xe0 + (value + 32)]);
      if (value >= 0 && value <= 0xff) return new Uint8Array([0xcc, value]);
      if (value >= 0 && value <= 0xffff) return new Uint8Array([0xcd, (value >> 8) & 0xff, value & 0xff]);
      if (value >= 0 && value <= 0xffffffff) {
        return new Uint8Array([0xce, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
      }
    }
    const buf = new ArrayBuffer(9);
    const view = new DataView(buf);
    view.setUint8(0, 0xcb);
    view.setFloat64(1, value, false);
    return new Uint8Array(buf);
  }
  if (typeof value === 'string') {
    const strBytes = TEXT_ENCODER.encode(value);
    const len = strBytes.length;
    if (len <= 31) return concatBytes(new Uint8Array([0xa0 | len]), strBytes);
    if (len <= 0xff) return concatBytes(new Uint8Array([0xd9, len]), strBytes);
    return concatBytes(new Uint8Array([0xda, (len >> 8) & 0xff, len & 0xff]), strBytes);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => msgpackEncode(v));
    const len = value.length;
    const hdr =
      len <= 15
        ? new Uint8Array([0x90 | len])
        : new Uint8Array([0xdc, (len >> 8) & 0xff, len & 0xff]);
    return concatBytes(hdr, ...items);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    const parts: Uint8Array[] = [];
    for (const [k, v] of entries) {
      parts.push(msgpackEncode(k), msgpackEncode(v));
    }
    const len = entries.length;
    const hdr =
      len <= 15
        ? new Uint8Array([0x80 | len])
        : new Uint8Array([0xde, (len >> 8) & 0xff, len & 0xff]);
    return concatBytes(hdr, ...parts);
  }
  return new Uint8Array([0xc0]);
}

function keccakStr(s: string): Uint8Array {
  return keccak_256(TEXT_ENCODER.encode(s));
}

function pad32(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  const src = bytes.length > 32 ? bytes.slice(-32) : bytes;
  out.set(src, 32 - src.length);
  return out;
}

export function signHyperliquidL1Action(opts: {
  agentPrivateKeyHex: string;
  action: Record<string, unknown>;
  nonce: number;
  isMainnet?: boolean;
}): {
  signature: { r: string; s: string; v: number };
  connectionId: string;
  signerAddress: string;
} {
  const encodedAction = msgpackEncode(opts.action);
  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(opts.nonce), false);
  const vaultFlag = new Uint8Array([0x00]); // no vaultAddress
  const connectionId = keccak_256(concatBytes(encodedAction, nonceBytes, vaultFlag));

  const domainTypeHash = keccakStr('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
  const domainSeparator = keccak_256(
    concatBytes(
      domainTypeHash,
      keccakStr('Exchange'),
      keccakStr('1'),
      pad32(bigIntToMinBytes(1337n)),
      new Uint8Array(32) // 0x0000...0000
    )
  );

  const agentTypeHash = keccakStr('Agent(string source,bytes32 connectionId)');
  const source = opts.isMainnet === false ? 'b' : 'a';
  const structHash = keccak_256(concatBytes(agentTypeHash, keccakStr(source), connectionId));

  const eip712Digest = keccak_256(concatBytes(new Uint8Array([0x19, 0x01]), domainSeparator, structHash));
  const priv = hexToBytes(opts.agentPrivateKeyHex);
  const sig = secp256k1.sign(eip712Digest, priv, { prehash: false, lowS: true, format: 'recovered' });

  return {
    signature: {
      r: '0x' + bytesToHex(sig.slice(1, 33)),
      s: '0x' + bytesToHex(sig.slice(33, 65)),
      v: 27 + sig[0]!,
    },
    connectionId: '0x' + bytesToHex(connectionId),
    signerAddress: deriveEvmAddressFromPrivateKey(opts.agentPrivateKeyHex),
  };
}
