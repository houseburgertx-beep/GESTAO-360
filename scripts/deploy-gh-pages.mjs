import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const apiDir = path.join(rootDir, "src", "app", "api");
const backupDir = path.join(rootDir, ".tmp-api-backup");
const nextDir = path.join(rootDir, ".next");
const outDir = path.join(rootDir, "out");
const remoteUrl = "https://github.com/houseburgertx-beep/GESTAO-360.git";

const env = {
  ...process.env,
  PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ""}`,
  GITHUB_PAGES: "true",
};

function run(cmd, cwd = rootDir) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, env, stdio: "inherit" });
}

async function main() {
  let movedApi = false;

  try {
    if (fs.existsSync(backupDir)) {
      throw new Error(`Diretório temporário ${backupDir} já existe. Verifique antes de continuar.`);
    }

    if (fs.existsSync(nextDir)) {
      fs.rmSync(nextDir, { recursive: true, force: true });
    }
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true });
    }

    if (fs.existsSync(apiDir)) {
      fs.renameSync(apiDir, backupDir);
      movedApi = true;
      console.log("Rotas /api movidas temporariamente para exportação estática.");
    }

    run("npm run build");
  } finally {
    if (movedApi && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, apiDir);
      console.log("Rotas /api restauradas em src/app/api.");
    }
  }

  if (!fs.existsSync(outDir)) {
    throw new Error("Pasta out/ não foi gerada pelo Next.js export.");
  }

  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
  console.log("Arquivo out/.nojekyll criado.");

  run("git init -b gh-pages", outDir);
  run('git config user.name "houseburgertx-beep"', outDir);
  run('git config user.email "houseburgertx@users.noreply.github.com"', outDir);
  run("git add -A", outDir);
  run('git commit -m "deploy: BrassaOps static build to GitHub Pages"', outDir);
  run(`git push -f ${remoteUrl} HEAD:gh-pages`, outDir);

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("Deploy para branch gh-pages concluído com sucesso!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
