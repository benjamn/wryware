# @wry/supertext

Generalized replacement for `@wry/context`, representing computational context
as a directed acyclic graph of branchable/mergeable `Supertext` objects, which
opaquely contain any number of individual `Subtext` objects, each granting
immutable access to a single contextual value.
