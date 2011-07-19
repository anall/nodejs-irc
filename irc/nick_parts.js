function NickParts(full) {
    this.source = full;

    if ( full === undefined ) return;

    this.nickname = undefined;
    this.username = undefined;
    this.server = full;

    var idx = full.indexOf("@");
    if ( idx != -1 ) {
        var nick = this.nickname = full.substr(0,idx);
        this.server = full.substr(idx+1);

        idx = nick.indexOf("!");
        if ( idx != -1 ) {
            this.username = nick.substr(idx+1);
            this.nickname = nick.substr(0,idx);
        }
    }
}
exports.NickParts = NickParts;
