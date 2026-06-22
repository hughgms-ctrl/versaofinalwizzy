import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        // Fase 7.3: split de vendor cacheavel. Nomeio APENAS as libs que ja sao
        // carregadas eager em toda pagina (providers/router/shell) e mudam raramente
        // -> tira do chunk de entrada e deixa em chunks estaveis e cacheaveis entre
        // deploys. O RESTO (recharts, @tiptap, @fullcalendar, @xyflow, pdfjs/jspdf,
        // dnd-kit, lucide...) fica no split AUTOMATICO do Rollup de proposito: assim
        // lib usada so em rota lazy continua lazy (carrega com a rota), e libs pequenas
        // nao arrastam libs grandes pro boot por compartilharem chunk nomeado.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-is|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return "vendor-react";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@radix-ui")) return "vendor-radix";
          // Sentry roda eager no main.tsx (Sentry.init no topo); separar tira ~86kB gzip
          // do entry e deixa cacheavel (muda raramente).
          if (id.includes("@sentry")) return "vendor-sentry";
        },
      },
    },
  },
}));
