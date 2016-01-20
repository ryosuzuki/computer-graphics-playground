
var fs = require('fs');
var path = require('path');
var http = require('http');
var route = require('koa-route');
var views = require('co-views');
var serve = require('koa-static');
var koa = require('koa');

var app = koa();
var server = http.createServer(app.callback());
var port = process.env.PORT || 3000;

app.use(serve('.'));
app.use( function *(next) {
  this.render = views('views', {
    map: { html: 'swig' },
  });
  yield next;
});
app.use(route.get('/', index));
app.use(route.get('/simple-texture', simpleTexture));
app.use(route.get('/image-texture', imageTexture));
app.use(route.get('/stl', stl));
app.use(route.get('/stl-export', stlExport));
app.use(route.get('/test-stl', testStl));
app.use(route.get('/gear', gear));
app.use(route.get('/drum', drum));
app.use(route.get('/trex', trex));
app.use(route.get('/involute', involute));
app.use(route.get('/pinion', pinion));
app.use(route.get('/basic', basic));
app.use(route.get('/physics', physics));
app.use(route.get('/jenga', jenga));
app.use(route.get('/hoge', hoge));
app.use(route.get('/breadboard', breadboard));
app.use(route.get('/svg-breadboard', svgBreadboard));

function *index() {
  this.body = yield this.render('index');
}
function *simpleTexture() {
  this.body = yield this.render('simple-texture');
}
function *imageTexture() {
  this.body = yield this.render('image-texture');
}
function *stl() {
  this.body = yield this.render('stl');
}
function *stlExport() {
  this.body = yield this.render('stl-export');
}
function *testStl() {
  this.body = yield this.render('test-stl');
}

function *gear() {
  this.body = yield this.render('gear');
}

function *drum() {
  this.body = yield this.render('drum');
}

function *trex() {
  this.body = yield this.render('trex');
}

function *involute() {
  this.body = yield this.render('involute');
}

function *pinion() {
  this.body = yield this.render('pinion');
}

function *physics() {
  this.body = yield this.render('physics');
}

function *basic() {
  this.body = yield this.render('basic');
}

function *jenga() {
  this.body = yield this.render('jenga');
}

function *hoge() {
  this.body = yield this.render('hoge');
}

function *breadboard() {
  this.body = yield this.render('breadboard');
}

function *svgBreadboard() {
  this.body = yield this.render('svg-breadboard');
}

app.listen(port);

module.exports = app;
