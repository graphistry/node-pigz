var compressBindings = require('./build/Release/compress');

module.exports = {

    //(Uint8Array U Buffer) * (string * Buffer -> ()) -> ()
    //input * (error * output -> ()) -> ()
    deflate: function (input, cb) {

        var t0 = new Date().getTime();

        try {
            var output = new Buffer(input.byteLength + 1024 /* min stride */ + 8 * 20);

            return compressBindings.deflate(
                input,
                output,
                function (err, bytesRead, bytesWritten) {

                    if (err) return cb(err);

                    var expectedWrittenBytes = input instanceof Buffer ? input.length : input.byteLength;
                    if (expectedWrittenBytes != bytesWritten) {
                        return cb(new Error('did not compress all input'));
                    }

                    return cb(
                        err ? new Error(err) : undefined,
                        err ? undefined
                        : output.slice(0, bytesRead));
                });
        } catch (e) {
            cb(new Error('bad deflate'));
        }
    }

};
