module.exports = (
    io,
    socket
)=>{


socket.on(
    "send-notification",
    (data)=>{


        io.to(
            data.receiver
        )
        .emit(
            "new-notification",
            data
        );


    }
);


};