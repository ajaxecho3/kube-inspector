# kube-inspector

A Node.js TUI for inspecting and monitoring Kubernetes clusters in real-time.

## Features

- Live watch of Pods, Deployments, Services, Namespaces, Nodes, and Events
- Color-coded health status (🟢 green / 🟡 yellow / 🔴 red)
- Per-tab resource counts and critical indicators in the tab bar
- Status summary bar showing total / critical / degraded / healthy counts
- Pop-up alerts on critical resource state transitions (auto-dismiss 5s, queue counter for multiple)
- Pod detail view with live log streaming and multi-pod log comparison
- Context switching with `/` search filter without leaving the terminal
- Safe opt-in mutation support with mandatory confirmation and audit log
- Adaptive column widths that scale with terminal size
- Loading spinner and scroll progress indicator
- Context-aware footer hints that change based on active view

### Pod Log Features

- **Log level filtering** — cycle through ALL / ERROR / WARN / INFO with `l`; lines are color-coded (red / yellow / cyan) regardless of active filter
- **Regex search** — toggle regex mode with `r` before or during `/` search; invalid patterns degrade gracefully
- **Timestamp toggle** — `t` shows or hides the RFC3339 timestamp prefix without restarting the stream
- **Line wrap toggle** — `w` switches between truncate and full-wrap mode
- **Tail size control** — `+` / `-` cycles the initial fetch window (50 / 100 / 200 / 500 lines)
- **Since filter** — `s` cycles recency filters: all / last 5 m / 15 m / 1 h
- **Previous container logs** — `p` streams logs from the last-terminated container instance (crash-loop debugging)
- **Dynamic height** — log panes in multi-pod view expand to fill the terminal rather than using a fixed line count

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
| `Space`        | Select pod (for multi-pod log view)  |
| `/`            | Search / filter rows                 |
| `c`            | Switch kubeconfig context            |
| `Esc`          | Dismiss alert / close detail / clear search |
| `q` / `Ctrl+C` | Quit                                 |

### Pod Log View

| Key         | Action                                                   |
| ----------- | -------------------------------------------------------- |
| `↑` / `↓`  | Scroll log                                               |
| `g` / `G`  | Jump to top / bottom                                     |
| `f`         | Toggle follow mode                                       |
| `/`         | Search log lines                                         |
| `r`         | Toggle regex search mode                                 |
| `l`         | Cycle log level filter (ALL → ERROR → WARN → INFO)       |
| `t`         | Toggle timestamp display                                 |
| `w`         | Toggle line wrap                                         |
| `s`         | Cycle since filter (all → 5 m → 15 m → 1 h)             |
| `p`         | Toggle previous container logs (crash-loop debugging)    |
| `+` / `-`   | Increase / decrease initial tail size (50/100/200/500)   |
| `[` / `]`  | Switch active container                                  |
| `m`         | Toggle split-pane view (multi-container pods)            |
| `Esc`       | Close detail view                                        |

### Multi-pod Log View

| Key              | Action                                    |
| ---------------- | ----------------------------------------- |
| `←` / `→` / `h` / `l` | Move focus between pod panes        |
| `↑` / `↓`        | Scroll focused pane                       |
| `L` (Shift+L)    | Cycle log level filter across all panes   |
| `Esc`            | Return to resource table                  |

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
npm test           # Run all tests (43 tests, 9 files)
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
│   ├── useLogStream.ts    # Streams pod logs into a ring buffer (last 500 lines); supports timestamps, previous, sinceSeconds, tailLines
│   └── useAlerts.ts       # Derives alerts from critical state transitions
├── components/
│   ├── ResourceTable.tsx  # Scrollable table with search, adaptive columns, spinner, progress bar
│   ├── StatusBadge.tsx    # Color-coded ● health indicator
│   ├── NavTabs.tsx        # Tab bar with resource count badges and critical indicators
│   ├── AlertBanner.tsx    # Critical alert banner with queue counter, auto-dismisses after 5s
│   ├── ConfirmModal.tsx   # Mutation confirmation overlay — never self-triggers
│   ├── ContextSwitcher.tsx# Kubeconfig context switcher with / search filter
│   ├── PodDetail.tsx      # Pod detail: container statuses + full-featured log view
│   ├── SplitLogView.tsx   # Side-by-side log comparison for multi-container pods
│   └── MultiPodLogView.tsx# Multi-pod log view for 2+ selected pods; dynamic height
└── utils/
    ├── health.ts          # Pure functions: classify resource health
    ├── format.ts          # Pure functions: format age/durations
    ├── logLevel.ts        # Shared log level types, keywords, color, filter helpers
    └── mutate.ts          # Only file that calls k8s write APIs — always audits
```
