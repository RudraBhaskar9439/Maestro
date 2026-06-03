import Link from "next/link";
import { SiteHeader, SiteFooter } from "../components/SiteHeader";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* ── hero ── */}
      <section className="relative overflow-hidden border-b border-[#232329]">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-6 py-28 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#232329] bg-[#101013] px-3 py-1 text-xs text-[var(--muted)]">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--positive)]" />
            Live on Unichain Sepolia + Reactive Lasna
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            The AMM where the manager is an{" "}
            <span className="gradient-text">autonomous cross-chain agent</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted)]">
            Maestro is an auction-managed AMM on Uniswap v4. A continuous auction sells the right to
            manage the pool; the manager concentrates liquidity and pays rent to LPs — and that
            manager is a Reactive Smart Contract running across chains, with no keeper.
          </p>
          <div className="mt-9 flex justify-center gap-3">
            <Link
              href="/app"
              className="glow rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-black hover:opacity-90"
            >
              Launch App →
            </Link>
            <Link
              href="/docs"
              className="rounded-md border border-[#232329] bg-[#101013] px-5 py-2.5 text-sm hover:border-[var(--accent)]"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      {/* ── the problem ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-sm text-[var(--accent)]">The problem</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight">
          On volatile pairs, LPs lose more to arbitrage than they earn in fees.
        </h2>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Every time the market moves, the pool&apos;s price is briefly stale and arbitrageurs trade
          against it — that leakage is <span className="text-[var(--text)]">Loss-Versus-Rebalancing
          (LVR)</span>, and today 100% of it flows to searchers and block builders, not LPs.
        </p>
      </section>

      <div className="hairline mx-auto max-w-6xl" />

      {/* ── mechanism ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-sm text-[var(--accent)]">The mechanism — am-AMM</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight">
          Don&apos;t fight the arbitrageur. Auction the right to be one — and pay LPs.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Feature
            title="Harberger auction"
            body="A continuous lease auctions the pool-manager role. The highest per-block rent wins; a K-block delay makes it censorship-resistant."
          />
          <Feature
            title="Rent → LPs"
            body="The manager sets the fee, captures the arbitrage, and pays rent every block — distributed to LP shareholders. Value recaptured, not leaked."
          />
          <Feature
            title="Concentrated liquidity"
            body="The manager concentrates the pool's liquidity around the price for capital efficiency — repositioning as the market moves."
          />
        </div>
      </section>

      {/* ── what's new ── */}
      <section id="novel" className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-sm text-[var(--accent)]">What&apos;s new</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight">
          Two things no one has shipped before.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="card glow p-7">
            <div className="text-xs text-[var(--accent)]">Novel #1</div>
            <h3 className="mt-2 text-xl font-semibold">Concentrated-liquidity am-AMM</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              The am-AMM paper (Adams, Moallemi, Reynolds, Robinson) left the extension to
              concentrated liquidity explicitly <span className="text-[var(--text)]">unsolved</span>.
              Maestro makes the manager govern a hook-owned vault&apos;s active tick range — the first
              concentrated-liquidity auction-managed AMM.
            </p>
          </div>
          <div className="card glow p-7">
            <div className="text-xs text-[var(--accent)]">Novel #2</div>
            <h3 className="mt-2 text-xl font-semibold">Autonomous cross-chain manager</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              The manager is a <span className="text-[var(--text)]">Reactive Smart Contract</span>:
              it watches a Pyth price signal on Ethereum Sepolia and fires a cross-chain callback that
              re-concentrates the Unichain pool — trustless, sequencer-independent, no keeper. It turns
              am-AMM from a pro-searcher game into a passive LP product.
            </p>
          </div>
        </div>
      </section>

      {/* ── how it works ── */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-sm text-[var(--accent)]">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Five steps, fully on-chain.</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {[
            ["01", "Deposit", "LPs deposit into the hook-owned vault and receive shares."],
            ["02", "Auction", "Bidders compete for the manager role; rent flows to LPs."],
            ["03", "Manage", "The Reactive manager sets the fee and concentration."],
            ["04", "React", "A price move on Sepolia triggers a cross-chain reposition."],
            ["05", "Earn", "LPs collect fees + recaptured rent; withdraw anytime."],
          ].map(([n, t, b]) => (
            <li key={n} className="card p-5">
              <div className="mono text-sm text-[var(--accent)]">{n}</div>
              <div className="mt-2 font-medium">{t}</div>
              <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{b}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── built on ── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="card flex flex-col items-center gap-6 p-10 text-center">
          <p className="text-sm uppercase tracking-wider text-[var(--muted)]">Built on</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-lg font-medium">
            <span>Uniswap v4</span>
            <span className="text-[var(--border)]">·</span>
            <span>Reactive Network</span>
            <span className="text-[var(--border)]">·</span>
            <span>Pyth</span>
          </div>
          <Link
            href="/app"
            className="mt-2 rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-black hover:opacity-90"
          >
            Launch the app →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-6">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
    </div>
  );
}
