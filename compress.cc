//////////////////


#include <nan.h>
#include "compress.h"

using v8::Function;
using v8::Local;
using v8::Number;
using v8::Value;
using Nan::AsyncQueueWorker;
using Nan::AsyncWorker;
using Nan::Callback;
using Nan::HandleScope;
using Nan::New;
using Nan::Null;
using Nan::HandleScope;
using Nan::To;
using Nan::ThrowError;
using Nan::ThrowTypeError;

using v8::FunctionTemplate;
using v8::Object;
using v8::String;
using Nan::GetFunction;
using Nan::New;
using Nan::Set;

using Nan::TypedArrayContents;

//shell access
#include <string>
#include <iostream>
#include <stdlib.h>
#include <time.h>
#include <poll.h>
#include <errno.h>
#include <unistd.h>
#include <sys/wait.h>

#include <errno.h>
#include <string.h>


class PigzWorker : public AsyncWorker {
    private:
        char *inputArr;
        uint inputLen;
        char *outputArr;
        uint outputLen;

        uint outputCharsRead;
        uint outputCharsWrote;

    public:

        PigzWorker(
            char *inputArr, uint inputLen,
            char *outputArr, uint outputLen,
            Callback *cb)
        : AsyncWorker(cb), inputArr(inputArr), inputLen(inputLen), outputArr(outputArr), outputLen(outputLen)
        { }

        ~PigzWorker() {}

        //defined below
        void pigz(
            char *inputArr, uint inputLen,
            char *outputArr, uint outputLen);


        // Executed inside the worker-thread.
        // It is not safe to access V8, or V8 data structures
        // here, so everything we need for input and output
        // should go on `this`.
        void Execute () {
            pigz(inputArr, inputLen, outputArr, outputLen);
        }

        // Executed when the async work is complete
        // this function will be run inside the main event loop
        // so it is safe to use V8 again
        void HandleOKCallback () {
            HandleScope scope;

            Local<Value> argv[] = {
                Null()
              , New<Number>(outputCharsRead)
              , New<Number>(outputCharsWrote)
            };

            Nan::Call(*callback, 3, argv);
        }

};




//Poll loop that pipes to child when ready & reads back results when ready
//  Using simple read/write will fill buffer
//  Using more efficient select breaks on OS X
//FIXME bounds check on writing too much
#define PIPE_READ 0
#define PIPE_WRITE 1
void PigzWorker::pigz(
    char *inputArr, uint inputLen,
    char *outputArr, uint outputLen)
{

    fflush(stdin);
    fflush(stdout);
    fflush(stderr);

    int childStdin[2];
    int childStdout[2];

    fd_set setIn;
    fd_set setOut;
    struct timeval timeout = {0, 1};

    if (pipe(childStdin) < 0) {
        SetErrorMessage("Native error: failed to allocate pipe for child input redirect");
        //HandleErrorCallback();
        return;
    }
    if (pipe(childStdout) < 0) {
        close(childStdin[PIPE_READ]);
        close(childStdin[PIPE_WRITE]);
        SetErrorMessage("Native error: failed to allocate pipe for child output redirect");
    }

    int pid = fork();

    switch (pid) {

        case -1: { //ERROR
            close(childStdin[PIPE_READ]);
            close(childStdin[PIPE_WRITE]);
            close(childStdout[PIPE_READ]);
            close(childStdout[PIPE_WRITE]);
            std::cerr << "Native error: failed to fork, errno " << errno << std::endl;
            const char *err = strerror(errno);
            std::string strErr(err);
            SetErrorMessage(strErr.c_str());
            return;
        }

        case 0: { //CHILD

            if (dup2(childStdin[PIPE_READ], STDIN_FILENO) == -1) {
                _exit(1);
            }
            if (dup2(childStdout[PIPE_WRITE], STDOUT_FILENO) == -1) {
                _exit(1);
            }
            //if (dup2(childStdout[PIPE_WRITE], STDERR_FILENO) == -1) {
            //    _exit(1);
            //}

            //stdin etc redirected, don't need these now
            close(childStdin[PIPE_READ]);
            close(childStdin[PIPE_WRITE]);
            close(childStdout[PIPE_READ]);
            close(childStdout[PIPE_WRITE]);

            execlp("pigz", "pigz", inputLen > 1024 * 1024 ? "-5" : "-3", "-b", "64", (char*)0);

            _exit(1); //FIXME: signal error
        }

        default: { //PARENT

            uint stride = 3 * 1024 * sizeof(uint) / sizeof(char);

            close(childStdin[PIPE_READ]);
            FD_ZERO(&setIn);
            FD_SET(childStdin[1], &setIn);

            close(childStdout[PIPE_WRITE]);
            FD_ZERO(&setOut);
            FD_SET(childStdout[0], &setOut);

            bool needsToWrite = true;
            bool needsToRead = true;
            uint charsRead = 0;
            uint charsWrote = 0;
            while (needsToRead || needsToWrite) {

                int selWrite = needsToWrite ? select(childStdin[1] + 1, NULL, &setIn, NULL, &timeout) : 0;
                if (selWrite) {
                    if (selWrite < 0) {
                        SetErrorMessage("Native error: bad selWrite");
                        return;
                    }
                    if (FD_ISSET(childStdin[1], &setIn)) {

                            bool overflows = charsWrote + stride >= inputLen;
                            uint amount = overflows ? (inputLen - charsWrote) : stride;
                            int wrote = write(childStdin[PIPE_WRITE], inputArr + charsWrote, amount);

                            if (wrote < 0) {
                                close(childStdin[PIPE_WRITE]);
                                if (needsToRead) {
                                    close(childStdout[PIPE_READ]);
                                }
                                SetErrorMessage("Native error: bad write");
                                return;
                            } else {
                                charsWrote = charsWrote + wrote;
                            }

                        if (charsWrote >= inputLen) {
                            needsToWrite = false;
                            close(childStdin[PIPE_WRITE]);
                        }
                    }
                }

                int selRead = needsToRead ? select(childStdout[0] + 1, &setOut, NULL, NULL, &timeout) : 0;

                if (selRead) {
                    if (selRead < 0) {
                        SetErrorMessage("Native error: bad selRead");
                        return;
                    }
                    if (FD_ISSET(childStdout[0], &setOut)) {

                        int readStatus = read(childStdout[PIPE_READ], outputArr + charsRead, stride);

                        if (readStatus < 0) {
                            if (needsToWrite) {
                                close(childStdin[PIPE_WRITE]);
                            }
                            close(childStdout[PIPE_READ]);
                            SetErrorMessage("Native error: bad read");
                            return;
                        } else if (readStatus == 0 && !needsToWrite) {
                            needsToRead = false;
                            close(childStdout[PIPE_READ]);
                        } else {
                            charsRead += readStatus;
                        }
                    }
                }

                //reset before next poll
                FD_ZERO(&setIn);
                FD_SET(childStdin[1], &setIn);
                FD_ZERO(&setOut);
                FD_SET(childStdout[0], &setOut);
            } //WHILE


            //wait for child to finish
            int status;
            if (waitpid(pid, &status, 0) == -1) {
                const char *err = strerror(errno);
                std::string strErr(err);
                SetErrorMessage(strErr.c_str());
                return;
            }

            outputCharsRead = charsRead;
            outputCharsWrote = charsWrote;
            return;

        }

    }
}



