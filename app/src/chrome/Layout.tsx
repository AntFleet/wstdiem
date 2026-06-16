// Layout — persistent chrome wrapper for every route.
//
// Header (nav + HF strip) + StateBitmapBanner + scrollable main. Synthesis §D.
// Routes render inside <Outlet />.

import { Outlet } from "react-router-dom";
import { Header } from "./Header.js";
import { StateBitmapBanner } from "./StateBitmapBanner.js";
import { useStateBitmap } from "../hooks/useStateBitmap.js";
import { useMarketContext } from "../hooks/useMarketContext.js";

export function Layout(): JSX.Element {
  const { activeMarket } = useMarketContext();
  const stateBitmapQuery = useStateBitmap(activeMarket);
  return (
    <div className="min-h-screen bg-canvas text-text">
      <Header market={activeMarket} />
      <StateBitmapBanner bitmap={stateBitmapQuery.data?.stateBitmap} />
      <main className="mx-auto max-w-[1280px] px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
