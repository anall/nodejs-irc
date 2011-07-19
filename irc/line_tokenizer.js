var EventEmitter = require('events').EventEmitter;
var util = require('util');

function LineTokenizer() {
    EventEmitter.call(this);

    this._data = "";
}
util.inherits(LineTokenizer,EventEmitter);

exports.LineTokenizer = LineTokenizer;

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

