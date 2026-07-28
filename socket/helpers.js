exports.sendToUser = (
    io,
    userId,
    event,
    data
)=>{

    io.to(
        userId.toString()
    )
    .emit(
        event,
        data
    );

};



exports.sendToChat = (
    io,
    chatId,
    event,
    data
)=>{


    io.to(
        chatId.toString()
    )
    .emit(
        event,
        data
    );


};