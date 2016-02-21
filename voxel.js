var repl = require('repl');

var voxelize = require('./voxelize/index');
var stl = require('ndarray-stl');
var normals = require('normals');
var fs = require('fs');
var sample = require('./sample.json');

var spatialGrid = require('./voxelize/src/spatial-grid');
var signedDistance = require('./voxelize/src/signed-distance');

// var json = JSON.parse(sample);
var json = sample;
// json.mappings = []

// var json = require('bunny');
// var grid = spatialGrid(json.cells, json.positions, 0.1);
// var faceNormals = normals.faceNormals(grid.cells, grid.positions);
var object = voxelize(json.cells, json.positions, 1.0, json.mappings);
var array = [];
for (var d in object.voxels.data) {
  array.push(object.voxels.data[d]);
}
fs.writeFileSync('voxel-data.js', 'a = ['+array+']', 'utf8');

  // 0.1
  // shape: [ 26, 29, 49 ],
  //
  // 0.6
  // shape: [ 43, 48, 82 ]
  //
  // 0.02
  // shape: [ 128, 144, 245 ],

var data = stl(object.voxels, object.faceNormals);
// fs.writeFileSync('bunny.stl', data, 'utf8');
fs.writeFileSync('hoge.stl', data, 'utf8');

repl.start('> ').context.object = object;

// object.voxels
// -> data, shape, stride, offset



