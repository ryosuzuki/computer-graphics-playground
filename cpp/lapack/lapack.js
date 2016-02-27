var FFI = require('ffi');
var LAPACK;

LAPACK = new FFI.Library('liblapack', {
"sgeqrf_": ["void", ["pointer", "pointer", "pointer", "pointer", "pointer",
      "pointer", "pointer", "pointer"]],
"dgeqrf_": ["void", ["pointer", "pointer", "pointer", "pointer", "pointer",
      "pointer", "pointer", "pointer"]],
"sorgqr_": ["void", ["pointer", "pointer", "pointer", "pointer", "pointer", "pointer",
      "pointer", "pointer", "pointer"]],
"sgesvd_": ["void", ["pointer", "pointer", "pointer", "pointer", "pointer",
      "pointer", "pointer", "pointer", "pointer", "pointer",
      "pointer", "pointer", "pointer", "pointer", ]],
"sgetrf_": ["void", ["pointer", "pointer", "pointer", "pointer", "pointer", "pointer"]],
"dgetrf_": ["void", ["pointer", "pointer", "pointer", "pointer", "pointer", "pointer"]],
"sgesv_": ["void", ["pointer", "pointer", "pointer", "pointer", "pointer", "pointer", "pointer", "pointer"]]
});

console.log(LAPACK);