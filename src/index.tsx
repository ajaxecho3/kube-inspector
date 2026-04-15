import React from "react";
import { render } from "ink";
import { App } from "./App.js";

const args = process.argv.slice(2);
const mutationsEnabled = args.includes("--enable-mutations");
const maxReplicasArg = args.find((a) => a.startsWith("--max-replicas="));
const maxReplicas = maxReplicasArg
  ? parseInt(maxReplicasArg.split("=")[1], 10)
  : 20;

render(<App mutationsEnabled={mutationsEnabled} maxReplicas={maxReplicas} />);
