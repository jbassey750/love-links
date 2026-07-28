module.exports = (
io,
socket
)=>{


socket.on(
"typing",
(data)=>{


socket.to(
data.chatId
)
.emit(
"user-typing",
data
);


}
);



socket.on(
"stop-typing",
(data)=>{


socket.to(
data.chatId
)
.emit(
"user-stop-typing",
data
);


}
);



};