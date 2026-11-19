import { CheckCircle2, Download, Laptop, Monitor, Share, Smartphone, X } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import { usePwaInstall } from '../lib/pwa';

export function PwaInstallModal({
  lang,
  onClose,
}: {
  lang: Lang;
  onClose: () => void;
}) {
  const { canPromptNatively, isInstalled, isIos, promptInstall } = usePwaInstall();
  const isFa = lang === 'fa';

  const handleInstall = async () => {
    await promptInstall();
  };

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="card-tt max-w-lg w-full p-6 space-y-5 shadow-2xl my-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="Dollarino" className="w-11 h-11 rounded-2xl shadow-md" />
            <div>
              <h3 className="font-bold text-base text-white">
                {isFa ? 'نصب اپلیکیشن دلارینو (ویندوز و موبایل)' : 'Install Dollarino App (Windows & Mobile)'}
              </h3>
              <p className="text-xs text-[#8f99aa]">
                {isFa ? 'وب‌اپلیکیشن پیشرفته (PWA) — سریع، سبک و بدون نیاز به فیلتر استورها' : 'Progressive Web App — Fast standalone desktop & mobile experience'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-[#161b26] text-[#9aa5b5] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isInstalled ? (
          <div className="p-4 rounded-xl bg-[#27cd86]/10 border border-[#27cd86]/35 flex items-center gap-3 text-xs text-[#27cd86]">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              {isFa ? 'اپلیکیشن دلارینو هم‌اکنون به صورت نصب‌شده اجرا شده است!' : 'Dollarino is already installed as an app on this device!'}
            </span>
          </div>
        ) : (
          <>
            {canPromptNatively && (
              <button
                onClick={handleInstall}
                className="w-full py-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition"
              >
                <Download className="w-4 h-4" />
                <span>{isFa ? 'نصب فوری اپلیکیشن روی دستگاه شما' : 'Install Dollarino App Now'}</span>
              </button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#0b101b] border border-[#1d2434] space-y-2">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Monitor className="w-4 h-4 text-[#4b73f5]" />
                  <span>{isFa ? 'نسخه ویندوز (Windows)' : 'Windows & macOS Desktop'}</span>
                </div>
                <p className="text-[#9aa5b5] leading-relaxed">
                  {isFa
                    ? 'در مرورگر Chrome یا Edge، روی آیکون «نصب / کامپیوتر» در سمت راست نوار آدرس کلیک کنید یا از منو گزینه Install Dollarino را بزنید تا آیکون روی دسکتاپ اضافه شود.'
                    : 'In Chrome or Edge, click the Install icon in the address bar (or Menu → Install Dollarino) to launch as a standalone Windows app.'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0b101b] border border-[#1d2434] space-y-2">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Smartphone className="w-4 h-4 text-[#27cd86]" />
                  <span>{isFa ? 'اندروید و آیفون (iOS)' : 'Android & iPhone (iOS)'}</span>
                </div>
                <p className="text-[#9aa5b5] leading-relaxed">
                  {isIos || isFa
                    ? 'در اندروید (Chrome): گزینه «نصب برنامه / Add to Home Screen» را بزنید. در آیفون (Safari): دکمه Share را زده و «Add to Home Screen» را انتخاب کنید.'
                    : 'On Android Chrome tap "Install app". On iPhone Safari tap the Share icon and choose "Add to Home Screen".'}
                </p>
              </div>
            </div>

            {isIos && (
              <div className="p-3 rounded-xl bg-[#4b73f5]/10 border border-[#4b73f5]/30 text-xs text-[#c5d6ff] flex items-center gap-2">
                <Share className="w-4 h-4 shrink-0 text-[#4b73f5]" />
                <span>
                  {isFa
                    ? 'برای نصب در آیفون حتماً سایت را با Safari باز کنید، دکمه Share (مربع و فلش بالا) را لمس کرده و Add to Home Screen را بزنید.'
                    : 'On iOS, open in Safari → tap Share → tap Add to Home Screen.'}
                </span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-[#181d28] text-[11px] text-[#6c7689]">
          <span className="inline-flex items-center gap-1.5">
            <Laptop className="w-3.5 h-3.5" /> Windows · macOS · Android · iOS
          </span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-[#161b26] hover:bg-[#1f2636] text-white font-medium">
            {isFa ? 'بستن' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
