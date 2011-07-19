var U = 'U';
var C = 'C';
var _ = undefined;

var _rc_data = [
    ['001',_,_,'RPL_WELCOME'],
    ['002',_,_,'RPL_YOURHOST'],
    ['003',_,_,'RPL_CREATED'],
    ['004',_,_,'RPL_MYINFO'],
    ['005',_,_,'RPL_ISUPPORT'],

    ['311',U,1,'RPL_WHOISUSER'],
    ['312',U,1,'RPL_WHOISSERVER'],
    ['313',U,1,'RPL_WHOISOPERATOR'],

    ['317',U,1,'RPL_WHOISIDLE'],
    ['318',U,1,'RPL_ENDOFWHOIS'],
    ['319',U,1,'RPL_WHOISCHANNELS'],

    ['324',C,1,'RPL_CHANNELMODEIS'],
    ['330',U,1,'RPL_WHOISACCOUNT'],

    ['331',C,1,'RPL_NOTOPIC'],
    ['332',C,1,'RPL_TOPIC'],
    ['333',C,1,'RPL_TOPICWHOTIME'],
   
    ['353',C,2,'RPL_WHOSPCRPL'],

    ['366',C,1,'RPL_ENDOFNAMES'],
    
// Commands
    ['JOIN',        C,0],
    ['TOPIC',       C,0],
    ['PART',        C,0],
];

exports.ERROR_CODES = new _twm({
    ERR_NOSUCHNICK: 401,
    ERR_NOSUCHSERVER: 402,
    ERR_NOSUCHCHANNEL: 403,
    ERR_CANNOTSENDTOCHAN: 404,
    ERR_TOOMANYCHANNELS: 405,
    ERR_WASNOSUCHNICK: 406,
    ERR_TOOMANYTARGETS: 407,
    ERR_NOORIGIN: 409,
    ERR_NORECIPIENT: 411,
    ERR_NOTEXTTOSEND: 412,
    ERR_NOTOPLEVEL: 413,
    ERR_WILDTOPLEVEL: 414,
    ERR_UNKNOWNCOMMAND: 421,
    ERR_NOMOTD: 422,
    ERR_NOADMININFO: 423,
    ERR_FILEERROR: 424,
    ERR_NONICKNAMEGIVEN: 431,
    ERR_ERRORNEUSNICKNAME: 432,
    ERR_NICKNAMEINUSE: 433,
    ERR_NICKCOLLISION: 436,
    ERR_USERNOTINCHANNEL: 441,
    ERR_NOTONCHANNEL: 442,
    ERR_USERONCHANNEL: 443,
    ERR_NOLOGIN: 444,
    ERR_SUMMONDISABLED: 445,
    ERR_USERSDISABLED: 446,
    ERR_NOTREGISTERED: 451,
    ERR_NEEDMOREPARAMS: 461,
    ERR_ALREADYREGISTERED: 462,
    ERR_NOPERMFORHOST: 463,
    ERR_PASSWDMISMATCH: 464,
    ERR_YOUREBANNEDCREEP: 465,
    ERR_KEYSET: 467,
    ERR_CHANNELISFULL: 471,
    ERR_UNKNOWNMODE: 472,
    ERR_INVITEONLYCHAN: 473,
    ERR_BANNEDFROMCHAN: 474,
    ERR_BADCHANNELKEY: 475,
    ERR_NOPRIVILEGES: 481,
    ERR_CHANOPRIVSNEEDED: 482,
    ERR_CANTKILLSERVER: 483,
    ERR_NOOPERHOST: 491,
    ERR_UMODEUNKNOWNFLAG: 501,
    ERR_USERSDONTMATCH: 502,
});

var rc_out = {};
var rr = {
    'U': {},
    'C': {}
};

for ( var i = 0; i < _rc_data.length; i++ ) {
    var v = _rc_data[i];
    if ( v[3] ) {
        if ( rc_out[v[0]] )
            throw "Code: " + v[3] + " trying to replace "
                + rc_out[v[0]] + " on " + v[0]; 
        if ( rc_out[v[3]] )
            throw "Code: " + v[0] + " trying to replace "
                + rc_out[v[3]] + " on " + v[3]; 
        rc_out[v[0]] = v[3];
        rc_out[v[3]] = v[0];
    }
    if ( v[1] ) {
        if ( !rr[v[1]] )
            throw "Invalid code " + v[1] + " for " + v[0] + " ("+v[3]+")";
        rr[v[1]][v[0]] = v[2];
    }
}

exports.RESPONSE_CODES = rc_out;
exports.RESPONSE_DISPATCH = rr;

function _twm(data) {
    for ( var x in data ) {
        this[x] = data[x];
        this[data[x]] = x;
    }
}

