export const CacheKeys = {

    // Static resources
    notifications: "notifications",
    messages: "messages",
    profile: "profile",
    feed: "feed",
    store: "store",
    leaderboard: "leaderboard",

    // Dynamic resources
    chat: (conversationId: string) =>
        `chat:${conversationId}`,

    post: (postId: string) =>
        `post:${postId}`,

    user: (userId: string) =>
        `user:${userId}`,

    campaign: (campaignId: string) =>
        `campaign:${campaignId}`,

    comments: (postId: string) =>
        `comments:${postId}`,

    rewards: (userId: string) =>
        `rewards:${userId}`,

    
} as const;