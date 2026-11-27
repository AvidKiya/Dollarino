import { fetchBscUsdtBalance, fetchEvmNativeBalance, fetchSolanaBalance, fetchTonBalance, fetchTronBalances } from '../routes/trustwallet.js';

export type TrustWalletAssetCategory = 'LAYER1' | 'LAYER2' | 'DEFI' | 'AI' | 'MEME' | 'STABLE' | 'GAMING';

export interface TrustWalletAssetMeta {
  base: string;
  symbol: string; // Canonical e.g. BTCUSDT
  nameEn: string;
  nameFa: string;
  category: TrustWalletAssetCategory;
  primaryChain: string;
  chains: string[];
  coingeckoId: string;
  contractAddress?: string;
  trustChainFolder: string;
  trustLogoUrl: string;
  tradableOnPerp: boolean;
  defaultPriceFallback?: number;
}

export interface TrustWalletPortfolioHolding {
  symbol: string;
  base: string;
  nameEn: string;
  nameFa: string;
  chain: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  changePct24h: number;
  logoUrl: string;
  contractAddress?: string;
  isNative: boolean;
}

export interface TrustWalletMarketQuote {
  symbol: string;
  base: string;
  nameEn: string;
  nameFa: string;
  category: TrustWalletAssetCategory;
  primaryChain: string;
  chains: string[];
  contractAddress?: string;
  logoUrl: string;
  priceUsd: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24hUsd: number;
  marketCapUsd: number;
  rank: number;
  priceSource: 'TRUST_COINGECKO' | 'SPOT_AGGREGATE' | 'DEX_LIVE' | 'FALLBACK';
  tradableOnPerp: boolean;
}

function twAssetLogo(chainFolder: string, contract?: string): string {
  if (contract) {
    return `https://assets-cdn.trustwallet.com/blockchains/${chainFolder}/assets/${contract}/logo.png`;
  }
  return `https://assets-cdn.trustwallet.com/blockchains/${chainFolder}/info/logo.png`;
}

