export function CoinIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const clean = symbol.replace(/USDT|USDC|-PERP|_USDT/gi, '').toUpperCase();

  const styles: Record<string, { bg: string; fg: string; glyph: string }> = {
    BTC: { bg: 'from-[#F7931A] to-[#D97706]', fg: '#ffffff', glyph: '₿' },
    ETH: { bg: 'from-[#627EEA] to-[#4338CA]', fg: '#ffffff', glyph: 'Ξ' },
    SOL: { bg: 'from-[#9945FF] to-[#14F195]', fg: '#ffffff', glyph: 'S' },
    BNB: { bg: 'from-[#F3BA2F] to-[#D97706]', fg: '#0b1120', glyph: 'B' },
    XRP: { bg: 'from-[#0EA5E9] to-[#1E3A8A]', fg: '#ffffff', glyph: '✕' },
    DOGE: { bg: 'from-[#EAB308] to-[#CA8A04]', fg: '#0b1120', glyph: 'Ð' },
    TON: { bg: 'from-[#0098EA] to-[#0284C7]', fg: '#ffffff', glyph: '💎' },
    TRX: { bg: 'from-[#EF4444] to-[#B91C1C]', fg: '#ffffff', glyph: 'T' },
    ADA: { bg: 'from-[#2563EB] to-[#1D4ED8]', fg: '#ffffff', glyph: '₳' },
    AVAX: { bg: 'from-[#E84142] to-[#991B1B]', fg: '#ffffff', glyph: 'A' },
  };

  const st = styles[clean] ?? {
    bg: 'from-[#3B82F6] to-[#1D4ED8]',
    fg: '#ffffff',
    glyph: clean.slice(0, 2) || '◈',
  };

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.44)), color: st.fg }}
      className={`rounded-full bg-gradient-to-br ${st.bg} flex items-center justify-center font-bold shadow-sm shrink-0 select-none`}
    >
      {st.glyph}
    </div>
  );
}
