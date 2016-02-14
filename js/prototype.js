var objects = [];

var pinionMesh;
var rackMesh;
var materials = [];
var basicMaterials = [];
THREE.ImageUtils.crossOrigin = '';
var texture = THREE.ImageUtils.loadTexture('/assets/plaster.jpg');
// materials[2] = material


var a = new THREE.Vector3(1, 0, 0);
var b = new THREE.Vector3(0, 0, 1);
var c = new THREE.Vector3(0, 1, 0);
var ab = new THREE.Vector3();
var bc = new THREE.Vector3();
ab.subVectors(b, a);
bc.subVectors(c, b);

var normal = new THREE.Vector3();
normal.crossVectors(ab, bc)
normal.normalize()

var triangle;
var cylinder;

function drawObjects () {
  cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(size, size, size*2, 20),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );
  cylinder.geometry.verticesNeedUpdate = true;
  cylinder.dynamic = true;
  cylinder.castShadow = true;
  cylinder.receiveShadow = true;
  // scene.add(cylinder);
  // objects.push(cylinder);
  // window.geometry = cylinder.geometry

  box = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );
  box.geometry.verticesNeedUpdate = true;
  box.dynamic = true;
  box.castShadow = true;
  box.receiveShadow = true;
  // scene.add(box);
  // objects.push(box);
  // window.geometry = box.geometry
  // computeUniq(geometry);
  // computeLaplacian(geometry);


  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if ( xhr.readyState == 4 ) {
      if ( xhr.status == 200 || xhr.status == 0 ) {
        var rep = xhr.response; // || xhr.mozResponseArrayBuffer;
        console.log(rep);
        parseStlBinary(rep);
        //parseStl(xhr.responseText);
        window.geometry = mesh.geometry;
        mesh.material.color.set(new THREE.Color('blue'))
        mesh.position.y = 1;
        mesh.rotation.x = 5;
        mesh.rotation.z = .25;
        // for mavin
        // mesh.scale.set(0.1, 0.1, 0.1);
        console.log('done parsing');
        computeUniq(geometry, function (geometry) {
          computeLaplacian(geometry);
        });
      }
    }
  }
  xhr.onerror = function(e) {
    console.log(e);
  }
  xhr.open( "GET", 'assets/mini_knight.stl', true );
  // xhr.open( "GET", 'assets/marvin-original.stl', true );
  // xhr.open( "GET", 'assets/marvin-original.stl', true );
  xhr.responseType = "arraybuffer";
  xhr.send( null );

}






function getTexture (current) {
  var v1 = current.object.geometry.vertices[current.face.a];
  var v2 = current.object.geometry.vertices[current.face.b];
  var v3 = current.object.geometry.vertices[current.face.c];
  var pos = current.object.position;
  var n = current.face.normal.normalize();

  var geometry = new THREE.Geometry();
  geometry.vertices.push(v1);
  geometry.vertices.push(v2);
  geometry.vertices.push(v3);
  geometry.faces.push(new THREE.Face3(0, 1, 2));
  geometry.verticesNeedUpdate = true;

  var rot = current.object.rotation;
  var axis = new THREE.Vector3(0, 1, 0);
  var quaternion = new THREE.Quaternion().setFromUnitVectors(axis, normal)
  var matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  for (var i=0; i<10; i++) {
    for (var j=0; j<10; j++) {
      var c1 = v1.clone()
      var c2 = v2.clone()
      var c3 = v3.clone()
      var a = c1.multiplyScalar( (10-i)/10 * j/10 )
      var b = c2.multiplyScalar( (10-i)/10 * (10-j)/10 )
      var c = c3.multiplyScalar( i/10 )
      var point = a.add(b).add(c)

      var radius = size/20;
      var height = size/10;
      var tetra = new THREE.Mesh(
        new THREE.CylinderGeometry(0, radius, height, 8, 1),
        new THREE.MeshLambertMaterial({color: 0x0000ff})
      )
      tetra.applyMatrix(matrix);
      tetra.castShadow = true;
      tetra.receiveShadow = true;
      tetra.position.set(point.x, point.y, point.z)
      geometry.mergeMesh(tetra);
    }
  }

  var texture = new THREE.Mesh(
    geometry, new THREE.MeshBasicMaterial({color: 'yellow'}));
  texture.rotation.set(rot.x, rot.y, rot.z, rot.order)
  texture.castShadow = true;
  texture.receiveShadow = true;
  texture.position.set(pos.x, pos.y, pos.z);
  scene.add(texture);
  return texture;
}

$( function () {
  init();
  drawObjects();
  // dragObjects();
  animate();

  $('#export').click( function() {
    var exporter = new THREE.STLExporter();
    var stlString = exporter.parse( scene );
    var blob = new Blob([stlString], {type: 'text/plain'});
    saveAs(blob, 'demo.stl');
  });
});



