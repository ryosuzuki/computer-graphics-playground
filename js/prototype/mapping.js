var start = 100;
var maxDistance = 2;

function computeMapping () {
  if (selectIndex.length <= 0) return false;
  start = geometry.faces[selectIndex[0]].a;
  computeExponentialMap(start, function () {
    hoge();
    console.log('start:' + start);
    // start = undefined;
  });
}

function hoge () {
  geometry.faceVertexUvs = [[]];
  // var faces = uniq[map[start]].faces;
  for (var i=0; i<geometry.faces.length; i++) {
    var face = geometry.faces[i];
  // for (var i=0; i<faces.length; i++) {
  //   var index = faces[i];
  //   var face = geometry.faces[index];
    var a = uniq[map[face.a]];
    var b = uniq[map[face.b]];
    var c = uniq[map[face.c]];
    if (a.uv && b.uv && c.uv) {
      // if (!selectIndex.includes(i)) return false;
      geometry.faceVertexUvs[0].push([a.uv, b.uv, c.uv]);
      geometry.uvsNeedUpdate = true;
    }
  }
  var texture = new THREE.ImageUtils.loadTexture('/assets/checkerboard-3.jpg');
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // texture.repeat.set(1, 1);
  // mesh.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
}