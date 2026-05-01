import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import modelingModule from '@jscad/modeling'

const modeling = modelingModule.default || modelingModule
const { geom2, geom3, path2 } = modeling.geometries

function computeNormal(a, b, c) {
  const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])
  return ab.cross(ac).normalize()
}

function colorFromRgba(rgba) {
  const [r, g, b] = rgba || [0.24, 0.58, 0.98]
  return new THREE.Color(r, g, b)
}

function buildEdgeColor(color, opacity) {
  const edgeColor = color.clone()
  const hsl = { h: 0, s: 0, l: 0 }
  edgeColor.getHSL(hsl)
  edgeColor.setHSL(
    hsl.h,
    Math.max(0.16, hsl.s * 0.7),
    Math.min(0.9, hsl.l + (opacity < 1 ? 0.28 : 0.14)),
  )
  return edgeColor
}

function geom3ToBufferGeometry(geometry) {
  const polygons = geom3.toPolygons(geometry)
  const positions = []
  const normals = []

  for (const polygon of polygons) {
    const vertices = polygon.vertices
    if (!vertices || vertices.length < 3) continue
    for (let index = 1; index < vertices.length - 1; index += 1) {
      const a = vertices[0]
      const b = vertices[index]
      const c = vertices[index + 1]
      const normal = computeNormal(a, b, c)
      positions.push(...a, ...b, ...c)
      normals.push(
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z,
      )
    }
  }

  const bufferGeometry = new THREE.BufferGeometry()
  bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return bufferGeometry
}

function geom2ToLineSegments(geometry) {
  const sides = geom2.toSides(geometry)
  const positions = []
  for (const side of sides) {
    const [start, end] = side
    positions.push(start[0], start[1], 0, end[0], end[1], 0)
  }
  const bufferGeometry = new THREE.BufferGeometry()
  bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return bufferGeometry
}

function curveToLineSegments(curve) {
  const points = path2.toPoints(curve)
  const positions = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    positions.push(current[0], current[1], 0, next[0], next[1], 0)
  }
  const bufferGeometry = new THREE.BufferGeometry()
  bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return bufferGeometry
}

function normalizeLayer(item) {
  if (item?.record) return item
  return { record: item, style: {} }
}

function createRenderableObject(record, style = {}, options = {}) {
  const rgba = style.color || record.color
  const color = colorFromRgba(rgba)
  const opacity = style.opacity ?? (rgba?.[3] ?? 1)
  const transparent = opacity < 1
  const includeEdges = options.includeEdges !== false

  if (record.kind === 'geom3') {
    const geometry = geom3ToBufferGeometry(record.value)
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.05,
      roughness: 0.64,
      transparent,
      opacity,
      depthWrite: opacity >= 0.9,
      wireframe: Boolean(style.wireframe),
      polygonOffset: transparent,
      polygonOffsetFactor: transparent ? 1 : 0,
      polygonOffsetUnits: transparent ? 1 : 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = style.renderOrder || 0
    mesh.castShadow = true
    mesh.receiveShadow = true

    if (!includeEdges || style.wireframe) {
      return mesh
    }

    const edgesGeometry = new THREE.EdgesGeometry(geometry, transparent ? 18 : 26)
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: buildEdgeColor(color, opacity),
      transparent: true,
      opacity: transparent ? Math.max(0.42, opacity * 0.92) : 0.55,
      depthWrite: false,
    })
    const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial)
    edges.renderOrder = mesh.renderOrder + 1

    const group = new THREE.Group()
    group.add(mesh, edges)
    group.renderOrder = mesh.renderOrder
    return group
  }

  if (record.kind === 'geom2') {
    const geometry = geom2ToLineSegments(record.value)
    const material = new THREE.LineBasicMaterial({ color, transparent, opacity })
    const lines = new THREE.LineSegments(geometry, material)
    lines.renderOrder = style.renderOrder || 0
    return lines
  }

  if (record.kind === 'curve2') {
    const geometry = curveToLineSegments(record.value)
    const material = new THREE.LineBasicMaterial({ color, transparent, opacity })
    const lines = new THREE.LineSegments(geometry, material)
    lines.renderOrder = style.renderOrder || 0
    return lines
  }

  return null
}

