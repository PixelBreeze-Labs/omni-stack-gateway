// src/gateways/chat.gateway.ts
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*', // Configure this according to your security requirements
    }
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(ChatGateway.name);
    private connectionsCount = 0;
    private chatRooms = new Map<string, Set<string>>(); // chatId -> Set of socket ids

    @WebSocketServer()
    server: Server;

    afterInit(server: Server) {
        this.logger.log('Socket.io server initialized');
    }

    handleConnection(client: Socket) {
        this.connectionsCount++;
        this.logger.log(`Client connected: ${client.id}. Total connections: ${this.connectionsCount}`);
    }

    handleDisconnect(client: Socket) {
        this.connectionsCount--;
        this.logger.log(`Client disconnected: ${client.id}. Total connections: ${this.connectionsCount}`);

        // Remove socket from all chat rooms
        this.chatRooms.forEach((sockets, chatId) => {
            if (sockets.has(client.id)) {
                sockets.delete(client.id);
                this.logger.debug(`Removed client ${client.id} from chat ${chatId}`);
            }
        });
    }

    @SubscribeMessage('join_chat')
    handleJoinChat(client: Socket, payload: { chatId: string }) {
        const { chatId } = payload;
        const roomName = `chat:${chatId}`;

        // Join the Socket.io room
        client.join(roomName);

        // Keep track of the socket in our chatRooms map
        if (!this.chatRooms.has(chatId)) {
            this.chatRooms.set(chatId, new Set());
        }
        this.chatRooms.get(chatId).add(client.id);

        this.logger.log(`Client ${client.id} joined chat ${chatId}`);

        return { success: true, message: `Joined chat ${chatId}` };
    }

    @SubscribeMessage('leave_chat')
    handleLeaveChat(client: Socket, payload: { chatId: string }) {
        const { chatId } = payload;
        const roomName = `chat:${chatId}`;

        // Leave the Socket.io room
        client.leave(roomName);

        // Remove from our tracking map
        if (this.chatRooms.has(chatId)) {
            this.chatRooms.get(chatId).delete(client.id);
        }

        this.logger.log(`Client ${client.id} left chat ${chatId}`);

        return { success: true, message: `Left chat ${chatId}` };
    }

    /**
     * Broadcast a message to all clients in a chat room
     */
    broadcastToChat(chatId: string, event: string, payload: any) {
        const roomName = `chat:${chatId}`;
        this.logger.debug(`Broadcasting ${event} to ${roomName}`);
        this.server.to(roomName).emit(event, payload);
    }

    /**
     * Get the total number of active connections
     */
    getConnectionsCount(): number {
        return this.connectionsCount;
    }

    /**
     * Get the number of clients in a specific chat room
     */
    getChatConnectionsCount(chatId: string): number {
        if (!this.chatRooms.has(chatId)) {
            return 0;
        }
        return this.chatRooms.get(chatId).size;
    }
}