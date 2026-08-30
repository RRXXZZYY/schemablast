# Agent instructions

- Keep compatibility rules deterministic and documented.
- Never imply that inferred lineage is exact; 0.1 accepts explicit edges only.
- Bound graph input before traversal and handle cycles safely.
- Reports must use relative source labels and escaped snapshot content.
- Add fixtures for every new rule and propagation boundary.
