var compressBindings = require('./build/Release/compress'),
    scheduler = require('./scheduler.js')(),
    debug = require('debug')('compress:main');

module.exports = {

    //  (TypedArray U ArrayBuffer U Buffer)
    //  * ?{output: Uint8Array U ArrayBuffer U Buffer}
    //  * (string * (Buffer U Uint8Array) * int  -> ())
    //  -> ()
    //input * (error * output -> ()) -> ()
    // If unspecified, output type is Uint8Array or Buffer based on input type
    //   Otherwise, must provide output buffer (Uint8Array or Buffer)
    // Node style return: error (or null), and compressed data and data byte count
    // If provided output array that was too small, will return an error
    // For typed array returns, outputs Uint8Array to avoid ambiguity in partial return for bigger types
    // For when provided output buffer that is too big and returning ArrayBuffer/Buffer,
    //      use first non-error argument to get compressed array output length
    //      (add to offset to get end offset)
    // TODO proxy options for controlling number of processes, block length, etc.
    deflate: function (rawInput, rawOptions, cb) {

        debug('deflate');

        var task = function (k) {
            module.exports.deflateHelper(rawInput, rawOptions, function () {

                //notify scheduler
                k();

                //notify caller
                var args = Array.prototype.slice.call(arguments, 0);
                cb.apply(this, args);

            });
        };

        scheduler.enqueue(task);

    },

    deflateHelper: function (rawInput, rawOptions, cb) {

        debug('deflate helper');

        if (!rawInput ||
            !(rawInput instanceof Buffer
                || rawInput instanceof ArrayBuffer
                || rawInput.buffer instanceof ArrayBuffer
                )) {
            return cb(new Error('first argument should be a Buffer, Typed Array, or ArrayBuffer'));
        }


        //Uint8Array U Buffer
        var input =
              rawInput instanceof Buffer ? rawInput
            : rawInput instanceof ArrayBuffer ? new Uint8Array(rawInput, 0, rawInput.byteLength)
            : new Uint8Array(rawInput.buffer, rawInput.byteOffset, rawInput.byteLength);



        //Uint8Array U Buffer
        var output = (rawOptions || {}).output;
        var EXTRA_BYTES = 1024 /* min stride */ + 8 * 20;
        if (!(!output || output instanceof Buffer || output instanceof ArrayBuffer || output instanceof Uint8Array)) {
            return cb(new Error('optional output option must be a Buffer or Uint8Array'))
        }
        output =
            !output ?
                //duplicate input type
                (input instanceof Uint8Array ? new Uint8Array(input.byteLength + EXTRA_BYTES)
                    : new Buffer(input.length + EXTRA_BYTES))
            : output instanceof Buffer ? output
            : output instanceof Uint8Array ? output
            : /*output instanceof ArrayBuffer ?*/ new Uint8Array(output);


        try {
            return compressBindings.deflate(
                input,
                output,
                //bytesRead: # of poll's read() calls
                //bytesWritten: # of poll's write() calls
                function (err, bytesRead, bytesWritten) {

                    debug('deflate callback', err, bytesRead, bytesWritten);


                    if (err) {
                        //console.error(output, input.length, EXTRA_BYTES)
                        return cb(err);
                    }

                    var expectedWrittenBytes =
                        input instanceof Buffer ? input.length
                        : input instanceof ArrayBuffer ? input.byteLength
                        : (input.byteLength);
                    if (expectedWrittenBytes != bytesWritten) {
                        return cb(new Error('did not compress all input. Bytes written: ' + bytesWritten + ' Expected bytes written' + expectedWrittenBytes));
                    }

                    /*
                     console.log('outtype', err ? undefined
                            : output instanceof Buffer ? 'buf slice'
                            : !rawOptions || !rawOptions.output ? 'u8'
                            : rawOptions.output instanceof ArrayBuffer ? 'arr buffer'
                            //typed array -> Uint8Array
                            : 'u8');
                    */
                    //console.log(output.constructor, output.slice)

                    return cb(
                        err ? new Error(err) : undefined,
                        err ? undefined
                            : output instanceof Buffer ? output.slice(0, bytesRead)
                            : !rawOptions || !rawOptions.output ? new Uint8Array(output.buffer, 0, bytesRead)
                            : rawOptions.output instanceof ArrayBuffer ? output.buffer
                            //typed array -> Uint8Array
                            : new Uint8Array(output.buffer, output.byteOffset, output.byteOffset + bytesRead),
                        bytesRead);
                });

        } catch (e) {
            cb(e);
        }
    }

};
