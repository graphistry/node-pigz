var debug = require('debug')('compress:scheduler');

/*
    Given max number of simulatenous tasks, returns enqueue function
    Task is a function that takes a continuation and calls it when done

    ?int -> {enqueue: (Task -> ()) -> () }
    where Task :: ( -> ) -> ()

*/

module.exports = function (MAX_OUTSTANDING) {

    MAX_OUTSTANDING = MAX_OUTSTANDING || 10;

    //[ k ]
    var queued = [],
        running = [];

    var scheduler = {

        //run (potentially deferred)
        //( -> ) -> ()
        enqueue:
            function (k) {

                debug('enqueue');

                if (running.length < MAX_OUTSTANDING) {
                    running.push(k);

                    //FIXME trampoline stack?
                    k(function () {
                        scheduler.dequeue(k);
                    });

                } else {
                    queued.push(k);
                }
            },

        //remove, and enqueue replacement
        //( -> ) -> ()
        dequeue:
            function (k) {

                debug('dequeue');

                running.splice(running.indexOf(k), 1);

                if (queued.length) {
                    scheduler.enqueue(queued.shift());
                }
            }
    };

    return {enqueue: scheduler.enqueue};
};