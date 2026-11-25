import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { apiFetch } from './api';
import { getTelegramWebApp, isInsideTelegramMiniApp } from './telegram';

export interface Eip1193Provider {
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface SolanaInjectedProvider {
  isTrust?: boolean;
  isPhantom?: boolean;
  publicKey?: { toString: () => string; toBase58?: () => string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } }>;
  signMessage?: (msg: Uint8Array, encoding?: string) => Promise<{ signature?: Uint8Array }>;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature?: string } | string>;
  request?: (args: { method: string; params?: unknown }) => Promise<{ signature?: string } | string>;
}

export interface TronInjectedProvider {
  defaultAddress?: { base58?: string; hex?: string };
  ready?: boolean;
  request?: (args: { method: string }) => Promise<{ code?: number }>;
}

export interface TonInjectedProvider {
  account?: { address?: string };
  connect?: () => Promise<{ account?: { address?: string }; address?: string } | void>;
  send?: (method: string, params?: unknown[]) => Promise<unknown>;
}

export interface EvmNetworkSpec {
  key: 'bsc' | 'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'avalanche' | 'optimism';
  chainIdHex: string;
  chainIdDec: number;
  chainName: string;
  shortName: string;
  symbol: string;
  decimals: number;
  rpcUrl: string;
  explorerUrl: string;
  trustCoinId: number;
}

export const EVM_NETWORKS: EvmNetworkSpec[] = [
  {
    key: 'bsc',
    chainIdHex: '0x38',
    chainIdDec: 56,
    chainName: 'BNB Smart Chain',
    shortName: 'BSC',
    symbol: 'BNB',
    decimals: 18,
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorerUrl: 'https://bscscan.com',
    trustCoinId: 20000714,
  },
  {
    key: 'ethereum',
    chainIdHex: '0x1',
    chainIdDec: 1,
    chainName: 'Ethereum Mainnet',
    shortName: 'ETH',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    trustCoinId: 60,
  },
  {
    key: 'base',
    chainIdHex: '0x2105',
    chainIdDec: 8453,
    chainName: 'Base Mainnet',
    shortName: 'BASE',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    trustCoinId: 8453,
  },
  {
    key: 'arbitrum',
    chainIdHex: '0xa4b1',
    chainIdDec: 42161,
    chainName: 'Arbitrum One',
    shortName: 'ARB',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    trustCoinId: 42161,
  },
  {
    key: 'polygon',
    chainIdHex: '0x89',
    chainIdDec: 137,
    chainName: 'Polygon POS',
    shortName: 'POL',
    symbol: 'POL',
    decimals: 18,
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    trustCoinId: 966,
  },
  {
    key: 'avalanche',
    chainIdHex: '0xa86a',
    chainIdDec: 43114,
    chainName: 'Avalanche C-Chain',
    shortName: 'AVAX',
    symbol: 'AVAX',
    decimals: 18,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    trustCoinId: 9005,
  },
  {
    key: 'optimism',
    chainIdHex: '0xa',
    chainIdDec: 10,
    chainName: 'OP Mainnet',
    shortName: 'OP',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    trustCoinId: 10000010,
  },
];

const BSC_CHAIN_ID_HEX = '0x38'; // 56
const BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

type InjectedWindow = {
  trustwallet?: {
    ethereum?: Eip1193Provider;
    solana?: SolanaInjectedProvider;
    tron?: TronInjectedProvider;
    ton?: TonInjectedProvider;
  } | Eip1193Provider;
  ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  solana?: SolanaInjectedProvider;
  phantom?: { solana?: SolanaInjectedProvider };
  solflare?: SolanaInjectedProvider;
  tronWeb?: TronInjectedProvider;
  tronLink?: { request?: (args: { method: string }) => Promise<{ code?: number }>; tronWeb?: TronInjectedProvider };
  ton?: TonInjectedProvider;
  tonkeeper?: { ton?: TonInjectedProvider } & TonInjectedProvider;
};

type WalletStandardWallet = {
  name?: string;
  chains?: string[];
  accounts?: Array<{ address?: string }>;
  features?: Record<
    string,
    {
      connect?: (input?: unknown) => Promise<{ accounts?: Array<{ address?: string }> }>;
    }
  >;
};

type Eip6963AnnounceEvent = CustomEvent<{
  info?: { rdns?: string; name?: string; uuid?: string };
  provider?: Eip1193Provider;
}>;

