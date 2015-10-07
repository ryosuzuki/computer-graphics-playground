
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

function *index() {
  this.body = yield this.render('index');
}

app.listen(port);

module.exports = app;
