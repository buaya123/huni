import { api } from "@/src/api/client";

import type {
    Conv,
    ConversationStatus,
    Message,
} from "@/src/types/chat";

export class ChatRepository {

    static async start(
        otherUserId: string,
    ): Promise<{ id: string }> {
        return api.post("/chat/start", {
            other_user_id: otherUserId,
        });
    }

    static async getConversations(): Promise<Conv[]> {
        return api.get("/chat/conversations");
    }

    static async getMessages(
        conversationId: string,
        offset = 0,
        limit = 30,
    ): Promise<Message[]> {
        return api.get(
            `/chat/${conversationId}/messages?offset=${offset}&limit=${limit}`
        );
    }

    static async getStatus(
        conversationId: string,
    ): Promise<ConversationStatus> {
        return api.get(
            `/chat/${conversationId}/status`
        );
    }

    static async sendMessage(
        conversationId: string,
        content: string,
    ): Promise<Message> {
        return api.post(
            `/chat/${conversationId}/messages`,
            { content }
        );
    }

}