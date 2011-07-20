var util = require('util');
var NickParts = require('./nick_parts.js').NickParts;

//FIXME: HANDLE MQUOTE

function Message(data,parent) {
    this.ctcp = false;
    this._raw = data;
    this._parent = parent;

    var idx = data.indexOf(" ");
    if (data.charAt(0) == ':' && idx != -1) {
        this.source = NickParts.fromSource(data.substr(1,idx-1));
        data = data.substr(idx+1);
    } else {
        this.source = undefined;
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

    if ( parent && !this.source ) {
        this.source = parent.source;
    }

    this.command = parts.shift();
    this.args = parts;
}
exports.Message = Message;

Message.prototype.getUser = function(svr) {
    if ( this.source )
        return this.source.getUser(svr);
    return undefined;
}

function CtcpMessage(data,parent) {
    if ( data.charAt(0) == '\001' ) {
        data = data.substr(1);
        var idx = data.indexOf('\001');
        if ( idx != -1 )
            data = data.substr(0,idx);
    } else {
        throw("Not a CTCP message");
    }
    Message.call(this,data,parent);
    this.ctcp = true;
}
util.inherits(CtcpMessage,Message);
exports.CtcpMessage = CtcpMessage;

CtcpMessage.prototype.reply = function(client, message) {
    if ( !this.source.nickname ) throw "Cannot reply";
    client.quote("NOTICE " + this.source.nickname + " :\001" + this.command + " " + message + "\001");
}