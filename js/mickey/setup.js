var stats;
var camera;
var scene;
var renderer;
var raycaster = new THREE.Raycaster()
var mouse = new THREE.Vector2();
var size = 1;
var Point;

$(function () {
  paper.setup('canvas');
  Point = paper.Point;
  Q.fcall(init())
  .then(drawObjects())
  .then(createSvg())
  .then(animate())
});

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(size*2, size*2, size*2)
  camera.lookAt(new THREE.Vector3(0, 3, 0));
  scene.add( camera );

  scene.add(new THREE.AmbientLight(0xccc));
  var light = new THREE.SpotLight(0xfff, 1.5);
  light.position.set(size*7, size*7, -size*7);
  light.castShadow = true;
  light.shadow.camera.near = size*3;
  light.shadow.camera.far = camera.far;
  light.shadow.camera.fov = 70;
  light.shadow.bias = -0.000222;
  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;
  scene.add(light);
  spotlight = light;

  var grid = new THREE.GridHelper(size*5, size/2);
  grid.position.y = 0.01;
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0xf0f0f0);
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  document.getElementById('viewport').appendChild( renderer.domElement );

  controls = new THREE.OrbitControls( camera, renderer.domElement );
  controls.damping = 0.2;
  controls.addEventListener( 'change', render );

  stats = new Stats();
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.top = '10px';
  stats.domElement.style.right = '20px';
  stats.domElement.style.zIndex = 100;
  document.getElementById('viewport').appendChild(stats.domElement);

}

function animate(){
  requestAnimationFrame(animate);
  render();
  stats.update();
}

function render() {
  // controls.update();
  renderer.clear();
  renderer.render(scene, camera);
}
