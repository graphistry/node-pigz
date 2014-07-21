var compress = require('./compress.js');


var t0 = new Date().getTime();
var data = [];
for (var i = 0; i < 10 * 1024  * 1024 / 3; i++) {
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


var input = new Uint32Array(data);
var t2 = new Date().getTime();

console.error('make', t1 - t0, 'ms', 'flatten', t2 - t1, 'ms');

compress.deflate(new Uint8Array(input.buffer),
    function (err, output) {
        var t3 = new Date().getTime();
        console.error('ret', t3 - t2, 'ms');

        if (err) {
            return console.error("ERROR", err);
        }
        console.log('no error');
    	console.log('deflated:', (input.byteLength/(1024*1024)), 'MB -->', (output.length/(1024*1024)), 'MB')
        console.log('',100 * output.length/input.byteLength, '% of original');
        console.log('', output.length, 'backing bytes');

        console.log(input[0],input[1],input[2])
        var o = new Uint32Array(output);
        console.log(o[0], o[1], o[2]);

    });
