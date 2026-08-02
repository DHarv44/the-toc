// The builder restores its session (bounds, settings, camera) at MODULE
// EVALUATION — before any host can possibly call configureBuilder, since
// configureBuilder is exported from the same package being evaluated. In TOC
// that means the restore reads the package-default key
// ('terrain-builder.session') while every runtime write lands under our
// prefix ('toc.terrain.session'): work saves into a key the restore never
// reads, and whatever the default key froze on replays forever.
//
// Until Groundwork defers its restore behind its own "configure before
// mount" contract, mirror our session over the default key BEFORE the
// package evaluates — this module is imported ahead of it in MapEditor, and
// ES modules evaluate imports in order.
try {
  const ours = localStorage.getItem('toc.terrain.session')
  if (ours != null) localStorage.setItem('terrain-builder.session', ours)
} catch { /* storage disabled — the builder tolerates it too */ }

export {}
