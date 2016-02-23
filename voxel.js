var repl = require('repl');

var Geometry = require('./voxelize/index');
var stl = require('ndarray-stl');
var fs = require('fs');
var sample = require('./sample.json');
var json = sample;
// var json = require('./mini-knight.json')

var geometry = new Geometry(json);
var object = geometry.voxelize(0.02);
var array = [];
for (var d in object.voxels.data) {
  array.push(object.voxels.data[d]);
}
fs.writeFileSync('voxel-data.js', 'a = ['+array+']; shape = ['+object.voxels.shape +']', 'utf8');

var data = stl(object.voxels, object.faceNormals);
fs.writeFileSync('hoge.stl', data, 'utf8');
repl.start('> ').context.object = object;



