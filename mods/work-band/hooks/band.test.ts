import { expect, test } from 'claude-code/testing'

import { SURFACES, band, world } from './test-world'

for (const surface of SURFACES) {
  test(`${surface}: with nothing to show the band stays empty`, async ($, on) => {
    world(on)
    expect(await band($, surface)).toBeNull()
  })
}
