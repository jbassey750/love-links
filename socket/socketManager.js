const { Server } = require("socket.io");

const messageSocket = require("./messageSocket");
const notificationSocket = require("./notificationSocket");
const matchSocket = require("./matchSocket");
const typingSocket = require("./typingSocket");
const presenceSocket = require("./presenceSocket");
const readReceiptSocket = require("./readReceiptSocket");


let io;

const onlineUsers = new Map();


const initSocket = (server)=>{

    io = new Server(server,{
        cors:{
            origin:"*",
            methods:["GET","POST"]
        }
    });


    io.on("connection",(socket)=>{

        console.log(
            "Socket connected:",
            socket.id
        );


        // User joins personal room
        socket.on("join-user",(userId)=>{

            socket.join(userId.toString());

            onlineUsers.set(
                userId.toString(),
                socket.id
            );


            io.emit(
                "user-online",
                userId
            );

        });


        presenceSocket(
            io,
            socket,
            onlineUsers
        );


        messageSocket(
            io,
            socket
        );


        notificationSocket(
            io,
            socket
        );


        matchSocket(
            io,
            socket
        );


        typingSocket(
            io,
            socket
        );


        readReceiptSocket(
            io,
            socket
        );



        socket.on("disconnect",()=>{


            for(
                let [userId,socketId]
                of onlineUsers
            ){

                if(socketId === socket.id){

                    onlineUsers.delete(userId);


                    io.emit(
                        "user-offline",
                        userId
                    );
                }

            }


            console.log(
                "Socket disconnected:",
                socket.id
            );

        });


    });


    return io;

};



const getIO = ()=>{

    if(!io){
        throw new Error(
            "Socket.io not initialized"
        );
    }

    return io;

};



module.exports={
    initSocket,
    getIO,
    onlineUsers
};