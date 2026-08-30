# Positioning

| Tool shape | Answers | SchemaBlast difference |
|---|---|---|
| Schema diff | What changed? | Adds consumer paths and owners |
| Data catalog | What assets exist? | Pull-request-sized deterministic check |
| Lineage UI | What depends on this node? | Couples paths to exact contract findings |
| Data quality monitor | Did values violate expectations? | Static pre-merge compatibility |
| SchemaBlast | Who may be affected by this change, and why? | Portable snapshot + CI + visual report |

The distribution hook is the review route: a maintainer can attach one visual
report that names a breaking field, shows the shortest path to each affected
asset, and lists the owners to involve. It does not require a hosted catalog or
access to production metadata.
