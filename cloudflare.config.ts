// Cloudflare deploy config for the `cf` CLI. The site is an assets-only Worker:
// `npm run build` writes _site/, then `cf deploy _site` uploads it (CI does this, see .github/workflows/deploy.yml).
// _headers and _redirects inside _site/ are applied by Workers static assets.
import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "engin-al",
    compatibilityDate: "2026-11-01",
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
    },
    // Attach the apex domain once DNS for engin.al is on Cloudflare (it points at GitHub Pages today).
    // domains: ["engin.al"],
  },
});
