
var fs = require('fs');
var crypto = require('crypto');

var winston = require('winston');

// For storing in files
// options[type] = file
// options[path] - Where to store

var FileDocumentStore = function(options) {
  this.basePath = options.path || './data';
  this.expire = options.expire;
};

// Generate md5 of a string
FileDocumentStore.md5 = function(str) {
  var md5sum = crypto.createHash('md5');
  md5sum.update(str);
  return md5sum.digest('hex');
};

// Save data in a file, key as md5 - since we don't know what we could
// be passed here
FileDocumentStore.prototype.set = function(key, info, data, callback, skipExpire) {
  info.key = key;
  try {
    var _this = this;
    fs.mkdir(this.basePath, '700', function() {
      var fn = _this.basePath + '/' + FileDocumentStore.md5(key);
      fs.writeFile(fn, data, 'utf8', function(err) {
        if (err) {
          callback(false);
        }
        else {
          fs.writeFile(fn + '.meta', JSON.stringify(info), 'utf8', function(err) {
            if (err) {
              callback(false);
            }
            else {
              callback(true);
              if (_this.expire && !skipExpire) {
                winston.warn('file store cannot set expirations on keys');
              }
            }
          })
        }
      });
    });
  } catch(err) {
    callback(false);
  }
};

// Get data from a file from key
FileDocumentStore.prototype.get = function(key, callback, skipExpire) {
  var _this = this;
  var fn = this.basePath + '/' + FileDocumentStore.md5(key);
  if (!fs.existsSync(fn + '.meta')) {
    callback(false);
  } else {
    var meta = fs.readFileSync(fn + '.meta');
    fs.readFile(fn, 'utf8', function(err, data) {
      if (err) {
        callback(false);
      }
      else {
        callback([meta, data]);
        if (_this.expire && !skipExpire) {
          winston.warn('file store cannot set expirations on keys');
        }
      }
    });
  }
};

FileDocumentStore.prototype.getMetadata = function(keys, callback) {
  var _this = this;
  var res = [];
  keys.forEach(function (key) {
    res.push(JSON.parse(fs.readFileSync(_this.basePath + '/' + FileDocumentStore.md5(key) + '.meta', 'utf8')));
  });
  callback(res);
};

FileDocumentStore.prototype.getRecent = function(callback) {
  var _this = this;
  files = fs.readdirSync(this.basePath + '/').filter(function (file) {
    return file.substr(-5) !== '.meta'
  });
  var res = [];
  files.forEach(function (key) {
    res.push(JSON.parse(fs.readFileSync(_this.basePath + '/' + key + '.meta', 'utf8')));
  });
  callback(res);
}
module.exports = FileDocumentStore;
