#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const MANIFEST_FILES = ["package.json", "package-lock.json"];
const STAGING_DIR_NAME = ".install-staging";

function defaultNpmCommand() {
  return [process.platform === "win32" ? "npm.cmd" : "npm"];
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function filesMatch(sourcePath, targetPath) {
  const [sourceContents, targetContents] = await Promise.all([
    readFileIfExists(sourcePath),
    readFileIfExists(targetPath),
  ]);

  return sourceContents !== null &&
    targetContents !== null &&
    sourceContents.equals(targetContents);
}

async function shouldInstall(pluginRoot, dataDir) {
  const nodeModulesPath = path.join(dataDir, "node_modules");
  if (!(await fileExists(nodeModulesPath))) {
    return true;
  }

  for (const manifestFile of MANIFEST_FILES) {
    const matches = await filesMatch(
      path.join(pluginRoot, manifestFile),
      path.join(dataDir, manifestFile),
    );
    if (!matches) {
      return true;
    }
  }

  return false;
}

async function runCommand(commandSpec, args, options) {
  const [command, ...commandArgs] = Array.isArray(commandSpec)
    ? commandSpec
    : [commandSpec];

  return await new Promise((resolve, reject) => {
    const child = spawn(
      command,
      [...commandArgs, ...args],
      {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            `Could not find ${command}. Install Node.js with npm available on PATH.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      reject(
        new Error(
          `Command failed (${[command, ...commandArgs, ...args].join(" ")}): ${output}`,
        ),
      );
    });
  });
}

async function copyManifests(sourceDir, targetDir) {
  await Promise.all(
    MANIFEST_FILES.map((manifestFile) =>
      fs.copyFile(
        path.join(sourceDir, manifestFile),
        path.join(targetDir, manifestFile),
      )),
  );
}

export async function ensureDependencies({
  pluginRoot = process.env.CLAUDE_PLUGIN_ROOT,
  dataDir = process.env.CLAUDE_PLUGIN_DATA,
  npmCommand = defaultNpmCommand(),
  env = process.env,
} = {}) {
  if (!pluginRoot) {
    throw new Error("CLAUDE_PLUGIN_ROOT is required");
  }
  if (!dataDir) {
    throw new Error("CLAUDE_PLUGIN_DATA is required");
  }

  await fs.mkdir(dataDir, { recursive: true });

  if (!(await shouldInstall(pluginRoot, dataDir))) {
    return { installed: false };
  }

  const stagingDir = path.join(dataDir, STAGING_DIR_NAME);
  const stagingNodeModulesPath = path.join(stagingDir, "node_modules");
  const targetNodeModulesPath = path.join(dataDir, "node_modules");

  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    await copyManifests(pluginRoot, stagingDir);
    await runCommand(
      npmCommand,
      ["ci", "--omit=dev", "--ignore-scripts"],
      {
        cwd: stagingDir,
        env,
      },
    );

    await fs.rm(targetNodeModulesPath, { recursive: true, force: true });
    await fs.rename(stagingNodeModulesPath, targetNodeModulesPath);
    await copyManifests(stagingDir, dataDir);
  } catch (error) {
    throw error;
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }

  return { installed: true };
}

async function main() {
  const result = await ensureDependencies();
  if (result.installed) {
    console.log("Installed vscode-langservers plugin dependencies.");
  } else {
    console.log("vscode-langservers plugin dependencies are up to date.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`install-deps failed: ${error.message}`);
    process.exitCode = 1;
  });
}
