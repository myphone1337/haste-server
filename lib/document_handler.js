var winston = require('winston');
var Busboy = require('busboy');
var zlib = require('zlib');

// For handling serving stored documents

var DocumentHandler = function(options) {
  if (!options) {
    options = {};
  }
  this.keyLength = options.keyLength || DocumentHandler.defaultKeyLength;
  this.maxLength = options.maxLength; // none by default
  this.store = options.store;
  this.keyGenerator = options.keyGenerator;
};

DocumentHandler.defaultKeyLength = 10;

DocumentHandler.prototype._setStoreObject = function(doc, rawData, response, forStaticDoc) {
  var _this = this;
  var validateAndStore = function(doc) {
    var jsonDoc = JSON.stringify(doc);
    // Check length
    if (_this.maxLength && jsonDoc.length > _this.maxLength) {
      winston.warn('document > maxLength', { maxLength: _this.maxLength });
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'Document exceeds maximum length.' }));
      return;
    }
    // And then save if we should
    _this.chooseKey(function (key) {
      // static documents are linked via static key/name rather than some generated key
      if (forStaticDoc) key = doc.name;
      _this.store.set(key, jsonDoc, function (res) {
        if (res) {
          winston.verbose('added document', { key: key });
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ key: key }));
        } else {
          winston.verbose('error adding document');
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ message: 'Error adding document.' }));
        }
      });
    });
  };

  zlib.gzip(rawData, function(err, zippedData) {
    if (!err) {
      try {
        doc.file = zippedData.toString('base64');
      } catch (error) {
        winston.error('base64 error', { error: error });
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'zlib error' }));
        return;
      }
      validateAndStore(doc);
    } else {
      winston.error('zlib error', { error: err });
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'zlib error' }));
    }
  });
};

DocumentHandler.prototype._getStoreObject = function(key, skipExpire, response, callback) {
  this.store.get(key, function(doc) {
    if (!doc) {
      winston.warn('document not found', {key: key});
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'Document not found.' }));
      callback(true);
      return;
    }

    winston.verbose('retrieved document', { key: key });
    try {
      doc = JSON.parse(doc);
    } catch (err) {
      winston.error('document not in json format', { key: key });
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'Error with document' }));
      callback(true);
      return;
    }
    zlib.gunzip(new Buffer(doc.file, 'base64'), function(err, rawData) {
      if (err) {
        winston.error('zlib error', { key: key, error: err });
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'Error with document' }));
        callback(true);
        return;
      }
      try {
        doc.file = rawData.toString('base64');
      } catch (err) {
        winston.error('document not in json format', { key: key, error: err });
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'Error with document' }));
        callback(true);
        return;
      }
      callback(false, doc);
    });
  }, skipExpire);
};

// Handle retrieving a document
DocumentHandler.prototype.handleGet = function(request, response, skipExpire) {
  var key = request.params.id;
  this._getStoreObject(key, skipExpire, response, function(err, doc) {
    if (!err) {
      var ct = request.headers['accept'];
      var acceptableTypes = [doc.mimetype, '$/*', '*/*'];
      var slashindex = doc.mimetype.indexOf('/');
      if (slashindex > -1) {
        acceptableTypes[1] = acceptableTypes[1].replace('$', doc.mimetype.substring(0, slashindex));
      }
      if (ct && ct.indexOf(doc.mimetype) < 0 && ct.indexOf('*/*') < 0) {
        winston.warn('document content type is not allowed per request', { requested: ct, doctype: doc.mimetype });
        response.writeHead(415, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'Requested document does not support acceptable content-type' }));
        return;
      }
      response.writeHead(200, { 'content-type': doc.mimetype, 'content-length': doc.size });
      response.end(doc.file, 'base64');
    }
  });
};

// Handle adding a new Document
DocumentHandler.prototype.handlePost = function (request, response) {
  var _this = this;

  var doc = {
    name: '',
    size: 0,
    mimetype: 'text/plain',
    file: null
  };

  // If we should, parse a form to grab the data
  var ct = request.headers['content-type'];
  if (ct && ct.split(';')[0] === 'multipart/form-data') {
    var fieldValue = ''
    var busboy = new Busboy({ headers: request.headers });
    busboy.on('field', function (fieldname, val) {
      if (fieldname === 'data') {
        doc.size = val.length;
        _this._setStoreObject(doc, fieldValue, response);
        fieldValue = val;
      }
    });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      var chunks = [];
      file.on('data', function(chunk) {
        chunks.push(chunk);
      });
      file.on('end', function() {
        var buffer = Buffer.concat(chunks);
        var doc = {
          name: filename,
          size: buffer.length,
          mimetype: mimetype,
          file: null
        };
        _this._setStoreObject(doc, buffer, response);
      });
      file.on('error', function(err) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify(err));
      });
    });
    request.pipe(busboy);
  // Otherwise, use our own and just grab flat data from POST body
  } else {
    var cancelled = false;
    var chunks = [];
    request.on('data', function (chunk) {
      chunks.push(chunk);
    });
    request.on('end', function () {
      if (!cancelled) {
        var buffer = Buffer.concat(chunks);
        doc.size = buffer.length;
        _this._setStoreObject(doc, buffer, response);
      }
    });
    request.on('error', function (error) {
      winston.error('connection error: ' + error.message);
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'Connection error.' }));
      cancelled = true;
    });
  }
};

// Keep choosing keys until one isn't taken
DocumentHandler.prototype.chooseKey = function(callback) {
  var key = this.acceptableKey();
  var _this = this;
  this.store.get(key, function(ret) {
    if (ret) {
      _this.chooseKey(callback);
    } else {
      callback(key);
    }
  });
};

DocumentHandler.prototype.acceptableKey = function() {
  return this.keyGenerator.createKey(this.keyLength);
};

module.exports = DocumentHandler;
