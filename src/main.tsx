import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

const enableSentry = import.meta.env.PROD;

Sentry.init({
  dsn: "https://e182c0b36f3c05825b22c0b0c5743cab@o4511028911734784.ingest.us.sentry.io/4511028921761792",
  tunnel: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sentry-tunnel`,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.3,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
  enabled: enableSentry,
  sendDefaultPii: true,
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Ocorreu um erro inesperado. Recarregue a página.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
