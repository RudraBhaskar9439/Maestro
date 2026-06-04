import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Maestro — Auction-Managed AMM",
  description:
    "An auction-managed AMM on Uniswap v4 with an autonomous, cross-chain pool manager. Rent flows to LPs; liquidity is concentrated by a Reactive agent.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="aurora-bg" aria-hidden>
          <span className="b1" />
          <span className="b2" />
          <span className="b3" />
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
