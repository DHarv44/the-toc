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
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '../../domains/comms/radio'

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
    win.document.body.style.margin = '0'
    win.document.body.style.background = '#0a0e12'
    win.document.body.style.overflow = 'hidden'
    const mount = win.document.createElement('div')
    mount.style.cssText = 'position:fixed;inset:0'
    win.document.body.appendChild(mount)
    setHost(mount)

    // BOTH DIRECTIONS. The window closing must tell the component, or the panel
    // that popped the content out keeps believing it is still out there.
    const onUnload = () => closed.current()
    win.addEventListener('beforeunload', onUnload)
    // and if the OPENER goes away, its children should not outlive it as
    // orphaned windows pointed at a dead context
    const onOpenerGone = () => win.close()
    window.addEventListener('beforeunload', onOpenerGone)

    return () => {
      stop()
      win.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('beforeunload', onOpenerGone)
      win.close()
      winRef.current = null
    }
  }, [])

  useEffect(() => {
    if (winRef.current) winRef.current.document.title = title
  }, [title])

  return host ? createPortal(children, host) : null
}