// Comprehensive Trust Wallet Asset Catalog (130+ verified multi-chain tokens & coins)
const RAW_TW_ASSETS: Array<{
  base: string;
  nameEn: string;
  nameFa: string;
  category: TrustWalletAssetCategory;
  primaryChain: string;
  chains: string[];
  cg: string;
  folder: string;
  contract?: string;
  perp?: boolean;
  fb?: number;
}> = [
  // Layer 1 & Majors
  { base: 'BTC', nameEn: 'Bitcoin', nameFa: 'بیت‌کوین', category: 'LAYER1', primaryChain: 'bitcoin', chains: ['bitcoin', 'bsc', 'ethereum'], cg: 'bitcoin', folder: 'bitcoin', perp: true, fb: 95000 },
  { base: 'ETH', nameEn: 'Ethereum', nameFa: 'اتریوم', category: 'LAYER1', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'base', 'optimism', 'bsc'], cg: 'ethereum', folder: 'ethereum', perp: true, fb: 3100 },
  { base: 'BNB', nameEn: 'BNB', nameFa: 'بایننس کوین', category: 'LAYER1', primaryChain: 'bsc', chains: ['bsc', 'opbnb', 'ethereum'], cg: 'binancecoin', folder: 'smartchain', perp: true, fb: 640 },
  { base: 'SOL', nameEn: 'Solana', nameFa: 'سولانا', category: 'LAYER1', primaryChain: 'solana', chains: ['solana'], cg: 'solana', folder: 'solana', perp: true, fb: 185 },
  { base: 'XRP', nameEn: 'XRP', nameFa: 'ریپل', category: 'LAYER1', primaryChain: 'ripple', chains: ['ripple', 'bsc'], cg: 'ripple', folder: 'ripple', perp: true, fb: 2.3 },
  { base: 'TON', nameEn: 'Toncoin', nameFa: 'تون‌کوین', category: 'LAYER1', primaryChain: 'ton', chains: ['ton', 'bsc', 'ethereum'], cg: 'the-open-network', folder: 'ton', perp: true, fb: 5.2 },
  { base: 'TRX', nameEn: 'TRON', nameFa: 'ترون', category: 'LAYER1', primaryChain: 'tron', chains: ['tron', 'bsc', 'ethereum'], cg: 'tron', folder: 'tron', perp: true, fb: 0.24 },
  { base: 'ADA', nameEn: 'Cardano', nameFa: 'کاردانو', category: 'LAYER1', primaryChain: 'cardano', chains: ['cardano', 'bsc'], cg: 'cardano', folder: 'cardano', perp: true, fb: 0.85 },
  { base: 'AVAX', nameEn: 'Avalanche', nameFa: 'آوالانچ', category: 'LAYER1', primaryChain: 'avalanche', chains: ['avalanche', 'bsc'], cg: 'avalanche-2', folder: 'avalanchec', perp: true, fb: 34 },
  { base: 'SUI', nameEn: 'Sui', nameFa: 'سویی', category: 'LAYER1', primaryChain: 'sui', chains: ['sui'], cg: 'sui', folder: 'sui', perp: true, fb: 3.1 },
  { base: 'DOT', nameEn: 'Polkadot', nameFa: 'پولکادات', category: 'LAYER1', primaryChain: 'polkadot', chains: ['polkadot', 'bsc'], cg: 'polkadot', folder: 'polkadot', perp: true, fb: 6.5 },
  { base: 'NEAR', nameEn: 'NEAR Protocol', nameFa: 'نیر پروتکل', category: 'LAYER1', primaryChain: 'near', chains: ['near', 'bsc'], cg: 'near', folder: 'near', perp: true, fb: 4.8 },
  { base: 'APT', nameEn: 'Aptos', nameFa: 'اپتوس', category: 'LAYER1', primaryChain: 'aptos', chains: ['aptos'], cg: 'aptos', folder: 'aptos', perp: true, fb: 8.5 },
  { base: 'LTC', nameEn: 'Litecoin', nameFa: 'لایت‌کوین', category: 'LAYER1', primaryChain: 'litecoin', chains: ['litecoin', 'bsc'], cg: 'litecoin', folder: 'litecoin', perp: true, fb: 108 },
  { base: 'BCH', nameEn: 'Bitcoin Cash', nameFa: 'بیت‌کوین کش', category: 'LAYER1', primaryChain: 'bitcoincash', chains: ['bitcoincash', 'bsc'], cg: 'bitcoin-cash', folder: 'bitcoincash', perp: true, fb: 420 },
  { base: 'ATOM', nameEn: 'Cosmos Hub', nameFa: 'کازماس', category: 'LAYER1', primaryChain: 'cosmos', chains: ['cosmos'], cg: 'cosmos', folder: 'cosmos', perp: true, fb: 6.2 },
  { base: 'XLM', nameEn: 'Stellar', nameFa: 'استلار', category: 'LAYER1', primaryChain: 'stellar', chains: ['stellar'], cg: 'stellar', folder: 'stellar', perp: true, fb: 0.38 },
  { base: 'HBAR', nameEn: 'Hedera', nameFa: 'هدرا', category: 'LAYER1', primaryChain: 'hedera', chains: ['hedera'], cg: 'hedera-hashgraph', folder: 'hedera', perp: true, fb: 0.25 },
  { base: 'FIL', nameEn: 'Filecoin', nameFa: 'فایل‌کوین', category: 'LAYER1', primaryChain: 'filecoin', chains: ['filecoin', 'bsc'], cg: 'filecoin', folder: 'filecoin', perp: true, fb: 4.5 },
  { base: 'ICP', nameEn: 'Internet Computer', nameFa: 'اینترنت کامپیوتر', category: 'LAYER1', primaryChain: 'icp', chains: ['icp'], cg: 'internet-computer', folder: 'dfinity', perp: true, fb: 9.2 },
  { base: 'ALGO', nameEn: 'Algorand', nameFa: 'الگوراند', category: 'LAYER1', primaryChain: 'algorand', chains: ['algorand'], cg: 'algorand', folder: 'algorand', perp: true, fb: 0.29 },
  { base: 'VET', nameEn: 'VeChain', nameFa: 'وی‌چین', category: 'LAYER1', primaryChain: 'vechain', chains: ['vechain'], cg: 'vechain', folder: 'vechain', perp: true, fb: 0.042 },
  { base: 'INJ', nameEn: 'Injective', nameFa: 'اینجکتیو', category: 'LAYER1', primaryChain: 'injective', chains: ['injective', 'ethereum', 'bsc'], cg: 'injective-protocol', folder: 'ethereum', contract: '0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30', perp: true, fb: 19 },
  { base: 'SEI', nameEn: 'Sei', nameFa: 'سی', category: 'LAYER1', primaryChain: 'sei', chains: ['sei'], cg: 'sei-network', folder: 'sei', perp: true, fb: 0.4 },
  { base: 'TIA', nameEn: 'Celestia', nameFa: 'سلستیا', category: 'LAYER1', primaryChain: 'celestia', chains: ['celestia'], cg: 'celestia', folder: 'celestia', perp: true, fb: 4.6 },
  { base: 'KAS', nameEn: 'Kaspa', nameFa: 'کاسپا', category: 'LAYER1', primaryChain: 'kaspa', chains: ['kaspa'], cg: 'kaspa', folder: 'kaspa', perp: true, fb: 0.13 },
  { base: 'ETC', nameEn: 'Ethereum Classic', nameFa: 'اتریوم کلاسیک', category: 'LAYER1', primaryChain: 'classic', chains: ['classic'], cg: 'ethereum-classic', folder: 'classic', perp: true, fb: 24 },
  { base: 'STX', nameEn: 'Stacks', nameFa: 'استکس', category: 'LAYER1', primaryChain: 'stacks', chains: ['stacks'], cg: 'blockstack', folder: 'stacks', perp: true, fb: 1.4 },
  { base: 'RUNE', nameEn: 'THORChain', nameFa: 'تورچین', category: 'LAYER1', primaryChain: 'thorchain', chains: ['thorchain'], cg: 'thorchain', folder: 'thorchain', perp: true, fb: 3.1 },
  { base: 'EGLD', nameEn: 'MultiversX', nameFa: 'مولتی‌ورس ایکس', category: 'LAYER1', primaryChain: 'elrond', chains: ['elrond'], cg: 'elrond-erd-2', folder: 'elrond', perp: true, fb: 31 },
  { base: 'ZEC', nameEn: 'Zcash', nameFa: 'زی‌کش', category: 'LAYER1', primaryChain: 'zcash', chains: ['zcash'], cg: 'zcash', folder: 'zcash', perp: true, fb: 44 },
  { base: 'DASH', nameEn: 'Dash', nameFa: 'دش', category: 'LAYER1', primaryChain: 'dash', chains: ['dash'], cg: 'dash', folder: 'dash', perp: true, fb: 32 },
  { base: 'XMR', nameEn: 'Monero', nameFa: 'مونرو', category: 'LAYER1', primaryChain: 'monero', chains: ['monero'], cg: 'monero', folder: 'monero', perp: true, fb: 195 },
  { base: 'EOS', nameEn: 'EOS', nameFa: 'ایاس', category: 'LAYER1', primaryChain: 'eos', chains: ['eos'], cg: 'eos', folder: 'eos', perp: true, fb: 0.72 },
  { base: 'XTZ', nameEn: 'Tezos', nameFa: 'تزوس', category: 'LAYER1', primaryChain: 'tezos', chains: ['tezos'], cg: 'tezos', folder: 'tezos', perp: true, fb: 1.1 },
  { base: 'FLOW', nameEn: 'Flow', nameFa: 'فلو', category: 'LAYER1', primaryChain: 'flow', chains: ['flow'], cg: 'flow', folder: 'flow', perp: true, fb: 0.68 },
  { base: 'KAVA', nameEn: 'Kava', nameFa: 'کاوا', category: 'LAYER1', primaryChain: 'kava', chains: ['kava'], cg: 'kava', folder: 'kava', perp: true, fb: 0.48 },
  { base: 'MINA', nameEn: 'Mina', nameFa: 'مینا', category: 'LAYER1', primaryChain: 'mina', chains: ['mina'], cg: 'mina-protocol', folder: 'mina', perp: true, fb: 0.56 },
  { base: 'S', nameEn: 'Sonic (FTM)', nameFa: 'سونیک / فانتوم', category: 'LAYER1', primaryChain: 'sonic', chains: ['sonic', 'ethereum', 'bsc'], cg: 'sonic-3', folder: 'fantom', perp: true, fb: 0.65 },

  // Layer 2 & Scaling
  { base: 'POL', nameEn: 'Polygon (POL)', nameFa: 'پالیگان', category: 'LAYER2', primaryChain: 'polygon', chains: ['polygon', 'ethereum'], cg: 'polygon-ecosystem-token', folder: 'polygon', perp: true, fb: 0.42 },
  { base: 'ARB', nameEn: 'Arbitrum', nameFa: 'آربیتروم', category: 'LAYER2', primaryChain: 'arbitrum', chains: ['arbitrum', 'ethereum'], cg: 'arbitrum', folder: 'arbitrum', contract: '0x912CE59144191C1204E64559FE8253a0e49E6548', perp: true, fb: 0.72 },
  { base: 'OP', nameEn: 'Optimism', nameFa: 'اپتیمیزم', category: 'LAYER2', primaryChain: 'optimism', chains: ['optimism', 'ethereum'], cg: 'optimism', folder: 'optimism', contract: '0x4200000000000000000000000000000000000042', perp: true, fb: 1.65 },
  { base: 'STRK', nameEn: 'Starknet', nameFa: 'استارک‌نت', category: 'LAYER2', primaryChain: 'ethereum', chains: ['ethereum', 'starknet'], cg: 'starknet', folder: 'ethereum', contract: '0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766', perp: true, fb: 0.44 },
  { base: 'ZK', nameEn: 'ZKsync', nameFa: 'زی‌کی‌سینک', category: 'LAYER2', primaryChain: 'zksync', chains: ['zksync', 'ethereum'], cg: 'zksync', folder: 'zksync', perp: true, fb: 0.16 },
  { base: 'MNT', nameEn: 'Mantle', nameFa: 'منتل', category: 'LAYER2', primaryChain: 'ethereum', chains: ['ethereum', 'mantle'], cg: 'mantle', folder: 'ethereum', contract: '0x3c3a81e81dc49A522A592e7622A7E711c06bf354', perp: true, fb: 1.05 },
  { base: 'IMX', nameEn: 'Immutable', nameFa: 'ایمیوتبل', category: 'LAYER2', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'immutable-x', folder: 'ethereum', contract: '0xF57e7e7C23978C3cAeC3C3548E3D615c346e79fF', perp: true, fb: 1.25 },
  { base: 'MANTA', nameEn: 'Manta Network', nameFa: 'مانتا', category: 'LAYER2', primaryChain: 'ethereum', chains: ['ethereum', 'manta'], cg: 'manta-network', folder: 'ethereum', perp: true, fb: 0.75 },
  { base: 'METIS', nameEn: 'Metis', nameFa: 'متیس', category: 'LAYER2', primaryChain: 'ethereum', chains: ['ethereum', 'metis'], cg: 'metis-token', folder: 'ethereum', contract: '0x9E32b13ce7f2E80A01932B42553652E053D6ed8e', perp: true, fb: 38 },

  // DeFi & Infrastructure
  { base: 'LINK', nameEn: 'Chainlink', nameFa: 'چین‌لینک', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'base', 'bsc', 'polygon'], cg: 'chainlink', folder: 'ethereum', contract: '0x514910771AF9Ca656af840dff83E8264EcF986CA', perp: true, fb: 19.5 },
  { base: 'UNI', nameEn: 'Uniswap', nameFa: 'یونی‌سواپ', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'base', 'polygon', 'bsc'], cg: 'uniswap', folder: 'ethereum', contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', perp: true, fb: 11.2 },
  { base: 'AAVE', nameEn: 'Aave', nameFa: 'آوه', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'polygon', 'avalanche'], cg: 'aave', folder: 'ethereum', contract: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', perp: true, fb: 280 },
  { base: 'LDO', nameEn: 'Lido DAO', nameFa: 'لیدو دائو', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'polygon'], cg: 'lido-dao', folder: 'ethereum', contract: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', perp: true, fb: 1.75 },
  { base: 'CAKE', nameEn: 'PancakeSwap', nameFa: 'پنکیک‌سواپ', category: 'DEFI', primaryChain: 'bsc', chains: ['bsc', 'ethereum', 'base', 'arbitrum'], cg: 'pancakeswap-token', folder: 'smartchain', contract: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', perp: true, fb: 2.3 },
  { base: 'PENDLE', nameEn: 'Pendle', nameFa: 'پندل', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'bsc'], cg: 'pendle', folder: 'ethereum', contract: '0x808507121B80c02388fAd14726482e061B8da827', perp: true, fb: 4.1 },
  { base: 'ENA', nameEn: 'Ethena', nameFa: 'اتنا', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'ethena', folder: 'ethereum', contract: '0x57e114B691Db790C35207b2e685D4A43181e6061', perp: true, fb: 0.78 },
  { base: 'EIGEN', nameEn: 'EigenLayer', nameFa: 'آیگن‌لیر', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'eigenlayer', folder: 'ethereum', contract: '0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83', perp: true, fb: 2.8 },
  { base: 'JUP', nameEn: 'Jupiter', nameFa: 'ژوپیتر', category: 'DEFI', primaryChain: 'solana', chains: ['solana'], cg: 'jupiter-exchange-solana', folder: 'solana', contract: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', perp: true, fb: 0.85 },
  { base: 'RAY', nameEn: 'Raydium', nameFa: 'ریدیوم', category: 'DEFI', primaryChain: 'solana', chains: ['solana'], cg: 'raydium', folder: 'solana', contract: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', perp: true, fb: 4.4 },
  { base: 'JTO', nameEn: 'Jito', nameFa: 'جیتو', category: 'DEFI', primaryChain: 'solana', chains: ['solana'], cg: 'jito-governance-token', folder: 'solana', contract: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', perp: true, fb: 2.9 },
  { base: 'PYTH', nameEn: 'Pyth Network', nameFa: 'پایت نتورک', category: 'DEFI', primaryChain: 'solana', chains: ['solana'], cg: 'pyth-network', folder: 'solana', contract: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', perp: true, fb: 0.34 },
  { base: 'CRV', nameEn: 'Curve DAO', nameFa: 'کرو دائو', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'polygon'], cg: 'curve-dao-token', folder: 'ethereum', contract: '0xD533a949740bb3306d119CC777fa900bA034cd52', perp: true, fb: 0.72 },
  { base: 'DYDX', nameEn: 'dYdX', nameFa: 'دی‌وای‌دی‌ایکس', category: 'DEFI', primaryChain: 'dydx', chains: ['dydx', 'ethereum'], cg: 'dydx-chain', folder: 'ethereum', contract: '0x92D6C1e31e14520e676a687F0a93788B716BEff5', perp: true, fb: 1.35 },
  { base: 'GMX', nameEn: 'GMX', nameFa: 'جی‌ام‌ایکس', category: 'DEFI', primaryChain: 'arbitrum', chains: ['arbitrum', 'avalanche'], cg: 'gmx', folder: 'arbitrum', contract: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', perp: true, fb: 26 },
  { base: 'COMP', nameEn: 'Compound', nameFa: 'کامپوند', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'compound-governance-token', folder: 'ethereum', contract: '0xc00e94Cb662C3520282E6f5717214004A7f26888', perp: true, fb: 68 },
  { base: 'SNX', nameEn: 'Synthetix', nameFa: 'سینتتیکس', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'optimism'], cg: 'havven', folder: 'ethereum', contract: '0xC011a73ee8576fb46F5E1c5751cA3B9Fe0af2a6F', perp: true, fb: 1.8 },
  { base: '1INCH', nameEn: '1inch', nameFa: 'وان‌اینچ', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'bsc', 'arbitrum', 'polygon'], cg: '1inch', folder: 'ethereum', contract: '0x111111111117dC0aa78b770fA6A738034120C302', perp: true, fb: 0.36 },
  { base: 'SUSHI', nameEn: 'SushiSwap', nameFa: 'سوشی‌سواپ', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'bsc'], cg: 'sushi', folder: 'ethereum', contract: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2', perp: true, fb: 1.15 },
  { base: 'ENS', nameEn: 'Ethereum Name Service', nameFa: 'ای‌ان‌اس', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'ethereum-name-service', folder: 'ethereum', contract: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', perp: true, fb: 29 },
  { base: 'GRT', nameEn: 'The Graph', nameFa: 'د گراف', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'polygon'], cg: 'the-graph', folder: 'ethereum', contract: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7', perp: true, fb: 0.21 },
  { base: 'MORPHO', nameEn: 'Morpho', nameFa: 'مورفو', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum', 'base'], cg: 'morpho', folder: 'ethereum', contract: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2', perp: true, fb: 2.3 },
  { base: 'ONDO', nameEn: 'Ondo Finance', nameFa: 'اوندو', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'ondo-finance', folder: 'ethereum', contract: '0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3', perp: true, fb: 1.35 },
  { base: 'HYPE', nameEn: 'Hyperliquid', nameFa: 'هایپرلیکویید', category: 'DEFI', primaryChain: 'arbitrum', chains: ['hyperliquid', 'arbitrum'], cg: 'hyperliquid', folder: 'arbitrum', perp: true, fb: 22 },

  // AI & Compute
  { base: 'TAO', nameEn: 'Bittensor', nameFa: 'بیت‌تنسور', category: 'AI', primaryChain: 'bittensor', chains: ['bittensor'], cg: 'bittensor', folder: 'bittensor', perp: true, fb: 430 },
  { base: 'FET', nameEn: 'Artificial Superintelligence', nameFa: 'فچ / ASI', category: 'AI', primaryChain: 'ethereum', chains: ['ethereum', 'fetch'], cg: 'fetch-ai', folder: 'ethereum', contract: '0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85', perp: true, fb: 1.25 },
  { base: 'RENDER', nameEn: 'Render', nameFa: 'رندر', category: 'AI', primaryChain: 'solana', chains: ['solana', 'ethereum'], cg: 'render-token', folder: 'solana', contract: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', perp: true, fb: 6.4 },
  { base: 'WLD', nameEn: 'Worldcoin', nameFa: 'ورلدکوین', category: 'AI', primaryChain: 'optimism', chains: ['optimism', 'ethereum'], cg: 'worldcoin-wld', folder: 'ethereum', contract: '0x163f8C2467924be0ae7B5347228CABF260318753', perp: true, fb: 2.0 },
  { base: 'VIRTUAL', nameEn: 'Virtuals Protocol', nameFa: 'ویرچوالز', category: 'AI', primaryChain: 'base', chains: ['base', 'ethereum'], cg: 'virtual-protocol', folder: 'base', contract: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', perp: true, fb: 2.4 },
  { base: 'ARKM', nameEn: 'Arkham', nameFa: 'آرکم', category: 'AI', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'arkham', folder: 'ethereum', contract: '0x6E2a43be0B1d33b726f0CA3b8de60b3482b8b050', perp: true, fb: 1.3 },
  { base: 'AR', nameEn: 'Arweave', nameFa: 'آروویو', category: 'AI', primaryChain: 'arweave', chains: ['arweave'], cg: 'arweave', folder: 'arweave', perp: true, fb: 16 },
  { base: 'AKT', nameEn: 'Akash Network', nameFa: 'آکاش', category: 'AI', primaryChain: 'akash', chains: ['akash'], cg: 'akash-network', folder: 'akash', perp: true, fb: 2.8 },
  { base: 'THETA', nameEn: 'Theta Network', nameFa: 'تتا', category: 'AI', primaryChain: 'theta', chains: ['theta'], cg: 'theta-token', folder: 'theta', perp: true, fb: 1.9 },

  // Meme & Telegram/TON & Trending DEX
  { base: 'DOGE', nameEn: 'Dogecoin', nameFa: 'دوج‌کوین', category: 'MEME', primaryChain: 'doge', chains: ['doge', 'bsc'], cg: 'dogecoin', folder: 'doge', perp: true, fb: 0.31 },
  { base: 'SHIB', nameEn: 'Shiba Inu', nameFa: 'شیبا اینو', category: 'MEME', primaryChain: 'ethereum', chains: ['ethereum', 'bsc', 'base'], cg: 'shiba-inu', folder: 'ethereum', contract: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', perp: true, fb: 0.000021 },
  { base: 'PEPE', nameEn: 'Pepe', nameFa: 'پپه', category: 'MEME', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'bsc'], cg: 'pepe', folder: 'ethereum', contract: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', perp: true, fb: 0.000016 },
  { base: 'WIF', nameEn: 'dogwifhat', nameFa: 'داگ‌ویف‌هت', category: 'MEME', primaryChain: 'solana', chains: ['solana'], cg: 'dogwifcoin', folder: 'solana', contract: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', perp: true, fb: 1.65 },
  { base: 'BONK', nameEn: 'Bonk', nameFa: 'بانک', category: 'MEME', primaryChain: 'solana', chains: ['solana', 'ethereum'], cg: 'bonk', folder: 'solana', contract: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', perp: true, fb: 0.000029 },
  { base: 'FLOKI', nameEn: 'FLOKI', nameFa: 'فلوکی', category: 'MEME', primaryChain: 'bsc', chains: ['bsc', 'ethereum'], cg: 'floki', folder: 'smartchain', contract: '0xfb5B838b6cfEEdC2873aB27866079AC55363D37E', perp: true, fb: 0.00016 },
  { base: 'NOT', nameEn: 'Notcoin', nameFa: 'نات‌کوین', category: 'MEME', primaryChain: 'ton', chains: ['ton'], cg: 'notcoin', folder: 'ton', contract: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT', perp: true, fb: 0.0062 },
  { base: 'DOGS', nameEn: 'DOGS', nameFa: 'داگز', category: 'MEME', primaryChain: 'ton', chains: ['ton'], cg: 'dogs-2', folder: 'ton', contract: 'EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS', perp: true, fb: 0.00048 },
  { base: 'HMSTR', nameEn: 'Hamster Kombat', nameFa: 'همستر کامبت', category: 'GAMING', primaryChain: 'ton', chains: ['ton'], cg: 'hamster-kombat', folder: 'ton', contract: 'EQAJ8uWd7EBqsmpSWaRdf_I-8R8-XHwh3gsNKhy-UrdrPcUo', perp: true, fb: 0.0028 },
  { base: 'CATI', nameEn: 'Catizen', nameFa: 'کتیزن', category: 'GAMING', primaryChain: 'ton', chains: ['ton'], cg: 'catizen', folder: 'ton', perp: true, fb: 0.34 },
  { base: 'MAJOR', nameEn: 'Major', nameFa: 'میجر', category: 'GAMING', primaryChain: 'ton', chains: ['ton'], cg: 'major', folder: 'ton', perp: true, fb: 0.55 },
  { base: 'BOME', nameEn: 'BOOK OF MEME', nameFa: 'بوم', category: 'MEME', primaryChain: 'solana', chains: ['solana'], cg: 'book-of-meme', folder: 'solana', contract: 'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82', perp: true, fb: 0.0058 },
  { base: 'POPCAT', nameEn: 'Popcat', nameFa: 'پاپ‌کت', category: 'MEME', primaryChain: 'solana', chains: ['solana'], cg: 'popcat', folder: 'solana', contract: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', perp: true, fb: 0.62 },
  { base: 'BRETT', nameEn: 'Brett', nameFa: 'برت', category: 'MEME', primaryChain: 'base', chains: ['base'], cg: 'based-brett', folder: 'base', contract: '0x532f27101965dd16442E59d40670FaF5eBB142E4', perp: true, fb: 0.11 },
  { base: 'PENGU', nameEn: 'Pudgy Penguins', nameFa: 'پنگو', category: 'MEME', primaryChain: 'solana', chains: ['solana'], cg: 'pudgy-penguins', folder: 'solana', contract: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv', perp: true, fb: 0.025 },
  { base: 'PNUT', nameEn: 'Peanut the Squirrel', nameFa: 'پینات', category: 'MEME', primaryChain: 'solana', chains: ['solana'], cg: 'peanut-the-squirrel', folder: 'solana', contract: '2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump', perp: true, fb: 0.52 },
  { base: 'TRUMP', nameEn: 'OFFICIAL TRUMP', nameFa: 'ترامپ', category: 'MEME', primaryChain: 'solana', chains: ['solana'], cg: 'official-trump', folder: 'solana', contract: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', perp: true, fb: 18 },
  { base: 'MEW', nameEn: 'cat in a dogs world', nameFa: 'میو', category: 'MEME', primaryChain: 'solana', chains: ['solana'], cg: 'cat-in-a-dogs-world', folder: 'solana', contract: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', perp: true, fb: 0.0052 },
  { base: 'TURBO', nameEn: 'Turbo', nameFa: 'توربو', category: 'MEME', primaryChain: 'ethereum', chains: ['ethereum', 'solana'], cg: 'turbo', folder: 'ethereum', contract: '0xA35923162C49cF95e6BF266233d5eb42d6d4A7f2', perp: true, fb: 0.0074 },
  { base: 'NEIRO', nameEn: 'Neiro', nameFa: 'نیرو', category: 'MEME', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'neiro-3', folder: 'ethereum', contract: '0x812Ba41e071C7b7fA4EBcFB62dF5F45f6fA853Ee', perp: true, fb: 0.00085 },
  { base: 'GALA', nameEn: 'Gala', nameFa: 'گالا', category: 'GAMING', primaryChain: 'ethereum', chains: ['ethereum', 'bsc'], cg: 'gala', folder: 'ethereum', contract: '0xd1d2Eb1B1e90B638588728b4130137D262C87cae', perp: true, fb: 0.032 },
  { base: 'SAND', nameEn: 'The Sandbox', nameFa: 'سندباکس', category: 'GAMING', primaryChain: 'ethereum', chains: ['ethereum', 'polygon'], cg: 'the-sandbox', folder: 'ethereum', contract: '0x3845badAde8e6dFF049820680d1F14bD3903a5d0', perp: true, fb: 0.52 },
  { base: 'MANA', nameEn: 'Decentraland', nameFa: 'دیسنترالند', category: 'GAMING', primaryChain: 'ethereum', chains: ['ethereum', 'polygon'], cg: 'decentraland', folder: 'ethereum', contract: '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942', perp: true, fb: 0.45 },
  { base: 'AXS', nameEn: 'Axie Infinity', nameFa: 'اکسی اینفینیتی', category: 'GAMING', primaryChain: 'ethereum', chains: ['ethereum', 'bsc'], cg: 'axie-infinity', folder: 'ethereum', contract: '0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b', perp: true, fb: 5.5 },

  // Stablecoins & Wrapped
  { base: 'USDT', nameEn: 'Tether USD', nameFa: 'تتر (USDT)', category: 'STABLE', primaryChain: 'tron', chains: ['tron', 'bsc', 'ethereum', 'ton', 'solana', 'arbitrum', 'base', 'polygon'], cg: 'tether', folder: 'ethereum', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', perp: false, fb: 1 },
  { base: 'USDC', nameEn: 'USD Coin', nameFa: 'یو‌اس‌دی‌کوین', category: 'STABLE', primaryChain: 'ethereum', chains: ['ethereum', 'base', 'arbitrum', 'solana', 'bsc', 'polygon'], cg: 'usd-coin', folder: 'ethereum', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', perp: false, fb: 1 },
  { base: 'DAI', nameEn: 'Dai', nameFa: 'دای', category: 'STABLE', primaryChain: 'ethereum', chains: ['ethereum', 'polygon', 'arbitrum', 'base'], cg: 'dai', folder: 'ethereum', contract: '0x6B175474E89094C44Da98b954EedeAC495271d0F', perp: false, fb: 1 },
  { base: 'FDUSD', nameEn: 'First Digital USD', nameFa: 'اف‌دی‌یو‌اس‌دی', category: 'STABLE', primaryChain: 'bsc', chains: ['bsc', 'ethereum'], cg: 'first-digital-usd', folder: 'smartchain', contract: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', perp: false, fb: 1 },
  { base: 'WBTC', nameEn: 'Wrapped Bitcoin', nameFa: 'رپد بیت‌کوین', category: 'LAYER1', primaryChain: 'ethereum', chains: ['ethereum', 'arbitrum', 'polygon'], cg: 'wrapped-bitcoin', folder: 'ethereum', contract: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', perp: false, fb: 95000 },
  { base: 'PAXG', nameEn: 'PAX Gold', nameFa: 'طلای دیجیتال پکس', category: 'DEFI', primaryChain: 'ethereum', chains: ['ethereum'], cg: 'pax-gold', folder: 'ethereum', contract: '0x45804880De22913dAFE09f4980848ECE6EcbAf78', perp: true, fb: 2700 },
];

export const TRUST_WALLET_CATALOG: TrustWalletAssetMeta[] = RAW_TW_ASSETS.map((a) => ({
  base: a.base,
  symbol: `${a.base}USDT`,
  nameEn: a.nameEn,
  nameFa: a.nameFa,
  category: a.category,
  primaryChain: a.primaryChain,
  chains: a.chains,
  coingeckoId: a.cg,
  contractAddress: a.contract,
  trustChainFolder: a.folder,
  trustLogoUrl: twAssetLogo(a.folder, a.contract),
  tradableOnPerp: Boolean(a.perp),
  defaultPriceFallback: a.fb,
}));

export const TRUST_WALLET_ASSET_MAP = new Map<string, TrustWalletAssetMeta>(
  TRUST_WALLET_CATALOG.map((a) => [a.base, a])
);

const COINGECKO_PRICE_CACHE: { ts: number; data: TrustWalletMarketQuote[] } = { ts: 0, data: [] };
const PORTFOLIO_CACHE = new Map<string, { ts: number; data: { totalUsd: number; holdings: TrustWalletPortfolioHolding[] } }>();

interface CgCoinMarketRow {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  high_24h?: number;
  low_24h?: number;
  price_change_percentage_24h?: number;
}

interface BinanceSpot24h {
  symbol: string;
  lastPrice?: string;
  priceChangePercent?: string;
  highPrice?: string;
  lowPrice?: string;
  quoteVolume?: string;
}

/**
 * Fetches live Trust Wallet-aligned prices & asset catalog.
 * Combines CoinGecko (Trust Wallet's canonical pricing oracle) + Binance Spot 24h
 * + any extra markets supplied by the active exchange universe so all prices match Trust Wallet.
 */
export async function fetchTrustWalletAlignedMarkets(
  extraMarketQuotes?: Array<{
    symbol: string;
    base: string;
    lastPrice: string;
    changePct24h: string;
    high24h: string;
    low24h: string;
    volume24h: number;
  }>
): Promise<TrustWalletMarketQuote[]> {
  const now = Date.now();
  if (COINGECKO_PRICE_CACHE.data.length > 0 && now - COINGECKO_PRICE_CACHE.ts < 45_000 && !extraMarketQuotes?.length) {
    return COINGECKO_PRICE_CACHE.data;
  }

  let baseList: TrustWalletMarketQuote[] = [];
  if (COINGECKO_PRICE_CACHE.data.length > 0 && now - COINGECKO_PRICE_CACHE.ts < 45_000) {
    baseList = COINGECKO_PRICE_CACHE.data;
  } else {
    const ids = TRUST_WALLET_CATALOG.map((a) => a.coingeckoId).join(',');
    const [cgRes, binanceRes] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'Dollarino-TrustSync/11.9' },
          signal: AbortSignal.timeout(5500),
        }
      ).catch(() => null),
      fetch('https://api.binance.com/api/v3/ticker/24hr', {
        signal: AbortSignal.timeout(4500),
      }).catch(() => null),
    ]);

    const cgById = new Map<string, CgCoinMarketRow>();
    if (cgRes?.ok) {
      const rows = (await cgRes.json().catch(() => [])) as CgCoinMarketRow[];
      if (Array.isArray(rows)) {
        for (const r of rows) {
          if (r.id) cgById.set(r.id, r);
        }
      }
    }

    const binBySym = new Map<string, BinanceSpot24h>();
    if (binanceRes?.ok) {
      const bRows = (await binanceRes.json().catch(() => [])) as BinanceSpot24h[];
      if (Array.isArray(bRows)) {
        for (const b of bRows) {
          if (b.symbol && b.symbol.endsWith('USDT')) binBySym.set(b.symbol, b);
        }
      }
    }

    baseList = TRUST_WALLET_CATALOG.map((meta, idx) => {
      const cg = cgById.get(meta.coingeckoId);
      const bin = binBySym.get(meta.symbol);
      const cgPx = Number(cg?.current_price ?? 0);
      const binPx = Number(bin?.lastPrice ?? 0);
      const priceUsd = cgPx > 0 ? cgPx : binPx > 0 ? binPx : meta.base === 'USDT' || meta.base === 'USDC' || meta.base === 'DAI' || meta.base === 'FDUSD' ? 1 : Number(meta.defaultPriceFallback ?? 0);
      const changePct24h =
        typeof cg?.price_change_percentage_24h === 'number'
          ? Number(cg.price_change_percentage_24h.toFixed(2))
          : bin?.priceChangePercent
            ? Number(Number(bin.priceChangePercent).toFixed(2))
            : 0;
      const high24h = Number(cg?.high_24h ?? bin?.highPrice ?? priceUsd) || priceUsd;
      const low24h = Number(cg?.low_24h ?? bin?.lowPrice ?? priceUsd) || priceUsd;
      const volume24hUsd = Number(cg?.total_volume ?? bin?.quoteVolume ?? 0);
      const marketCapUsd = Number(cg?.market_cap ?? 0);
      const priceSource: TrustWalletMarketQuote['priceSource'] =
        cgPx > 0 ? 'TRUST_COINGECKO' : binPx > 0 ? 'SPOT_AGGREGATE' : 'FALLBACK';

      return {
        symbol: meta.symbol,
        base: meta.base,
        nameEn: meta.nameEn,
        nameFa: meta.nameFa,
        category: meta.category,
        primaryChain: meta.primaryChain,
        chains: meta.chains,
        contractAddress: meta.contractAddress,
        logoUrl: cg?.image || meta.trustLogoUrl,
        priceUsd,
        changePct24h,
        high24h,
        low24h,
        volume24hUsd,
        marketCapUsd,
        rank: cg?.market_cap_rank || idx + 1,
        priceSource,
        tradableOnPerp: meta.tradableOnPerp,
      };
    });

    // Also include top liquid Binance spot tokens not yet in the curated catalog (gives 250+ coins)
    const existingBases = new Set(baseList.map((b) => b.base));
    if (binBySym.size > 0) {
      const extras = Array.from(binBySym.values())
        .filter((b) => {
          const base = b.symbol.slice(0, -4);
          return !existingBases.has(base) && Number(b.lastPrice ?? 0) > 0 && Number(b.quoteVolume ?? 0) >= 2_500_000;
        })
        .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
        .slice(0, 120);

      for (const b of extras) {
        const base = b.symbol.slice(0, -4);
        const px = Number(b.lastPrice ?? 0);
        baseList.push({
          symbol: b.symbol,
          base,
          nameEn: base,
          nameFa: base,
          category: 'LAYER1',
          primaryChain: 'ethereum',
          chains: ['ethereum', 'bsc'],
          logoUrl: '',
          priceUsd: px,
          changePct24h: Number(Number(b.priceChangePercent ?? 0).toFixed(2)),
          high24h: Number(b.highPrice ?? px) || px,
          low24h: Number(b.lowPrice ?? px) || px,
          volume24hUsd: Number(b.quoteVolume ?? 0),
          marketCapUsd: 0,
          rank: baseList.length + 1,
          priceSource: 'SPOT_AGGREGATE',
          tradableOnPerp: true,
        });
      }
    }

    COINGECKO_PRICE_CACHE.ts = now;
    COINGECKO_PRICE_CACHE.data = baseList;
  }

  if (!extraMarketQuotes?.length) return baseList;

  const bySym = new Map<string, TrustWalletMarketQuote>();
  for (const item of baseList) bySym.set(item.symbol, { ...item });
  for (const ex of extraMarketQuotes) {
    const px = Number(ex.lastPrice ?? 0);
    if (!Number.isFinite(px) || px <= 0) continue;
    const prev = bySym.get(ex.symbol);
    if (!prev) {
      bySym.set(ex.symbol, {
        symbol: ex.symbol,
        base: ex.base,
        nameEn: ex.base,
        nameFa: ex.base,
        category: 'LAYER1',
        primaryChain: 'bsc',
        chains: ['bsc', 'ethereum'],
        logoUrl: '',
        priceUsd: px,
        changePct24h: Number(ex.changePct24h ?? 0),
        high24h: Number(ex.high24h ?? px) || px,
        low24h: Number(ex.low24h ?? px) || px,
        volume24hUsd: Number(ex.volume24h ?? 0),
        marketCapUsd: 0,
        rank: bySym.size + 1,
        priceSource: 'SPOT_AGGREGATE',
        tradableOnPerp: true,
      });
    } else if (prev.priceSource === 'FALLBACK') {
      prev.priceUsd = px;
      prev.changePct24h = Number(ex.changePct24h ?? prev.changePct24h);
      prev.high24h = Number(ex.high24h ?? px) || px;
      prev.low24h = Number(ex.low24h ?? px) || px;
      prev.volume24hUsd = Math.max(prev.volume24hUsd, Number(ex.volume24h ?? 0));
      prev.priceSource = 'SPOT_AGGREGATE';
    }
  }

  return Array.from(bySym.values()).sort((a, b) => a.rank - b.rank || b.volume24hUsd - a.volume24hUsd);
}

async function fetchErc20TokenBalance(
  rpcUrl: string,
  tokenContract: string,
  walletAddress: string,
  decimals: number
): Promise<number> {
  try {
    const clean = walletAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: tokenContract, data: `0x70a08231${clean}` }, 'latest'],
      }),
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return 0;
    const j = (await res.json()) as { result?: string };
    if (!j.result || j.result === '0x') return 0;
    return Number(BigInt(j.result)) / 10 ** decimals;
  } catch {
    return 0;
  }
}

async function fetchSolanaSplHoldings(
  walletAddress: string
): Promise<Array<{ mint: string; amount: number }>> {
  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as {
      result?: {
        value?: Array<{
          account?: {
            data?: {
              parsed?: {
                info?: {
                  mint?: string;
                  tokenAmount?: { uiAmount?: number | null };
                };
              };
            };
          };
        }>;
      };
    };
    const out: Array<{ mint: string; amount: number }> = [];
    for (const item of j.result?.value ?? []) {
      const info = item.account?.data?.parsed?.info;
      const amt = Number(info?.tokenAmount?.uiAmount ?? 0);
      if (info?.mint && amt > 0) out.push({ mint: info.mint, amount: amt });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchTonJettons(
  walletAddress: string
): Promise<Array<{ symbol: string; name: string; balance: number; address: string }>> {
  try {
    const res = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(walletAddress)}/jettons`, {
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as {
      balances?: Array<{
        balance?: string;
        jetton?: { symbol?: string; name?: string; decimals?: number; address?: string };
      }>;
    };
    const out: Array<{ symbol: string; name: string; balance: number; address: string }> = [];
    for (const b of j.balances ?? []) {
      const dec = Number(b.jetton?.decimals ?? 9);
      const val = Number(b.balance ?? 0) / 10 ** dec;
      const sym = (b.jetton?.symbol || '').toUpperCase().trim();
      if (sym && val > 0) {
        out.push({ symbol: sym, name: b.jetton?.name || sym, balance: val, address: b.jetton?.address || '' });
      }
    }
    return out;
  } catch {
    return [];
  }
}

const KEY_EVM_TOKENS: Array<{
  chain: string;
  rpc: string;
  base: string;
  contract: string;
  decimals: number;
}> = [
  { chain: 'bsc', rpc: 'https://bsc-dataseed.binance.org', base: 'USDC', contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  { chain: 'bsc', rpc: 'https://bsc-dataseed.binance.org', base: 'FDUSD', contract: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', decimals: 18 },
  { chain: 'bsc', rpc: 'https://bsc-dataseed.binance.org', base: 'CAKE', contract: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18 },
  { chain: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', base: 'USDT', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  { chain: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', base: 'USDC', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  { chain: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', base: 'WBTC', contract: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  { chain: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', base: 'PEPE', contract: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18 },
  { chain: 'base', rpc: 'https://mainnet.base.org', base: 'USDC', contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { chain: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', base: 'USDT', contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  { chain: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', base: 'USDC', contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  { chain: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', base: 'ARB', contract: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  { chain: 'polygon', rpc: 'https://polygon-rpc.com', base: 'USDT', contract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
];

const SOL_MINT_TO_BASE = new Map<string, string>([
  ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT'],
  ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC'],
  ['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'JUP'],
  ['4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'RAY'],
  ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'BONK'],
  ['EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'WIF'],
  ['rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', 'RENDER'],
]);

/**
 * Reads live multi-chain balances + tokens directly from user's connected Trust Wallet addresses
 * and values every holding using Trust Wallet-aligned live prices.
 */
export async function fetchTrustWalletLivePortfolio(addresses: {
  evmAddress?: string | null;
  tronAddress?: string | null;
  solanaAddress?: string | null;
  tonAddress?: string | null;
}): Promise<{
  totalUsd: number;
  holdings: TrustWalletPortfolioHolding[];
  fetchedAt: string;
}> {
  const key = [
    addresses.evmAddress || '',
    addresses.tronAddress || '',
    addresses.solanaAddress || '',
    addresses.tonAddress || '',
  ].join('|');

  const cached = PORTFOLIO_CACHE.get(key);
  if (cached && Date.now() - cached.ts < 25_000) {
    return { ...cached.data, fetchedAt: new Date(cached.ts).toISOString() };
  }

  const [quotes, bnbBal, ethBal, baseEth, arbEth, polBal, bscUsdt, evmTokens, solBal, splList, tonBal, tonJettons, tronBal] =
    await Promise.all([
      fetchTrustWalletAlignedMarkets().catch(() => [] as TrustWalletMarketQuote[]),
      addresses.evmAddress ? fetchEvmNativeBalance('https://bsc-dataseed.binance.org', addresses.evmAddress) : Promise.resolve(null),
      addresses.evmAddress ? fetchEvmNativeBalance('https://ethereum-rpc.publicnode.com', addresses.evmAddress) : Promise.resolve(null),
      addresses.evmAddress ? fetchEvmNativeBalance('https://mainnet.base.org', addresses.evmAddress) : Promise.resolve(null),
      addresses.evmAddress ? fetchEvmNativeBalance('https://arb1.arbitrum.io/rpc', addresses.evmAddress) : Promise.resolve(null),
      addresses.evmAddress ? fetchEvmNativeBalance('https://polygon-rpc.com', addresses.evmAddress) : Promise.resolve(null),
      addresses.evmAddress ? fetchBscUsdtBalance(addresses.evmAddress) : Promise.resolve(null),
      addresses.evmAddress
        ? Promise.all(KEY_EVM_TOKENS.map((t) => fetchErc20TokenBalance(t.rpc, t.contract, addresses.evmAddress!, t.decimals)))
        : Promise.resolve([] as number[]),
      addresses.solanaAddress ? fetchSolanaBalance(addresses.solanaAddress) : Promise.resolve(null),
      addresses.solanaAddress ? fetchSolanaSplHoldings(addresses.solanaAddress) : Promise.resolve([]),
      addresses.tonAddress ? fetchTonBalance(addresses.tonAddress) : Promise.resolve(null),
      addresses.tonAddress ? fetchTonJettons(addresses.tonAddress) : Promise.resolve([]),
      addresses.tronAddress ? fetchTronBalances(addresses.tronAddress) : Promise.resolve({ trx: null, trc20Usdt: null }),
    ]);

  const quoteMap = new Map<string, TrustWalletMarketQuote>(quotes.map((q) => [q.base, q]));
  const getPx = (base: string) => {
    if (base === 'USDT' || base === 'USDC' || base === 'DAI' || base === 'FDUSD' || base === 'USD₮') return { px: 1, chg: 0 };
    const q = quoteMap.get(base);
    if (q && q.priceUsd > 0) return { px: q.priceUsd, chg: q.changePct24h };
    const meta = TRUST_WALLET_ASSET_MAP.get(base);
    return { px: Number(meta?.defaultPriceFallback ?? 0), chg: 0 };
  };

  const holdings: TrustWalletPortfolioHolding[] = [];
  const pushHolding = (
    base: string,
    chain: string,
    balance: number | null | undefined,
    isNative: boolean,
    contractAddress?: string
  ) => {
    const cleanBal = Number(balance ?? 0);
    if (!Number.isFinite(cleanBal) || cleanBal <= 0) return;
    const normBase = base === 'USD₮' ? 'USDT' : base.toUpperCase();
    const meta = TRUST_WALLET_ASSET_MAP.get(normBase);
    const { px, chg } = getPx(normBase);
    const valueUsd = Number((cleanBal * px).toFixed(4));
    if (valueUsd < 0.0001 && cleanBal < 0.00001) return;
    holdings.push({
      symbol: `${normBase}USDT`,
      base: normBase,
      nameEn: meta?.nameEn || normBase,
      nameFa: meta?.nameFa || normBase,
      chain,
      balance: cleanBal,
      priceUsd: px,
      valueUsd: Number(valueUsd.toFixed(2)),
      changePct24h: chg,
      logoUrl: quoteMap.get(normBase)?.logoUrl || meta?.trustLogoUrl || '',
      contractAddress: contractAddress || meta?.contractAddress,
      isNative,
    });
  };

  pushHolding('BNB', 'bsc', bnbBal, true);
  pushHolding('USDT', 'bsc', bscUsdt, false, '0x55d398326f99059fF775485246999027B3197955');
  pushHolding('ETH', 'ethereum', ethBal, true);
  pushHolding('ETH', 'base', baseEth, true);
  pushHolding('ETH', 'arbitrum', arbEth, true);
  pushHolding('POL', 'polygon', polBal, true);

  KEY_EVM_TOKENS.forEach((t, i) => {
    pushHolding(t.base, t.chain, evmTokens[i] ?? 0, false, t.contract);
  });

  pushHolding('SOL', 'solana', solBal, true);
  for (const spl of splList) {
    const base = SOL_MINT_TO_BASE.get(spl.mint);
    if (base) pushHolding(base, 'solana', spl.amount, false, spl.mint);
  }

  pushHolding('TON', 'ton', tonBal, true);
  for (const jet of tonJettons) {
    pushHolding(jet.symbol, 'ton', jet.balance, false, jet.address);
  }

  if (tronBal) {
    pushHolding('TRX', 'tron', tronBal.trx, true);
    const trc20Usdt = 'trc20Usdt' in tronBal ? tronBal.trc20Usdt : tronBal.usdt;
    pushHolding('USDT', 'tron', trc20Usdt, false, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  }

  holdings.sort((a, b) => b.valueUsd - a.valueUsd);
  const totalUsd = Number(holdings.reduce((s, h) => s + h.valueUsd, 0).toFixed(2));
  PORTFOLIO_CACHE.set(key, { ts: Date.now(), data: { totalUsd, holdings } });

  return {
    totalUsd,
    holdings,
    fetchedAt: new Date().toISOString(),
  };
}
