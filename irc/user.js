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

User._messages = {
    311: 1, // RPL_WHOISUSER,
    312: 1, // RPL_WHOISSERVER,
    313: 1, // RPL_WHOISOPERATOR
    317: 1, // RPL_WHOISIDLE
    318: 1, // RPL_ENDOFWHOIS
};

User.prototype.gotMessage = function(message) {
    if ( message.command == "NICK" ) {
        this.source.nickname = message.args[0];
    } else if ( message.command == RC.RPL_WHOISUSER ) {
        this.source = NickParts.fromWhois(message);
        this.whois.fullname = message.args[5];
    } else if ( message.command == RC.RPL_WHOISSERVER ) {
        this.whois.server = message.args[2];
        this.whois.server_desc = message.args[3];
    } else if ( message.command == RC.RPL_ENDOFWHOIS ) {
        this.whois.pending = 0;
        this.whois.loaded = new Date();
        this.emit('whoisLoaded');
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