export class ThreeCadViewer {
  constructor(container) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0f172a)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
    this.camera.position.set(180, 160, 180)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0, 0)
    this.stlExporter = new STLExporter()
    this.exportRecords = []

    this.modelRoot = new THREE.Group()
    this.scene.add(this.modelRoot)

    const ambient = new THREE.AmbientLight(0xffffff, 0.45)
    const hemiLight = new THREE.HemisphereLight(0xa5d8ff, 0x020617, 1.05)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45)
    const fillLight = new THREE.DirectionalLight(0x9bd1ff, 0.6)
    const rimLight = new THREE.DirectionalLight(0xeff6ff, 0.42)
    keyLight.position.set(150, 220, 170)
    fillLight.position.set(-160, 90, 120)
    rimLight.position.set(-120, 180, -200)
    this.scene.add(ambient, hemiLight, keyLight, fillLight, rimLight)

    this.gridHelper = new THREE.GridHelper(500, 20, 0x475569, 0x1e293b)
    this.gridHelper.material.transparent = true
    this.gridHelper.material.opacity = 0.42
    this.axesHelper = new THREE.AxesHelper(80)
    this.scene.add(this.gridHelper, this.axesHelper)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()
    this.animate = this.animate.bind(this)
    requestAnimationFrame(this.animate)
  }

  animate() {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this.animate)
  }

  resize() {
    const width = this.container.clientWidth || 640
    const height = this.container.clientHeight || 480
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  clear() {
    while (this.modelRoot.children.length) {
      const child = this.modelRoot.children[0]
      child.traverse((node) => {
        node.geometry?.dispose?.()
        if (Array.isArray(node.material)) {
          node.material.forEach((material) => material?.dispose?.())
          return
        }
        node.material?.dispose?.()
      })
      this.modelRoot.remove(child)
    }
  }

  updateSceneHelpers(box, maxDim) {
    const helperOffset = Math.max(maxDim * 0.08, 8)
    this.gridHelper.position.y = box.min.y - helperOffset
    this.axesHelper.position.set(
      box.min.x - helperOffset * 0.35,
      box.min.y - helperOffset,
      box.min.z - helperOffset * 0.35,
    )
  }

  fitCamera() {
    const box = new THREE.Box3().setFromObject(this.modelRoot)
    if (box.isEmpty()) return

    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 20)
    const distance = maxDim * 2.2

    this.updateSceneHelpers(box, maxDim)

    this.camera.position.set(center.x + distance, center.y + distance, center.z + distance)
    this.controls.target.copy(center)
    this.controls.update()
  }

  render(records, options = {}) {
    this.clear()
    this.exportRecords = options.exportRecords || records.map((item) => normalizeLayer(item).record)

    for (const item of records) {
      const layer = normalizeLayer(item)
      const object3d = createRenderableObject(layer.record, layer.style, { includeEdges: true })
      if (object3d) {
        this.modelRoot.add(object3d)
      }
    }

    if (options.fitCamera !== false) {
      this.fitCamera()
    }
  }

  hasSolidMeshes() {
    let meshCount = 0
    this.modelRoot.traverse((child) => {
      if (child.isMesh) meshCount += 1
    })
    return meshCount > 0
  }

  exportStl(fileName = 'aiscad-model.stl') {
    const solidRecords = this.exportRecords.filter((record) => record.kind === 'geom3')
    if (solidRecords.length === 0) {
      throw new Error('当前没有可导出的 3D 实体，请先渲染包含 geom3 的模型。')
    }

    const exportGroup = new THREE.Group()
    for (const record of solidRecords) {
      const object3d = createRenderableObject(record, {}, { includeEdges: false })
      if (object3d) exportGroup.add(object3d)
    }

    const stlText = this.stlExporter.parse(exportGroup)
    exportGroup.traverse((child) => {
      child.geometry?.dispose?.()
      child.material?.dispose?.()
    })
    const blob = new Blob([stlText], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
