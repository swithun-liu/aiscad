const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 180
const MIN_POINT_DISTANCE = 0.012

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function safeContext(canvas) {
  try {
    return canvas.getContext('2d')
  } catch {
    return null
  }
}

function normalizePoint(point) {
  return {
    x: clamp01(Number(point.x) || 0),
    y: clamp01(Number(point.y) || 0),
  }
}

function simplifyStroke(points) {
  if (!Array.isArray(points) || points.length === 0) return []

  const simplified = [normalizePoint(points[0])]
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = normalizePoint(points[index])
    const previous = simplified[simplified.length - 1]
    const dx = point.x - previous.x
    const dy = point.y - previous.y
    if (Math.hypot(dx, dy) >= MIN_POINT_DISTANCE) {
      simplified.push(point)
    }
  }

  if (points.length > 1) {
    simplified.push(normalizePoint(points[points.length - 1]))
  }

  return simplified
}

function sanitizeStrokes(strokes) {
  if (!Array.isArray(strokes)) return []
  return strokes
    .map((stroke) => simplifyStroke(stroke))
    .filter((stroke) => stroke.length >= 2)
}

function denormalize(point) {
  return {
    x: point.x * CANVAS_WIDTH,
    y: point.y * CANVAS_HEIGHT,
  }
}

function createBackground(ctx) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = '#08111f'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)'
  ctx.lineWidth = 1
  for (let x = 40; x < CANVAS_WIDTH; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, CANVAS_HEIGHT)
    ctx.stroke()
  }
  for (let y = 30; y < CANVAS_HEIGHT; y += 30) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CANVAS_WIDTH, y)
    ctx.stroke()
  }
}

function drawStroke(ctx, stroke) {
  if (stroke.length < 2) return
  ctx.beginPath()
  const first = denormalize(stroke[0])
  ctx.moveTo(first.x, first.y)
  for (let index = 1; index < stroke.length; index += 1) {
    const point = denormalize(stroke[index])
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
}

function eventPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  const x = rect.width ? (event.clientX - rect.left) / rect.width : 0
  const y = rect.height ? (event.clientY - rect.top) / rect.height : 0
  return normalizePoint({ x, y })
}

export function createSketchPad(container, options = {}) {
  container.innerHTML = ''

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  canvas.className = 'sketch-canvas'
  canvas.dataset.role = 'sketch-canvas'
  container.appendChild(canvas)

  const ctx = safeContext(canvas)
  let strokes = sanitizeStrokes(options.value?.strokes || options.value)
  let activeStroke = null
  let drawing = false

  function render() {
    if (!ctx) return
    createBackground(ctx)
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    strokes.forEach((stroke) => drawStroke(ctx, stroke))
    if (activeStroke?.length >= 2) {
      drawStroke(ctx, activeStroke)
    }
  }

  function getSketchData() {
    const simplifiedStrokes = sanitizeStrokes(strokes)
    if (!simplifiedStrokes.length) return null

    return {
      version: '1.0',
      coordinateSystem: 'normalized-top-left',
      canvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      },
      strokes: simplifiedStrokes.map((stroke) => stroke.map((point) => ({
        x: Number(point.x.toFixed(3)),
        y: Number(point.y.toFixed(3)),
      }))),
    }
  }

  function emitChange() {
    options.onChange?.(getSketchData())
    render()
  }

  function endStroke() {
    if (!drawing) return
    drawing = false
    if (activeStroke?.length >= 2) {
      strokes = [...strokes, simplifyStroke(activeStroke)]
    }
    activeStroke = null
    emitChange()
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    drawing = true
    activeStroke = [eventPoint(event, canvas)]
    canvas.setPointerCapture?.(event.pointerId)
    render()
  })

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || !activeStroke) return
    const point = eventPoint(event, canvas)
    const previous = activeStroke[activeStroke.length - 1]
    const dx = point.x - previous.x
    const dy = point.y - previous.y
    if (Math.hypot(dx, dy) < MIN_POINT_DISTANCE / 2) return
    activeStroke = [...activeStroke, point]
    render()
  })

  canvas.addEventListener('pointerup', endStroke)
  canvas.addEventListener('pointercancel', endStroke)
  canvas.addEventListener('pointerleave', () => {
    if (!drawing) return
    endStroke()
  })

  const api = {
    clear() {
      strokes = []
      activeStroke = null
      drawing = false
      emitChange()
    },
    getSketchData,
    setSketchData(nextValue) {
      strokes = sanitizeStrokes(nextValue?.strokes || nextValue)
      activeStroke = null
      drawing = false
      emitChange()
    },
  }

  container.__sketchPad = api
  canvas.__sketchPad = api

  render()
  options.onChange?.(getSketchData())
  return api
}
