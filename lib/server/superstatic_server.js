var fs = require('fs');
var connect = require('connect');
var ConfigFile = require('./config/file');
var ConfigRedis = require('./config/redis');
var StoreLocal = require('./store/local');
var StoreS3 = require('./store/s3');
var middleware = require('./middleware');

var SuperstaticServer = function (options) {
  this._server = options.server;
  this._port = options.port;
  this._host = options.host;
  
  this.settings = options.settings;
  this.store = options.store;
};

SuperstaticServer.createServer = function (serverOptions) {
  var settings;
  var store;
  
  // TODO: put this in a factory?
  // or is this the factory?
  
  if (serverOptions.settings.type === 'file') {
    settings = new ConfigFile(serverOptions.settings.options);
  }
  
  if (serverOptions.settings.type === 'redis') {
    settings = new ConfigRedis(serverOptions.settings.options);
  }
  
  if (serverOptions.store.type === 'local') {
    store = new StoreLocal(serverOptions.store.options);
  }
  
  if (serverOptions.store.type === 's3') {
    store = new StoreS3(serverOptions.store.options); 
  }
  
  var server = new SuperstaticServer({
    settings: settings,
    store: store,
    port: serverOptions.port,
    host: serverOptions.host,
  });
  
  return server;
};

SuperstaticServer.prototype._createServer = function () {
  // The order of these middleware modules is DEATHLY important!!!
  return this._server = connect()
    .use(middleware.router(this.settings, this.store))
    .use(middleware.settingsCache)
    .use(middleware.static)
    .use(middleware.customRoute)
    .use(middleware.directoryIndex)
    .use(middleware.cleanUrls)
    .use(middleware.removeTrailingSlash)
    .use(connect.compress())
    .use(middleware.notFound)
    .use(middleware.responder);
};

SuperstaticServer.prototype.start = function (callback) {
  this._createServer();
  var openServer = this._openServer = this._server.listen(this._port, this._host, callback);
  openServer._connects = openServer._connects || {};
  
  // Track all connections
  openServer.on('connection', function (connection) {
    var key = connection.remoteAddress + ':' + connection.remotePort;
    openServer._connects[key] = connection;
    
    connection.once('close', function() {
      delete openServer._connects[key];
    });
  });
};

SuperstaticServer.prototype.stop = function (callback) {
  var openServer = this._openServer;
  
  // Close all connections
  Object.keys(openServer._connects).forEach(function (key) {
    var connection = openServer._connects[key];
    return connection && connection.destroy();
  });
  
  openServer.close(function () {
    openServer.removeAllListeners();
    callback();
  });
};

module.exports = SuperstaticServer;