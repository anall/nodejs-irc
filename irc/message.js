var util = require('util');
var NickParts = require('./nick_parts.js').NickParts;

function Message(data) {
    this._raw = data;

    var idx = data.indexOf(" ");
    if (data.charAt(0) == ':' && idx != -1) {
        NickParts.call(this,data.substr(1,idx-1));
        data = data.substr(idx+1);
    } else {
        NickParts.call(this);
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
util.inherits(Message,NickParts);

exports.Message = Message;
