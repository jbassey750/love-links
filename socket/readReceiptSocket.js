module.exports = (
io,
socket
)=>{


socket.on(
"message-seen",
(data)=>{


io.to(
data.chatId
)
.emit(
"message-read",
{
messageId:data.messageId,
userId:data.userId
}
);


}
);



};