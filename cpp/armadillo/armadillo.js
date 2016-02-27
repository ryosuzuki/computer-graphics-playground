
var ffi = require('ffi');
var armadillo;

armadillo = new ffi.Library('./hoge.dylib', {
  '_main': ['int', []]
  // 'zeros': [ 'int', 'int', ['sp_mat']],
  // 'eye': ['int', 'int', ['mat']]
});

// console.log(dl.get);

var repl = require('repl')
repl.start('> ').context.armadillo = armadillo;
