var util = require('util');
var NickParts = require('./nick_parts.js').NickParts;

function Message(data) {
    this._raw = data;

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

    this.command = parts.shift();
    this.args = parts;
}
exports.Message = Message;

Message.prototype.getUser = function(svr) {
    if ( this.source )
        return this.source.getUser(svr);
    return undefined;
}