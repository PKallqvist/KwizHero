import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { MantineProvider } from "@mantine/core";
import { App } from "./App";
import { i18n } from "./platform/i18n/i18n";
import { kwizTheme } from "./platform/theme/kwizTheme";
import { registerSW } from "virtual:pwa-register";
import "@mantine/core/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";

registerSW({
  immediate: true,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={kwizTheme} defaultColorScheme="light">
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nextProvider>
    </MantineProvider>
  </React.StrictMode>
);
