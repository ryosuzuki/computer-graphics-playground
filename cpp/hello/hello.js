
var ffi = require('ffi');
var hello = new ffi.Library('libhello', {
  'hello': ['int', []]
});

console.log(hello.hello())
