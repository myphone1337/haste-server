var redis = require('then-redis');
var winston = require('winston');

var RedisDocumentStore = function(options, client) {
  this.expire = options.expire;
  if (client) {
    winston.info('using predefined redis client');
    RedisDocumentStore.client = client;
  } else if (!RedisDocumentStore.client) {
    winston.info('configuring redis');
    RedisDocumentStore._connect(options);
  }
};

RedisDocumentStore._connect = function(options) {
  var host = options.host || '127.0.0.1';
  var port = options.port || 6379;
  var index = options.db || 0;
  RedisDocumentStore.client = redis.createClient({port:port, host:host, database:index});
  RedisDocumentStore.client.connect().then(function() {
    winston.info('connected to redis', { host: host, port: port, db: index });
  }, function() {
    winston.error('failed to connect to redis', { host: host, port: port, db: index });
    process.exit();
  });
};

RedisDocumentStore.prototype.set = function(key, info, data, callback, skipExpire) {
  var _this = this;
  var infoJson = JSON.stringify(info);
  RedisDocumentStore.client.mset('info.'+key, infoJson, 'data.'+key, data).then(function(reply) {
    if (!reply) {
      callback(false);
      return;
    }

    _this._updateRecent(key);
    
    if (!skipExpire) {
      _this._setExpiration(key, callback, true);
    }
    else {
      callback(true);
    }
  }, function() {
    callback(false);
  });
};

RedisDocumentStore.prototype.get = function(key, callback, skipExpire) {
  var _this = this;
  RedisDocumentStore.client.mget('info.'+key, 'data.'+key).then(function(reply) {
    if (!reply) {
      callback(false);
      return;
    }
    else {
      for (var i=0; i<reply.length; i++) {
        if (reply[i] == null) {
          callback(false)
          return;
        }
      }
    }

    if (!skipExpire) {
      _this._setExpiration(key, callback, reply);
    }
    else {
      callback(reply);
    }
  }, function() {
    callback(false);
  });
};

RedisDocumentStore.prototype._setExpiration = function(key, callback, callbackValue) {
  var _this = this;
  if (!_this.expire) {
    callback(callbackValue);
    return;
  }
  RedisDocumentStore.client.expire('info.'+key, _this.expire).then(function(reply) {
    if (!reply) {
      winston.error('failed to set expiry on key', { key: 'info'+key });
      callback(false);
      return;
    }
    RedisDocumentStore.client.expire('data.'+key, _this.expire).then(function(reply) {
      if (!reply) {
        winston.error('failed to set expiry on key', { key: 'data.'+key });
        callback(false);
        return;
      }
      callback(callbackValue);
    }, function() {
      winston.error('failed to set expiry on key', { key: 'data.'+key });
      callback(false);
    });
  }, function() {
    winston.error('failed to set expiry on key', { key: 'info'+key });
    callback(false);
  });
};

RedisDocumentStore.prototype._updateRecent = function(key) {
  // TODO: transactions
  RedisDocumentStore.client.lrem('recent', '0', key).then(function(reply) {
    RedisDocumentStore.client.lpush('recent', key).then(function(reply) {
      if (!reply) {
        winston.warn('failed to update recent list with lpush', { key: key, reply: reply });
        return;
      }

      RedisDocumentStore.client.ltrim('recent', 0, 19).then(function(reply) {
        if (!reply) {
          winston.warn('failed to update recent list with ltrim', { key: key, reply: reply });
        }
        winston.verbose('updated recent list', { key: key });
      }, function() {
        winston.warn('failed to update recent list with ltrim', { key: key, reply: reply });
      });
    }, function() {
      winston.warn('failed to update recent list with lpush', { key: key, reply: reply });
    });
  });
};

RedisDocumentStore.prototype.getRecent = function(callback) {
  // TODO: transactions
  RedisDocumentStore.client.lrange('recent', '0', '-1').then(function(reply) {
    if (!reply) {
      winston.error('failed to get recent', { reply: reply });
      callback([]);
      return;
    }

    var keys = [];
    for (var i=0; i<reply.length; i++) {
      keys.push('info.'+reply[i]);
    }

    RedisDocumentStore.client.mget.apply(RedisDocumentStore.client, keys).then(function(reply) {
      if (!reply) {
        winston.error('failed to get recent', { reply: reply });
        callback([]);
        return;
      }

      var recent = [];
      for (var i=0; i<reply.length; i++) {
        if (reply[i]) {
          var item = JSON.parse(reply[i]);
          item.key = keys[i].substring(5);
          recent.push(item);
        }
      }
      callback(recent);
    }, function() {
      winston.error('failed to get recent', { reply: reply });
      callback([]);
    });
  }, function() {
    winston.error('failed to get recent', { reply: reply });
    callback([]);
  });
};

module.exports = RedisDocumentStore;
