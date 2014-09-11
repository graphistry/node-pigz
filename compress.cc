#include <node.h>
#include <node_buffer.h>
#include <v8.h>

//shell access
#include <string>
#include <iostream>
#include <stdlib.h>
#include <time.h>
#include <poll.h>
#include <errno.h>
#include <cstdlib>
#include <cstdio>
#include <unistd.h>
#include <sys/wait.h>


using namespace v8;


Handle<Value> failureCallback(HandleScope &scope, Local<Function> &cb, std::string msg) {
    const unsigned argc = 1;

    Local<Value> argv[argc] = { Local<Value>::New(String::New(msg.c_str())) };
    cb->Call(Context::GetCurrent()->Global(), argc, argv);

    return scope.Close(Undefined());
}



//Poll loop that pipes to child when ready & reads back results when ready
//  Using simple read/write will fill buffer
//  Using more efficient select breaks on OS X
//FIXME bounds check on writing too much
#define PIPE_READ 0
#define PIPE_WRITE 1
Handle<Value> pigz(
    HandleScope &scope,
    char *inputArr, uint inputLen,
    char *outputArr, uint outputLen,
    Local<Function> &cb) {

    fflush(stdin);
    fflush(stdout);
    fflush(stderr);

    int childStdin[2];
    int childStdout[2];

    fd_set setIn;
    fd_set setOut;
    struct timeval timeout = {0, 1};

    if (pipe(childStdin) < 0) {
        return failureCallback(scope, cb, "Native error: failed to allocate pipe for child input redirect");
    }
    if (pipe(childStdout) < 0) {
        close(childStdin[PIPE_READ]);
        close(childStdin[PIPE_WRITE]);
        return failureCallback(scope, cb, "Native error: failedto allocate pipe for child output redirect");
    }

    int pid = fork();

    switch (pid) {

        case -1: { //ERROR
            close(childStdin[PIPE_READ]);
            close(childStdin[PIPE_WRITE]);
            close(childStdout[PIPE_READ]);
            close(childStdout[PIPE_WRITE]);
            return failureCallback(scope, cb, "Native error: failed to fork");
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

            execlp("pigz", "pigz", "-3", "-b", "1024", (char*)0);

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
                        return failureCallback(scope, cb, "Native error: bad selWrite");
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
                                return failureCallback(scope, cb, "Native error: bad write");
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
                        return failureCallback(scope, cb, "Native error: bad selRead");
                    }
                    if (FD_ISSET(childStdout[0], &setOut)) {

                        int readStatus = read(childStdout[PIPE_READ], outputArr + charsRead, stride);

                        if (readStatus < 0) {
                            if (needsToWrite) {
                                close(childStdin[PIPE_WRITE]);
                            }
                            close(childStdout[PIPE_READ]);
                            return failureCallback(scope, cb, "Native error: bad read");
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

            const unsigned argc = 3;
            Local<Value> argv[argc] = {
                Local<Value>::New(Undefined()), //no error
                Local<Value>::New(Number::New(charsRead)), //compressed bytes read
                Local<Value>::New(Number::New(charsWrote)) //uncompressed bytes written
            };
            cb->Call(Context::GetCurrent()->Global(), argc, argv);
            return scope.Close(Undefined());
        }

    }
}


bool unwrapHeapObj(Local<Object> &obj, uint &len, char **arr) {

    if (obj->GetIndexedPropertiesExternalArrayDataType() == kExternalUnsignedByteArray) {
        *arr = static_cast<char*>(obj->GetIndexedPropertiesExternalArrayData());
        len = obj->GetIndexedPropertiesExternalArrayDataLength();
        return true;
    } else if (node::Buffer::HasInstance(obj)) {
        unsigned int offset = obj->Get(String::New("byteOffset"))->Uint32Value();
        *arr = (char*) &((char*) obj->GetIndexedPropertiesExternalArrayData())[offset];
        len = obj->Get(String::New("byteLength"))->Uint32Value() - offset;
        return true;
    } else {
        return false;
    }

}



//In JS: (Uint8Array U Buffer) * (Uint8Array U Buffer) * (err * uint -> ()) -> ()
//Given input/output buffers, compress and notify if err, and if on success, amount written
Handle<Value> DeflateMethod(const Arguments& args) {
    HandleScope scope;

    if (args.Length() < 3) {
        ThrowException(Exception::TypeError(String::New("Expected 3 arguments: input TypedArray, output TypedArray, and callback")));
        return scope.Close(Undefined());
    }

    Local<Object> inputObj = args[0]->ToObject();
    uint inputLen;
    char* inputArr;
    if (!unwrapHeapObj(inputObj, inputLen, &inputArr)) {
        ThrowException(Exception::TypeError(String::New("Expected first argument to be a Buffer or Uint8Array")));
        return scope.Close(Undefined());
    }


    Local<Object> outputObj = args[1]->ToObject();
    uint outputLen;
    char* outputArr;
    if (!unwrapHeapObj(outputObj, outputLen, &outputArr)) {
        ThrowException(Exception::TypeError(String::New("Expected first argument to be a Buffer or Uint8Array")));
        return scope.Close(Undefined());
    }

    Local<Function> cb = Local<Function>::Cast(args[2]);

    return pigz(scope, inputArr, inputLen, outputArr, outputLen, cb);
}


Handle<Value> ErrorOnlyMethod(const Arguments& args) {
    HandleScope scope;

    ThrowException(Exception::Error(
        String::New("pigz executable not found. Install pigz (if necessary) and ensure it's in the system PATH.")
    ));
    return scope.Close(Undefined());
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


void init(Handle<Object> exports) {
    // If pigz is not found on this system, 'deflate' should only throw exceptions
    int pigzStatus = checkForPigz();
    if(pigzStatus != EXIT_SUCCESS) {
        exports->Set(String::NewSymbol("deflate"),
           FunctionTemplate::New(ErrorOnlyMethod)->GetFunction());
    } else {
        exports->Set(String::NewSymbol("deflate"),
           FunctionTemplate::New(DeflateMethod)->GetFunction());
    }
}

NODE_MODULE(compress, init)

