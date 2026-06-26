import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { StatusBadge } from "@/components/marketing/StatusBadge";
import { openDesktopDownload } from "@/lib/downloadDesktop";
import { DESKTOP_RELEASE_PAGE } from "@/lib/platformAccess";

export default function DownloadDesktopPage() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8 sm:p-10">
          <StatusBadge variant="desktop" className="mb-4">
            Desktop v0.1.7
          </StatusBadge>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Descargar App Desktop</h1>
          <p className="mt-4 text-base leading-relaxed text-[#9ca3af]">
            Instalador para Windows con módulos avanzados de liquidez:{" "}
            <span className="text-[#d1d5db]">Bookmap, heatmap completo y DOM avanzado</span>.
            Procesamiento local y diagnósticos de feed para setups más intensivos.
          </p>

          <ul className="mt-6 space-y-2.5 text-sm text-[#d1d5db]">
            <li className="flex gap-2">
              <span className="text-[#ff3b3b]">•</span>
              Windows 10/11 x64
            </li>
            <li className="flex gap-2">
              <span className="text-[#ff3b3b]">•</span>
              GoodTrading-Terminal-0.1.7-x64-setup.exe
            </li>
            <li className="flex gap-2">
              <span className="text-[#ff3b3b]">•</span>
              Bookmap, heatmap y DOM avanzado con procesamiento local
            </li>
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => openDesktopDownload("download_page")}
              className="rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-8 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Descargar v0.1.7
            </button>
            <a
              href={DESKTOP_RELEASE_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 px-8 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
            >
              Ver release en GitHub
            </a>
          </div>

          <Link href="/products" className="mt-8 inline-block text-sm text-blue-400 hover:text-blue-300">
            ← Ver todos los productos
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}
