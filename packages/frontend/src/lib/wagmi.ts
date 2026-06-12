import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { unichainSepolia } from "./chain";

export const config = createConfig({
  chains: [unichainSepolia],
  // Generic injected connector; EIP-6963 discovery (on by default) surfaces each installed wallet
  // separately so the user can pick the one they actually use (avoids window.ethereum conflicts).
  connectors: [injected()],
  ssr: true,
  transports: {
    [unichainSepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
