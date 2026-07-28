export type Message = {
    id: string;
    conversation_id: string;
    sender_id: string;
    sender_alias: string;
    content: string;
    created_at: string;
};

export type Conv = {
    id: string;
    other: {
        id: string;
        alias: string;
    };
    last_message: string | null;
    last_message_at: string | null;
    unread: number;
};

export type ConversationStatus = {
    blocked: boolean;
    blocked_by_me: boolean;
    blocked_by_other: boolean;
};