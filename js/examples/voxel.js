var objects = [];
var materials = [];
THREE.ImageUtils.crossOrigin = '';

var triangle;
var cylinder;

function loadObjects () {
  computeUniq(geometry, function () {
    computeLaplacian(geometry, function () {
      console.log('done')
    });
  });
}


var size = 0.1;
var shape = [ 26, 29, 49 ];

size = 0.02;
shape = [ 128, 144, 245 ];

size = 0.06;
shape = [ 43, 48, 82 ];

size = 1.0;

shape = [ 110, 108, 84 ];
shape = [ 99, 97, 76 ];
shape = [ 50, 49, 38 ];

// bunny 0.1
shape = [ 99, 97, 76 ];

var geometry;

var hoge = 0;
function drawObjects () {
  var n = 0;
  geometry = new THREE.Geometry();
  for (var y=1; y<=shape[2]; y++) {
    for (var x=1; x<=shape[1]; x++) {
      for (var z=1; z<=shape[0]; z++) {
        var phase = a[n++];
        if (phase > 0) {
          // setTimeout( function () {
          drawBox(x, y, z);
          // }, 1000);
          // console.log(n);
        }
      }
    }
  }
  // var material = new THREE.MeshLambertMaterial({color: 'blue'});
  var mesh = new THREE.Mesh(geometry);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  var exporter = new THREE.STLExporter();
  var stlString = exporter.parse( scene );
  var blob = new Blob([stlString], {type: 'text/plain'});
  // saveAs(blob, 'demo.stl');
}

function drawBox (x, y, z) {
  var size = 0.07;
  x = size*x, y=size*y, z = size*z;
  var box = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshLambertMaterial({color: 'blue'})
  );
  box.geometry.verticesNeedUpdate = true;
  box.dynamic = true;
  box.castShadow = true;
  box.receiveShadow = true;
  box.position.set(x, y, z);
  geometry.mergeMesh(box);
}




