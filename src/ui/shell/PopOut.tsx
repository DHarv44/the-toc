// A SECOND SCREEN, FOR PEOPLE WHO HAVE ONE.
//
// CONSOLE.md step 5. A real operations centre is several screens: the COP on
// the wall, the feed on a monitor, a staff board on somebody's laptop. One
// browser viewport cannot be that, and it should not pretend to — but a second
// WINDOW can, and it costs almost nothing.
//
// WHY window.open AND NOT A TAB. A tab that is not the active tab in its window
// is `document.hidden`: its timers throttle to about 1 Hz and requestAnimationFrame
// stops entirely. Three of four map tabs would be frozen pictures. A separate
// window is visible, so it is not throttled — and it SHARES THE JS CONTEXT with
// the opener, which is the part that matters: same `S`, same zustand store, no
// serialisation, no sync layer, no second copy of the world to keep honest.
//
// Everything here is the plumbing that makes a React subtree render into that
// other document: the styles have to be carried across (Vite injects them into
// the opener's head, and a bare popup would render unstyled), and the window's
// lifetime has to be tied to the component's in BOTH directions — the component
// closes the window when it unmounts, and the window tells the component when
// the user closes it.
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { toast } from '../../domains/comms/radio'

/** WHICH DOCUMENT AM I IN?
 *
 *  A portalled overlay — a menu, a tooltip, a modal — mounts itself into
 *  `document.body`, and inside a popped-out window `document` is still the
 *  OPENER'S: the React tree renders through a portal but the code is running in
 *  the original context. So a dropdown opened on the second screen appeared on
 *  the first one, next to nothing, while the button that opened it sat there
 *  looking broken.
 *
 *  Every popped-out subtree gets the document it is actually drawn in, and
 *  anything that portals asks for it. */
const PopoutDoc = createContext<Document | null>(null)

/** Spread into a Mantine overlay's `portalProps`. Undefined in the main window,
 *  which is exactly right — the default target is already correct there. */
export function usePortalTarget(): { target: HTMLElement } | undefined {
  const doc = useContext(PopoutDoc)
  return doc ? { target: doc.body } : undefined
}

/** Copy the opener's stylesheets into the popup, and keep copying: Vite adds a
 *  <style> for every hot update, so a window opened before an edit would slowly
 *  lose its styling as the session went on. */
function adoptStyles(doc: Document): () => void {
  const copy = () => {
    for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
      const id = node.getAttribute('data-popout-id') ?? String(Math.random())
      node.setAttribute('data-popout-id', id)
      if (doc.querySelector(`[data-popout-id="${id}"]`)) continue
      doc.head.appendChild(node.cloneNode(true))
    }
  }
  copy()
  const obs = new MutationObserver(copy)
  obs.observe(document.head, { childList: true })
  return () => obs.disconnect()
}

