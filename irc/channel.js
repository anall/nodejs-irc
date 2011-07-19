var EventEmitter = require('events').EventEmitter;
var util = require('util');
var NickParts = require('./nick_parts.js').NickParts;

var _const = require("./constant.js");
var ERROR_CODES = _const.ERROR_CODES;
var RC = _const.RESPONSE_CODES;

function Channel(_client, channel) {
    this._client = _client;
    this.channel = channel;
    this._pending = 1;
    this._joined = 0;

    this.channel_key = undefined;

    this._reset();
}
util.inherits(Channel, EventEmitter);
exports.Channel = Channel;

Channel._messages = {
    'JOIN': 0,
    'TOPIC': 0,
    'PART': 0,
    'MODE': 0,
};

Channel._messages = _const.__rprase([
    [RC.RPL_CHANNELMODEIS, 1, function (message) {  // 324
        this.modes = {};
        this._parseModeMessage(message,2);
    }],
    [RC.RPL_TOPIC, 1, function (message) {          // 332
        this.topic.text = message.args[2];
    }],
    [RC.RPL_TOPICWHOTIME, 1, function(message) {    // 333
        this.topic.set = new Date(message.args[3] * 1000);
        this.topic.set_by = NickParts.fromSource(message.args[2]);
    }],
    [RC.RPL_WHOSPCRPL, 2, function(message) {       // 353
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
    }],
    [RC.RPL_ENDOFNAMES, 1, function(message) {      // 366
        if ( this._pending ) {
            this._client.quote("MODE " + this.channel);
            this._pending = 0;
            this.emit('synced');
        }
    }],
],{
    'JOIN': [0],
    'TOPIC': [0],
    'PART': [0],
    'MODE': [0],
});


Channel.prototype.join = function(key) {
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

Channel.prototype._reset = function() {
    this.topic = { text: "", set_by: {}, set: 0 };
    this.members = {};

    this.modes = {};
}

Channel.prototype.gotMessage = function(message) {
    if ( Channel._messages.hasOwnProperty(message.command) && Channel._messages[message.command][1] ) {
        Channel._messages[message.command][1].call(this,message);
    } else if ( message.command == "JOIN" ) {
        if ( ! this._joined ) {
            this.channel = message.args[0];
            this._joined = 1;
            this._pending = 1;
            this._reset();
        } else {
            this.members[message.source.nickname.toLowerCase()] = {};
            this.emit('joined',message);
            this._client.emit('joined',this,message);
        }
    } else if ( message.command == "MODE" ) {
        this._parseModeMessage(message,1);
    } else if ( message.command == "TOPIC" ) {
        this.topic.text = message.args[1];
        this.topic.set_by = message.source;
        this.topic.set = new Date();
    } else if ( message.command == "PART" ) {
        delete this.members[message.source.nickname.toLowerCase()];
    }
}

Channel.prototype.handleUserMessage = function(message) {
    if ( message.command == "NICK" ) {
        var source = message.source.nickname.toLowerCase();
        var dest = message.args[0].toLowerCase();
        this.members[dest] = this.members[source] || {};
        delete this.members[source];
    }
}

Channel.prototype.privmsg = function(text) {
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

Channel.prototype._parseModeMessage = function(message, start) {
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
