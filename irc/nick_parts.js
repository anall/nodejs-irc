function NickParts() {
    this.source = undefined;

    this.nickname = undefined;
    this.username = undefined;
    this.hostname = undefined;
}
exports.NickParts = NickParts;

NickParts.fromSource = function(full) {
    var np = new NickParts();

    if ( full.charAt(0) == ':' )
        full = full.substr(1);

    if ( full === undefined ) return;

    np.nickname = undefined;
    np.username = undefined;
    np.hostname = full;

    var idx = full.indexOf("@");
    if ( idx != -1 ) {
        var nick = np.nickname = full.substr(0,idx);
        np.hostname = full.substr(idx+1);

        idx = nick.indexOf("!");
        if ( idx != -1 ) {
            np.username = nick.substr(idx+1);
            np.nickname = nick.substr(0,idx);
        }
    }

    return np;
}

NickParts.fromNickname = function(who) {
    var np = new NickParts();
    np.nickname = who;

    return np;
}

NickParts.fromWhois = function(m) {
    var np = new NickParts();
    np.nickname = m.args[1];
    np.username = m.args[2];
    np.hostname = m.args[3];

    return np;
}

NickParts.prototype.getUser = function(client) {
    if ( ! client ) return undefined;
    if ( ! this.nickname ) return undefined;
    return client.getUser(this.nickname);
}