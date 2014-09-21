var winston = require('winston');
var Client = require('spirc').Client;

var IrcHandler = function(docStore, options) {
	this.docStore = docStore;
	this.client = new Client(options);
	this.chan = this.client.getTarget(options.channel);
	this.url = options.url;
	if (this.url.lastIndexOf('/') != this.url.length - 1) {
		this.url += '/';
	}

	var _this = this;
	this.client.on('registered', function() {
		winston.info('irc: connected');
		_this.chan.join();
	});

	this.client.on('disconnect', function() {
		winston.info('irc: disconnect');
	});

	process.on('exit', function() {
		_this.client.disconnect();
	});

	winston.info('irc: connecting');
	this.client.connect();
};

IrcHandler.prototype.handleNotify = function(request, response) {
	var _this = this;
	this.docStore.getMetadata([request.params.id], function(reply) {
		if (reply.length == 0) {
			winston.error('irc notify did not find document', { reply: reply });
			response.writeHead(404, { 'content-type': 'application/json' });
      		response.end(JSON.stringify({ message: 'Document not found, not notifying IRC' }));
      		return;
		}

		var item = reply[0];
		var noti = '';
		if (item.name) {
			noti += item.name + ': ';
		}
		noti += _this.url;
		if (item.mimetype.indexOf('text') < 0) {
			noti += 'docs/';
		}
		noti += request.params.id;
		if (item.syntax) {
			noti += '.' + item.syntax;
		}

		winston.verbose('notifying irc', { message: noti });
		_this.chan.say(noti);

		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ message: 'Posted to IRC: ' + noti }));
	});
};

module.exports = IrcHandler;