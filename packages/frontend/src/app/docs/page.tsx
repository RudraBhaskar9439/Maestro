import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Maestro — Docs",
  description: "How the Maestro auction-managed AMM works: am-AMM, concentrated liquidity, and the autonomous cross-chain manager.",
};

const sections = [
  ["overview", "Overview"],
  ["problem", "The LVR problem"],
  ["amamm", "am-AMM mechanism"],
  ["vault", "Hook-owned vault & concentration"],
  ["reactive", "Autonomous cross-chain manager"],
  ["architecture", "Architecture"],
  ["addresses", "Deployed addresses"],
  ["using", "Using Maestro"],
  ["limits", "Security & limitations"],
];

export default function Docs() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto flex max-w-6xl gap-12 px-6 py-16">
        {/* sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-1 text-sm">
            <div className="mb-3 text-xs uppercase tracking-wider text-[var(--muted)]">Documentation</div>
            {sections.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded px-2 py-1.5 text-[var(--muted)] hover:bg-[#101013] hover:text-[var(--text)]">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        {/* content */}
        <article className="prose-invert min-w-0 max-w-2xl space-y-14 text-[15px] leading-relaxed text-[var(--muted)]">
          <Section id="overview" title="Overview">
            <p>
              <b className="text-[var(--text)]">Maestro</b> is an auction-managed AMM (am-AMM) built as a
              Uniswap v4 hook. Liquidity providers deposit into a hook-owned vault; a continuous
              auction sells the right to <b className="text-[var(--text)]">manage</b> the pool. The
              manager sets the swap fee, concentrates the liquidity, and captures arbitrage — and in
              exchange pays rent every block that is distributed to LPs.
            </p>
            <p>
              Two contributions go beyond prior work: a <b className="text-[var(--text)]">concentrated-liquidity</b>{" "}
              am-AMM, and a manager that is an <b className="text-[var(--text)]">autonomous, cross-chain
              Reactive Smart Contract</b> rather than an off-chain searcher.
            </p>
          </Section>

          <Section id="problem" title="The LVR problem">
            <p>
              When the market price moves, an AMM pool&apos;s price is briefly stale. Arbitrageurs trade
              against the stale pool and pocket the difference. This leakage —{" "}
              <b className="text-[var(--text)]">Loss-Versus-Rebalancing (LVR)</b> — is often larger than
              the fees LPs earn on volatile pairs, and today it accrues entirely to searchers and block
              builders. Maestro recaptures it: the right to capture that arbitrage is auctioned, and the
              proceeds (rent) go to LPs.
            </p>
          </Section>

          <Section id="amamm" title="am-AMM mechanism">
            <p>The manager role is allocated by a continuous Harberger lease:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li><Mono>R</Mono> — the per-block rent a bidder commits to pay.</li>
              <li><Mono>D</Mono> — a deposit (≥ <Mono>R·K</Mono>) the rent is drawn from each block.</li>
              <li><Mono>K</Mono> — the block delay before a new top bid activates (censorship resistance).</li>
              <li><Mono>f_max</Mono> — the maximum swap fee the manager may set.</li>
            </ul>
            <p>
              The highest bidder becomes manager and is charged <Mono>R</Mono> per block out of{" "}
              <Mono>D</Mono>; that rent accrues to LP shareholders. A higher bid displaces the manager
              only after <Mono>K</Mono> blocks. If the deposit runs out, the manager is evicted and the
              pool reverts to a default fee.
            </p>
          </Section>

          <Section id="vault" title="Hook-owned vault & concentration">
            <p>
              For the manager to control concentration, the hook must own the liquidity. LPs{" "}
              <Mono>deposit()</Mono> through the hook and receive shares of a single aggregate position;
              external liquidity is blocked. The manager calls <Mono>reposition()</Mono> to move that
              position into a tighter, tick-aligned band around the price — strictly more capital
              efficient for the same tokens. This is the concentrated-liquidity extension the am-AMM
              paper left open.
            </p>
          </Section>

          <Section id="reactive" title="Autonomous cross-chain manager">
            <p>
              The manager is a <b className="text-[var(--text)]">Reactive Smart Contract</b> on the
              Reactive Network. It subscribes to a Pyth <Mono>PriceFeedUpdate</Mono> on Ethereum Sepolia
              and, on each update, emits a cross-chain callback to a <Mono>ManagerCallback</Mono> contract
              on Unichain that re-concentrates the pool. No keeper, no off-chain bot, sequencer-independent.
            </p>
            <p>
              Unichain Sepolia can receive Reactive callbacks (it is a supported <i>destination</i>) but
              cannot be subscribed to as an <i>origin</i>, so the price signal is observed on Ethereum
              Sepolia and the action is taken on Unichain — a genuinely cross-chain loop.
            </p>
          </Section>

          <Section id="architecture" title="Architecture">
            <pre className="mono overflow-x-auto rounded-lg border border-[#232329] bg-[#0c0c0f] p-4 text-xs text-[var(--text)]">{`Pyth (Eth Sepolia)                 Reactive Lasna
   │ PriceFeedUpdate                ┌───────────────────┐
   └──────────────────────────────▶│ MaestroManagerRSC │
                                    │   react → Callback│
                                    └─────────┬─────────┘
                                              │ cross-chain
        UNICHAIN SEPOLIA                      ▼
   ┌──────────────┐  reposition()   ┌───────────────────┐
   │  MaestroHook │◀────────────────│  ManagerCallback  │
   │  vault+auction│   rent → LPs    └───────────────────┘
   └──────────────┘`}</pre>
          </Section>

          <Section id="addresses" title="Deployed addresses">
            <ul className="ml-5 list-disc space-y-1">
              <li><Mono>MaestroHook</Mono> (Unichain Sepolia) — <Mono>0x9d756CfA7a0eb3a83e1b6792037b6F950af5eac0</Mono></li>
              <li><Mono>ManagerCallback</Mono> (Unichain Sepolia) — <Mono>0x94535D4EC8c013F6D669ae72ab2683aC7EE820C4</Mono></li>
              <li><Mono>MaestroManagerRSC</Mono> (Reactive Lasna) — <Mono>0x07A577d7cB5De074841e7A47f12Ed3E7dEfde923</Mono></li>
              <li><Mono>currency0 / currency1</Mono> — <Mono>0x4d10…e6aD</Mono> / <Mono>0x8398…6fc2</Mono></li>
            </ul>
          </Section>

          <Section id="using" title="Using Maestro">
            <p>From the <a className="text-[var(--accent)]" href="/app">app</a>, connected to Unichain Sepolia:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li><b className="text-[var(--text)]">Deposit</b> — approve currency0/1 and add liquidity; receive shares.</li>
              <li><b className="text-[var(--text)]">Claim Rent</b> — withdraw your share of accrued manager rent.</li>
              <li><b className="text-[var(--text)]">Withdraw</b> — burn shares and redeem the underlying.</li>
            </ul>
          </Section>

          <Section id="limits" title="Security & limitations">
            <ul className="ml-5 list-disc space-y-1">
              <li>This is a hackathon prototype on testnet — unaudited; do not use with real funds.</li>
              <li>The concentrated-liquidity am-AMM is a working approach, not a formal optimality proof.</li>
              <li>Swap-fee distribution to shareholders is a known follow-up; manager rent is distributed today.</li>
              <li>Manager rent is denominated in the pool&apos;s currency1.</li>
            </ul>
          </Section>
        </article>
      </div>
      <SiteFooter />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-2xl font-semibold tracking-tight text-[var(--text)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="mono rounded bg-[#16161b] px-1.5 py-0.5 text-[13px] text-[var(--text)]">{children}</code>;
}
