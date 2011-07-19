var EventEmitter = require('events').EventEmitter;
var net = require('net');
var util = require('util');

var _const = require("./constant.js");
var ERROR_CODES = exports.ERROR_CODES = _const.ERROR_CODES;
var RESPONSE_CODES = exports.RESPONSE_CODES = _const.RESPONSE_CODES;
var CR = '\n';

function LineTokenizer() {
    EventEmitter.call(this);

    this._data = "";
}
util.inherits(LineTokenizer,EventEmitter);

LineTokenizer.prototype.feed = function(data) {
    this._data += data;

    if ( this._busy )
        return;

    this._busy = 1;
    var idx;

    while ( this._data.length > 0 ) {
        if ( ( idx = this._data.indexOf("\r\n") ) != -1 ) {
            this.emit("line",this._data.substr(0,idx));
            this._data = this._data.substr(idx+2);
        } else if ( ( idx = this._data.indexOf("\n") ) != -1 ) {
            this.emit("line",this._data.substr(0,idx));
            this._data = this._data.substr(idx+1);
        } else if ( ( idx = this._data.indexOf("\r") ) != -1 ) {
            this.emit("line",this._data.substr(0,idx));
            this._data = this._data.substr(idx+1);
        } else {
            break;
        }
    }
    this._busy = 0;
}

function IRCMessage(data) {
    this._raw = data;

    var idx = data.indexOf(" ");
    if (data.charAt(0) == ':' && idx != -1) {
        this.source = data.substr(1,idx-1);
        data = data.substr(idx+1); 
        idx = data.indexOf(" ");
        this.server = this.source;

        IRCMessage.parseNickParts(this.source, this);
    }

    var parts = [];

    while ( data.length > 0 ) {
        var slurp = ( data.charAt(0) == ':' );
        if ( slurp ) {
            parts.push( data.substr(1) );
            data = "";
        } else if ( ( idx = data.indexOf(" ") ) != -1 ) {
            parts.push( data.substr(0,idx) );
            data = data.substr(idx+1);
        } else {
            parts.push( data );
            data = "";
        }
    };

    this.command = parts.shift();
    this.args = parts;
}
exports.IRCMessage = IRCMessage;

IRCMessage.parseNickParts = function(full, sv) {
    if ( !sv ) { sv = {}; }

    sv.nickname = undefined;
    sv.username = undefined;
    sv.server = full;

    var idx = full.indexOf("@");
    if ( idx != -1 ) {
        var nick = sv.nickname = full.substr(0,idx);
        sv.server = full.substr(idx+1);

        idx = nick.indexOf("!");
        if ( idx != -1 ) {
            sv.username = nick.substr(idx+1);
            sv.nickname = nick.substr(0,idx);
        }
    }

    return sv;
}

IRCMessage.prototype.getNickParts = function() {
    return {
        nickname: this.nickname,
        username: this.username,
        server: this.server
    };
}

function IRCChannel(_client, channel) {
    this._client = _client;
    this.channel = channel;
    this._pending = 1;
    this._joined = 0;

    this.channel_key = undefined;

    this._reset();
}
util.inherits(IRCChannel, EventEmitter);
exports.IRCChannel = IRCChannel;

IRCChannel.prototype.join = function(key) {
    if ( this._joined ) return 0;
    if ( key )
        this.channel_key = key;
    var cmd = "JOIN " + this.channel;
    if ( this.channel_key ) {
        cmd += " " + key;
    }
    this._client.quote(cmd);
    return 1;
}

IRCChannel.prototype._reset = function() {
    this.topic = { text: "", set_by: {}, set: 0 };
    this.members = {};

    this.modes = {};
}

