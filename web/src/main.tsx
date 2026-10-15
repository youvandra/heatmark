import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "./styles.css";
import { SessionProvider } from "./lib/session";
import AppShell from "./pages/AppShell";
import Docs from "./pages/Docs";
import Landing from "./pages/Landing";
import Passport from "./pages/Passport";
import Passports from "./pages/Passports";
import Plant from "./pages/Plant";
import Report from "./pages/Report";
import { VerifierQueue, VerifierReview } from "./pages/Verifier";

// Hover light follows the cursor inside every button (see .btn::after).
document.addEventListener("pointermove", (e) => {
  const el = (e.target as HTMLElement | null)?.closest?.(".btn") as HTMLElement | null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
});

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/docs", element: <Docs /> },
  { path: "/p/:id", element: <Passport /> },
  {
    path: "/app",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="plant" replace /> },
      { path: "plant", element: <Plant /> },
      { path: "plant/reports/:id", element: <Report /> },
      { path: "verifier", element: <VerifierQueue /> },
      { path: "verifier/:id", element: <VerifierReview /> },
      { path: "passports", element: <Passports /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
