var compress = require('./compress.js');
var _ = require('underscore');

var t0 = new Date().getTime();
var data = [];
for (var i = 0; i < 10 * 1024 / 3; i++) {
    var which = Math.random();
    if (which < 0.1) {
        data.push(0.3);
        data.push(400);
        data.push(which);
    } else if (which < 0.3) {
        data.push(0.4);
        data.push(500);
        data.push(which);
    } else {
        data.push(0.4);
        data.push(500);
        data.push(500);
    }
    data.push(which < 0.1 ? 20 : which < 0.3 ? 121 : 98987);
}
var t1 = new Date().getTime();


var tests = {
    testUint32: function (cb) {
        var input = new Uint32Array(data);
        compress.deflate(input, null,
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof Uint8Array)) {
                    return cb(new Error("Expected Uint8Array output"));
                }
                return cb(null);
            });
    },
    testUint32ToUint8: function (cb) {
        var input = new Uint32Array(data);
        compress.deflate(input, {output: new Uint8Array(10 * 1024)},
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof Uint8Array)) {
                    return cb(new Error("Expected Uint8Array output"));
                }
                return cb(null);
            });
    },
    testUint32ToBuffer: function (cb) {
        var input = new Uint32Array(data);
        compress.deflate(input, {output: new Buffer(10 * 1024)},
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof Buffer)) {
                    return cb(new Error("Expected Buffer output"));
                }
                return cb(null);
            });
    },
    testUint32ToArrayBuffer: function (cb) {
        var input = new Uint32Array(data);
        compress.deflate(input, {output: (new Uint32Array(10 * 1024)).buffer},
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof ArrayBuffer)) {
                    return cb(new Error("Expected Buffer output"));
                }
                return cb(null);
            });
    },
    testUint8: function (cb) {
        var input = new Uint8Array(data);
        compress.deflate(input, null,
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof Uint8Array)) {
                    return cb(new Error("Expected Uint8Array output"));
                }
                return cb(null);
            });
    },
    testUint8ToBuffer: function (cb) {
        var input = new Uint8Array(data);
        compress.deflate(input, {output: new Buffer(10 * 1024)},
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof Buffer)) {
                    return cb(new Error("Expected Buffer output"));
                }
                return cb(null);
            });
    },
    arrayBuffer: function (cb) {
        var input = (new Uint8Array(data)).buffer;
        compress.deflate(input, null,
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof ArrayBuffer)) {
                    //console.error('~~~', output.constructor)
                    return cb(new Error("Expected ArrayBuffer output"));
                }
                return cb(null);
            });
    },
    arrayBufferToArrayBuffer: function (cb) {
        var input = (new Uint8Array(data)).buffer;
        compress.deflate(input, {output: (new Uint32Array(10 * 1024)).buffer},
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof ArrayBuffer)) {
                    return cb(new Error("Expected ArrayBuffer output"));
                }
                return cb(null);
            });
    },
    buffer: function (cb) {
        var input = new Buffer(data);
        compress.deflate(input, null,
            function (err, output) {
                if (err) return cb(err);
                if (!(output instanceof Buffer)) {
                    return cb(new Error("Expected Buffer output"));
                }
                return cb(null);
            });
    }
};


var results = {};
var pairs = _.pairs(tests);
var interval = setTimeout(finish, 1000);
function finish () {
    for (var i = 0; i < pairs.length; i++) {
        console.log('====', i, '====', pairs[i][0], '====',
            !results.hasOwnProperty(i) ? 'TIMEOUT'
            : results[i] ? 'EXCEPTION'
            : 'OK');
        if (results[i]) {
            console.error('  ', results[i]);
        }
    }
    clearTimeout(interval);
}

var done = 0;
pairs.forEach(function (pair, i) {
    var lbl = pair[0];
    var f = pair[1];

    f(function (err) {
        done++;
        results[i] = err;
        if (done == pairs.length) {
            finish();
        }
}); });




