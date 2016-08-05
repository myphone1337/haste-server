//jshint browser: true, strict: false, maxstatements: 30
/*eslint strict:0, no-shadow: 0, no-use-before-define: 0 */
//jscs:disable
/*global $: true, hljs: true */

var Haste_document = function() {
  this.locked = false;
  $(".editing").show();
  $(".metas").hide();
};

// Escapes HTML tag characters
Haste_document.prototype.htmlEscape = function(s) {
  return (s === null ? '' : s
    .replace(/&/g, '&amp;')
    .replace(/>/g, '&gt;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;'));
};

// Get this document from the server and lock it here
Haste_document.prototype.load = function(key, haste, callback, lang) {
  var _this = this;

  var parseResponseAsRedirect = function() {
    _this.locked = true;
    _this.key = key;
    _this.data = "URL Redirect";
    $(".editing").hide();
    $(".metas").show();

    var high = { value: _this.htmlEscape(_this.data) };

    callback({
      value: high.value,
      key: key,
      language: 'txt',
      lineCount: _this.data.split("\n").length
    });
  };

  var parseResponseAsText = function() {
    haste.$pastebin.show();
    haste.$preview.hide();
    haste.$table.hide();

    $.ajax('docs/' + key, {
      type: 'get',
      headers: {
        accept: 'text/plain'
      },
      success: function(data, status, xhr) {
        _this.locked = true;
        _this.key = key;
        _this.data = data;
        $(".editing").hide();
        $(".metas").show();

        var high;
        try {
          if (lang === 'txt') {
            high = { value: _this.htmlEscape(data) };
          } else if (lang) {
            high = hljs.highlight(lang, data);
          } else {
            high = hljs.highlightAuto(data);
          }
        } catch(err) {
          // failed highlight, fall back on auto
          high = hljs.highlightAuto(data);
        }

        callback({
          name:      xhr.getResponseHeader('x-haste-name'),
          expire:    xhr.getResponseHeader('x-haste-expire'),
          onetime:   xhr.getResponseHeader('x-haste-onetime'),
          password:  xhr.getResponseHeader('x-haste-password'),
          time:      xhr.getResponseHeader('x-haste-time'),
          size:      xhr.getResponseHeader('x-haste-size'),
          syntax:    xhr.getResponseHeader('x-haste-syntax'),
          mimetype:  xhr.getResponseHeader('x-haste-mimetype'),
          encoding:  xhr.getResponseHeader('x-haste-encoding'),
          value:     high.value,
          key:       key,
          language:  high.language || lang,
          lineCount: data.split("\n").length
        });
      },
      error: function() {
        callback(false);
      }
    });
  };

  $.ajax('docs/' + key, {
    type: 'head',
    success: function(data, status, xhr) {
      var metadata = {
        key:      xhr.getResponseHeader('x-haste-key'),
        name:     xhr.getResponseHeader('x-haste-name'),
        expire:   xhr.getResponseHeader('x-haste-expire'),
        onetime:  xhr.getResponseHeader('x-haste-onetime'),
        password: xhr.getResponseHeader('x-haste-password'),
        size:     xhr.getResponseHeader('x-haste-size'),
        syntax:   xhr.getResponseHeader('x-haste-syntax'),
        mimetype: xhr.getResponseHeader('x-haste-mimetype'),
        encoding: xhr.getResponseHeader('x-haste-encoding'),
        time:     xhr.getResponseHeader('x-haste-time')
      };
      var publicUrl = window.location.toString().replace(/\/apps\//, '/public/');
      haste.$documentName.html(metadata.name || metadata.key);
      haste.$publicUrl.html('<a href="' + publicUrl + '" target="blank">' + publicUrl + '</a>');
      haste.$createDate.html(metadata.time === null ? '' : 'Created on ' + new Date(parseInt(metadata.time, 10)).toLocaleString());
      haste.$expireDate.html(metadata.expire === null ? 'Never expires' : 'Expires on ' + new Date(parseInt(metadata.expire, 10)).toLocaleString());
      haste.$onetime.html(metadata.onetime === 'on' ? 'Deleted after read' : '');
      haste.$password.html(metadata.password ? 'Password: ' + metadata.password : 'No password');
      haste.$metas.size.text(metadata.size || '');
      haste.$metas.syntax.text(metadata.syntax || '');
      haste.$metas.mime.text(metadata.mimetype || '');
      haste.$metas.encoding.text(metadata.encoding || '');
      if (metadata.mimetype.indexOf('text') > -1) {
        parseResponseAsText();
      }
      else if (metadata.mimetype.indexOf('url-redirect') === 0) {
        parseResponseAsRedirect();
      }
      else {
        haste.$pastebin.hide();
        haste.$preview.show();
        haste.$table.hide();

        metadata.locked = true;
        haste.doc = metadata;
        $(".editing").hide();
        $(".metas").show();

        haste.updateRecents();
        haste.setViewNonTextDocMenu();

        if (metadata.mimetype.indexOf('image') > -1) {
          haste.$preview.html('<img src="docs/' + metadata.key + '"/>');
        }
      }
    },
    error: function(err) {
      haste.showMessage(err.statusText, 'error');
    }
  });
};

// Save this document to the server and lock it here
Haste_document.prototype.save = function(data, callback) {
  if (this.locked) {
    return false;
  }
  this.data = data;
  var _this = this;
  var expire = $('#documentExpiration').val();
  if (expire !== '') {
    expire = new Date(new Date().getTime() + parseInt(expire, 10) * 60000).getTime();
  }
  $.ajax('docs', {
    type: 'post',
    data: data,
    dataType: 'json',
    contentType: 'application/json; charset=utf-8',
    headers: {
      'x-haste-name': $("#documentTitle").val(),
      'x-haste-expire': expire,
      'x-haste-onetime': $("#documentOnetime").is( ":checked" ) ? 'on' : false,
      'x-haste-password': $("#documentPassword").val()
    },
    success: function(res) {
      _this.locked = true;
      _this.key = res.key;
      $(".editing").hide();
      $(".metas").show();
      var high = hljs.highlightAuto(data);
      callback(null, {
        value: high.value,
        key: res.key,
        language: high.language,
        lineCount: data.split("\n").length
      });
    },
    error: function(res) {
      try {
        callback($.parseJSON(res.responseText));
      } catch (e) {
        callback({message: 'Something went wrong!'});
      }
    }
  });
};

///// represents the paste application

var haste = function(appName, options) {
  this.appName = appName;
  this.ircChan = 'spirc';
  this.$textarea = $('textarea');
  this.$box = $('#box');
  this.$code = $('#box code');
  this.$linenos = $('#linenos');
  this.$recents = $('#recent-pastes ul');
  this.$recentsTitle = $('#recent-pastes-title');
  this.$pastebin = $('#pastebin');
  this.$preview = $('#preview');
  this.$table   = $('#recent-all');
  this.$documentName = $('#documentName');
  this.$publicUrl = $('#publicUrl');
  this.$createDate = $('#createDate');
  this.$expireDate = $('#expireDate');
  this.$onetime = $('#onetime');
  this.$password = $('#password');
  this.$metas = {
    size: $('.metas .metaSize'),
    syntax: $('.metas .metaSynctax'),
    mime: $('.metas .metaMime'),
    encoding: $('.metas .metaEncoding')
  };
  this.options = options;
  this.configureShortcuts();
  this.configureButtons();
  this.loadRecentsList();

  var _this = this;

  document.getElementById('tableShow').addEventListener('click', function () {
    _this.$pastebin.hide();
    _this.$preview.hide();
    _this.$table.show();
    _this.removeLineNumbers();
  });

  var fileUploadOpts = {
    url: 'docs',
    dataType: 'json',
    onBeforeUpload: function (pos, fd) {
      var expire = $('#documentExpiration').val();
      if (expire !== '') {
        expire = new Date(new Date().getTime() + parseInt(expire, 10) * 60000).getTime();
      }
      fd.append('expire', expire);
      fd.append('onetime', $("#documentOnetime").is( ":checked" ) ? 'on' : false);
      fd.append('password', $("#documentPassword").val());
    },
    onUploadSuccess: function(id, data) {
      var ext = '';
      var extIndex = data.metadata.name.lastIndexOf('.');
      if (extIndex > -1) {
        ext = data.metadata.name.substring(extIndex);
      }
      window.location.assign(data.key + ext);
    },
    onUploadError: function(id, message) {
      _this.showMessage(message, 'error');
    }
  };
  $('body').dmUploader(fileUploadOpts);
};

// Set the page title - include the appName
haste.prototype.setTitle = function(ext) {
  var title = ext ? this.appName + ' - ' + ext : this.appName;
  document.title = title;
};

// Show a message box
haste.prototype.showMessage = function(msg, cls) {
  var msgBox = $('<li class="' + (cls || 'info') + '">' + msg + '</li>');
  $('#messages').prepend(msgBox);
  setTimeout(function() {
    msgBox.slideUp('fast', function() { $(this).remove(); });
  }, 3000);
};

// Show the light key
haste.prototype.setNewDocMenu = function() {
  this.enableMenuItems(['new', 'save', 'irc']);
  $(".editing").show();
  $(".metas").hide();
};

// Show the full key
haste.prototype.setViewTextDocMenu = function() {
  this.enableMenuItems(['new', 'edit', 'download', 'irc', 'delete']);
  $(".editing").hide();
  $(".metas").show();
};

haste.prototype.setViewNonTextDocMenu = function() {
  this.enableMenuItems(['new', 'download', 'irc', 'delete']);
  $(".editing").hide();
  $(".metas").show();
};

haste.prototype.disableMenuItems = function(disable) {
  var $this, i = 0;
  $('#box2 .function').each(function() {
    $this = $(this);
    for (i = 0; i < disable.length; i++) {
      if ($this.hasClass(disable[i])) {
        $this.removeClass('enabled');
        return true;
      }
    }
  });
};

haste.prototype.enableMenuItems = function(enable) {
  var $this, i = 0;
  $('#box2 .function').each(function() {
    $this = $(this);
    for (i = 0; i < enable.length; i++) {
      if ($this.hasClass(enable[i])) {
        $this.addClass('enabled');
        return true;
      }
    }
    $this.removeClass('enabled');
  });
};

haste.prototype.getRecents = function(cb) {
  $.ajax('recent', {
    type: 'get',
    contentType: 'application/json; charset=utf-8',
    dataType: 'json',
    success: function (res) {
      cb(res.map(function (doc) { return doc.key; }));
    }
  });
};

haste.prototype.updateRecents = function() {
  var _this = this;
  this.getRecents(function (recents) {
    var addthis = true;
    for (var i in recents) {
      if (recents[i] === _this.doc.key) {
        addthis = false;
        break;
      }
    }
    if (addthis) {
      recents.unshift(_this.doc.key);
      recents = recents.slice(0, recents.length > 20 ? 20 : recents.length);
      //localStorage.setItem('recents', JSON.stringify(recents));
    }
    _this.loadRecentsList();
  });
};

haste.prototype.loadRecentsList = function() {
  this.getRecents(function (recents) {
    $.ajax('keys/' + recents.join(','), {
      type: 'get',
      contentType: 'application/json; charset=utf-8',
      dataType: 'json',
      success: function(res) {
        var items = '', rows = '';
        rows = '<tr><th></th><th>Name</th><th>Creation</th><th>Expires</th><th>Size</th><th>Syntax</th><th>Mime</th><th>Encoding</th><th>Password</th><th>Auto-delete</th></tr>';
        res.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
        for (var i in res) {
          var item = res[i];

          var title = item.name;
          var ext = '';
          var extIndex = title.lastIndexOf('.');
          var row = '';

          if (extIndex > -1) {
            ext = title.substring(extIndex);
          }
          if (item.syntax) {
            ext = '.' + item.syntax;
          }

          if (!title) {
            title = item.key + ext;
          }
          var href = '' + item.key + ext;
          items += '<li><a href="' + href + '">' + title + '</a></li>';
          row += '<td class="action" data-action="delete" data-id="' + item.key + '">🗑</td>';
          row += '<td><a href="' + href + '">' + title + '</a></td>';
          row += '<td>' + (typeof item.time === 'undefined' ? '' : new Date(parseInt(item.time, 10)).toLocaleString()) + '</td>';
          row += '<td>' + (typeof item.expire === 'undefined' ? '' : new Date(parseInt(item.expire, 10)).toLocaleString()) + '</td>';
          ['size', 'syntax', 'mimetype', 'encoding', 'password', 'onetime'].forEach(function (key) {
            row += '<td>' + (typeof item[key] === 'undefined' ? '' : item[key]) + '</td>';
          });
          rows += '<tr>' + row + '</tr>';
        }
        $('#recent-pastes ul').html(items);
        $('#recent-all').html(rows);
      }
    });
  });
};

// Remove the current document (if there is one)
// and set up for a new one
haste.prototype.newDocument = function() {
  this.$pastebin.show();
  this.$preview.hide();
  this.$table.hide();
  this.$box.hide();
  this.doc = new Haste_document();
  this.setTitle();
  this.setNewDocMenu();
  this.$textarea.val('').show('fast', function() {
    this.focus();
  });
  this.removeLineNumbers();
  $("#documentTitle").val('');
  $("#documentPassword").val('');
  $("#documentExpiration").val('1440'); // 1 day
};

// Map of common extensions
// Note: this list does not need to include anything that IS its extension,
// due to the behavior of lookupTypeByExtension and lookupExtensionByType
// Note: optimized for lookupTypeByExtension
haste.extensionMap = {
  rb: 'ruby', py: 'python', pl: 'perl', php: 'php', scala: 'scala', go: 'go',
  xml: 'xml', html: 'xml', htm: 'xml', css: 'css', js: 'javascript', vbs: 'vbscript',
  lua: 'lua', pas: 'delphi', java: 'java', cpp: 'cpp', cc: 'cpp', m: 'objectivec',
  vala: 'vala', cs: 'cs', sql: 'sql', sm: 'smalltalk', lisp: 'lisp', ini: 'ini',
  diff: 'diff', bash: 'bash', sh: 'bash', tex: 'tex', erl: 'erlang', hs: 'haskell',
  md: 'markdown', txt: '', coffee: 'coffee', json: 'javascript'
};

// Look up the extension preferred for a type
// If not found, return the type itself - which we'll place as the extension
haste.prototype.lookupExtensionByType = function(type) {
  for (var key in haste.extensionMap) {
    if (haste.extensionMap[key] === type) {
      return key;
    }
  }
  return type;
};

// Look up the type for a given extension
// If not found, return the extension - which we'll attempt to use as the type
haste.prototype.lookupTypeByExtension = function(ext) {
  return haste.extensionMap[ext] || ext;
};

// Add line numbers to the document
// For the specified number of lines
haste.prototype.addLineNumbers = function(lineCount) {
  var h = '';
  for (var i = 0; i < lineCount; i++) {
    h += (i + 1).toString() + '<br/>';
  }
  $('#linenos div').html(h);
};

// Remove the line numbers
haste.prototype.removeLineNumbers = function() {
  $('#linenos div').html('&gt;');
};

// Load a document and show it
haste.prototype.loadDocument = function(key) {
  // Split the key up
  var ext = '';
  var extIndex = key.lastIndexOf('.');
  if (extIndex > -1 && extIndex < key.length - 1) {
    ext = key.substring(extIndex + 1);
    key = key.substring(0, extIndex);
  }
  // Ask for what we want
  var _this = this, publicUrl;
  _this.doc = new Haste_document();
  _this.doc.load(key, _this, function(ret) {
    if (ret) {
      _this.$code.html(ret.value);
      _this.setTitle(ret.name || ret.key);
      _this.setViewTextDocMenu();
      _this.$textarea.val('').hide();
      _this.$box.show().focus();
      _this.addLineNumbers(ret.lineCount);
      _this.updateRecents();
      publicUrl = window.location.toString().replace(/\/apps\//, '/public/');
      _this.$documentName.html(ret.name || ret.key);
      _this.$publicUrl.html('<a href="' + publicUrl + '" target="blank">' + publicUrl + '</a>');
      _this.$createDate.html(ret.time === null ? '' : 'Created on ' + new Date(parseInt(ret.time, 10)).toLocaleString());
      _this.$expireDate.html(ret.expire === null ? 'Never expires' : 'Expires on ' + new Date(parseInt(ret.expire, 10)).toLocaleString());
      _this.$onetime.html(ret.onetime === 'on' ? 'Deleted after read' : '');
      _this.$password.html(ret.password ? 'Password: ' + ret.password : 'No password');
      _this.$metas.size.text(ret.size || '');
      _this.$metas.syntax.text(ret.syntax || '');
      _this.$metas.mime.text(ret.mimetype || '');
      _this.$metas.encoding.text(ret.encoding || '');
    }
    else {
      _this.newDocument();
    }
  }, this.lookupTypeByExtension(ext));
};

// Duplicate the current document - only if locked
haste.prototype.duplicateDocument = function() {
  if (this.doc.locked) {
    var currentData = this.doc.data;
    this.newDocument();
    this.$textarea.val(currentData);
  }
};

// Delete the current document - only if locked
haste.prototype.deleteDocument = function() {
  var _this = this;
  if (this.doc.locked) {
    $.ajax('docs/' + this.doc.key, {
      type: 'delete',
      success: function(res) {
        window.location.assign(window.location.pathname.replace(/[^\/]*$/, ''));
        _this.newDocument();
      },
      error: function(res) {
        _this.showMessage('Error deleting document', 'error');
      }
    });
  }
};

// Lock the current document
haste.prototype.lockDocument = function(cb_aftersave) {
  var _this = this;
  if (_this.$textarea.val().replace(/^\s+|\s+$/g, '') === '') {
    return;
  }
  this.doc.save(this.$textarea.val(), function(err, ret) {
    if (err) {
      _this.showMessage(err.message, 'error');
    }
    else if (ret && cb_aftersave) {
      cb_aftersave(ret);
    }
  });
};

haste.prototype.configureButtons = function() {
  var _this = this;
  this.buttons = [
    {
      $where: $('#box2 .save'),
      label: 'Save',
      shortcutDescription: 'ctrl + s',
      shortcut: function(evt) {
        return (evt.ctrlKey || evt.metaKey) && !evt.shiftKey && !evt.altKey && (evt.keyCode === 83);
      },
      action: function() {
        _this.lockDocument(function(ret) {
          window.location.assign(ret.key);
          var publicUrl = window.location.toString().replace(/\/apps\//, '/public/');
          _this.$publicUrl.html('<a href="' + publicUrl + '" target="blank">' + publicUrl + '</a>');
        });
      }
    },
    {
      $where: $('#box2 .new'),
      label: 'New',
      shortcut: function(evt) {
        return (evt.ctrlKey || evt.metaKey) && !evt.shiftKey && !evt.altKey && evt.keyCode === 78;
      },
      shortcutDescription: 'ctrl + n',
      action: function() {
        _this.newDocument();
      }
    },
    {
      $where: $('#box2 .edit'),
      label: 'Edit',
      shortcut: function(evt) {
        return _this.doc.locked && (evt.ctrlKey || evt.metaKey) && !evt.shiftKey && !evt.altKey && evt.keyCode === 69;
      },
      shortcutDescription: 'ctrl + e',
      action: function() {
        _this.duplicateDocument();
      }
    },
    {
      $where: $('#box2 .download'),
      label: 'Download',
      shortcut: function(evt) {
        return (evt.ctrlKey || evt.metaKey) && !evt.shiftKey && !evt.altKey && evt.keyCode === 68;
      },
      shortcutDescription: 'ctrl + d',
      action: function() {
        if (_this.doc.key) {
          window.open(window.location.toString().replace(/[^\/]*$/, 'docs/' + _this.doc.key));
        }
      }
    },
    {
      $where: $('#box2 .delete'),
      label: 'Delete',
      action: function() {
        if (_this.doc.key) {
          _this.deleteDocument();
        }
      }
    },
    {
      $where: $('#box2 .irc'),
      label: 'Notify IRC',
      shortcut: function(evt) {
        return (evt.ctrlKey || evt.metaKey) && !evt.shiftKey && !evt.altKey && evt.keyCode === 73;
      },
      shortcutDescription: 'ctrl + i',
      action: function() {
        if (_this.doc.locked) {
          _this.postToIrc(_this.doc.key);
        }
        else {
          _this.lockDocument(function(ret) {
            _this.postToIrc(ret.key, function(res) {
              window.location.assign(ret.key);
            });
          });
        }
      }
    }
  ];
  for (var i = 0; i < this.buttons.length; i++) {
    this.configureButton(this.buttons[i]);
  }
};

haste.prototype.configureButton = function(options) {
  if (!options.$where) {
    return;
  }
  // Handle the click action
  options.$where.click(function(evt) {
    evt.preventDefault();
    if (!options.clickDisabled && $(this).hasClass('enabled')) {
      options.action();
    }
  });
  // Show the label
  options.$where.mouseenter(function(evt) {
    $('#box3 .label').html(options.label);
    $('#box3 .shortcut').html(options.shortcutDescription || '&nbsp;');
  });
  // Hide the label
  options.$where.mouseleave(function(evt) {
    $('#box3 .label').html('&nbsp;');
    $('#box3 .shortcut').html('&nbsp;');
  });
};

// Configure keyboard shortcuts for the textarea
haste.prototype.configureShortcuts = function() {
  var _this = this;
  $(document.body).keydown(function(evt) {
    evt.keyCode = evt.charCode ? evt.charCode : evt.keyCode ? evt.keyCode : 0;
    var button;
    for (var i = 0 ; i < _this.buttons.length; i++) {
      button = _this.buttons[i];
      if (button.shortcut && button.shortcut(evt)) {
        evt.preventDefault();
        button.action();
        return;
      }
    }
  });
};

haste.prototype.postToIrc = function(key, cb) {
  var _this = this;
  $.ajax('irc/privmsg/' + this.ircChan + '/' + key, {
    type: 'get',
    dataType: 'json',
    success: function(res) {
      _this.disableMenuItems(['irc']);
      _this.showMessage('Notified #' + _this.ircChan);
      if (cb) {
        cb(res);
      }
    }
  });
};


/**
 * Create modal window
 *
 * @param {HTML} content - The HTML content of the modal window
 *
 * @return {function} - a function to close the modal window
 */
window.modal = function (content) {
  "use strict";
  [document.children[0], document.body].forEach(function (e) {
    e.style.height  = "100%";
    e.style.width   = "100%";
    e.style.padding = "0";
    e.style.margin  = "0";
  });
  var mod  = document.createElement('div'),
      cell = document.createElement('div'),
      overlay = document.createElement('div');
  mod.setAttribute('style', 'display: inline-block; max-width: 50%; max-height: 90vh; background: white; padding: 1em; border-radius: .5em; overflow: auto; box-shadow: .5em .5em .5em #000;');
  cell.setAttribute('style', 'display:table-cell; vertical-align:middle; text-align:center');
  overlay.setAttribute('style', 'position: fixed; top: 0; left: 0;display:table; width: 100%; height: 100%; background: rgba(0,0,0,.5)');
  if (content instanceof Element) {
    mod.appendChild(content);
  } else {
    mod.innerHTML = content;
  }
  cell.appendChild(mod);
  overlay.appendChild(cell);
  document.body.appendChild(overlay);
  return function () {
    document.body.removeChild(overlay);
  };
};

// OnLoad
$(function() {

  $('textarea').keydown(function(evt) {
    // Tab behavior in the textarea - 2 spaces per tab
    if (evt.keyCode === 9) {
      evt.preventDefault();
      var myValue = '  ';
      // http://stackoverflow.com/questions/946534/insert-text-into-textarea-with-jquery
      // For browsers like Internet Explorer
      if (document.selection) {
        this.focus();
        var sel = document.selection.createRange();
        sel.text = myValue;
        this.focus();
      }
      // Mozilla and Webkit
      else if (this.selectionStart || this.selectionStart === '0') {
        var startPos = this.selectionStart;
        var endPos = this.selectionEnd;
        var scrollTop = this.scrollTop;
        this.value = this.value.substring(0, startPos) + myValue +
          this.value.substring(endPos, this.value.length);
        this.focus();
        this.selectionStart = startPos + myValue.length;
        this.selectionEnd = startPos + myValue.length;
        this.scrollTop = scrollTop;
      }
      else {
        this.value += myValue;
        this.focus();
      }
    }
  });

  // Display functions allowing to post content from shell
  function shellShow(evt) {
    $.ajax('pass', {
      type: 'get',
      contentType: 'application/json; charset=utf-8',
      dataType: 'json',
      success: function (res) {
        var hostFull, host, script, win, closeFct;
        hostFull = window.location.protocol + '//haste:' + res.password + '@' + window.location.host;
        host     = window.location.protocol + '//' + window.location.host;
        script   = "\n" +
          "haste () {\n" +
          "  a=$(cat);\n" +
          '  curl -X POST -s -d "$a" ' + hostFull + '/public/hastebin/docs | awk -F \'"\' \'{print "' + host + '/public/hastebin/"$4}\'' + "\n" +
          "}\n" +
          "hastebin () {\n" +
          "  curl -s --form \"fileupload=@$1;filename=$(basename $1)\" " + hostFull + "/public/hastebin/docs | awk -F '\"' '{print \"" + host + "/public/hastebin/\"$4}'\n" +
          "}\n\n";

        win = document.getElementById('template-shell').cloneNode(true);
        win.querySelector('.shell-code').innerHTML = script;
        closeFct = window.modal(win);
        win.querySelector('[name=close]').addEventListener('click', closeFct);
        win.querySelector('[name=reset]').addEventListener('click', function () {
          closeFct();
          shellReset();
        });
      }
    });
  }
  function shellReset(evt) {
    $.ajax('pass', {
      type: 'post',
      contentType: 'application/json; charset=utf-8',
      dataType: 'json',
      success: function (res) {
        shellShow();
      }
    });
  }
  document.getElementById('shellShow').addEventListener('click', shellShow);

  document.getElementById('recent-all').addEventListener('click', function (e) {
    var id;
    if (e.target.dataset.action) {
      id = e.target.dataset.id;
      switch (e.target.dataset.action) {
        case 'delete':
          if (window.confirm("Do you really want to delete " + id)) {
            $.ajax('docs/' + id, {
              type: 'delete',
              success: function(res) {
                window.app.loadRecentsList();
                window.app.showMessage('Document deleted', 'info');
              },
              error: function(res) {
                window.app.showMessage('Error deleting document', 'error');
              }
            });
          }
          break;
      }
    }
  });
});
