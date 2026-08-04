import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { basename, resolve } from "node:path";

const projectRoot = resolve(".");
const outputDirectory = resolve(projectRoot, "dist");

if (basename(outputDirectory) !== "dist") {
  throw new Error(`Отказ от очистки неожиданного каталога: ${outputDirectory}`);
}

const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(resolve(projectRoot, "manifest.json"), "utf8"),
);

if (packageJson.version !== manifest.version) {
  throw new Error(
    `Версии расходятся: package.json=${packageJson.version}, manifest.json=${manifest.version}`,
  );
}

const files = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "options.html",
  "options.css",
  "options.js",
];

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const file of files) {
  copyFileSync(resolve(projectRoot, file), resolve(outputDirectory, file));
}

cpSync(resolve(projectRoot, "icons"), resolve(outputDirectory, "icons"), {
  recursive: true,
});

// В сборку намеренно попадает только обезличенный пример. Локальный
// resume.json может содержать персональные данные и никогда не пакуется.
copyFileSync(
  resolve(projectRoot, "resume.example.json"),
  resolve(outputDirectory, "resume.json"),
);

console.log(`Сборка ${manifest.version} подготовлена: ${outputDirectory}`);
