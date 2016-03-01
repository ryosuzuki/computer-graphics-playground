
var fs = require('fs');
var path = require('path');
var http = require('http');
var route = require('koa-route');
var views = require('co-views');
var favicon = require('koa-favicon');
var serve = require('koa-static');
var parser = require('koa-bodyparser');
var koa = require('koa');
var Q = require('q');

var app = koa();
var server = http.createServer(app.callback());
var port = process.env.PORT || 3000;

app.use(serve('.'));
app.use(favicon('/assets/favicon.ico'));
app.use(parser({
  strict: false,
  jsonLimit: '5000mb',
  formLimit: '5000mb',
  extendTypes: {
    json: ['application/x-javascript']
  }
}));
app.use( function *(next) {
  this.render = views('views', {
    map: { html: 'swig' },
  });
  yield next;
});
app.use(route.get('/', index));
app.use(route.get('/favicon.ico', null));
app.use(route.get('/:id', show));
app.use(route.post('/init', init));
app.use(route.post('/save', save));
app.use(route.post('/stl', generateSTL));

function *index() {
  this.body = yield this.render('index');
}
function *show(id) {
  this.body = yield this.render(id)
}

var mapping = require('./ffi/mapping');
function *init() {
  var json = this.request.body.json;
  json = JSON.parse(json);
  var result = mapping(json);
  this.response.body = result;
}

function *save() {
  var json = this.request.body.json;
  // json = JSON.parse(json);
  console.log(json);
  fs.writeFileSync('hoge.json', json, 'utf8')
}

var Geometry = require('./voxelize/src/geometry');
var stl = require('ndarray-stl');

function *generateSTL () {
  var body = this.request.body;
  var json = this.request.body.json;
  fs.writeFileSync('sample.json', json, 'utf8');
  json = JSON.parse(json);
  console.log('Start voxelization...')
  /*
  json = {
    cells:
    positions:
    mappings:
    selected_cells:
    resolution:
  }
  */
  var geometry = new Geometry(json);
  var object = geometry.voxelize(0.02)
  var data = stl(object.voxels);
  // fs.writeFileSync('hoge.stl', str, 'utf8');
  console.log('done')
  this.status = 200;
  this.response.body = JSON.stringify(data);
}





app.listen(port);

module.exports = app;
