var EventEmitter = require('events').EventEmitter;
var util = require('util');
var NickParts = require('./nick_parts.js').NickParts;

var _const = require("./constant.js");
var ERROR_CODES = _const.ERROR_CODES;
var RC = _const.RESPONSE_CODES;

function User(_client, user) {
    this._client = _client;
    this.source = NickParts.fromNickname(user);
    this._pending = 1;

    this.whois = { loaded: undefined };
}
util.inherits(User, EventEmitter);
exports.User = User;

var _f = {};
_f[RC.RPL_WHOISUSER] = function (message) {      // 311
    this.source = NickParts.fromWhois(message);
    this.whois.fullname = message.args[5];
};

_f[RC.RPL_WHOISSERVER] = function (message) {    // 312
    this.whois.server = message.args[2];
    this.whois.server_desc = message.args[3];
};

// 313: 1, // RPL_WHOISOPERATOR
// 317: 1, // RPL_WHOISIDLE

_f[RC.RPL_ENDOFWHOIS] = function (message) {     // 318
    this.whois.pending = 0;
    this.whois.loaded = new Date();
    this.emit('whoisLoaded');
};
_f[RC.RPL_WHOISACCOUNT] = function (message) {
    this.whois.account = message.args[2];
};

User.prototype.gotMessage = function(message) {
    if ( message.command == "NICK" ) {
        this.source.nickname = message.args[0];
    } else if ( _f.hasOwnProperty(message.command) ) {
        _f[message.command].call(this,message);
    }
};

User.prototype.loadWhois = function(callback, cached) {
    if ( callback )
        this.once('whoisLoaded',callback);
    if ( cached && this.whois.loaded ) {
        this.emit('whoisLoaded');
        return;
    } else {
        this.whois.pending = 1;
        this._client.quote("WHOIS " + this.source.nickname);
    }
}

User.prototype.updateForMessage = function(message) {
    this.source = message.source;
    this._pending = 0;
}
