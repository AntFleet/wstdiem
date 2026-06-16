import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import { WalletProvider } from "./wallet/index.js";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fail-closed posture: do NOT silently retry reads that may be RPC-quorum-degraded.
      // The SDK already enforces G-PM-3 (RpcQuorumNotIndependent); UI exposes the result.
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 12_000,
    },
  },
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
);