IRCChannel.prototype.gotMessage = function(message) {
    if ( message.command == "JOIN" ) {
        if ( ! this._joined ) {
            this.channel = message.args[0];
            this._joined = 1;
            this._pending = 1;
            this._reset();
        } else {
            this.members[message.nickname.toLowerCase()] = {};
            this.emit('joined',message);
            this._client.emit('joined',this,message);
        }
    } else if ( message.command == RESPONSE_CODES.RPL_TOPIC ) {
        this.topic.text = message.args[2];
    } else if ( message.command == "333" ) {
        this.topic.set = new Date(message.args[3] * 1000);
        IRCMessage.parseNickParts(message.args[2], this.topic.set_by);
    } else if ( message.command == "353" ) {
        var data = message.args[3];
        var parts = data.split(" ");
        for ( var i = 0; i < parts.length; i++ ) {
            var un = parts[i];
            var chr = "";
            if ( ! un.match(/^[a-zA-Z0-9_]/) ) {
                chr = un.charAt(0);
                un = un.substr(1);
            }
            this._client.getUser(un,1);
            un = un.toLowerCase();
            this.members[un] = {};
            if ( chr == '@' )
                this.members[un].op = 1;
            else if ( chr == '%' )
                this.members[un].halfop = 1;
            else if ( chr == '+' )
                this.members[un].voice = 1;
        }
    } else if ( message.command == "366" ) {
        if ( this._pending ) {
            this._client.quote("MODE " + this.channel);
            this._pending = 0;
            this.emit('synced');
        }
    } else if ( message.command == "324" ) {
        this.modes = {};
        this._parseModeMessage(message,2);
    } else if ( message.command == "MODE" ) {
        this._parseModeMessage(message,1);
    } else if ( message.command == "TOPIC" ) {
        this.topic.text = message.args[1];
        this.topic.set_by = message.getNickParts();
        this.topic.set = new Date();
    } else if ( message.command == "PART" ) {
        delete this.members[message.nickname.toLowerCase()];
    }
}

IRCChannel.prototype.privmsg = function(text) {
    this._client.quote("PRIVMSG " + this.channel + " :" + text);
}

var __modeParts = {
    k: { mode: 'key', arg: 's' },
    l: { mode: 'limit', arg: 'i' },

    i: { mode: 'invite' },
    s: { mode: 'secret' },
    p: { mode: 'private' },

    o: { umode: 'op' },
    h: { umode: 'halfop' },
    v: { umode: 'voice' },
};

IRCChannel.prototype._parseModeMessage = function(message, start) {
    var modes = message.args[start++];
    var mode_dir = -1;

    for ( var i = 0; i < modes.length; i++ ) {
        var chr = modes.charAt(i);
        var mdata = undefined;
        if ( chr == '+' )
            mode_dir = 1;
        else if ( chr == '-' )
            mode_dir = 0;
        else if ( mode_dir == -1 )
            throw "Invalid mode specifier";
        else
            mdata = __modeParts[chr];

        if ( mdata ) {
            var mode = mdata.mode;
            var umode = mdata.umode;
            if ( mode ) {
                if ( mode_dir ) {
                    if ( ! mdata.arg ) {
                        this.modes[mode] = 1;
                    } else if ( mdata.arg == 'i' ) {
                        this.modes[mode] = parseInt(message.args[start++]);
                    } else {
                        this.modes[mode] = message.args[start++];
                    }
                } else {
                    delete this.modes[mode];
                }
            } else if ( umode ) {
                var un = message.args[start++].toLowerCase();
                if ( mode_dir )
                    this.members[un][umode] = 1;
                else
                    delete this.members[un][umode];
            }
        }
    }
    this.channel_key = this.modes['key'];
}

IRCChannel.prototype.gotUserMessage = function(message) {
}

function IRCUser(_client, user) {
    this._client = _client;
    this.nickname = user;
    this.username = undefined;
    this.hostname = undefined;
    this._pending = 1;
}
util.inherits(IRCUser, EventEmitter);
exports.IRCUser = IRCUser;

IRCUser.prototype.gotMessage = function(message) {
    this.updateForMessage(message);

    if ( message.command == "NICK" ) {
        this.nickname = message.args[0];
    }
};