//In JS: (Uint8Array U Buffer) * (Uint8Array U Buffer) * (err * uint -> ()) -> ()
//Given input/output buffers, compress and notify if err, and if on success, amount written
NAN_METHOD(DeflateMethod) {

    if (info.Length() < 3) {
        return ThrowTypeError("Expected 3 arguments: input TypedArray, output TypedArray, and callback");
    }

    v8::Local<v8::Object> rawInputObj = info[0].As<v8::Object>();
    v8::Local<v8::Object> rawOutputObj = info[1].As<v8::Object>();
    Callback *cb = new Callback(info[2].As<Function>());

    //FIXME return error if size 0 (caused by empty or null array)
    TypedArrayContents<uint8_t> typedInput(rawInputObj);
    char *inputArr = reinterpret_cast<char*>(*typedInput);
    //std::cout << " TYPEDINPUT.LENGTH(): " << typedInput.length() << std::endl;
    uint32_t inputLen = typedInput.length() * sizeof(uint8_t) / sizeof(char);

    //FIXME return error if size 0 (caused by empty or null array)
    TypedArrayContents<uint32_t> typedOutput(rawOutputObj);
    char *outputArr = reinterpret_cast<char*>(*typedOutput);
    uint32_t outputLen = typedOutput.length() * sizeof(uint32_t) / sizeof(char);

    AsyncQueueWorker(new PigzWorker(inputArr, inputLen, outputArr, outputLen, cb));
}


NAN_METHOD(ErrorOnlyMethod) {
    HandleScope();
    return ThrowError("pigz executable not found. Install pigz (if necessary) and ensure it's in the system PATH.");
}


// Checks to make the 'pigz' command is found somewhere in the PATH and we can execute it.
// Returns 0 on success, EXIT_FAILURE or a non-zero pigz exit code on failure.
int checkForPigz() {
    pid_t processId;
    if ((processId = fork()) == 0) { // CHILD
        execlp("pigz", "pigz", "--version", (char*)0);
        // Since execlp() should never return, if we get here, there's been an error
        _exit(errno);

    } else if (processId < 0) { // ERROR
        return EXIT_FAILURE;

    } else { // PARENT
        int status;
        waitpid(processId, &status, 0);

        if(WIFEXITED(status)) {
            return WEXITSTATUS(status);
        } else {
            return EXIT_FAILURE;
        }
    }
}


NAN_MODULE_INIT(init) {

    // If pigz is not found on this system, 'deflate' should only throw exceptions
    int pigzStatus = checkForPigz();
    if(pigzStatus != EXIT_SUCCESS) {
      Set(target, New<String>("deflate").ToLocalChecked(),
        GetFunction(New<FunctionTemplate>(ErrorOnlyMethod)).ToLocalChecked());
    } else {
      Set(target, New<String>("deflate").ToLocalChecked(),
        GetFunction(New<FunctionTemplate>(DeflateMethod)).ToLocalChecked());
    }
}


NODE_MODULE(compress, init)

