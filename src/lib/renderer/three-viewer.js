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

export class ThreeCadViewer {
  constructor(container) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0f172a)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
    this.camera.position.set(180, 160, 180)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0, 0)
    this.stlExporter = new STLExporter()

    this.modelRoot = new THREE.Group()
    this.scene.add(this.modelRoot)

    const ambient = new THREE.AmbientLight(0xffffff, 1.2)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4)
    dirLight.position.set(120, 180, 160)
    this.scene.add(ambient, dirLight)
    this.scene.add(new THREE.GridHelper(500, 20, 0x334155, 0x1e293b))
    this.scene.add(new THREE.AxesHelper(80))

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
      const child = this.modelRoot.children.pop()
      child.geometry?.dispose?.()
      child.material?.dispose?.()
    }
  }

  fitCamera() {
    const box = new THREE.Box3().setFromObject(this.modelRoot)
    if (box.isEmpty()) return

    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 20)
    const distance = maxDim * 2.2

    this.camera.position.set(center.x + distance, center.y + distance, center.z + distance)
    this.controls.target.copy(center)
    this.controls.update()
  }

  render(records) {
    this.clear()

    for (const record of records) {
      const color = colorFromRgba(record.color)
      if (record.kind === 'geom3') {
        const geometry = geom3ToBufferGeometry(record.value)
        const material = new THREE.MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.72 })
        const mesh = new THREE.Mesh(geometry, material)
        this.modelRoot.add(mesh)
      } else if (record.kind === 'geom2') {
        const geometry = geom2ToLineSegments(record.value)
        const material = new THREE.LineBasicMaterial({ color })
        const lines = new THREE.LineSegments(geometry, material)
        this.modelRoot.add(lines)
      } else if (record.kind === 'curve2') {
        const geometry = curveToLineSegments(record.value)
        const material = new THREE.LineBasicMaterial({ color })
        const lines = new THREE.LineSegments(geometry, material)
        this.modelRoot.add(lines)
      }
    }

    this.fitCamera()
  }

  hasSolidMeshes() {
    let meshCount = 0
    this.modelRoot.traverse((child) => {
      if (child.isMesh) meshCount += 1
    })
    return meshCount > 0
  }

  exportStl(fileName = 'aiscad-model.stl') {
    if (!this.hasSolidMeshes()) {
      throw new Error('当前没有可导出的 3D 实体，请先渲染包含 geom3 的模型。')
    }

    const stlText = this.stlExporter.parse(this.modelRoot)
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
