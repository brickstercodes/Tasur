# Tasur Documentation

Welcome to the Tasur codebase documentation. This follows the [Divio documentation system](https://documentation.divio.com/) — content is organised by what the reader needs to _do_, not by what the code _is_.

---

## Contents

| Doc                                            | Type        | Purpose                                      |
| ---------------------------------------------- | ----------- | -------------------------------------------- |
| [01-quickstart.md](01-quickstart.md)           | How-to      | Get Tasur running locally in under 5 minutes |
| [10-architecture.md](10-architecture.md)       | Explanation | How the system is designed and why           |
| [99-troubleshooting.md](99-troubleshooting.md) | Reference   | Common dev setup issues and fixes            |
| [adr/](adr/)                                   | Reference   | Architecture Decision Records                |

---

## Planning documents

The three planning documents live outside the repo and define the product scope:

- `01_Tasur_Product_Vision.md` — The problem, solution, target user, and core thesis
- `02_Tasur_Feature_Breakdown.md` — Feature list by version (v0.1 → v1.0 → v2.0+)
- `03_Tasur_System_Architecture.md` — Dual-path agent system, graph design, DB schema, prompts

---

## Quick links

- [ADR-0001: Dual-Path Agent Framework](adr/ADR-0001-dual-path-agent-framework.md)
- [ADR-0002: In-Memory Graph Storage](adr/ADR-0002-in-memory-graph-storage.md)
- [CHANGELOG](../CHANGELOG.md)
