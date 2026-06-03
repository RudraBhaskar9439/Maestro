import Link from "next/link";

/** Marketing-site header used on the landing + docs pages. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[rgba(7,11,22,0.72)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="text-[var(--accent)]">◆</span> MAESTRO
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-[var(--muted)] md:flex">
          <a href="/#how" className="hover:text-[var(--text)]">How it works</a>
          <a href="/#novel" className="hover:text-[var(--text)]">What&apos;s new</a>
          <Link href="/docs" className="hover:text-[var(--text)]">Docs</Link>
        </nav>
        <Link
          href="/app"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90"
        >
          Launch App →
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] px-6 py-10 text-xs text-[var(--muted)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-[var(--text)]">
          <span className="text-[var(--accent)]">◆</span> Maestro
          <span className="text-[var(--muted)]">· auction-managed AMM</span>
        </div>
        <div className="mono flex flex-wrap gap-x-6 gap-y-1">
          <a href="https://sepolia.uniscan.xyz/address/0x9d756CfA7a0eb3a83e1b6792037b6F950af5eac0" target="_blank" rel="noreferrer" className="hover:text-[var(--text)]">
            hook ↗
          </a>
          <a href="https://sepolia.uniscan.xyz/address/0x94535D4EC8c013F6D669ae72ab2683aC7EE820C4" target="_blank" rel="noreferrer" className="hover:text-[var(--text)]">
            manager ↗
          </a>
          <span>Unichain Sepolia · Reactive Lasna</span>
        </div>
      </div>
    </footer>
  );
}
