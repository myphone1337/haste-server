{

  "host": "0.0.0.0",
  "port": 7777,

  "keyLength": 8,

  "maxLength": 536870912,

  "staticMaxAge": 86400,

  "recompressStaticAssets": true,

  "logging": [
    {
       "type": "File",
       "timestamp": true,
       "filename": "haste-server.js.log",
       "maxsize": 16777216,
       "maxFiles": 10
    }
  ],

  "keyGenerator": {
    "type": "betterrand"
  },

  "storage": {
    "type": "redis",
    "host": "localhost",
    "port": 6379,
    "db": 1,
    "expire": 2592000
  },

  "documents": {
    "about": "./about.md"
  },

  "irc": {
    "nick": "haste",
    "altnicks": ["haste_", "hastebin", "hastebin_"],
    "server": "napoleon.mimsoftware.com",
    "channels": ["#support"],
    "url": "http://reviewboard:7777/"
  }

}

