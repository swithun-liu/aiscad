export const VISUAL_TEST_CASES = [
  {
    id: 'servo-mount-bracket',
    name: '伺服安装支架',
    description: '带底板安装孔、竖向安装面和双加强肋的工业安装支架。',
    program: {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      precision: {
        eps: 0.001,
        segments: 48,
      },
      actions: [
        {
          id: 'base',
          action: 'solid.box',
          params: {
            size: [140, 80, 12],
            center: [0, 0, 6],
          },
        },
        {
          id: 'wall',
          action: 'solid.box',
          params: {
            size: [12, 80, 70],
            center: [-64, 0, 47],
          },
        },
        {
          id: 'rib_left',
          action: 'solid.box',
          params: {
            size: [36, 12, 50],
            center: [-40, -22, 37],
          },
        },
        {
          id: 'rib_right',
          action: 'solid.box',
          params: {
            size: [36, 12, 50],
            center: [-40, 22, 37],
          },
        },
        {
          id: 'mount_hole',
          action: 'solid.cylinder',
          params: {
            height: 20,
            radius: 4,
            center: [0, 0, 6],
          },
        },
        {
          id: 'mount_holes',
          action: 'pattern.grid',
          params: {
            source: 'mount_hole',
            count: [2, 2, 1],
            step: [92, 44, 0],
            origin: [-46, -22, 0],
          },
        },
        {
          id: 'wall_hole_raw',
          action: 'solid.cylinder',
          params: {
            height: 20,
            radius: 6,
            center: [0, 0, 0],
          },
        },
        {
          id: 'wall_hole_axis',
          action: 'transform.rotate',
          params: {
            source: 'wall_hole_raw',
            angles: [0, 90, 0],
          },
        },
        {
          id: 'wall_holes',
          action: 'pattern.linear',
          params: {
            source: 'wall_hole_axis',
            count: 2,
            step: [0, 34, 0],
            origin: [-64, -17, 45],
          },
        },
        {
          id: 'bracket_blank',
          action: 'boolean.union',
          params: {
            sources: ['base', 'wall', 'rib_left', 'rib_right'],
          },
        },
        {
          id: 'body',
          action: 'boolean.subtract',
          params: {
            base: 'bracket_blank',
            tools: ['mount_holes', 'wall_holes'],
          },
        },
        {
          id: 'preview',
          action: 'display.color',
          params: {
            source: 'body',
            rgba: [0.38, 0.6, 0.96, 1],
          },
        },
      ],
      result: 'preview',
    },
    expect: {
      resultKinds: ['geom3'],
      bboxSize: [140, 80, 82],
      bboxTolerance: 0.001,
      volumeRange: [238000, 240000],
      color: [0.38, 0.6, 0.96, 1],
      renderableCount: 1,
    },
  },
  {
    id: 'bearing-flange',
    name: '轴承法兰盘',
    description: '带中心轴孔和六孔螺栓圆的法兰盘，模拟工业法兰连接件。',
    program: {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      precision: {
        eps: 0.001,
        segments: 64,
      },
      actions: [
        {
          id: 'flange_disk',
          action: 'solid.cylinder',
          params: {
            height: 12,
            radius: 60,
            center: [0, 0, 6],
            segments: 64,
          },
        },
        {
          id: 'hub',
          action: 'solid.cylinder',
          params: {
            height: 36,
            radius: 28,
            center: [0, 0, 18],
            segments: 64,
          },
        },
        {
          id: 'blank',
          action: 'boolean.union',
          params: {
            sources: ['flange_disk', 'hub'],
          },
        },
        {
          id: 'center_bore',
          action: 'solid.cylinder',
          params: {
            height: 44,
            radius: 12,
            center: [0, 0, 18],
            segments: 64,
          },
        },
        {
          id: 'bolt_hole',
          action: 'solid.cylinder',
          params: {
            height: 20,
            radius: 5,
            center: [0, 0, 0],
            segments: 48,
          },
        },
        {
          id: 'bolt_circle',
          action: 'pattern.radial',
          params: {
            source: 'bolt_hole',
            count: 6,
            radius: 40,
            startAngle: 0,
            sweepAngle: 360,
            center: [0, 0, 6],
            axis: 'z',
            rotateItems: false,
          },
        },
        {
          id: 'body',
          action: 'boolean.subtract',
          params: {
            base: 'blank',
            tools: ['center_bore', 'bolt_circle'],
          },
        },
        {
          id: 'preview',
          action: 'display.color',
          params: {
            source: 'body',
            rgba: [0.7, 0.74, 0.8, 1],
          },
        },
      ],
      result: 'preview',
    },
    expect: {
      resultKinds: ['geom3'],
      bboxSize: [120, 120, 36],
      bboxTolerance: 0.001,
      volumeRange: [170000, 176000],
      color: [0.7, 0.74, 0.8, 1],
      renderableCount: 1,
    },
  },
  {
    id: 'shaft-pillow-block',
    name: '轴承座夹块',
    description: '带横向轴孔和四个安装孔的工业轴承座夹块。',
    program: {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      precision: {
        eps: 0.001,
        segments: 48,
      },
      actions: [
        {
          id: 'body_blank',
          action: 'solid.roundedBox',
          params: {
            size: [160, 70, 40],
            center: [0, 0, 20],
            radius: 6,
            segments: 32,
          },
        },
        {
          id: 'shaft_bore_raw',
          action: 'solid.cylinder',
          params: {
            height: 180,
            radius: 18,
            center: [0, 0, 0],
            segments: 48,
          },
        },
        {
          id: 'shaft_bore_axis',
          action: 'transform.rotate',
          params: {
            source: 'shaft_bore_raw',
            angles: [0, 90, 0],
          },
        },
        {
          id: 'shaft_bore',
          action: 'transform.translate',
          params: {
            source: 'shaft_bore_axis',
            offset: [0, 0, 30],
          },
        },
        {
          id: 'mount_hole',
          action: 'solid.cylinder',
          params: {
            height: 50,
            radius: 6,
            center: [0, 0, 20],
            segments: 40,
          },
        },
        {
          id: 'mount_holes',
          action: 'pattern.grid',
          params: {
            source: 'mount_hole',
            count: [2, 2, 1],
            step: [100, 34, 0],
            origin: [-50, -17, 0],
          },
        },
        {
          id: 'body',
          action: 'boolean.subtract',
          params: {
            base: 'body_blank',
            tools: ['shaft_bore', 'mount_holes'],
          },
        },
        {
          id: 'preview',
          action: 'display.color',
          params: {
            source: 'body',
            rgba: [0.78, 0.83, 0.92, 1],
          },
        },
      ],
      result: 'preview',
    },
    expect: {
      resultKinds: ['geom3'],
      bboxSize: [160, 70, 40],
      bboxTolerance: 0.001,
      volumeRange: [250000, 300000],
      color: [0.78, 0.83, 0.92, 1],
      renderableCount: 1,
    },
  },
  {
    id: 'electronics-enclosure-base',
    name: '控制盒底座',
    description: '带内腔、安装柱和侧向线缆孔的工业控制盒底座。',
    program: {
      dsl: 'aiscad.dsl',
      version: '1.0.0',
      units: 'mm',
      precision: {
        eps: 0.001,
        segments: 48,
      },
      actions: [
        {
          id: 'outer_shell',
          action: 'solid.roundedBox',
          params: {
            size: [180, 120, 60],
            center: [0, 0, 30],
            radius: 10,
            segments: 32,
          },
        },
        {
          id: 'inner_cavity',
          action: 'solid.roundedBox',
          params: {
            size: [160, 100, 48],
            center: [0, 0, 36],
            radius: 8,
            segments: 32,
          },
        },
        {
          id: 'shell',
          action: 'boolean.subtract',
          params: {
            base: 'outer_shell',
            tools: ['inner_cavity'],
          },
        },
        {
          id: 'standoff',
          action: 'solid.cylinder',
          params: {
            height: 22,
            radius: 6,
            center: [0, 0, 11],
            segments: 36,
          },
        },
        {
          id: 'standoffs',
          action: 'pattern.grid',
          params: {
            source: 'standoff',
            count: [2, 2, 1],
            step: [110, 70, 0],
            origin: [-55, -35, 0],
          },
        },
        {
          id: 'standoff_hole',
          action: 'solid.cylinder',
          params: {
            height: 26,
            radius: 2.2,
            center: [0, 0, 11],
            segments: 28,
          },
        },
        {
          id: 'standoff_holes',
          action: 'pattern.grid',
          params: {
            source: 'standoff_hole',
            count: [2, 2, 1],
            step: [110, 70, 0],
            origin: [-55, -35, 0],
          },
        },
        {
          id: 'cable_hole_raw',
          action: 'solid.cylinder',
          params: {
            height: 140,
            radius: 8,
            center: [0, 0, 0],
            segments: 40,
          },
        },
        {
          id: 'cable_hole_axis',
          action: 'transform.rotate',
          params: {
            source: 'cable_hole_raw',
            angles: [90, 0, 0],
          },
        },
        {
          id: 'cable_holes',
          action: 'pattern.linear',
          params: {
            source: 'cable_hole_axis',
            count: 2,
            step: [40, 0, 0],
            origin: [-20, 60, 28],
          },
        },
        {
          id: 'body_with_posts',
          action: 'boolean.union',
          params: {
            sources: ['shell', 'standoffs'],
          },
        },
        {
          id: 'body',
          action: 'boolean.subtract',
          params: {
            base: 'body_with_posts',
            tools: ['standoff_holes', 'cable_holes'],
          },
        },
        {
          id: 'preview',
          action: 'display.color',
          params: {
            source: 'body',
            rgba: [0.18, 0.22, 0.3, 1],
          },
        },
      ],
      result: 'preview',
    },
    expect: {
      resultKinds: ['geom3'],
      bboxSize: [180, 120, 60],
      bboxTolerance: 0.001,
      volumeRange: [510000, 518000],
      color: [0.18, 0.22, 0.3, 1],
      renderableCount: 1,
    },
  },
]

export function getVisualTestCase(caseId) {
  return VISUAL_TEST_CASES.find((item) => item.id === caseId) || null
}
