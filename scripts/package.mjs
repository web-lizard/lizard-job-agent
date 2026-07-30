import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { zipSync } from "fflate";

const source = resolve("dist");
const outputDirectory = resolve("web-ext-artifacts");
const output = join(outputDirectory, "lizard_job_agent-0.1.0.zip");
const files = {};

function collect(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      collect(path);
      continue;
    }
    const archivePath = relative(source, path).replaceAll("\\", "/");
    files[archivePath] = new Uint8Array(readFileSync(path));
  }
}

collect(source);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(output, zipSync(files, { level: 9 }));
console.log(`Extension package created: ${output}`);
