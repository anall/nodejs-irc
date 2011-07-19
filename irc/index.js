var EventEmitter = require('events').EventEmitter;
var net = require('net');
var util = require('util');

var _const = require("./constant.js");
var ERROR_CODES = exports.ERROR_CODES = _const.ERROR_CODES;
var RESPONSE_CODES = exports.RESPONSE_CODES = _const.RESPONSE_CODES;

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
        }
    } else {
        var sender;
        if ( sender = message.getUser(this) )
            sender.updateForMessage(message);
        if ( message.command == "PING" ) {
            this.quote("PONG :" + message.args[0]);
        } else if ( Channel._messages.hasOwnProperty(message.command) ) {
            this.getChannel(message.args[Channel._messages[message.command]]).gotMessage(message);
        } else if ( User._messages.hasOwnProperty(message.command) ) {
            this.getUser(message.args[User._messages[message.command]]).gotMessage(message);
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
