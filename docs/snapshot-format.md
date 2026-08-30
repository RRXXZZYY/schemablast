# Snapshot format 1.0

A snapshot is one explicit graph. `nodes` carry contract and ownership data;
`edges` carry lineage. Node IDs and owner strings are opaque identifiers, not
URLs, paths, or executable expressions.

Dataset fields require a string `type` and boolean `nullable`. Optional `enum`
values are set-like strings; ordering does not affect compatibility. Primary
key ordering does affect compatibility and every primary-key field must exist.

An edge is `{ from, to, fields? }`. Both node IDs must exist in the same
snapshot. Omit `fields` when the consumer's column selection is unknown or the
source is not a dataset. Keeping a reference to a removed field is allowed so a
candidate snapshot can expose the very migration work SchemaBlast is meant to
route.

Input bounds:

- 10 MiB encoded JSON;
- 5,000 nodes;
- 10,000 edges;
- 100,000 declared fields;
- strings are bounded and reject ASCII control characters.
