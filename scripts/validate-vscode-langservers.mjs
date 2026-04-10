#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { ensureDependencies, MANIFEST_FILES } from "../vscode-langservers/scripts/install-deps.mjs";

const rootDir = process.cwd();
const pluginDir = path.join(rootDir, "vscode-langservers");

async function readJson(jsonPath) {
  const raw = await fs.readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-langservers-"));
  try {
    return await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function copyPluginManifests(destinationDir) {
  await fs.mkdir(destinationDir, { recursive: true });
  await Promise.all(
    MANIFEST_FILES.map((manifestFile) =>
      fs.copyFile(
        path.join(pluginDir, manifestFile),
        path.join(destinationDir, manifestFile),
      )),
  );
}

function fakeInstallLayout(dependencyName) {
  if (dependencyName === "@zed-industries/vscode-langservers-extracted") {
    return ["vscode-html-language-server"];
  }

  if (dependencyName === "vscode-langservers-extracted") {
    return [
      "vscode-css-language-server",
      "vscode-eslint-language-server",
      "vscode-json-language-server",
    ];
  }

  return [];
}

async function writeFakeNpmScript(scriptPath) {
  const source = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

if (process.env.FAKE_NPM_FAIL === "1") {
  console.error("simulated npm failure");
  process.exit(1);
}

if (process.argv[2] !== "ci") {
  console.error("unexpected npm invocation: " + process.argv.slice(2).join(" "));
  process.exit(1);
}

if (!process.argv.includes("--ignore-scripts")) {
  console.error("expected --ignore-scripts in npm ci argv: " + process.argv.slice(2).join(" "));
  process.exit(1);
}

const cwd = process.cwd();
const stateDir = process.env.FAKE_NPM_STATE_DIR;
if (!stateDir) {
  console.error("missing FAKE_NPM_STATE_DIR");
  process.exit(1);
}

fs.mkdirSync(stateDir, { recursive: true });
const countFile = path.join(stateDir, "install-count.txt");
const currentCount = fs.existsSync(countFile)
  ? Number(fs.readFileSync(countFile, "utf8"))
  : 0;
fs.writeFileSync(countFile, String(currentCount + 1));

const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
for (const dependencyName of Object.keys(pkg.dependencies || {})) {
  const packageDir = path.join(cwd, "node_modules", ...dependencyName.split("/"));
  const binDir = path.join(packageDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  let binNames = [];
  if (dependencyName === "@zed-industries/vscode-langservers-extracted") {
    binNames = ["vscode-html-language-server"];
  } else if (dependencyName === "vscode-langservers-extracted") {
    binNames = [
      "vscode-css-language-server",
      "vscode-eslint-language-server",
      "vscode-json-language-server"
    ];
  }

  for (const binName of binNames) {
    fs.writeFileSync(
      path.join(binDir, binName),
      "#!/usr/bin/env node\\nconsole.log(\\"" + dependencyName + ":" + binName + "\\");\\n"
    );
  }
}
`;

  await fs.writeFile(scriptPath, source, "utf8");
}

async function readInstallCount(stateDir) {
  const countFile = path.join(stateDir, "install-count.txt");
  try {
    return Number(await fs.readFile(countFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function readFileUtf8(filePath) {
  return await fs.readFile(filePath, "utf8");
}

async function validateHookScript() {
  const hookConfig = await readJson(path.join(pluginDir, "hooks", "hooks.json"));
  assert.equal(hookConfig.hooks.SessionStart.length, 1);
  assert.equal(
    hookConfig.hooks.SessionStart[0].hooks[0].command,
    "node \"${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.mjs\"",
  );
}

async function validateLspConfig() {
  const lspConfig = await readJson(path.join(pluginDir, ".lsp.json"));

  const expectedCommands = {
    html: "${CLAUDE_PLUGIN_DATA}/node_modules/@zed-industries/vscode-langservers-extracted/bin/vscode-html-language-server",
    css: "${CLAUDE_PLUGIN_DATA}/node_modules/vscode-langservers-extracted/bin/vscode-css-language-server",
    eslint: "${CLAUDE_PLUGIN_DATA}/node_modules/vscode-langservers-extracted/bin/vscode-eslint-language-server",
    json: "${CLAUDE_PLUGIN_DATA}/node_modules/vscode-langservers-extracted/bin/vscode-json-language-server",
  };

  for (const [serverName, scriptPath] of Object.entries(expectedCommands)) {
    const serverConfig = lspConfig[serverName];
    assert.equal(serverConfig.command, "node");
    assert.equal(serverConfig.args[0], scriptPath);
    assert.deepEqual(serverConfig.args.slice(1), ["--stdio"]);
    assert.equal(serverConfig.env.NODE_PATH, "${CLAUDE_PLUGIN_DATA}/node_modules");
    assert.equal(serverConfig.startupTimeout, 15000);
  }

  assert.deepEqual(lspConfig.json.extensionToLanguage, {
    ".json": "json",
    ".jsonc": "jsonc",
  });
}

async function validateInstallFlow() {
  await withTempDir(async (tempDir) => {
    const fixturePluginDir = path.join(tempDir, "plugin-root");
    const dataDir = path.join(tempDir, "plugin-data");
    const stateDir = path.join(tempDir, "state");
    const fakeNpmScript = path.join(tempDir, "fake-npm.cjs");

    await copyPluginManifests(fixturePluginDir);
    await writeFakeNpmScript(fakeNpmScript);

    const npmCommand = [process.execPath, fakeNpmScript];
    const baseEnv = {
      ...process.env,
      FAKE_NPM_STATE_DIR: stateDir,
    };

    const firstInstall = await ensureDependencies({
      pluginRoot: fixturePluginDir,
      dataDir,
      npmCommand,
      env: baseEnv,
    });
    assert.equal(firstInstall.installed, true);
    assert.equal(await readInstallCount(stateDir), 1);

    const expectedInstalledBins = [
      "@zed-industries/vscode-langservers-extracted/bin/vscode-html-language-server",
      "vscode-langservers-extracted/bin/vscode-css-language-server",
      "vscode-langservers-extracted/bin/vscode-eslint-language-server",
      "vscode-langservers-extracted/bin/vscode-json-language-server",
    ];

    for (const relativePath of expectedInstalledBins) {
      await fs.access(path.join(dataDir, "node_modules", relativePath));
    }

    const secondInstall = await ensureDependencies({
      pluginRoot: fixturePluginDir,
      dataDir,
      npmCommand,
      env: baseEnv,
    });
    assert.equal(secondInstall.installed, false);
    assert.equal(await readInstallCount(stateDir), 1);

    await fs.writeFile(
      path.join(fixturePluginDir, "package-lock.json"),
      "{\n  \"name\": \"changed\"\n}\n",
      "utf8",
    );

    const thirdInstall = await ensureDependencies({
      pluginRoot: fixturePluginDir,
      dataDir,
      npmCommand,
      env: baseEnv,
    });
    assert.equal(thirdInstall.installed, true);
    assert.equal(await readInstallCount(stateDir), 2);

    const packageJsonPath = path.join(fixturePluginDir, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    packageJson.version = "0.2.1-test";
    await fs.writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );

    const fourthInstall = await ensureDependencies({
      pluginRoot: fixturePluginDir,
      dataDir,
      npmCommand,
      env: baseEnv,
    });
    assert.equal(fourthInstall.installed, true);
    assert.equal(await readInstallCount(stateDir), 3);
  });
}

async function validateUpgradeFailurePreservesExistingInstall() {
  await withTempDir(async (tempDir) => {
    const fixturePluginDir = path.join(tempDir, "plugin-root");
    const dataDir = path.join(tempDir, "plugin-data");
    const stateDir = path.join(tempDir, "state");
    const fakeNpmScript = path.join(tempDir, "fake-npm.cjs");

    await copyPluginManifests(fixturePluginDir);
    await writeFakeNpmScript(fakeNpmScript);

    const npmCommand = [process.execPath, fakeNpmScript];
    const successEnv = {
      ...process.env,
      FAKE_NPM_STATE_DIR: stateDir,
    };

    const expectedInstalledBins = [
      "@zed-industries/vscode-langservers-extracted/bin/vscode-html-language-server",
      "vscode-langservers-extracted/bin/vscode-css-language-server",
      "vscode-langservers-extracted/bin/vscode-eslint-language-server",
      "vscode-langservers-extracted/bin/vscode-json-language-server",
    ];

    const seedInstall = await ensureDependencies({
      pluginRoot: fixturePluginDir,
      dataDir,
      npmCommand,
      env: successEnv,
    });
    assert.equal(seedInstall.installed, true);
    assert.equal(await readInstallCount(stateDir), 1);

    const originalDataPackageJson = await readFileUtf8(path.join(dataDir, "package.json"));
    const originalDataPackageLockJson = await readFileUtf8(path.join(dataDir, "package-lock.json"));

    for (const relativePath of expectedInstalledBins) {
      await fs.access(path.join(dataDir, "node_modules", relativePath));
    }

    const packageJsonPath = path.join(fixturePluginDir, "package.json");
    const packageJson = JSON.parse(await readFileUtf8(packageJsonPath));
    packageJson.version = "0.2.1-test";
    await fs.writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    // Deliberately stubbed: fake-npm drives installation, so this lockfile only needs
    // to differ from the seeded copy to force a reinstall attempt.
    await fs.writeFile(
      path.join(fixturePluginDir, "package-lock.json"),
      "{\n  \"name\": \"changed-upgrade\"\n}\n",
      "utf8",
    );

    await assert.rejects(
      ensureDependencies({
        pluginRoot: fixturePluginDir,
        dataDir,
        npmCommand,
        env: {
          ...successEnv,
          FAKE_NPM_FAIL: "1",
        },
      }),
      /simulated npm failure/,
    );

    assert.equal(await readInstallCount(stateDir), 1);
    assert.equal(await readFileUtf8(path.join(dataDir, "package.json")), originalDataPackageJson);
    assert.equal(await readFileUtf8(path.join(dataDir, "package-lock.json")), originalDataPackageLockJson);
    await assert.rejects(
      fs.access(path.join(dataDir, ".install-staging")),
      { code: "ENOENT" },
    );

    for (const relativePath of expectedInstalledBins) {
      await fs.access(path.join(dataDir, "node_modules", relativePath));
    }

    const recoveryInstall = await ensureDependencies({
      pluginRoot: fixturePluginDir,
      dataDir,
      npmCommand,
      env: successEnv,
    });
    assert.equal(recoveryInstall.installed, true);
    assert.equal(await readInstallCount(stateDir), 2);
    assert.equal(
      await readFileUtf8(path.join(dataDir, "package.json")),
      await readFileUtf8(path.join(fixturePluginDir, "package.json")),
    );
    assert.equal(
      await readFileUtf8(path.join(dataDir, "package-lock.json")),
      await readFileUtf8(path.join(fixturePluginDir, "package-lock.json")),
    );

    for (const relativePath of expectedInstalledBins) {
      await fs.access(path.join(dataDir, "node_modules", relativePath));
    }
  });
}

async function validateFreshInstallFailureCleanup() {
  await withTempDir(async (tempDir) => {
    const fixturePluginDir = path.join(tempDir, "plugin-root");
    const dataDir = path.join(tempDir, "plugin-data");
    const stateDir = path.join(tempDir, "state");
    const fakeNpmScript = path.join(tempDir, "fake-npm.cjs");

    await copyPluginManifests(fixturePluginDir);
    await writeFakeNpmScript(fakeNpmScript);

    await assert.rejects(
      ensureDependencies({
        pluginRoot: fixturePluginDir,
        dataDir,
        npmCommand: [process.execPath, fakeNpmScript],
        env: {
          ...process.env,
          FAKE_NPM_FAIL: "1",
          FAKE_NPM_STATE_DIR: stateDir,
        },
      }),
      /simulated npm failure/,
    );

    for (const manifestFile of MANIFEST_FILES) {
      await assert.rejects(fs.access(path.join(dataDir, manifestFile)));
    }
    await assert.rejects(fs.access(path.join(dataDir, "node_modules")));
  });
}

async function validatePackageManifests() {
  const packageJson = await readJson(path.join(pluginDir, "package.json"));
  const packageLockJson = await readJson(path.join(pluginDir, "package-lock.json"));

  assert.equal(packageJson.dependencies["@zed-industries/vscode-langservers-extracted"], "4.10.7");
  assert.equal(packageJson.dependencies["vscode-langservers-extracted"], "4.10.0");
  assert.equal(packageLockJson.packages[""].dependencies["@zed-industries/vscode-langservers-extracted"], "4.10.7");
  assert.equal(packageLockJson.packages[""].dependencies["vscode-langservers-extracted"], "4.10.0");
}

async function main() {
  await validateHookScript();
  await validateLspConfig();
  await validatePackageManifests();
  await validateInstallFlow();
  await validateUpgradeFailurePreservesExistingInstall();
  await validateFreshInstallFailureCleanup();
  console.log("vscode-langservers validation passed.");
}

main().catch((error) => {
  console.error(`validate-vscode-langservers failed: ${error.message}`);
  process.exitCode = 1;
});
