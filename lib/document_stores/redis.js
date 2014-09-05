var redis = require('then-redis');
var winston = require('winston');

var RedisDocumentStore = function(options, client) {
  this.expire = options.expire;
  if (client) {
    winston.info('using predefined redis client');
    RedisDocumentStore.client = client;
  } else if (!RedisDocumentStore.client) {
    winston.info('configuring redis');
    RedisDocumentStore.connect(options);
  }
};

RedisDocumentStore.connect = function(options) {
  var host = options.host || '127.0.0.1';
  var port = options.port || 6379;
  var index = options.db || 0;
  RedisDocumentStore.client = redis.createClient({port:port, host:host, database:index});
};

RedisDocumentStore.prototype.set = function(key, info, data, callback, skipExpire) {
  var _this = this;
  var infoJson = JSON.stringify(info);
  RedisDocumentStore.client.mset('info.'+key, infoJson, 'data.'+key, data).then(function(reply) {
    if (!reply) {
      callback(false);
      return;
    }
    
    if (!skipExpire) {
      _this._setExpiration(key, callback, true);
    }
    else {
      callback(true);
    }
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
    });
  });
};

module.exports = RedisDocumentStore;
