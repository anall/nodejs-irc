var EventEmitter = require('events').EventEmitter;
var net = require('net');
var util = require('util');

var _const = require("./constant.js");
var ERROR_CODES = exports.ERROR_CODES = _const.ERROR_CODES;
var RESPONSE_CODES = exports.RESPONSE_CODES = _const.RESPONSE_CODES;
var _rd = _const.RESPONSE_DISPATCH;

var LineTokenizer = require('./line_tokenizer.js').LineTokenizer;
var Message = require('./message.js').Message;
var NickParts = require('./nick_parts.js').NickParts;

var User = exports.User = require('./user.js').User;
var Channel = exports.Channel = require('./channel.js').Channel;

function Client(options, defaultPort) {
    var self = this;

    EventEmitter.call(this)

    if (!defaultPort) defaultPort = 6667;

    if ( options.host && !options.port )
        options.port = defaultPort;

    if ( !options.nickname )
        throw "Nickname missing";

    if ( !options.username )
        options.username = options.nickname;
    if ( !options.realName )
        options.realName = "node.js IRC";

    this._options = options;
    this._nickname = options.nickname;

    this._tokenizer = new LineTokenizer();
    this._tokenizer.on('line', function(data,ending) {
        self._gotData(data);
    });

    this._reset();

    if ( options.autoConnect )
        this.connect();
}
util.inherits(Client, EventEmitter);
exports.Client = Client;

Client.prototype.connect = function() {
    var self = this;

    delete this._serverName;

    var socket = this._socket = this._makeSocket();
    socket.setEncoding('utf8');
    socket.on('connect', function() { self._connected(); });
    socket.on('data', function(data) { self._tokenizer.feed(data); });
}

Client.prototype._makeSocket = function() {
    var options = this._options;
    if ( options.host ) {
        var socket = net.createConnection(options.port, options.host);
    }
    if ( !socket ) throw "Could not make socket.";
    return socket;
}

Client.prototype.quote = function(data) {
    console.log("< %s",data);
    this._socket.write(data + "\n",'utf8');
}

Client.prototype._reset = function() {
    this._connectionState = {};

    this._channel = {};
    this._user = {};
    this._support = {};

    this._host = undefined;
    this._version = undefined;
    this._modes = {
        user: undefined,
        channel: undefined,
    }
}

Client.prototype._connected = function() {
    var self = this;
    this.emit('socketConnected');
    this._preconnect = 1;

    this.once('rawMessage', function(message) {
        self._serverName = message.source;
        self._attemptConnect();
    });
}

Client.prototype._attemptConnect = function() {
    if ( this._options.password && ! this._connectionState.passwordSent ) {
        this.quote("PASS " + this._options.password);
        this._connectionState.passwordSent = 1;
    }
    if ( ! this._connectionState.nickSent ) {
        this.quote("NICK " + this._nickname);
        this._connectionState.nickSent = 1;
    }
    if ( ! this._connectionState.userSent ) {
        this.quote("USER " + this._options.username +
            " hostname " + this._serverName +
            " :" + this._options.realName);
        this._connectionState.userSent = 1;
    }
}

function _valsToList(v) {
    var rv = {};
    for ( var i = 0; i < v.length; i++ )
        rv[v.charAt(i)] = true;
    return rv;
}

function _splitArgsList(v) {
    var rv = {};
    v = v.split(",");
    for ( var i = 0; i < v.length; i++ ) {
        var key = v[i];
        var value = true;
        var idx = key.indexOf(":");
        if ( idx != -1 ) {
            value = key.substr(idx+1);
            key = key.substr(0,idx);
        }
        rv[key] = value;
    }
    return rv;
}

function _splitArgsValsList(v) {
    var rv = {};
    v = v.split(",");
    for ( var i = 0; i < v.length; i++ ) {
        var key = v[i];
        var value = true;
        var idx = key.indexOf(":");
        if ( idx != -1 ) {
            value = key.substr(idx+1);
            key = key.substr(0,idx);
        }
        for ( var j = 0; j < key.length; j++ )
            rv[key.charAt(j)] = value;
    }
    return rv;
}

var _mogrifySupport = {
    CHANTYPES: _valsToList,
    CHANMODES: function(v) {
        v = v.split(",");
        return {
            list: _valsToList(v[0]),
            always: _valsToList(v[1]),
            set: _valsToList(v[2]),
            never: _valsToList(v[3])
        };
    },
    CHANLIMIT: _splitArgsValsList,
    MAXLIST: _splitArgsValsList,
    TARGMAX: _splitArgsList,
    STATUSMSG: _valsToList,
};

