import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

function copyManifest(): Plugin {
  return {
    name: "copy-firefox-manifest",
    writeBundle(options) {
      const outDir = String(options.dir ?? "dist");
      mkdirSync(outDir, { recursive: true });
      copyFileSync(resolve("src/manifest.json"), resolve(outDir, "manifest.json"));
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "content" || mode === "background") {
    return {
      build: {
        outDir: "dist",
        emptyOutDir: false,
        copyPublicDir: false,
        lib: {
          entry: resolve(
            mode === "content"
              ? "src/content/content.ts"
              : "src/background/background.ts",
          ),
          name: mode === "content" ? "LizardContent" : "LizardBackground",
          formats: ["iife"],
          fileName: () => `${mode}.js`,
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
    };
  }

  return {
    plugins: [vue(), copyManifest()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve("popup.html"),
          options: resolve("options.html"),
        },
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    test: {
      environment: "jsdom",
      include: ["tests/**/*.test.ts"],
    },
  };
});
