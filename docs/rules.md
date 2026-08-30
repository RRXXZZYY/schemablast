# Compatibility rules

SchemaBlast compares dataset nodes from a consumer-compatibility perspective.
An error means an existing downstream reader may no longer understand the
contract. A note records a change that is compatible under the narrow 0.1
model. Rules do not replace a database migration plan.

## Breaking changes

- `SB001`: the dataset node no longer exists.
- `SB002`: a previously available field no longer exists.
- `SB003`: a type name changed, except `integer` to `number`.
- `SB004`: a field that was never null can now be null.
- `SB005`: an enum becomes bounded or loses any previously allowed value.
- `SB009`: the ordered primary-key field list changes.

Each breaking finding starts traversal at its dataset. A field finding follows
only outgoing edges whose empty/absent field filter means “all fields” or whose
field list contains the changed field. Dataset- and primary-key-level findings
follow every outgoing edge.

## Informational changes

- `integer → number` numeric widening.
- nullable to non-nullable.
- enum values added or enum restriction removed.
- field or dataset added.
- dataset owner changed.

Informational changes do not generate a blast radius in 0.1. Owner changes are
still visible so repository metadata can stay current.
