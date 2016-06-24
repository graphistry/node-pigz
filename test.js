var compress = require('./compress.js');
var zlib = require('zlib');
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


// n -> [ i ]_n
function makeData(len) {
    var out = [];
    for (var i = 0; i < len; i++) {
        out.push(i);
    }
    //console.log('out.len: ', out.length);
    return out;
}


function makeUint8ToBufferTest (len) {
    return function (cb) {
        var data = makeData(len);
        for (var i = 0; i < data.length; i++) {
            data[i] = data[i] % 256;
        }
        var input = new Uint8Array(data);
        //console.log('sending', input.length);
        compress.deflate(input, {output: new Buffer(len + 1024)},
            function (err, output, bytes) {
                if (err) return cb(err);
                if (!(output instanceof Uint8Array)) {
                    return cb(new Error("Expected Uint8Array output"));
                }
                zlib.gunzip(output, function (err, inflated) {
                    if (err) return cb(err);
                    else {
                        if (!inflated || inflated.length != len) {
                            return cb(new Error("Wrong decompressed len, orig " + len + ", but got " + (inflated||{}).length));
                        }
                        for (var i = 0; i < inflated.length; i++) {
                            if (inflated[i] != data[i]) {
                                return cb(new Error("Bad val @ " + i + " / " + len + ": " + inflated[i]));
                            }
                        }
                        return cb(null);
                    }
                });

                //TODO test inflate?
                return cb(null);
            });
    };
}

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
    testUint8_1: makeUint8ToBufferTest(1),
    testUint8_4: makeUint8ToBufferTest(4),
    testUint8_8: makeUint8ToBufferTest(8),
    testUint8_16: makeUint8ToBufferTest(16),
    testUint8_32: makeUint8ToBufferTest(32),
    testUint8_64: makeUint8ToBufferTest(64),
    testUint8_128: makeUint8ToBufferTest(128),
    testUint8_1024: makeUint8ToBufferTest(1024),
    testUint8_10000: makeUint8ToBufferTest(10000),
    testUint8_100000: makeUint8ToBufferTest(100000),
    testUint8_1000000: makeUint8ToBufferTest(1000000),
    testUint8_10000000: makeUint8ToBufferTest(10000000),
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

var done = 0;
pairs.forEach(function (pair, i) {
    var lbl = pair[0];
    var f = pair[1];
    if (lbl != 'testUint8_1') {
        //console.log('skipping', lbl);
        //return;
    }

    f(function (err) {
        console.log('----', i, '----', pairs[i][0], '----',
            results[i] ? 'EXCEPTION'
            : 'OK');

        done++;
        results[i] = err;
        //if (done == 1) { finish(); return; }
        if (done == pairs.length) {
            console.log('========== DONE =======')
        }
}); });




