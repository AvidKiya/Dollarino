export interface Eip1193Provider {
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

const BSC_CHAIN_ID_HEX = '0x38'; // 56
const BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

export function getInjectedTrustProvider(): Eip1193Provider | null {
  const win = window as unknown as {
    trustwallet?: { ethereum?: Eip1193Provider } | Eip1193Provider;
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  };
  if (win.trustwallet) {
    if ('ethereum' in win.trustwallet && win.trustwallet.ethereum) return win.trustwallet.ethereum;
    if ('request' in win.trustwallet) return win.trustwallet as Eip1193Provider;
  }
  if (win.ethereum?.providers?.length) {
    const found = win.ethereum.providers.find((p) => p.isTrust || p.isTrustWallet);
    if (found) return found;
  }
  if (win.ethereum) return win.ethereum;
  return null;
}

export function isTrustWalletEnvironment(): boolean {
  const p = getInjectedTrustProvider();
  return Boolean(
    p?.isTrust ||
      p?.isTrustWallet ||
      (typeof navigator !== 'undefined' && /Trust/i.test(navigator.userAgent))
  );
}

export function buildTrustWalletDappOpenUrl(targetUrl: string, coinId = 20000714): string {
  return `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;
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
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BSC_CHAIN_ID_HEX }],
    });
  } catch {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: BSC_CHAIN_ID_HEX,
          chainName: 'BNB Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        },
      ],
    });
  }

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
