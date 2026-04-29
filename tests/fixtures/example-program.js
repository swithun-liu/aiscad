export const EXAMPLE_PROGRAM = {
  dsl: 'aiscad.dsl',
  version: '1.0.0',
  units: 'mm',
  precision: {
    eps: 0.001,
    segments: 48,
  },
  actions: [
    {
      id: 'plate',
      action: 'solid.box',
      params: {
        size: [120, 80, 10],
        center: [0, 0, 0],
      },
    },
    {
      id: 'hole',
      action: 'solid.cylinder',
      params: {
        height: 16,
        radius: 3,
        center: [0, 0, 0],
      },
    },
    {
      id: 'holes',
      action: 'pattern.grid',
      params: {
        source: 'hole',
        count: [2, 2, 1],
        step: [100, 60, 0],
        origin: [-50, -30, 0],
      },
    },
    {
      id: 'body',
      action: 'boolean.subtract',
      params: {
        base: 'plate',
        tools: ['holes'],
      },
    },
    {
      id: 'preview',
      action: 'display.color',
      params: {
        source: 'body',
        rgba: [0.19, 0.47, 0.98, 1],
      },
    },
  ],
  result: 'preview',
}

export function cloneExampleProgram() {
  return structuredClone(EXAMPLE_PROGRAM)
}
