var fs = require('fs')
var repl = require('repl')
var harmonic = require('./index.js')
var filename = '../../data/bunny.obj'

var json = {
  filename: filename,
  size: 502,
  p_edges: [233, 283, 303],
  q_edges: [112, 112, 112]
}
var result = harmonic.getHarmonicField(json);

repl.start('> ').context.r = result;


