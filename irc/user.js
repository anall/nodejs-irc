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

User._messages = _const.__rprase([
    [RC.RPL_WHOISUSER, 1, function (message) {      // 311
        this.source = NickParts.fromWhois(message);
        this.whois.fullname = message.args[5];
    }],
    [RC.RPL_WHOISSERVER, 1, function (message) {    // 312
        this.whois.server = message.args[2];
        this.whois.server_desc = message.args[3];
    }],
    // 313: 1, // RPL_WHOISOPERATOR
    // 317: 1, // RPL_WHOISIDLE
    [RC.RPL_ENDOFWHOIS, 1, function (message) {     // 318
        this.whois.pending = 0;
        this.whois.loaded = new Date();
        this.emit('whoisLoaded');
    }],
    [RC.RPL_WHOISACCOUNT, 1, function (message) {
        this.whois.account = message.args[2];
    }],
]);

User.prototype.gotMessage = function(message) {
    if ( message.command == "NICK" ) {
        this.source.nickname = message.args[0];
    } else if ( User._messages.hasOwnProperty(message.command) && User._messages[message.command][1] ) {
        User._messages[message.command][1].call(this,message);
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