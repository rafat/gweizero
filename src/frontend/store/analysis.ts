import { create } from "zustand";

export type ContractInputMode = "paste" | "upload" | "address";
export type ChainOption = "bsc-mainnet" | "bsc-testnet" | "opbnb-mainnet";

type AnalysisDraftState = {
  mode: ContractInputMode;
  network: ChainOption;
  sourceCode: string;
  sourceAddress: string;
  setMode: (mode: ContractInputMode) => void;
  setNetwork: (network: ChainOption) => void;
  setSourceCode: (sourceCode: string) => void;
  setSourceAddress: (sourceAddress: string) => void;
};

export const useAnalysisDraftStore = create<AnalysisDraftState>((set) => ({
  mode: "paste",
  network: "bsc-mainnet",
  sourceCode: "",
  sourceAddress: "",
  setMode: (mode) => set({ mode }),
  setNetwork: (network) => set({ network }),
  setSourceCode: (sourceCode) => set({ sourceCode }),
  setSourceAddress: (sourceAddress) => set({ sourceAddress })
}));
