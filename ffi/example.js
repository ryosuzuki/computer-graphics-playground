var repl = require('repl');
var ffi = require('ffi');
var ref = require('ref');
var ArrayType = require('ref-array');
var int = ref.types.int;
var IntArray = ArrayType(int);

var funcPtr = ffi.Function('void', ['int']);

var lib = ffi.Library('mylib', {
  'twice': ['int', ['int']],
  'doSomething': ['int', [funcPtr, IntArray, int]],
  'createMatrix': [IntArray, [int, IntArray, int] ]
});

var n = 0;
var a = [0, 1, 2, 3, 4];
var array = new IntArray(a);

var result = lib.createMatrix(100, array, 5);

repl.start('> ').context.r = result;


var onResult = function (resultVal) {
  n = resultVal;
  console.log('Result is', resultVal);
}

// console.log('twice 10', mylib.twice(10));
// mylib.doSomething(onResult, array, a.length);

// console.log(n);
// console.log(array)