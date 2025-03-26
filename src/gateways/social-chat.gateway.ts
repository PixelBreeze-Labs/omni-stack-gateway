// src/gateways/social-chat.gateway.ts
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from '../guards/ws-auth.guard';
import { SocialChatService } from '../services/social-chat.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class SocialChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly socialChatService: SocialChatService
    ) {}

    async handleConnection(client: Socket) {
        try {
            // Extract token from handshake
            const token = client.handshake.auth.token;
            if (!token) {
                return client.disconnect();
            }

            // Validate token (implementation depends on your auth system)
            // For this example, we assume the WsAuthGuard handles this
        } catch (error) {
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        // Optional: Handle client disconnection
    }

    @UseGuards(WsAuthGuard)
    @SubscribeMessage('join_chat')
    async handleJoinChat(client: Socket, chatId: string) {
        return this.socialChatService.subscribeClientToChat(client, chatId);
    }

    @UseGuards(WsAuthGuard)
    @SubscribeMessage('typing')
    handleTyping(client: Socket, data: {chatId: string, isTyping: boolean}) {
        // Broadcast typing status to other participants
        client.to(`chat:${data.chatId}`).emit('user_typing', {
            userId: client.data.user._id,
            isTyping: data.isTyping
        });

        return { success: true };
    }

    @UseGuards(WsAuthGuard)
    @SubscribeMessage('read_message')
    async handleReadMessage(client: Socket, data: {messageId: string}) {
        return this.socialChatService.markMessageAsRead(
            data.messageId,
            client.data.user._id
        );
    }
}