// How the selected units arrange themselves on the ground. Mixed selections
// read as MIXED and any pick puts all of them into the same formation, which is
// what "3rd platoon, wedge" means when it goes out over the net.
import { Button, Divider, Menu, Text } from '@mantine/core'
import type { Unit } from '../../engine/GameState'
import { FORMATION, FORMATIONS, formOf } from '../../domains/forces/elements'
import { orderFormation } from '../../domains/forces/orders'

export default function FormSelect({ units }: { units: Unit[] }) {
  const forms = new Set(units.map(formOf))
  const cur = forms.size === 1 ? FORMATION[[...forms][0]!] : null
  return (
    <Menu shadow="md" width={280} position="top-start" withArrow={false}>
      <Menu.Target>
        <Button size="compact-xs" variant={cur?.key === 'wedge' ? 'default' : 'filled'}
          styles={{ label: { fontSize: 9.5, letterSpacing: 0.5 } }}>
          {cur ? cur.label : 'MIXED'} ▾
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {FORMATIONS.map((f, i) => (
          <div key={f.key}>
            {/* the two halt postures are a different kind of order from the
                five march formations above them — a stopped element covering
                its ground, not a way of getting somewhere */}
            {f.halt && !FORMATIONS[i - 1]?.halt && (
              <Divider my={3} label={<Text fz={8} c="dark.3" fw={700}>AT THE HALT</Text>} />
            )}
            <Menu.Item onClick={() => units.forEach(u => orderFormation(u.id, f.key))}
              style={{ background: f.key === cur?.key ? 'var(--mantine-color-toc-8)' : undefined }}>
              <Text fz={10} fw={f.key === cur?.key ? 700 : 400}>{f.label}</Text>
              <Text fz={8.5} c="dark.3">{f.hint}</Text>
            </Menu.Item>
          </div>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
