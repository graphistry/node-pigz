var compressBindings = require('./build/Release/compress');

module.exports = {

    //(Uint8Array U Buffer) * (string * Buffer -> ()) -> ()
    //input * (error * output -> ()) -> ()
    deflate: function (input, cb) {

        var t0 = new Date().getTime();

        try {
            var output = new Buffer(input.byteLength + 1024 /* min stride */ + 8 * 20);

            var t1 = new Date().getTime();
            console.error('Made backing store', t1 - t0, 'ms');

            return compressBindings.deflate(
                input,
                output,
                function (err, bytesRead, bytesWritten) {

                    var t2 = new Date().getTime();
                    console.error('Compressed', t2 - t1, 'ms', bytesWritten, 'B -> ', bytesRead, 'B', (100 * bytesRead / input.byteLength).toFixed(2), '%');
                    if (err) {
                        console.error('bad compress', err);
                    } else {
                        var expectedWrittenBytes = input instanceof Buffer ? input.length : input.byteLength;
                        if (expectedWrittenBytes != bytesWritten) {
                            console.error('did not compress exact input; ', bytesWritten, 'B compressed vs', expectedWrittenBytes, 'B in input');
                            return cb(err || 'did not compress all input');
                        }
                    }


                    return cb(
                        err ? new Error(err) : undefined,
                        err ? undefined
                        : output.slice(0, bytesRead));
                });
        } catch (e) {
            console.error('bad deflate');
            cb(new Error(e));
        }
    }

};
