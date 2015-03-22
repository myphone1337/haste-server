//jshint node: true
var cozydb  = require('cozydb'),
    winston = require('winston'),
    async   = require('async'),
    util    = require('util'),
    stream  = require('stream'),
    Haste, hasteOptions;

function Bufferer(onDone) {
  "use strict";
  stream.Writable.call(this);
  this._chunks = [];
  this._onDone = onDone;
}
util.inherits(Bufferer, stream.Writable);
Bufferer.prototype._write = function (chunk, encoding, callback) {
  "use strict";
  this._chunks.push(chunk);
  callback();
};
Bufferer.prototype.end = function () {
  "use strict";
  this._onDone(null, Buffer.concat(this._chunks));
};

hasteOptions = {
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
  expire: {
    'type': Number
  },
  binary: {
    'type': cozydb.NoSchema
  }
};

Haste = cozydb.getModel('Haste', hasteOptions);

Haste.defineRequest('all', cozydb.defaultRequests.all, function (err) {
  "use strict";
  if (err) {
    winston.error("Error defining request:", err);
  }
});

function Store(options) {
  "use strict";
}

Store.prototype.set = function (key, info, data, callback, skipExpire) {
  "use strict";
  info._id = key;
  info.key = key;
  Haste.create(info, function (err, created) {
    if (err) {
      winston.error(err);
      callback(false);
    } else {
      var buf = new Buffer(data, 'utf-8');
      buf.path = key;
      created.attachBinary(buf, {name: info.name || key}, function (attachErr) {
        callback(attachErr ? false : true);
      });
    }
  });
};

// Get data from a file from key
Store.prototype.get = function (key, callback, skipExpire) {
  "use strict";
  Haste.find(key, function (err, item) {
    var binaryStream, out;
    if (err) {
      winston.error(err);
      callback(false);
    } else {
      if (item === null) {
        callback(false);
      } else {
        binaryStream = item.getBinary(item.name || key, function (errBinary) {
          if (errBinary) {
            winston.error(errBinary);
          }
        });
        out = new Bufferer(function (errBuffered, buf) {
          if (errBuffered) {
            winston.error(errBuffered);
            callback(false);
          } else {
            callback([JSON.stringify(item), buf.toString('utf-8')]);
          }
        });
        binaryStream.pipe(out);
      }
    }
  });
};

Store.prototype.getMetadata = function (keys, callback) {
  "use strict";
  if (!Array.isArray(keys)) {
    keys = [keys];
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
      callback(result);
    }
  });
};

Store.prototype.getRecent = function (callback) {
  "use strict";
  Haste.all(null, function (err, res) {
    if (err) {
      winston.error(err);
      res = [];
    }
    callback(res);
  });
};

Store.prototype.delete = function (key, callback) {
  "use strict";
  Haste.destroy(key, function (err) {
    callback(err !== null);
  });
};

module.exports = Store;
