
var ffi = require('ffi');
var ref = require('ref');
var armadillo;

armadillo = new ffi.Library('armadillo', {
  'main': ['int', []],
  'changeSize': ['void', [ ref.refType(ref.refType('int')) ]],
  'createZeros': ['void', [ 'int' ]]
});

var repl = require('repl')
repl.start('> ').context.a = armadillo;
