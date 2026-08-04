// THE BOUNDARY — a render throw inside a tool blanks the screen, and the
// author's unsaved document goes with it.
//
// The scenario builder's own dogfood log opened with this: one bad keystroke
// in a mission name threw, and because nothing caught it the whole app went
// white with an hour of unsaved authoring inside. React unmounts the entire
// tree on an uncaught error by design; the only cure is a boundary.
//
// This one is deliberately plain. It says what threw, and it offers the two
// things that are actually useful: go back to whatever screen you came from
// (the tool's own exit path, which is still valid — the crash was in the
// tool's RENDER, not in the app), or reload. It does not try to recover the
// document, because it cannot honestly promise the state that produced the
// throw is worth resuming.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Group, Text } from '@mantine/core'

const MONO = 'Consolas, monospace'

interface Props {
  children: ReactNode
  /** what crashed, for the heading — 'SCENARIO BUILDER' */
  what: string
  /** the tool's own exit; absent = reload is the only way out */
  onExit?: () => void
}

interface State { err: Error | null; stack: string | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null, stack: null }

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // the component stack is what actually locates the bug; console it in
    // full rather than truncating it into the panel
    console.error(`${this.props.what} crashed`, err, info.componentStack)
    this.setState({ stack: info.componentStack ?? null })
  }

  render() {
    const { err } = this.state
    if (!err) return this.props.children
    return (
      <Box pos="fixed" inset={0} bg="#05080b" style={{
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, padding: 40,
      }}>
        <Box maw={720}>
          <Text fz={26} fw={700} c="#e8524a" style={{ letterSpacing: 3 }}>
            {this.props.what} CRASHED
          </Text>
          <Text fz={15} c="#9ab8d0" mt={8}>
            A render threw and this tool stopped. Anything unsaved is gone —
            the details are in the browser console.
          </Text>
          <Box mt={16} p={12} style={{
            border: '1px solid #3a2530', borderRadius: 3, background: 'rgba(30,14,18,0.6)',
          }}>
            <Text fz={15} c="#ffb0a8" style={{ whiteSpace: 'pre-wrap' }}>
              {err.message || String(err)}
            </Text>
          </Box>
          <Group gap={8} mt={20}>
            {this.props.onExit && (
              <Button size="sm" variant="default" onClick={this.props.onExit}>
                ◀ BACK TO THE MENU
              </Button>
            )}
            <Button size="sm" variant="default" onClick={() => window.location.reload()}>
              RELOAD
            </Button>
          </Group>
        </Box>
      </Box>
    )
  }
}
