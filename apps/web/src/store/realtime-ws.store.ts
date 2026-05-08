import { create } from "zustand";

export type RealtimeWsStatus = "connecting" | "open" | "closed";

type State = {
  status: RealtimeWsStatus;
  setStatus: (status: RealtimeWsStatus) => void;
};

export const useRealtimeWsStore = create<State>((set) => ({
  status: "closed",
  setStatus: (status) => set({ status }),
}));
