import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { unichainSepolia } from "./chain";

export const config = createConfig({
  chains: [unichainSepolia],
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
