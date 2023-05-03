This was originally an attempt at p2pdraw but I ended up adding live reload, which needs a UDP file send protocol.

Usage:

Server: 
ssc build -r -o --env=RELOAD_HOST=<ip address>:9989 ----env=SERVER=1 --env=SENDFILE=/some/file

Client (Same ip address as above)
ssc build -r -o --env=RELOAD_HOST=<ip address>:9989

Note that you will need to rebuild for --env args to take affect

Currently the code just sends c:\program files\

The server will send the specified file to any client that connects, over and over again.