const discoveredEip6963Providers: Array<{
  rdns: string;
  name: string;
  provider: Eip1193Provider;
}> = [];
const discoveredStandardWallets: WalletStandardWallet[] = [];
let discoveryInitialized = false;

export function initWalletDiscovery(): void {
  if (typeof window === 'undefined' || discoveryInitialized) return;
  discoveryInitialized = true;

  const onAnnounce = (ev: Event) => {
    const detail = (ev as Eip6963AnnounceEvent).detail;
    if (!detail?.provider) return;
    const rdns = detail.info?.rdns || '';
    const name = detail.info?.name || '';
    if (!discoveredEip6963Providers.some((p) => p.provider === detail.provider)) {
      discoveredEip6963Providers.push({ rdns, name, provider: detail.provider });
    }
  };

  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // Listen for Wallet Standard (Solana / multi-chain extensions including Trust Wallet)
  const registerFn = (wallet: WalletStandardWallet) => {
    if (wallet && !discoveredStandardWallets.includes(wallet)) {
      discoveredStandardWallets.push(wallet);
    }
  };
  try {
    window.addEventListener('wallet-standard:register-wallet', (ev: Event) => {
      const cb = (ev as CustomEvent<(api: { register: (w: WalletStandardWallet) => void }) => void>).detail;
      if (typeof cb === 'function') cb({ register: registerFn });
    });
    window.dispatchEvent(
      new CustomEvent('wallet-standard:app-ready', {
        detail: { register: registerFn },
      })
    );
  } catch {
    // ignore if browser blocks custom wallet-standard event
  }
}

export async function waitForWalletProviders(ms = 140): Promise<void> {
  initWalletDiscovery();
  if (getInjectedTrustProvider() || getInjectedSolanaProvider() || getInjectedTonProvider()) {
    return;
  }
  await new Promise((r) => setTimeout(r, ms));
}

export function getInjectedTrustProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  initWalletDiscovery();
  const win = window as unknown as InjectedWindow;

  // 1) Explicit Trust Wallet global
  if (win.trustwallet) {
    if ('ethereum' in win.trustwallet && win.trustwallet.ethereum) return win.trustwallet.ethereum;
    if ('request' in win.trustwallet) return win.trustwallet as Eip1193Provider;
  }
  // 2) EIP-6963 announced Trust Wallet extension
  const eipTrust = discoveredEip6963Providers.find(
    (p) => p.rdns.toLowerCase().includes('trustwallet') || /trust\s*wallet/i.test(p.name) || p.provider.isTrust || p.provider.isTrustWallet
  );
  if (eipTrust) return eipTrust.provider;

  // 3) Multi-provider window.ethereum.providers
  if (win.ethereum?.providers?.length) {
    const found = win.ethereum.providers.find((p) => p.isTrust || p.isTrustWallet);
    if (found) return found;
  }
  // 4) Any EIP-6963 provider if window.ethereum absent, else window.ethereum
  if (win.ethereum) return win.ethereum;
  if (discoveredEip6963Providers[0]?.provider) return discoveredEip6963Providers[0].provider;
  return null;
}

export function getInjectedSolanaProvider(): SolanaInjectedProvider | null {
  if (typeof window === 'undefined') return null;
  initWalletDiscovery();
  const win = window as unknown as InjectedWindow;
  if (win.trustwallet && 'solana' in win.trustwallet && win.trustwallet.solana) return win.trustwallet.solana;
  if (win.solana?.isTrust) return win.solana;
  if (win.phantom?.solana) return win.phantom.solana;
  if (win.solana) return win.solana;
  if (win.solflare) return win.solflare;
  return null;
}

export function getInjectedTronProvider(): { tronWeb?: TronInjectedProvider; link?: InjectedWindow['tronLink'] } {
  if (typeof window === 'undefined') return {};
  const win = window as unknown as InjectedWindow;
  const twTron = win.trustwallet && 'tron' in win.trustwallet ? win.trustwallet.tron : undefined;
  return {
    tronWeb: twTron || win.tronLink?.tronWeb || win.tronWeb,
    link: win.tronLink,
  };
}

export function getInjectedTonProvider(): TonInjectedProvider | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as InjectedWindow;
  if (win.trustwallet && 'ton' in win.trustwallet && win.trustwallet.ton) return win.trustwallet.ton;
  if (win.tonkeeper?.ton) return win.tonkeeper.ton;
  if (win.tonkeeper?.connect) return win.tonkeeper;
  if (win.ton) return win.ton;
  return null;
}

