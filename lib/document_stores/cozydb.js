var cozydb  = require('cozydb');
var crypto  = require('crypto');
var winston = require('winston');
var async   = require('async');
var util    = require('util');
var stream  = require('stream');

var Bufferer = function (onDone) {
  stream.Writable.call(this);
  this._chunks = [];
  this._onDone = onDone;
}
require('util').inherits(Bufferer, stream.Writable);
Bufferer.prototype._write = function(chunk, encoding, callback) {
  this._chunks.push(chunk);
  callback();
};
Bufferer.prototype.end = function() {
  this._onDone(null, Buffer.concat(this._chunks));
}

options = {
  key: {
    'type': String,
    'default': ''
  },
  name: {
    'type': String,
    'default': ''
  },
  size: {
    'type': Number,
    'default': 0
  },
  syntax: {
    'type': String,
    'default': ''
  },
  mimetype: {
    'type': String,
    'default': 'text/plain'
  },
  encoding: {
    'type': String,
    'default': 'utf-8'
  },
  time: {
    'type': Number
  },
  binary: {
    'type': cozydb.NoSchema
  }
};

Haste = cozydb.getModel('Haste', options);

Haste.defineRequest('all', cozydb.defaultRequests.all, function (err) {
  if (err) {
    winston.error("Error defining request:", err);
  }
});

Store = function (options) {
}

Store.prototype.set = function(key, info, data, callback, skipExpire) {
  info._id = key;
  info.key = key;
  Haste.create(info, function (err, created) {
    if (err) {
      winston.error(err);
      callback(false);
    } else {
      var buf = new Buffer(data, 'utf-8');
      buf.path = key;
      created.attachBinary(buf, {name: info.name || key}, function (err) {
        callback(err?false:true);
      });
    }
  });
};

// Get data from a file from key
Store.prototype.get = function(key, callback, skipExpire) {
  Haste.find(key, function (err, item) {
    if (err) {
      winston.error(err);
      callback(false);
    } else {
      if (item === null) {
        callback(false);
      } else {
        var stream, buff = new Buffer('', 'utf-8'), out;
        stream = item.getBinary(item.name || key, function (err) {
          if (err) {
            winston.error(err);
          }
        });
        out = new Bufferer(function (err, buf) {
          if (err) {
            winston.error(err);
            callback(false);
          } else {
            callback([JSON.stringify(item), buf.toString('utf-8')]);
          }
        });
        stream.pipe(out);
      }
    }
  });
};

Store.prototype.getMetadata = function(keys, callback) {
  if (!Array.isArray(keys)) {
    keys = [ keys ];
  }
  async.map(keys, function (key, cb) {
    Haste.find(key, function (err, res) {
      cb(err, res);
    });
  }, function (err, result) {
    if (err) {
      winston.error(err);
      callback(false);
    } else {
      callback(result)
    }
  });
};

Store.prototype.getRecent = function(callback) {
  var files = Haste.all(null, function (err, res) {

    if (err) {
      winston.error(err);
      res = []
    }
    callback(res);
  });
}

Store.prototype.delete = function (key, callback) {
  Haste.destroy(key, function (err) {
    callback(err !== null);
  });
}

module.exports = Store
