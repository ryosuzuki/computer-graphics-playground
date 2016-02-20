// initialize our modules
var ndthree = require('ndthree')
var ndarray = require('ndarray')
var fill = require('ndarray-fill')
// var terrain = require('isabella-texture-pack')
var THREE = require('three')

// Create some random voxels in a sphere
var voxels = ndarray(new Uint16Array(32*32*32), [32,32,32])
fill(voxels, function(i,j,k) {
  var x = Math.abs(i - 16)
  var y = Math.abs(j - 16)
  var z = Math.abs(k - 16)
  // (1<<15) toggles ambient occlusion
  return (x*x+y*y+z*z) < 190 ? ((Math.random()*255)|0) + (1<<15) : 0
})

// Create our buffer geometry and shader material
var geometry = new THREE.BufferGeometry()
var material = new THREE.ShaderMaterial()

// Populate the geometry and material
ndthree(voxels, geometry, material)

// Restructure terrain ([256,256,4]) into a tile map shape ([16, 16, 16, 16, 4])
// var tiles = ndarray(terrain.data,
//     [16,16,terrain.shape[0]>>4,terrain.shape[1]>>4,4],
//     [terrain.stride[0]*16, terrain.stride[1]*16, terrain.stride[0], terrain.stride[1], terrain.stride[2]], 0)

// Use helper for creating a mesh (optional)
var mesh = ndthree.createMesh({
  THREE: THREE,
  geometry: geometry,
  material: material,
  // map: tiles,
  size: 32,
  pad: true,
})