export function isTrustWalletEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as InjectedWindow;
  const p = getInjectedTrustProvider();
  return Boolean(
    win.trustwallet ||
      p?.isTrust ||
      p?.isTrustWallet ||
      discoveredEip6963Providers.some((x) => x.rdns.toLowerCase().includes('trustwallet')) ||
      (typeof navigator !== 'undefined' && /Trust/i.test(navigator.userAgent))
  );
}

export function hasAnyInjectedWallet(): boolean {
  return Boolean(
    getInjectedTrustProvider() ||
      getInjectedSolanaProvider() ||
      getInjectedTonProvider() ||
      getInjectedTronProvider().tronWeb ||
      getInjectedTronProvider().link ||
      discoveredStandardWallets.length > 0
  );
}

export function isMobileWalletPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || isInsideTelegramMiniApp();
}

export function buildTrustWalletDappOpenUrl(targetUrl: string, coinId = 20000714): string {
  return `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;
}

export async function switchEvmNetwork(networkKey: EvmNetworkSpec['key']): Promise<EvmNetworkSpec> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const spec = EVM_NETWORKS.find((n) => n.key === networkKey) || EVM_NETWORKS[0]!;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: spec.chainIdHex }],
    });
  } catch {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: spec.chainIdHex,
          chainName: spec.chainName,
          nativeCurrency: { name: spec.symbol, symbol: spec.symbol, decimals: spec.decimals },
          rpcUrls: [spec.rpcUrl],
          blockExplorerUrls: [spec.explorerUrl],
        },
      ],
    });
  }
  return spec;
}

export async function connectTrustWalletEvm(): Promise<{ address: string; isTrust: boolean; chainId: string | null }> {
  const provider = getInjectedTrustProvider();
  if (!provider) {
    throw new Error('NO_INJECTED_WALLET');
  }
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error('NO_ACCOUNT_SELECTED');
  let chainId: string | null = null;
  try {
    chainId = (await provider.request({ method: 'eth_chainId' })) as string;
  } catch {
    chainId = null;
  }
  return {
    address,
    isTrust: Boolean(provider.isTrust || provider.isTrustWallet),
    chainId,
  };
}

export interface MultiChainConnectResult {
  evmAddress: string | null;
  solanaAddress: string | null;
  tronAddress: string | null;
  tonAddress: string | null;
  isTrust: boolean;
  activeEvmChainId: string | null;
  connectedFamilies: string[];
}

export async function connectAllWalletChains(): Promise<MultiChainConnectResult> {
  await waitForWalletProviders(140);
  if (!hasAnyInjectedWallet()) {
    throw new Error('NO_INJECTED_WALLET');
  }

  let evmAddress: string | null = null;
  let solanaAddress: string | null = null;
  let tronAddress: string | null = null;
  let tonAddress: string | null = null;
  let isTrust = isTrustWalletEnvironment();
  let activeEvmChainId: string | null = null;
  const connectedFamilies: string[] = [];
  let userRejectedAny = false;

  // 1. Connect EVM (covers Ethereum, BSC, Base, Arbitrum, Polygon, Avalanche, Optimism)
  try {
    const evm = await connectTrustWalletEvm();
    evmAddress = evm.address;
    isTrust = isTrust || evm.isTrust;
    activeEvmChainId = evm.chainId;
    connectedFamilies.push('EVM (ETH · BSC · Base · Arb · Pol · Avax · OP)');
  } catch (err) {
    const code = (err as { code?: number })?.code;
    const msg = err instanceof Error ? err.message : '';
    if (code === 4001 || /reject|denied|cancel/i.test(msg)) userRejectedAny = true;
  }

  // 2. Connect Solana (Trust Wallet Solana / Wallet Standard / Phantom / Solflare)
  const solProv = getInjectedSolanaProvider();
  if (solProv) {
    try {
      const resp = await solProv.connect().catch((err) => {
        const code = (err as { code?: number })?.code;
        if (code === 4001) userRejectedAny = true;
        return null;
      });
      const pk = resp?.publicKey?.toString() || solProv.publicKey?.toString() || null;
      if (pk && !pk.startsWith('0x')) {
        solanaAddress = pk;
        connectedFamilies.push('Solana (SPL)');
      }
    } catch {
      // optional
    }
  } else if (discoveredStandardWallets.length > 0) {
    const solStandard =
      discoveredStandardWallets.find(
        (w) => /trust/i.test(w.name || '') && w.chains?.some((c) => c.startsWith('solana:'))
      ) || discoveredStandardWallets.find((w) => w.chains?.some((c) => c.startsWith('solana:')));
    if (solStandard?.features?.['standard:connect']?.connect) {
      try {
        const res = await solStandard.features['standard:connect'].connect();
        const pk = res?.accounts?.[0]?.address || solStandard.accounts?.[0]?.address || null;
        if (pk && !pk.startsWith('0x')) {
          solanaAddress = pk;
          if (/trust/i.test(solStandard.name || '')) isTrust = true;
          connectedFamilies.push('Solana (SPL)');
        }
      } catch {
        // optional
      }
    }
  }

  // 3. Connect TRON (Trust Wallet TRON / TronLink)
  const { tronWeb, link } = getInjectedTronProvider();
  try {
    if (link?.request) {
      await link.request({ method: 'tron_requestAccounts' }).catch(() => null);
    }
    const addr = tronWeb?.defaultAddress?.base58 || link?.tronWeb?.defaultAddress?.base58 || null;
    if (addr && addr.startsWith('T')) {
      tronAddress = addr;
      connectedFamilies.push('TRON (TRC20)');
    }
  } catch {
    // optional
  }

  // 4. Connect TON (Trust Wallet TON / Tonkeeper)
  const tonProv = getInjectedTonProvider();
  if (tonProv) {
    try {
      const res = (await tonProv.connect?.().catch(() => null)) as { account?: { address?: string }; address?: string } | undefined;
      let addr = res?.account?.address || res?.address || tonProv.account?.address || null;
      if (!addr && tonProv.send) {
        const accounts = (await tonProv.send('ton_requestAccounts').catch(() => null)) as string[] | null;
        if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
          addr = accounts[0];
        } else {
          const wallets = (await tonProv.send('ton_requestWallets').catch(() => null)) as Array<{ address?: string }> | null;
          if (Array.isArray(wallets) && typeof wallets[0]?.address === 'string') {
            addr = wallets[0].address;
          }
        }
      }
      if (addr) {
        tonAddress = addr;
        connectedFamilies.push('TON (Jetton)');
      }
    } catch {
      // optional
    }
  }

  if (!evmAddress && !solanaAddress && !tronAddress && !tonAddress) {
    throw new Error(userRejectedAny ? 'USER_REJECTED' : 'NO_INJECTED_WALLET');
  }

  return {
    evmAddress,
    solanaAddress,
    tronAddress,
    tonAddress,
    isTrust,
    activeEvmChainId,
    connectedFamilies,
  };
}

export interface PersistedMultiChainResult extends MultiChainConnectResult {
  verified: boolean;
}

export async function connectAndPersistAllTrustWallets(): Promise<PersistedMultiChainResult> {
  const conn = await connectAllWalletChains();
  const nonceRes = await apiFetch<{ message: string }>('/api/trustwallet/nonce', { method: 'POST' });
  const sig = conn.evmAddress
    ? await signTrustWalletNonce(conn.evmAddress, nonceRes.message).catch(() => undefined)
    : undefined;
  await apiFetch('/api/trustwallet/connect', {
    method: 'POST',
    body: JSON.stringify({
      evmAddress: conn.evmAddress || undefined,
      solanaAddress: conn.solanaAddress || undefined,
      tronAddress: conn.tronAddress || undefined,
      tonAddress: conn.tonAddress || undefined,
      signature: sig,
      signedMessage: nonceRes.message,
    }),
  });
  void apiFetch('/api/trustwallet/balance', { method: 'POST' }).catch(() => {});
  return {
    ...conn,
    verified: Boolean(sig),
  };
}

export interface TrustWalletDappHandoff {
  targetUrl: string;
  universalLink: string;
  deepLink: string;
  expiresInSeconds: number;
}

export async function requestTrustWalletDappHandoff(coinId = 20000714): Promise<TrustWalletDappHandoff> {
  return apiFetch<TrustWalletDappHandoff>('/api/trustwallet/dapp-handoff', {
    method: 'POST',
    body: JSON.stringify({
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      coinId,
    }),
  });
}

export function launchTrustWalletUrl(universalLink: string, deepLink?: string): void {
  if (typeof window === 'undefined') return;
  const tg = getTelegramWebApp();
  if (isInsideTelegramMiniApp() && tg?.openLink) {
    tg.openLink(universalLink, { try_instant_view: false });
    return;
  }
  if (deepLink && isMobileWalletPlatform()) {
    window.location.href = deepLink;
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        window.location.href = universalLink;
      }
    }, 850);
    return;
  }
  window.open(universalLink, '_blank', 'noopener,noreferrer');
}

export async function signTrustWalletNonce(address: string, message: string): Promise<string> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [message, address],
  })) as string;
  return signature;
}

/**
 * Send BEP20 USDT payment via Trust Wallet / EIP-1193 provider directly on BNB Smart Chain (chain 56).
 */
export async function sendBep20UsdtViaTrustWallet(params: {
  toAddress: string;
  amountUsdt: number;
}): Promise<string> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error('NO_ACCOUNT_SELECTED');

  // Switch to BNB Smart Chain if needed
  await switchEvmNetwork('bsc');

  // BEP20 USDT has 18 decimals on BSC
  const weiAmount = BigInt(Math.round(params.amountUsdt * 1_000_000)) * 10n ** 12n;
  const toClean = params.toAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amtHex = weiAmount.toString(16).padStart(64, '0');
  // ERC20 transfer(address,uint256) selector = 0xa9059cbb
  const data = `0xa9059cbb${toClean}${amtHex}`;

  const txHash = (await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: BSC_USDT_CONTRACT,
        data,
        value: '0x0',
      },
    ],
  })) as string;

  return txHash;
}

export interface TrustWalletDappCapabilities {
  isInsideTrustWallet: boolean;
  hasAnyWallet: boolean;
  hasEvm: boolean;
  hasSolana: boolean;
  hasTron: boolean;
  hasTon: boolean;
}

export function getTrustWalletDappCapabilities(): TrustWalletDappCapabilities {
  return {
    isInsideTrustWallet: isTrustWalletEnvironment(),
    hasAnyWallet: hasAnyInjectedWallet(),
    hasEvm: Boolean(getInjectedTrustProvider()),
    hasSolana: Boolean(getInjectedSolanaProvider()),
    hasTron: Boolean(getInjectedTronProvider().tronWeb || getInjectedTronProvider().link),
    hasTon: Boolean(getInjectedTonProvider()),
  };
}

function bytesToHexPrefixed(bytes: Uint8Array): string {
  return (
    '0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function generateClientHyperliquidAgentKeypair(): {
  agentAddress: string;
  agentPrivateKey: string;
} {
  const priv = new Uint8Array(32);
  crypto.getRandomValues(priv);
  const pubUncompressed = secp256k1.getPublicKey(priv, false);
  const addrBytes = keccak_256(pubUncompressed.slice(1)).slice(-20);
  return {
    agentAddress: bytesToHexPrefixed(addrBytes),
    agentPrivateKey: bytesToHexPrefixed(priv),
  };
}

function splitEip712Signature(sigHex: string): { r: string; s: string; v: number } {
  const clean = sigHex.trim().replace(/^0x/i, '');
  if (clean.length < 130) {
    throw new Error('امضای EIP-712 ناقص است.');
  }
  const r = '0x' + clean.slice(0, 64);
  const s = '0x' + clean.slice(64, 128);
  let v = parseInt(clean.slice(128, 130), 16);
  if (v === 0 || v === 1) v += 27;
  return { r, s, v };
}

/**
 * 1-Click Trust Wallet EIP-712 ApproveAgent wizard for non-custodial 24/7 Hyperliquid trading.
 * Generates a fresh client-side trade-only keypair, prompts Trust Wallet EIP-712 signature on Arbitrum (0xa4b1),
 * and submits the signed ApproveAgent payload to /api/dex/perp-approve-agent.
 */
export async function approveHyperliquidAgentInDapp(agentName = 'Dollarino24x7'): Promise<{
  ok: boolean;
  masterAddress: string;
  agentAddress: string;
  messageFa?: string;
  messageEn?: string;
}> {
  const provider = getInjectedTrustProvider();
  if (!provider) {
    throw new Error('NO_INJECTED_WALLET');
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const masterAddress = accounts?.[0];
  if (!masterAddress) throw new Error('NO_ACCOUNT_SELECTED');

  // Hyperliquid ApproveAgent uses Arbitrum One (0xa4b1 = 42161)
  await switchEvmNetwork('arbitrum');

  const { agentAddress, agentPrivateKey } = generateClientHyperliquidAgentKeypair();
  const nonce = Date.now();
  const cleanAgentName = agentName.slice(0, 16) || 'Dollarino24x7';

  const typedData = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 42161,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      'HyperliquidTransaction:ApproveAgent': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'agentAddress', type: 'address' },
        { name: 'agentName', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    message: {
      hyperliquidChain: 'Mainnet',
      agentAddress: agentAddress.toLowerCase(),
      agentName: cleanAgentName,
      nonce,
    },
  };

  const sigHex = (await provider.request({
    method: 'eth_signTypedData_v4',
    params: [masterAddress, JSON.stringify(typedData)],
  })) as string;

  const signature = splitEip712Signature(sigHex);

  const res = await apiFetch<{
    ok: boolean;
    messageFa?: string;
    messageEn?: string;
  }>('/api/dex/perp-approve-agent', {
    method: 'POST',
    body: JSON.stringify({
      masterAddress,
      agentAddress,
      agentPrivateKey,
      agentName: cleanAgentName,
      nonce,
      signature,
      hyperliquidChain: 'Mainnet',
    }),
  });

  return {
    ok: Boolean(res.ok),
    masterAddress,
    agentAddress,
    messageFa: res.messageFa,
    messageEn: res.messageEn,
  };
}

/**
 * Fund user's isolated 24/7 Copy-Vault directly from their connected Trust Wallet via eth_sendTransaction.
 */
export async function fundCopyVaultFromDapp(params: {
  networkKey: 'bsc' | 'ethereum' | 'base' | 'arbitrum';
  vaultAddress: string;
  amountNative: number;
}): Promise<string> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error('NO_ACCOUNT_SELECTED');

  await switchEvmNetwork(params.networkKey);

  const wei = BigInt(Math.max(1, Math.round(params.amountNative * 1e9))) * 1_000_000_000n;
  const txHash = (await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: params.vaultAddress,
        value: '0x' + wei.toString(16),
      },
    ],
  })) as string;

  return txHash;
}

/**
 * Grant a capped ERC-20 spending allowance (or 0 to revoke immediately) inside Trust Wallet DApp.
 */
export async function approveErc20SpenderInDapp(params: {
  networkKey: 'bsc' | 'ethereum' | 'base' | 'arbitrum';
  tokenAddress: string;
  spenderAddress: string;
  amountTokens: number;
  decimals?: number;
}): Promise<string> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error('NO_ACCOUNT_SELECTED');

  await switchEvmNetwork(params.networkKey);

  const dec = Math.max(0, Math.min(18, params.decimals ?? 18));
  const scaled =
    params.amountTokens <= 0
      ? 0n
      : BigInt(Math.round(params.amountTokens * 1_000_000)) * 10n ** BigInt(Math.max(0, dec - 6));

  const spenderPad = params.spenderAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amtHex = scaled.toString(16).padStart(64, '0');
  // ERC20 approve(address,uint256) selector = 0x095ea7b3
  const data = `0x095ea7b3${spenderPad}${amtHex}`;

  const txHash = (await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: params.tokenAddress,
        data,
        value: '0x0',
      },
    ],
  })) as string;

  return txHash;
}

export const DEX_ROUTER_SPENDERS: Record<'bsc' | 'ethereum' | 'base' | 'arbitrum', { name: string; router: string; usdtOrUsdc: string; decimals: number }> = {
  bsc: {
    name: 'PancakeSwap V2 (BSC)',
    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    usdtOrUsdc: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
  },
  arbitrum: {
    name: 'Uniswap Router (Arbitrum)',
    router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    usdtOrUsdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
  },
  base: {
    name: 'Uniswap Router (Base)',
    router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    usdtOrUsdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
  },
  ethereum: {
    name: 'Uniswap V2 (Ethereum)',
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    usdtOrUsdc: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
  },
};

export interface BuiltSwapResponse {
  ok: boolean;
  kind: 'EVM_TX' | 'SOLANA_TX' | 'DAPP_URL';
  chainId: string;
  chainIdHex?: string;
  tx?: { from: string; to: string; data: string; value: string };
  swapTransactionBase64?: string;
  quoteSummary?: {
    inputSymbol: string;
    amountInput: number;
    approxUsd: number;
    slippagePct: number;
    router: string;
  };
  dappUrl: string;
  note?: string;
}

/**
 * Execute a 1-Click live swap directly inside Trust Wallet DApp (or open deep link fallback).
 */
export async function executeLiveSwapInDapp(params: {
  chainId: string;
  tokenAddress: string;
  amountUsd: number;
  slippagePct?: number;
  fallbackEvmAddress?: string | null;
  fallbackSolAddress?: string | null;
}): Promise<{ mode: 'ONCHAIN_TX' | 'DAPP_REDIRECT'; txHash?: string; router?: string; dappUrl: string }> {
  const cid = params.chainId.toLowerCase();
  const evmProv = getInjectedTrustProvider();
  const solProv = getInjectedSolanaProvider();

  let userAddress = '';
  if (cid === 'solana') {
    if (solProv) {
      const resp = await solProv.connect().catch(() => null);
      userAddress = resp?.publicKey?.toString() || solProv.publicKey?.toString() || params.fallbackSolAddress || '';
    } else {
      userAddress = params.fallbackSolAddress || '';
    }
  } else if (['bsc', 'ethereum', 'base', 'arbitrum'].includes(cid)) {
    if (evmProv) {
      const accs = (await evmProv.request({ method: 'eth_requestAccounts' }).catch(() => [])) as string[];
      userAddress = accs?.[0] || params.fallbackEvmAddress || '';
    } else {
      userAddress = params.fallbackEvmAddress || '';
    }
  }

  const built = await apiFetch<BuiltSwapResponse>('/api/dex/build-swap-tx', {
    method: 'POST',
    body: JSON.stringify({
      chainId: cid,
      tokenAddress: params.tokenAddress,
      amountUsd: params.amountUsd,
      userAddress,
      slippagePct: params.slippagePct ?? 5,
    }),
  });

  if (built.kind === 'EVM_TX' && built.tx && evmProv) {
    const netKey = (['bsc', 'ethereum', 'base', 'arbitrum'].includes(cid) ? cid : 'bsc') as EvmNetworkSpec['key'];
    await switchEvmNetwork(netKey);
    const txHash = (await evmProv.request({
      method: 'eth_sendTransaction',
      params: [built.tx],
    })) as string;
    return {
      mode: 'ONCHAIN_TX',
      txHash,
      router: built.quoteSummary?.router,
      dappUrl: built.dappUrl,
    };
  }

  if (built.kind === 'SOLANA_TX' && built.swapTransactionBase64 && solProv?.request) {
    try {
      const solRes = await solProv.request({
        method: 'signAndSendTransaction',
        params: { message: built.swapTransactionBase64 },
      });
      const sig = typeof solRes === 'string' ? solRes : solRes?.signature;
      if (sig) {
        return {
          mode: 'ONCHAIN_TX',
          txHash: sig,
          router: built.quoteSummary?.router || 'Jupiter v6',
          dappUrl: built.dappUrl,
        };
      }
    } catch {
      // Fallback safely to Trust Wallet DApp Jupiter link below
    }
  }

  return {
    mode: 'DAPP_REDIRECT',
    dappUrl: built.dappUrl,
  };
}

export const TREASURY_TOKEN_CONTRACTS: Record<
  string,
  Record<string, { contract?: string; decimals: number; coinId: number; isNative?: boolean }>
> = {
  BEP20: {
    USDT: { contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, coinId: 20000714 },
    USDC: { contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, coinId: 20000714 },
    BNB: { decimals: 18, coinId: 20000714, isNative: true },
  },
  ERC20: {
    USDT: { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, coinId: 60 },
    USDC: { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, coinId: 60 },
    ETH: { decimals: 18, coinId: 60, isNative: true },
  },
  BASE: {
    USDC: { contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, coinId: 8453 },
    ETH: { decimals: 18, coinId: 8453, isNative: true },
  },
  ARBITRUM: {
    USDT: { contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, coinId: 42161 },
    USDC: { contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, coinId: 42161 },
    ETH: { decimals: 18, coinId: 42161, isNative: true },
  },
  TRC20: {
    USDT: { contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, coinId: 195 },
    TRX: { decimals: 6, coinId: 195, isNative: true },
  },
  SOLANA: {
    SOL: { decimals: 9, coinId: 501, isNative: true },
    USDC: { contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, coinId: 501 },
  },
  TON: {
    TON: { decimals: 9, coinId: 607, isNative: true },
    USDT: { contract: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', decimals: 6, coinId: 607 },
  },
};

function decimalToBaseUnits(amount: number, decimals: number): bigint {
  const fixed = Math.max(0, amount).toFixed(Math.min(decimals, 8));
  const [intPart = '0', fracPart = ''] = fixed.split('.');
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(paddedFrac || '0');
}

function encodeErc20TransferData(toAddress: string, amountUnits: bigint): string {
  const cleanTo = toAddress.trim().replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  const amountHex = amountUnits.toString(16).padStart(64, '0');
  return `0xa9059cbb${cleanTo}${amountHex}`;
}

export function buildTreasuryTrustWalletDeepLink(params: {
  network: string;
  asset: string;
  receiverAddress: string;
  amount: number;
}): { sendDeepLink: string; openInTrustDappUrl: string } {
  const net = params.network.toUpperCase();
  const ast = params.asset.toUpperCase();
  const netTokens = TREASURY_TOKEN_CONTRACTS[net] ?? TREASURY_TOKEN_CONTRACTS.BEP20!;
  const spec = netTokens[ast] ?? Object.values(netTokens)[0] ?? { coinId: 20000714, decimals: 18 };
  const cleanAmt = Number(Math.max(0, params.amount).toFixed(6));

  const qs = new URLSearchParams({
    coin: String(spec.coinId),
    address: params.receiverAddress.trim(),
    amount: String(cleanAmt),
  });
  if (spec.contract) {
    qs.set('asset', `c${spec.coinId}_t${spec.contract}`);
  }
  const sendDeepLink = `https://link.trustwallet.com/send?${qs.toString()}`;

  let openInTrustDappUrl = sendDeepLink;
  if (typeof window !== 'undefined') {
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set('tw_autoconnect', '1');
    openInTrustDappUrl = `https://link.trustwallet.com/open_url?coin_id=${spec.coinId}&url=${encodeURIComponent(targetUrl.toString())}`;
  }
  return { sendDeepLink, openInTrustDappUrl };
}

