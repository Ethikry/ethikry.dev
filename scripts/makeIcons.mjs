/**
 * Renders public/apple-touch-icon.png from the same geometry as
 * public/favicon.svg.
 *
 * The SVG covers every browser tab on its own; this exists only because iOS
 * home-screen bookmarks ignore SVG icons and fall back to a screenshot of the
 * page. No dependency and no
 * SVG rasteriser is available here, so the shape — rounded rectangles on a
 * rounded square — is drawn directly into an RGBA buffer, 4× supersampled for
 * edges, and deflated into a PNG by node's own zlib.
 *
 * Run after editing favicon.svg:  node scripts/makeIcons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SIZE = 180
const SS = 4 // supersampling factor
const VB = 64 // the SVG's viewBox, which the geometry below is written in

// Light-mode palette only: an apple-touch-icon has no media queries, and iOS
// renders it on the user's wallpaper rather than on browser chrome.
const TEAL = [0x0d, 0x7a, 0x68]
const WHITE = [0xff, 0xff, 0xff]

/** [x, y, w, h, r, colour, alpha] in viewBox units, painted in order. */
const SHAPES = [
  [0, 0, 64, 64, 16, TEAL, 1],
  [19, 15, 9, 34, 2, WHITE, 1],
  [19, 15, 27, 8, 2, WHITE, 1],
  [19, 28, 22, 8, 2, WHITE, 1],
  [19, 41, 27, 8, 2, WHITE, 1],
]

/** Is (px, py) inside the rounded rect? Corners are quarter-circles of radius r. */
function inside(px, py, [x, y, w, h, r]) {
  if (px < x || py < y || px > x + w || py > y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

const W = SIZE * SS
// Start fully transparent: anything outside the paper square stays cut out.
const hi = new Float64Array(W * W * 4)
for (const shape of SHAPES) {
  const [, , , , , colour, alpha] = shape
  for (let y = 0; y < W; y++) {
    const vy = ((y + 0.5) / SS) * (VB / SIZE)
    for (let x = 0; x < W; x++) {
      const vx = ((x + 0.5) / SS) * (VB / SIZE)
      if (!inside(vx, vy, shape)) continue
      const i = (y * W + x) * 4
      // Source-over, so overlapping bars blend correctly.
      const a0 = hi[i + 3]
      const a1 = alpha + a0 * (1 - alpha)
      for (let c = 0; c < 3; c++) {
        hi[i + c] = (colour[c] * alpha + hi[i + c] * a0 * (1 - alpha)) / a1
      }
      hi[i + 3] = a1
    }
  }
}

// Box-filter down to the real size — this is what softens the corners.
const px = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 4
        const sa = hi[i + 3]
        r += hi[i] * sa
        g += hi[i + 1] * sa
        b += hi[i + 2] * sa
        a += sa
      }
    }
    const o = (y * SIZE + x) * 4
    if (a > 0) {
      px[o] = Math.round(r / a)
      px[o + 1] = Math.round(g / a)
      px[o + 2] = Math.round(b / a)
    }
    px[o + 3] = Math.round((a / (SS * SS)) * 255)
  }
}

/** Raw scanlines with a leading filter byte each (filter 0 = none). */
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const CRC = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return (buf) => {
    let c = -1
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'apple-touch-icon.png')
writeFileSync(out, png)
console.log(`wrote ${out} (${SIZE}×${SIZE}, ${png.length} bytes)`)

// Browsers still request /favicon.ico on their own (and the holodle demo links
// it), so wrap the same PNG in a one-image ICO container. ICO has held PNG data
// since Windows Vista, and every current browser reads it.
const icoHeader = Buffer.alloc(6 + 16)
icoHeader.writeUInt16LE(0, 0) // reserved
icoHeader.writeUInt16LE(1, 2) // type: icon
icoHeader.writeUInt16LE(1, 4) // one image
icoHeader[6] = SIZE // width (0 would mean 256)
icoHeader[7] = SIZE // height
icoHeader[8] = 0 // palette size
icoHeader[9] = 0 // reserved
icoHeader.writeUInt16LE(1, 10) // colour planes
icoHeader.writeUInt16LE(32, 12) // bits per pixel
icoHeader.writeUInt32LE(png.length, 14) // image size
icoHeader.writeUInt32LE(icoHeader.length, 18) // image offset
const ico = join(dirname(out), 'favicon.ico')
writeFileSync(ico, Buffer.concat([icoHeader, png]))
console.log(`wrote ${ico}`)
