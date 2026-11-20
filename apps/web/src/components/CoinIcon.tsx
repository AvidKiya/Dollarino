import { useEffect, useMemo, useState } from 'react';

function normalizeBase(symbol: string): string {
  return symbol
    .toUpperCase()
    .replace(/-SWAP-USDT|-SWAP|-PERP|_USDT|_USDC/gi, '')
    .replace(/USDT$|USDC$|USD$|BUSD$/i, '')
    .replace(/[^A-Z0-9]/g, '');
}

const COIN_COLORS: Record<string, { from: string; to: string }> = {
  BTC: { from: '#F7931A', to: '#E07000' },
  ETH: { from: '#627EEA', to: '#3B5BDB' },
  SOL: { from: '#9945FF', to: '#14F195' },
  BNB: { from: '#F3BA2F', to: '#D99B06' },
  USDT: { from: '#26A17B', to: '#17785B' },
  XRP: { from: '#23292F', to: '#0B1220' },
  TON: { from: '#0098EA', to: '#0072B8' },
  DOGE: { from: '#C2A633', to: '#947B1B' },
  ADA: { from: '#0033AD', to: '#001F73' },
  AVAX: { from: '#E84142', to: '#B71C1C' },
  TRX: { from: '#EF0027', to: '#A8001A' },
  LINK: { from: '#2A5ADA', to: '#1B3C9B' },
  DOT: { from: '#E6007A', to: '#9E0053' },
  SUI: { from: '#4DA2FF', to: '#1E64D8' },
  PEPE: { from: '#3D9947', to: '#1E6826' },
  ARB: { from: '#28A0F0', to: '#17629B' },
  OP: { from: '#FF0420', to: '#B80015' },
  LTC: { from: '#345D9D', to: '#1D3969' },
  NEAR: { from: '#111827', to: '#374151' },
  APT: { from: '#1F2937', to: '#0F172A' },
  MATIC: { from: '#8247E5', to: '#5621B8' },
  POL: { from: '#8247E5', to: '#5621B8' },
};