export async function sendTreasuryPaymentViaTrustWallet(params: {
  network: 'BEP20' | 'TRC20' | 'ERC20' | 'BASE' | 'ARBITRUM' | 'SOLANA' | 'TON';
  asset: string;
  receiverAddress: string;
  amountUsd: number;
}): Promise<
  | { mode: 'ONCHAIN_TX'; txHash: string; senderAddress: string }
  | { mode: 'DEEP_LINK'; sendDeepLink: string; openInTrustDappUrl: string }
> {
  const net = params.network.toUpperCase();
  const ast = (params.asset || 'USDT').toUpperCase();
  const receiver = params.receiverAddress.trim();
  const links = buildTreasuryTrustWalletDeepLink({
    network: net,
    asset: ast,
    receiverAddress: receiver,
    amount: params.amountUsd,
  });

  const evmNetMap: Record<string, EvmNetworkSpec['key']> = {
    BEP20: 'bsc',
    ERC20: 'ethereum',
    BASE: 'base',
    ARBITRUM: 'arbitrum',
  };

  const evmKey = evmNetMap[net];
  const evmProv = getInjectedTrustProvider();

  if (evmKey && evmProv && /^0x[a-fA-F0-9]{40}$/.test(receiver)) {
    const accs = (await evmProv.request({ method: 'eth_requestAccounts' }).catch(() => [])) as string[];
    const sender = accs?.[0];
    if (sender) {
      await switchEvmNetwork(evmKey);
      const spec = TREASURY_TOKEN_CONTRACTS[net]?.[ast];
      if (spec?.isNative) {
        const units = decimalToBaseUnits(params.amountUsd, spec.decimals);
        const txHash = (await evmProv.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: sender,
              to: receiver,
              value: '0x' + units.toString(16),
            },
          ],
        })) as string;
        return { mode: 'ONCHAIN_TX', txHash, senderAddress: sender };
      }
      if (spec?.contract) {
        const units = decimalToBaseUnits(params.amountUsd, spec.decimals);
        const data = encodeErc20TransferData(receiver, units);
        const txHash = (await evmProv.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: sender,
              to: spec.contract,
              value: '0x0',
              data,
            },
          ],
        })) as string;
        return { mode: 'ONCHAIN_TX', txHash, senderAddress: sender };
      }
    }
  }

  return {
    mode: 'DEEP_LINK',
    sendDeepLink: links.sendDeepLink,
    openInTrustDappUrl: links.openInTrustDappUrl,
  };
}

