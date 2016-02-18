var fs = require('fs');
var voxelize = require('voxelize');
var stl = require('ndarray-stl');

function generateSTL (geometry) {
  var cells = geometry.faces.map( function (face) {
    var map = geometry.map;
    return [map[face.a], map[face.b], map[face.c]];
  })
  var positions = geometry.uniq.map( function (object) {
    var vertex = object.vertex;
    return [vertex.x, vertex.y, vertex.z];
  })

  object = voxelize(cells, positions, 0.1);
  var str = stl(object.voxels);
  fs.writeFileSync('hoge.stl', str, 'utf8');
}