function BrandSvgMark({ base }: { base: string }) {
  switch (base) {
    case 'BTC':
      return (
        <svg viewBox="0 0 32 32" className="w-[62%] h-[62%] text-white fill-current">
          <path d="M21.4 14.3c.6-2.4-1.5-3.7-4-4.5l.8-3.3-2-.5-.8 3.2c-.5-.1-1-.3-1.6-.4l.8-3.2-2-.5-.8 3.3c-.4-.1-.9-.2-1.3-.3l-2.7-.7-.5 2.1s1.5.3 1.4.4c.8.2.9.7.9 1.1l-.9 3.6c.1 0 .2 0 .3.1l-.3-.1-1.3 5c-.1.2-.3.6-.9.4 0 0-1.4-.4-1.4-.4l-1 2.3 2.5.6c.5.1 1 .3 1.4.4l-.8 3.3 2 .5.8-3.3c.5.1 1.1.3 1.6.4l-.8 3.3 2 .5.8-3.3c3.4.6 6 .4 7.1-2.7.9-2.5 0-3.9-1.8-4.9 1.3-.3 2.3-1.1 2.5-2.9zm-4.5 6.3c-.6 2.5-4.8 1.1-6.2.8l1.1-4.4c1.4.3 5.7 1 5.1 3.6zm.6-6.3c-.6 2.3-4.1 1.1-5.2.8l1-4c1.2.3 4.8.9 4.2 3.2z" />
        </svg>
      );
    case 'ETH':
      return (
        <svg viewBox="0 0 32 32" className="w-[60%] h-[60%] text-white fill-current">
          <path d="M16 4l-.2.7v15.4l.2.2 7.2-4.2L16 4z" opacity="0.85" />
          <path d="M16 4L8.8 16.1 16 20.3V4z" />
          <path d="M16 21.7l-.1.2v5.4l.1.3 7.2-10.1-7.2 4.2z" opacity="0.85" />
          <path d="M16 27.6v-5.9l-7.2-4.2L16 27.6z" />
        </svg>
      );
    case 'SOL':
      return (
        <svg viewBox="0 0 32 32" className="w-[58%] h-[58%] text-white fill-current">
          <path d="M7.5 21.8c.3-.3.7-.5 1.1-.5h16.9c.7 0 1 .8.5 1.3l-2.8 2.8c-.3.3-.7.5-1.1.5H5.2c-.7 0-1-.8-.5-1.3l2.8-2.8z" />
          <path d="M7.5 6.4c.3-.3.7-.5 1.1-.5h16.9c.7 0 1 .8.5 1.3l-2.8 2.8c-.3.3-.7.5-1.1.5H5.2c-.7 0-1-.8-.5-1.3L7.5 6.4z" />
          <path d="M23.2 14c-.3-.3-.7-.5-1.1-.5H5.2c-.7 0-1 .8-.5 1.3l2.8 2.8c.3.3.7.5 1.1.5h16.9c.7 0 1-.8.5-1.3L23.2 14z" />
        </svg>
      );
    case 'BNB':
      return (
        <svg viewBox="0 0 32 32" className="w-[60%] h-[60%] text-white fill-current">
          <path d="M16 5l3.9 3.9-6.8 6.8L9.2 11.8 16 5zm-8.9 8.9l3.1 3.1-3.1 3.1L4 17l3.1-3.1zm8.9 3.1l6.8-6.8L26.7 14 16 24.7 12.1 20.8 16 17zm8.9 0L28 17l-3.1 3.1-3.1-3.1L24.9 17zM16 27l-3.9-3.9L16 19.2l3.9 3.9L16 27z" />
        </svg>
      );
    case 'TON':
      return (
        <svg viewBox="0 0 32 32" className="w-[58%] h-[58%] text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
          <path d="M8 9.5C8 8.7 8.7 8 9.5 8h13c.8 0 1.5.7 1.5 1.5 0 .3-.1.6-.2.8L16 24.5 8.2 10.3c-.1-.2-.2-.5-.2-.8z" />
          <path d="M16 8v16.5" />
        </svg>
      );
    case 'XRP':
      return (
        <svg viewBox="0 0 32 32" className="w-[58%] h-[58%] text-white fill-current">
          <path d="M23.6 7h2.7l-6.1 6.1a5.9 5.9 0 01-8.4 0L5.7 7h2.7l4.8 4.8a3.9 3.9 0 005.6 0L23.6 7zM8.4 25H5.7l6.1-6.1a5.9 5.9 0 018.4 0l6.1 6.1h-2.7l-4.8-4.8a3.9 3.9 0 00-5.6 0L8.4 25z" />
        </svg>
      );
    case 'USDT':
      return (
        <svg viewBox="0 0 32 32" className="w-[58%] h-[58%] text-white fill-current">
          <path d="M17.9 14.3V12h5.3V8.2H8.8V12h5.3v2.3c-4.2.2-7.4 1.1-7.4 2.1s3.2 1.9 7.4 2.1V25h3.8v-6.5c4.2-.2 7.4-1.1 7.4-2.1s-3.2-1.9-7.4-2.1zm0 3.3c-.6 0-1.2.1-1.9.1s-1.3 0-1.9-.1c-3.4-.2-5.9-.8-5.9-1.4s2.5-1.2 5.9-1.4v2.1c.6 0 1.2.1 1.9.1s1.3 0 1.9-.1v-2.1c3.4.2 5.9.8 5.9 1.4s-2.5 1.2-5.9 1.4z" />
        </svg>
      );
    case 'TRX':
      return (
        <svg viewBox="0 0 32 32" className="w-[58%] h-[58%] text-white" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round">
          <path d="M5.5 7l19.8 3.6-8.6 15.8L5.5 7zm0 0l10.3 7.5 9.5-3.9M15.8 14.5l.9 11.9" />
        </svg>
      );
    case 'LINK':
      return (
        <svg viewBox="0 0 32 32" className="w-[56%] h-[56%] text-white" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round">
          <polygon points="16,5 25.5,10.5 25.5,21.5 16,27 6.5,21.5 6.5,10.5" />
        </svg>
      );
    case 'AVAX':
      return (
        <svg viewBox="0 0 32 32" className="w-[58%] h-[58%] text-white fill-current">
          <path d="M21.2 22.8h4.2c.9 0 1.3-.7.9-1.5l-2.1-3.7c-.4-.8-1.1-.8-1.6 0l-2.1 3.7c-.4.8 0 1.5.7 1.5zM14.3 6.8l-8.6 14.5c-.5.8-.1 1.5.9 1.5h4.1c.9 0 1.7-.5 2.1-1.2l4.7-8.1c.4-.7.4-1.6 0-2.3l-1.5-2.6c-.4-.8-1.3-.8-1.7-1.8z" />
        </svg>
      );
    default: {
      const label = base.slice(0, 3) || 'USD';
      return (
        <span
          className="font-display font-black tracking-tight text-white leading-none"
          style={{ fontSize: label.length >= 3 ? '0.68em' : '0.84em' }}
        >
          {label}
        </span>
      );
    }
  }
}

export function CoinIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const base = useMemo(() => normalizeBase(symbol), [symbol]);
  const low = base.toLowerCase();

  const logoUrls = useMemo(
    () =>
      low
        ? [
            `https://assets.coincap.io/assets/icons/${low}@2x.png`,
            `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${low}.png`,
            `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${low}.png`,
          ]
        : [],
    [low]
  );

  const [urlIndex, setUrlIndex] = useState(0);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    setUrlIndex(0);
    setImgReady(false);
  }, [low]);

  const colors = COIN_COLORS[base] ?? (() => {
    let h = 0;
    for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) % 360;
    return {
      from: `hsl(${h}, 72%, 46%)`,
      to: `hsl(${(h + 36) % 360}, 78%, 32%)`,
    };
  })();

  const activeUrl = urlIndex < logoUrls.length ? logoUrls[urlIndex] : null;

  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.44)),
        background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
      }}
      className="relative rounded-full flex items-center justify-center shadow-sm shrink-0 select-none overflow-hidden ring-1 ring-white/15"
      title={base}
    >
      {!imgReady && <BrandSvgMark base={base} />}
      {activeUrl && (
        <img
          src={activeUrl}
          alt={base}
          loading="lazy"
          decoding="async"
          onLoad={() => setImgReady(true)}
          onError={() => {
            setImgReady(false);
            setUrlIndex((idx) => idx + 1);
          }}
          className={`absolute inset-0 w-full h-full object-cover rounded-full transition-opacity duration-200 ${
            imgReady ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}
    </div>
  );
}
