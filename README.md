# kube-inspector

A Node.js TUI for inspecting and monitoring Kubernetes clusters in real-time.

## Features

- Live watch of Pods, Deployments, Services, Namespaces, Nodes, and Events
- Color-coded health status (🟢 green / 🟡 yellow / 🔴 red)
- Pop-up alerts on critical resource state transitions (auto-dismiss 5s)
- Pod detail view with live log streaming
- Context switching without leaving the terminal
- Safe opt-in mutation support with mandatory confirmation and audit log

## Requirements

- Node.js 20+
- A valid `~/.kube/config` with at least one context

## Usage

```bash
npm install

# Read-only mode (default)
npm start

# With mutations enabled
npm start -- --enable-mutations

# Custom max replica cap (default: 20)
npm start -- --enable-mutations --max-replicas=10
```

## Keyboard Controls

| Key            | Action                               |
| -------------- | ------------------------------------ |
| `Tab`          | Switch to next resource tab          |
| `↑` / `↓`      | Navigate rows                        |
| `Enter`        | Open detail view (pod logs for pods) |
| `c`            | Switch kubeconfig context            |
| `Esc`          | Dismiss alert / close detail view    |
| `q` / `Ctrl+C` | Quit                                 |

### Mutations (requires `--enable-mutations`)

| Key       | Action                                      |
| --------- | ------------------------------------------- |
| `d`       | Delete selected pod, deployment, or service |
| `Shift+D` | Force-delete stuck pod (grace period = 0)   |
| `Shift+R` | Rollout restart selected deployment         |
| `s`       | Scale selected deployment                   |

## Safety — Mutations Mode

All mutations require explicit `y` confirmation. No action is ever triggered automatically.

- Protected namespaces (`prod`, `production`, `kube-system`) show a red `[PRODUCTION]` warning on the confirmation dialog
- `kube-system` resources cannot be mutated regardless of flags
- Scale is capped at 20 replicas by default (override with `--max-replicas=N`)
- Every mutation attempt is appended to `~/.kube-inspector/audit.log` with timestamp, action, resource, namespace, and result

## Development

```bash
npm test           # Run all tests (34 tests, 9 files)
npm run test:watch # Watch mode
npm run build      # Compile TypeScript to dist/
```

## Project Structure

```
src/
├── index.tsx              # CLI entry — parses args, renders App
├── App.tsx                # Root component — state, routing, key bindings
├── hooks/
│   ├── useKubeClient.ts   # Loads kubeconfig, exposes context switching
│   ├── useResources.ts    # Watch-based live resource state (reconnects on disconnect)
│   ├── useLogStream.ts    # Streams pod logs into a ring buffer (last 500 lines)
│   └── useAlerts.ts       # Derives alerts from critical state transitions
├── components/
│   ├── ResourceTable.tsx  # Scrollable, keyboard-navigable resource table
│   ├── StatusBadge.tsx    # Color-coded ● health indicator
│   ├── NavTabs.tsx        # Tab bar: Pods | Deployments | Services | Namespaces | Nodes | Events
│   ├── AlertBanner.tsx    # Slide-in critical alert, auto-dismisses after 5s
│   ├── ConfirmModal.tsx   # Mutation confirmation overlay — never self-triggers
│   ├── ContextSwitcher.tsx# Kubeconfig context switcher overlay
│   └── PodDetail.tsx      # Pod detail: container statuses + live logs
└── utils/
    ├── health.ts          # Pure functions: classify resource health
    ├── format.ts          # Pure functions: format age/durations
    └── mutate.ts          # Only file that calls k8s write APIs — always audits
```
