export interface Notification {
    id: string;
    type: string;
    actor_alias?: string;
    content_preview?: string;
    post_id?: string;
    is_ad?: boolean;
    conversation_id?: string;
    campaign_id?: string;
    created_at: string;
    read: boolean;
}