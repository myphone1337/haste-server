var redis = require('then-redis');
var winston = require('winston');

var RedisDocumentStore = function(options) {
  this.expire = options.expire;
  if (process.env.REDISTOGO_URL) {
    RedisDocumentStore.client = require('redis-url').connect(process.env.REDISTOGO_URL);
    if (RedisDocumentStore.client) {
      winston.info('using predefined redis client');
      return;
    }
  }

  winston.info('configuring redis');
  RedisDocumentStore._connect(options);
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

  var replycount = [];
  RedisDocumentStore.client.multi();
  RedisDocumentStore.client.watch('info.'+key, 'data.'+key);
  replycount.push(RedisDocumentStore.client.mset('info.'+key, infoJson, 'data.'+key, data));
  if (!skipExpire && this.expire) {
    replycount.push(RedisDocumentStore.client.expire('info.'+key, this.expire));
    replycount.push(RedisDocumentStore.client.expire('data.'+key, this.expire));
  }
  replycount.push(RedisDocumentStore.client.lrem('recent', 0, key));
  replycount.push(RedisDocumentStore.client.lpush('recent', key));
  replycount.push(RedisDocumentStore.client.ltrim('recent', 0, 19));
  RedisDocumentStore.client.exec().then(function(reply) {
    if (!reply) {
      callback(false);
      return;
    }

    // can return null for WATCH calls, but unclear whether WATCH return values are _always_ included
    // so check the number of replies we want to verify starting from the end of reply list
    for (var i=0; i<replycount.length; i++) {
      if (reply[reply.length - 1 - i] == null) {
        callback(false);
        return;
      }
    }
    callback(true);
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
    for (var i=0; i<reply.length; i++) {
      if (!reply[i]) {
        callback(false)
        return;
      }
    }

    RedisDocumentStore.client.multi();
    RedisDocumentStore.client.watch('info.'+key, 'data.'+key);
    if (!skipExpire && this.expire) {
      RedisDocumentStore.client.expire('info.'+key, this.expire);
      RedisDocumentStore.client.expire('data.'+key, this.expire);
    }
    RedisDocumentStore.client.exec();

    callback(reply);
  }, function(reply) {
    callback(false);
  });
};

RedisDocumentStore.prototype.getRecent = function(callback) {
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
