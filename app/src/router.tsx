import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./chrome/Layout.js";
import { Markets } from "./screens/Markets.js";
import { Evidence } from "./screens/Evidence.js";
import { LoopBuilder } from "./screens/LoopBuilder.js";
import { Positions } from "./screens/Positions.js";
import { Automation } from "./screens/Automation.js";
import { DevForceExit } from "./screens/DevForceExit.js";

// Dev-only routes are mounted ONLY when `import.meta.env.DEV === true`.
// Production builds (vite build) dead-code-eliminate this branch — the
// route + the DevForceExit chunk never reach the production bundle.
const IS_DEV = import.meta.env.DEV;

export function Router(): JSX.Element {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/markets" replace />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/loop" element={<LoopBuilder />} />
        <Route path="/positions" element={<Positions />} />
        <Route path="/automation" element={<Automation />} />
        <Route path="/evidence" element={<Evidence />} />
        {IS_DEV ? (
          <Route path="/dev/force-exit" element={<DevForceExit />} />
        ) : null}
        <Route path="*" element={<Navigate to="/markets" replace />} />
      </Route>
    </Routes>
  );
}
