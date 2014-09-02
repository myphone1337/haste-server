{

  "host": "0.0.0.0",
  "port": 7777,

  "keyLength": 6,

  "maxLength": 400000,

  "staticMaxAge": 86400,

  "recompressStaticAssets": true,

  "logging": [
    {
      "level": "verbose",
      "type": "Console",
      "colorize": true
    }
  ],

  "keyGenerator": {
    "type": "random",
    "keyspace": "abcdefghijklmnopqrstuvwxyz01234567890"
  },

  "storage": {
    "path": "./data",
    "type": "file"
  },

  "documents": {
    "about": "./about.md"
  }

}

