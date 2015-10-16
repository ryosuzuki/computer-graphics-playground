
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
app.use(route.get('/gear', gear));
app.use(route.get('/basic', basic));
app.use(route.get('/physics', physics));
app.use(route.get('/jenga', jenga));
app.use(route.get('/hoge', hoge));

function *index() {
  this.body = yield this.render('index');
}

function *gear() {
  this.body = yield this.render('gear');
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

app.listen(port);

module.exports = app;
