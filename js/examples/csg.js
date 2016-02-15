
var triangle;
var cylinder;
var objects = [];

var changedIndex = []
var oldIndex;
var currentIndex;

function getTexture (current) {
  var v1 = current.object.geometry.vertices[current.face.a];
  var v2 = current.object.geometry.vertices[current.face.b];
  var v3 = current.object.geometry.vertices[current.face.c];
  var pos = current.object.position;
  var normal = current.face.normal

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
      csgUnion(tetra);
      // geometry.mergeMesh(tetra);
    }
  }

  var texture = new THREE.Mesh(
    geometry, new THREE.MeshBasicMaterial({color: 'yellow'}));
  texture.rotation.set(rot.x, rot.y, rot.z, rot.order)
  texture.castShadow = true;
  texture.receiveShadow = true;
  texture.position.set(pos.x, pos.y, pos.z);
  scene.add(texture);

  // textures.push(texture);

  return texture;
}

$(document).on('click', '#csg', function () {
  csgUnion();
})

var csgMesh;
var textures = [];
function csgUnion (tetra) {
  var hoge = new THREE.Mesh(
    new THREE.CylinderGeometry(size*0.5, size*2, size*2, 20),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );
  hoge.position.set(1, -0.1, -2);
  hoge.material = new THREE.MeshBasicMaterial({color: 'black'});
  // scene.add(hoge);

  var cm = new ThreeBSP(cylinder);
  var cb = new ThreeBSP(tetra)
  csgMesh = cm.union(cb);
  var mesh = csgMesh.toMesh();
  mesh.material = new THREE.MeshBasicMaterial({color: 'blue'});
  scene.add(mesh);

}

function onDocumentMouseUp (event) {
  var intersects = getIntersects(event);
  if (intersects.length > 0) {
    if (changedIndex.indexOf(currentIndex) == -1) {
      var texture = getTexture(current);
      window.texture = texture;
      changedIndex.push(currentIndex);
    }
  }
}

var oldColor = new THREE.Color('white');
var selectColor = new THREE.Color('yellow');

function onDocumentMouseDown( event ) {
  var intersects = getIntersects(event)
  if ( intersects.length > 0 ) {
    // if (current !== intersects[0]) oldIndex = undefined;
    window.current = intersects[0]
    currentIndex = current.faceIndex;
    if (oldIndex != currentIndex) {
      if (oldIndex && current.object.geometry.faces[oldIndex]) {
        current.object.geometry.faces[oldIndex].color.set(oldColor);
      }
      current.object.geometry.faces[currentIndex].color.set(selectColor);
      current.object.geometry.colorsNeedUpdate = true;
      oldIndex = currentIndex;
      if (changedIndex.indexOf(currentIndex) == -1) {
      }
    }
  }
}

function onDocumentMouseMove (event) {
  console.log('move')
  var intersects = getIntersects(event);
  if (intersects.length > 0) {
    var basicMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    changeMaterial(intersects, basicMaterial);
  }
}

function drawObjects () {
  cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(size, size, size*2, 20),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );
  cylinder.geometry.verticesNeedUpdate = true;
  cylinder.dynamic = true;
  cylinder.castShadow = true;
  cylinder.receiveShadow = true;
  cylinder.position.set(1, 0, -2);
  scene.add(cylinder);
  objects.push(cylinder);

}



