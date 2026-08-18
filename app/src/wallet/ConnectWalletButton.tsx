import { ConnectKitButton } from "connectkit";

interface ConnectWalletButtonProps {
  label?: string;
}

export function ConnectWalletButton({
  label = "Connect wallet",
}: ConnectWalletButtonProps): JSX.Element {
  return (
    <ConnectKitButton.Custom>
      {({ show }) => (
        <button
          type="button"
          onClick={show}
          className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/40"
          data-testid="connect-wallet-cta"
        >
          {label}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}
