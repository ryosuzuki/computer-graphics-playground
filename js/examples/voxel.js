var createGame = require('voxel-engine')
var voxel = require('voxel')
var voxelGeometry = require('voxel-geometry')

window.game = createGame({
  generate: voxel.generator['Valley'],
  startingPosition: [35, 350, 35],
  worldOrigin: [0,0,0],
  controlOptions: {jump: 8}
})

voxelGeometry.loadGeometry('http://thingiverse-production.s3.amazonaws.com/assets/dc/6b/db/6e/3e/steve2-flatback.stl', function(err, geometry) {
  geometry.computeFaceNormals();
  material = new THREE.MeshBasicMaterial( { color: 0xFF44FF, wireframe: true } )
  material.side = THREE.DoubleSide;
  var mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(-400, 400, 0);
  mesh.scale.set(10, 10, 10);
  mesh.rotation.y = Math.PI / 2.0;
  game.scene.add(mesh);
  voxelGeometry.voxelateMesh(game, mesh);
});

var currentMaterial = 3


game.on('mousedown', function (pos) {
  if (erase) {
    game.getBlock(pos, 0)
  } else {
    game.createBlock(pos, currentMaterial)
  }
})

var erase = true
window.addEventListener('keydown', function (ev) {
  if (ev.keyCode === 'X'.charCodeAt(0)) {
    erase = !erase
  }
})

function ctrlToggle (ev) { erase = !ev.ctrlKey }
window.addEventListener('keyup', ctrlToggle)
window.addEventListener('keydown', ctrlToggle)

var container = document.body
game.appendTo(container)
game.setupPointerLock(container)