IRCUser.prototype.updateForMessage = function(message) {
    if ( this._pending ) {
        this.username = message.username;
        this.hostname = message.server;
        this._pending = 0;
    }
}

function IRCClient(options, defaultPort) {
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
util.inherits(IRCClient, EventEmitter);
exports.IRCClient = IRCClient;

IRCClient.prototype.connect = function() {
    var self = this;

    delete this._serverName;

    var socket = this._socket = this._makeSocket();
    socket.setEncoding('utf8');
    socket.on('connect', function() { self._connected(); });
    socket.on('data', function(data) { self._tokenizer.feed(data); });
}

IRCClient.prototype._makeSocket = function() {
    var options = this._options;
    if ( options.host ) {
        var socket = net.createConnection(options.port, options.host);
    }
    if ( !socket ) throw "Could not make socket.";
    return socket;
}

IRCClient.prototype.quote = function(data) {
    console.log("< %s",data);
    this._socket.write(data + CR,'utf8');
}

IRCClient.prototype._reset = function() {
    this._connectionState = {};

    this._channel = {};
    this._user = {};
}

IRCClient.prototype._connected = function() {
    var self = this;
    this.emit('socketConnected');
    this._preconnect = 1;

    this.once('rawMessage', function(message) {
        self._serverName = message.source;
        self._attemptConnect();
    });
}

IRCClient.prototype._attemptConnect = function() {
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

var __channelMessages = {
    324: 1, // RPL_CHANNELMODEIS
    332: 1, // RPL_TOPIC
    333: 1, // RPL_TOPICWHOTIME
    353: 2, // RPL_WHOSPCRPL
    366: 1, // RPL_ENDOFNAMES

    'JOIN': 0,
    'TOPIC': 0,
    'PART': 0,
    'MODE': 0,
};

IRCClient.prototype._gotData = function(data) { 
    var message = new IRCMessage(data);
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
        var cMsg = __channelMessages[message.command];
        if ( message.nickname )
            this.getUser(message.nickname).updateForMessage(message);
        if ( message.command == "PING" ) {
            this.quote("PONG :" + message.args[0]);
        } else if ( cMsg !== undefined ) {
            this.getChannel(message.args[cMsg]).gotMessage(message);
        } else if ( message.command == "NICK" ) {
            if ( this._user[message.nickname.toLowerCase()] ) {
                this._user[message.nickname.toLowerCase()] = this._user[message.args[0].toLowerCase()];
                delete this._user[message.nickname.toLowerCase()];
            }
            this.getUser(message.args[0]).gotMessage(message);
            for ( var ch in this._channel ) {
                this._channel[ch].gotUserMessage(message);
            }
        } else if ( message.command == "PRIVMSG" ) {
            var target = message.args[0];
            if ( target.match(/^[a-zA-Z0-9_]/) ) {
                this.getUser(message.nickname).updateForMessage(message);
                this.getUser(message.args[0]).gotMessage(message);
            } else {
                this.getUser(message.nickname).updateForMessage(message);
                this.getChannel(message.args[0]).gotMessage(message);
            }
        }
    }
}

IRCClient.prototype.getUser = function(user,canonical) {
    var lcName = user.toLowerCase();
    if ( ! this._user[lcName] )
        if ( canonical ) {
            this._user[lcName] = new IRCUser(this,user);
        } else
            this._user[lcName] = new IRCUser(this,lcName);
    return this._user[lcName]
}

IRCClient.prototype.getChannel = function(channel) {
    var lcName = channel.toLowerCase();
    if ( lcName == "0" )
        throw "Invalid channel name";
    if ( ! this._channel[lcName] )
        this._channel[lcName] = new IRCChannel(this,lcName);
    return this._channel[lcName]
}

exports.dbg = {
    channelMessages: __channelMessages,
    modeParts: __modeParts,
};
