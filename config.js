{

  "host": "0.0.0.0",
  "port": 7777,

  "keyLength": 8,

  "maxLength": 524288000,

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
    "db": 1
  },

  "documents": {
    "about": "./about.md"
  }

}

