module.exports = (io,socket)=>{


    socket.on(
        "join-chat",
        (chatId)=>{

            socket.join(
                chatId.toString()
            );

        }
    );



    socket.on(
        "send-message",
        (data)=>{


            io.to(
                data.chatId
            )
            .emit(
                "receive-message",
                data
            );


        }
    );



    socket.on(
        "leave-chat",
        (chatId)=>{

            socket.leave(
                chatId
            );

        }
    );


};