export default function PopOut({ title, w = 720, h = 460, onClose, children }: {
  title: string
  w?: number
  h?: number
  /** the window is gone — whoever opened it owns putting the content back */
  onClose: () => void
  children: React.ReactNode
}) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  // held so the cleanup closes the window the effect opened, not whatever the
  // ref happens to point at later
  const winRef = useRef<Window | null>(null)
  // the LATEST onClose without re-opening the window when it changes identity
  const closed = useRef(onClose)
  closed.current = onClose

  useEffect(() => {
    const win = window.open('', '', `popup=yes,width=${w},height=${h}`)
    // BLOCKED. Some browsers refuse window.open outright, and embedded webviews
    // refuse it always. Put the content back where it was and SAY SO — a pop-out
    // button that quietly does nothing is worse than one that is not there.
    if (!win) {
      toast('POP-OUT BLOCKED — ALLOW POPUPS FOR THIS SITE')
      closed.current()
      return
    }
    winRef.current = win
    win.document.title = title
    const stop = adoptStyles(win.document)
    // Mantine hangs its colour scheme off the root element, and its CSS
    // variables are scoped to it — without this the popup renders in the
    // library's light default inside a console that is entirely dark
    for (const a of Array.from(document.documentElement.attributes)) {
      win.document.documentElement.setAttribute(a.name, a.value)
    }
    // the popup's own document arrives with the agent's default margin and a
    // white background, which is a bright rectangle in a dark console
    // every new document gets asked for an icon by the browser, and this app
    // ships none — an empty data URI answers it instead of a 404 per window
    const icon = win.document.createElement('link')
    icon.rel = 'icon'
    icon.href = 'data:,'
    win.document.head.appendChild(icon)
    win.document.body.style.margin = '0'
    win.document.body.style.background = '#0a0e12'
    win.document.body.style.overflow = 'hidden'
    const mount = win.document.createElement('div')
    mount.style.cssText = 'position:fixed;inset:0'
    win.document.body.appendChild(mount)
    setHost(mount)

    // BOTH DIRECTIONS, AND THE ORDER IS THE WHOLE BUG.
    //
    // A popped-out feed is a WebGL view: an @react-three/fiber canvas with a
    // live GPU context and a render loop. When the user closes that window the
    // browser destroys its document — and if React is still holding the canvas
    // at that moment, the renderer and its context are torn down underneath it
    // and the whole PAGE goes with it (STATUS_ACCESS_VIOLATION, which is the
    // renderer process dying, not an exception you can catch).
    //
    // So the subtree is unmounted SYNCHRONOUSLY while the document is still
    // alive. flushSync forces React to run the cleanup now — cancelling the
    // loop, disposing the renderer, releasing the context in the proper order —
    // rather than scheduling it for a document that will not exist.
    const onUnload = () => {
      // 0. KILL THE GPU CONTEXTS BEFORE ANYTHING ELSE.
      //
      //    This is the whole crash. A 2D canvas is memory the page owns and
      //    dies harmlessly with its document; a WebGL context is a GPU-process
      //    resource with a compositor surface behind it, and letting the
      //    document take it down uninvited is a use-after-free over there —
      //    STATUS_ACCESS_VIOLATION, the renderer dying, nothing catchable.
      //
      //    Unmounting React first was not enough, because the release still
      //    went through three.js and the scheduler and landed after the
      //    document was gone. WEBGL_lose_context is the one call that takes
      //    the context away NOW, synchronously, while its document is still
      //    standing. Everything downstream then finds a lost context, which is
      //    a case three.js already knows how to survive.
      for (const cv of Array.from(win.document.querySelectorAll('canvas'))) {
        // getContext returns the EXISTING context — this does not create one,
        // and a 2D canvas simply answers null to both
        const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGLRenderingContext | null
        gl?.getExtension('WEBGL_lose_context')?.loseContext()
      }
      // 1. then let go of the dying document, synchronously
      flushSync(() => setHost(null))
      // 2. and put the content back on the NEXT task, not in this handler.
      //    Doing it here rebuilt the feed — a second WebGL context — in the
      //    console while this window was still unloading, and that race is what
      //    took the page down: it came back, then everything died.
      setTimeout(() => closed.current(), 0)
    }
    // pagehide as well: beforeunload does not fire on every close path, and a
    // missed unmount here is a crash rather than a leak
    win.addEventListener('beforeunload', onUnload)
    win.addEventListener('pagehide', onUnload)
    // and if the OPENER goes away, its children should not outlive it as
    // orphaned windows pointed at a dead context
    const onOpenerGone = () => win.close()
    window.addEventListener('beforeunload', onOpenerGone)

    return () => {
      stop()
      win.removeEventListener('beforeunload', onUnload)
      win.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onOpenerGone)
      // SAME ORDERING FROM THE OTHER SIDE. When the component unmounts, React
      // is mid-commit and the portal's children may not have released their GPU
      // context yet; closing the window inside that commit destroys the document
      // out from under them. A task boundary lets the unmount finish first.
      setTimeout(() => win.close(), 0)
      winRef.current = null
    }
  }, [])

  useEffect(() => {
    if (winRef.current) winRef.current.document.title = title
  }, [title])

  return host
    ? createPortal(
      <PopoutDoc.Provider value={host.ownerDocument}>{children}</PopoutDoc.Provider>,
      host)
    : null
}