Client.prototype._parseIsSupport = function(data) {
    var x = data.args.slice(1);
    for ( var i = 0; i < x.length-1; i++ ) {
        var key = x[i];
        var value = true;
        var idx = key.indexOf("=");
        if ( idx != -1 ) {
            value = key.substr(idx+1);
            key = key.substr(0,idx);
        }
        if ( _mogrifySupport.hasOwnProperty(key) )
            value = _mogrifySupport[key](value);
        this._support[key] = value;
    }
}

Client.prototype._gotData = function(data) { 
    var message = new Message(data);
    this.emit('rawMessage',message);
    if ( this._preconnect ) {
        if ( message.command == ERROR_CODES.ERR_NONICKNAMEGIVEN || message.command == ERROR_CODES.ERR_ERRORNEUSNICKNAME ) {
            this.emit('error',message);
            this._socket.end();
        } else if ( message.command == ERROR_CODES.ERR_NICKNAMEINUSE || message.command == ERROR_CODES.ERR_NICKCOLLISION ) {
            this._nickname = this._nickname + "_";
            this._connectionState.nickSent = 0;
            this._connectionState.userSent = 0;
            this._attemptConnect();
        } else if ( message.command == ERROR_CODES.ERR_NEEDMOREPARAMS ) {
            this.emit('error',message);
            this._socket.end();
        } else if ( message.command == "001" ) {
            this._preconnect = 0;
            this.emit('connected');
            this._ownUser = this.getUser(this._nickname,1);
            this._support = {};
        }
    } else {
        var sender;
        if ( sender = message.getUser(this) )
            sender.updateForMessage(message);
        if ( message.command == '004' ) {
            this._host = message.args[1];
            this._version = message.args[2];
            this._modes = {
                user: _valsToList(message.args[3]),
                channel: _valsToList(message.args[4]),
            };
        } else if ( message.command == '005' ) {
            this._parseIsSupport(message);
        } else if ( message.command == "PING" ) {
            this.quote("PONG :" + message.args[0]);
        } else if ( _rd['C'].hasOwnProperty(message.command) ) {
            this.getChannel(
                message.args[_rd['C'][message.command]]).gotMessage(message);
        } else if ( _rd['U'].hasOwnProperty(message.command) ) {
            this.getUser(
                message.args[_rd['U'][message.command]]).gotMessage(message);
        } else if ( _rd['B'].hasOwnProperty(message.command) ) {
            var target = message.args[0];
            var pos = _rd['B'][message.command];
            if ( target.match(/^[a-zA-Z0-9_]/) ) {
                this.getUser(message.args[pos]).gotMessage(message);
            } else {
                this.getChannel(message.args[pos]).gotMessage(message);
            }
        } else if ( message.command == "NICK" ) {
            var source = message.source.nickname.toLowerCase();
            var dest = message.args[0].toLowerCase();
            if ( this._user[source] ) {
                this._user[dest] = this._user[source];
                delete this._user[source];
            }
            this.getUser(message.args[0]).gotMessage(message);
            for ( var ch in this._channel )
                this._channel[ch].handleUserMessage(message);
        } else if ( message.command == "PRIVMSG" ) {
            var target = message.args[0];
            if ( target.match(/^[a-zA-Z0-9_]/) ) {
                message.getUser(this).updateForMessage(message);
                this.getUser(message.args[0]).gotMessage(message);
            } else {
                message.getUser(this).updateForMessage(message);
                this.getChannel(message.args[0]).gotMessage(message);
            }
        }
    }
}

Client.prototype.getUser = function(user,canonical) {
    var lcName = user.toLowerCase();
    if ( ! this._user.hasOwnProperty(lcName) )
        if ( canonical ) {
            this._user[lcName] = new User(this,user);
        } else
            this._user[lcName] = new User(this,lcName);
    return this._user[lcName]
}

Client.prototype.getChannel = function(channel) {
    var lcName = channel.toLowerCase();
    if ( lcName == "0" )
        throw "Invalid channel name";
    if ( ! this._channel.hasOwnProperty(lcName) )
        this._channel[lcName] = new Channel(this,lcName);
    return this._channel[lcName]
}
