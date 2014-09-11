var http = require('http');
var url = require('url');
var fs = require('fs');

var winston = require('winston');
var connect = require('connect');
var uglify = require('uglify-js');

var connectRoute = require('connect-route');
var st = require('st');

var DocumentHandler = require('./lib/document_handler');

// Load the configuration and set some defaults
var config = JSON.parse(fs.readFileSync('./config.js', 'utf8'));
config.port = process.env.PORT || config.port || 7777;
config.host = process.env.HOST || config.host || 'localhost';

// Set up the logger
if (config.logging) {
  try {
    winston.remove(winston.transports.Console);
  } catch(er) { }
  var detail, type;
  for (var i = 0; i < config.logging.length; i++) {
    detail = config.logging[i];
    type = detail.type;
    delete detail.type;
    winston.add(winston.transports[type], detail);
  }
}

// build the store from the config on-demand - so that we don't load it
// for statics
if (!config.storage) {
  config.storage = { type: 'file' };
}
if (!config.storage.type) {
  config.storage.type = 'file';
}

var Store = require('./lib/document_stores/' + config.storage.type);
var preferredStore = new Store(config.storage);

// Pick up a key generator
var pwOptions = config.keyGenerator || {};
pwOptions.type = pwOptions.type || 'random';
var gen = require('./lib/key_generators/' + pwOptions.type);
var keyGenerator = new gen(pwOptions);

// Configure the document handler
var documentHandler = new DocumentHandler({
  store: preferredStore,
  maxLength: config.maxLength,
  keyLength: config.keyLength,
  keyGenerator: keyGenerator
});

// Compress the static javascript assets
if (config.recompressStaticAssets) {
  var list = fs.readdirSync('./static');
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if ((item.indexOf('.js') === item.length - 3) && (item.indexOf('.min.js') === -1)) {
      dest = item.substring(0, item.length - 3) + '.min' + item.substring(item.length - 3);
      var minified = uglify.minify('./static/' + item);
      fs.writeFileSync('./static/' + dest, minified.code, 'utf8');
      winston.info('compressed ' + item + ' into ' + dest);
    }
  }
}

// Send the static documents into the preferred store, skipping expirations
var path, data;
for (var name in config.documents) {
  path = config.documents[name];

  var storeStaticDoc = function() {
    data = fs.readFileSync(path, 'utf8');
    if (data) {
      var syntax = '';
      var extIndex = path.lastIndexOf('.');
      if (extIndex > -1 && extIndex < path.length - 1) {
        syntax = path.substring(extIndex + 1);
      }
      var doc = {
        name: name,
        size: data.length,
        mimetype: 'text/plain',
        syntax: syntax
      };
      // we're not actually using http requests to initialize the static docs
      // so use a fake response object to determine finished success/failure
      var nonHttpResponse = {
        writeHead: function(code, misc) {
          if (code == 200) {
            winston.debug('loaded static document', { file: name, path: path });
          } else {
            winston.warn('failed to store static document', { file: name, path: path });
          }
        },
        end: function(){}
      };
      documentHandler._setStoreObject(doc, data, nonHttpResponse, true);
    }
    else {
      winston.warn('failed to load static document', { name: name, path: path });
    }
  };

  var nonHttpResponse = {writeHead: function(){},end: function(){}};
  documentHandler._getStoreObject(name, true, nonHttpResponse, function(err, doc) {
    if (err) {
      storeStaticDoc();
    }
    else {
      winston.verbose('not storing static document as it already exists', {name: name});
    }
  });
}

var staticServe = st({
  path: './static',
  url: '/',
  index: 'index.html',
  passthrough: true
});

var apiServe = connectRoute(function(router) {
  // add documents
  router.post('/docs', function(request, response, next) {
    return documentHandler.handlePost(request, response);
  });
  // get documents
  router.get('/docs/:id', function(request, response, next) {
    var skipExpire = !!config.documents[request.params.id];
    return documentHandler.handleGet(request, response, skipExpire);
  });
  // get recent documents
  router.get('/recent', function(request, response, next) {
    return documentHandler.handleRecent(request, response);
  });
  // if the previous static-serving module didn't respond to the resource, 
  // forward to next with index.html and the web client application will request the doc based on the url
  router.get('/:id', function(request, response, next) {
    // redirect to index.html, also clearing the previous 'st' module 'sturl' field generated
    // by the first staticServe module. if sturl isn't cleared out then this new request.url is not
    // looked at again.
    request.url = '/index.html';
    request.sturl = null;
    next();
  });
});

var staticRemains = st({
  path: './static',
  url: '/',
  passthrough: false
});

var app = connect();
app.use(staticServe);
app.use(apiServe);
app.use(staticRemains);
app.listen(config.port, config.host);

winston.info('listening on ' + config.host + ':' + config.port);
