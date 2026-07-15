import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
    server: {
        proxy: {
            "/webdav-proxy": {
                target: "http://192.168.1.135:5005",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/webdav-proxy/, "/sata12-REDACTED_USERNAME/备份/WEBDAV"),
                configure: (proxy) => {
                    proxy.on("proxyReq", (proxyReq, req) => {
                        // Forward WebDAV methods
                        if (req.method) proxyReq.method = req.method;
                    });
                },
            },
        },
    },
});
