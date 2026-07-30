import React from "react";
import { render } from "ink";
import { App } from "./App.js";

const args = process.argv.slice(2);
const mutationsEnabled = args.includes("--enable-mutations");
const maxReplicasArg = args.find((a) => a.startsWith("--max-replicas="));
const maxReplicas = maxReplicasArg
  ? parseInt(maxReplicasArg.split("=")[1], 10)
  : 20;

// Run in the terminal's alternate screen buffer (same trick vim/htop/less
// use) so the app gets its own blank canvas — scrolling never reveals prior
// shell history while it's running, and the original screen contents are
// restored exactly as they were once it exits.
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const isInteractive = Boolean(process.stdout.isTTY);
let screenRestored = false;

function restoreScreen(): void {
  if (screenRestored || !isInteractive) return;
  screenRestored = true;
  process.stdout.write(EXIT_ALT_SCREEN);
}

if (isInteractive) {
  process.stdout.write(ENTER_ALT_SCREEN);
  // Last-resort safety net for crashes / SIGTERM — synchronous, always fires.
  process.on("exit", restoreScreen);
}

const instance = render(
  <App mutationsEnabled={mutationsEnabled} maxReplicas={maxReplicas} />,
);

instance.waitUntilExit().then(restoreScreen);
