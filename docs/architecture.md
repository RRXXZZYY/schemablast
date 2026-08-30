# Architecture

```text
before snapshot ─┐
                 ├──► deterministic contract diff ──► findings
after snapshot ──┘                                      │
                                                       ▼
explicit graph union ──► field-aware BFS ──► shortest impact paths + owners
                                                       │
                                                       ▼
                                  terminal / JSON / SARIF / standalone HTML
```

Both snapshots are independently validated. Dataset changes are stable-sorted
and receive a 16-character SHA-256-derived ID from rule, dataset, and field.
This makes SARIF fingerprints and impact references deterministic.

Traversal uses a union of before and after graphs so removed and newly declared
consumer paths remain visible. Each change has its own visited set, making
cycles safe and preserving the first shortest path. The first hop honors column
filters; later hops propagate conservatively.

HTML receives only the finished report, escapes every string, and embeds JSON
with `<` Unicode-escaped. It contains no remote scripts, styles, fonts, or
images.
